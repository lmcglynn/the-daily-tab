import { newestEntryAt, normalizeEntries } from '../feed/normalize';
import { parseFeed } from '../feed/parse';
import type { Feed, FeedState, Item } from '../types';

export const FETCH_TIMEOUT_MS = 15_000;
const MAX_BYTES = 5 * 1024 * 1024;

export const FEED_ACCEPT =
  'application/rss+xml, application/atom+xml, application/rdf+xml;q=0.9, application/xml;q=0.8, text/xml;q=0.8, */*;q=0.1';

export type FetchOutcome =
  | {
      kind: 'ok';
      items: Item[];
      title: string;
      etag?: string;
      lastModified?: string;
      /** Newest entry date in the feed, including entries too old to keep. */
      latestAt?: number;
    }
  | { kind: 'not-modified' }
  | { kind: 'error'; error: string };

export const RETRY_DELAYS_MS = [500, 1500];

export interface FetchOptions {
  fetch: typeof fetch;
  now: number;
  timeoutMs?: number;
  /** Waits before each retry of a transient failure; [] disables retries. */
  retryDelaysMs?: number[];
}

/** Fetch with a hard timeout; the signal also aborts reading the body. */
export async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ res: Response; body: () => Promise<ArrayBuffer> }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: ctrl.signal });
    return {
      res,
      body: async () => {
        try {
          return await res.arrayBuffer();
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (e) {
    clearTimeout(timer);
    throw ctrl.signal.aborted ? new Error(`Timed out after ${timeoutMs / 1000} s`) : e;
  }
}

/** Decode using the HTTP charset, else the XML/HTML declaration, else UTF-8. */
export function decodeBody(buf: ArrayBuffer, contentType: string | null): string {
  const fromHeader = /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1];
  const head = new TextDecoder('latin1').decode(buf.slice(0, 1024));
  const fromDecl =
    /<\?xml[^>]*encoding=["']([\w-]+)["']/i.exec(head)?.[1] ??
    /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromDecl, 'utf-8']) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(buf);
    } catch {
      /* unknown label, try next */
    }
  }
  return new TextDecoder().decode(buf);
}

const UNREACHABLE = 'Could not be reached';
/** Worth another try within the same refresh: dropped connections and gateway hiccups. */
const isTransient = (error: string) => error === UNREACHABLE || /^HTTP 50[234]\b/.test(error);

/**
 * Fetch and parse one feed, retrying transient failures a couple of times. Some publishers
 * (Nature) randomly bounce cookieless requests to a sign-in origin, which the browser reports
 * as a network error; a second or third try usually gets the feed. Timeouts are not retried.
 */
export async function fetchFeed(
  feed: Pick<Feed, 'id' | 'url'>,
  state: Pick<FeedState, 'etag' | 'lastModified'>,
  opts: FetchOptions,
): Promise<FetchOutcome> {
  const delays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  let outcome = await fetchOnce(feed, state, opts);
  for (const delay of delays) {
    if (outcome.kind !== 'error' || !isTransient(outcome.error)) break;
    await new Promise((r) => setTimeout(r, delay));
    outcome = await fetchOnce(feed, state, opts);
  }
  return outcome;
}

async function fetchOnce(
  feed: Pick<Feed, 'id' | 'url'>,
  state: Pick<FeedState, 'etag' | 'lastModified'>,
  opts: FetchOptions,
): Promise<FetchOutcome> {
  const headers: Record<string, string> = { Accept: FEED_ACCEPT };
  if (state.etag) headers['If-None-Match'] = state.etag;
  if (state.lastModified) headers['If-Modified-Since'] = state.lastModified;

  try {
    const { res, body } = await fetchWithTimeout(
      opts.fetch,
      feed.url,
      // no-store: we do conditional GET ourselves; the HTTP cache must not answer for us.
      { headers, cache: 'no-store', credentials: 'omit', redirect: 'follow' },
      opts.timeoutMs ?? FETCH_TIMEOUT_MS,
    );
    if (res.status === 304) {
      await body().catch(() => undefined);
      return { kind: 'not-modified' };
    }
    if (!res.ok) {
      await body().catch(() => undefined);
      return {
        kind: 'error',
        error: `HTTP ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`,
      };
    }
    const buf = await body();
    if (buf.byteLength > MAX_BYTES) return { kind: 'error', error: 'Feed is larger than 5 MB' };
    const parsed = parseFeed(decodeBody(buf, res.headers.get('content-type')));
    const outcome: FetchOutcome = {
      kind: 'ok',
      title: parsed.title,
      items: normalizeEntries(feed, parsed, opts.now),
    };
    const latestAt = newestEntryAt(parsed, opts.now);
    if (latestAt !== undefined) outcome.latestAt = latestAt;
    const etag = res.headers.get('etag');
    const lastModified = res.headers.get('last-modified');
    if (etag) outcome.etag = etag;
    if (lastModified) outcome.lastModified = lastModified;
    return outcome;
  } catch (e) {
    return { kind: 'error', error: describeError(e) };
  }
}

function describeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) return UNREACHABLE;
  return msg.slice(0, 200);
}
