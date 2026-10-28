import { FEED_ACCEPT, decodeBody, fetchWithTimeout } from '../engine/fetch';
import { parseFeed } from './parse';
import { decodeEntities, htmlToText, safeUrl } from './text';

export interface DiscoveredFeed {
  url: string;
  title: string;
  siteUrl: string;
}

const FEED_TYPES = /application\/(rss|atom|rdf)\+xml|application\/feed\+json/i;
const FALLBACK_PATHS = ['/feed', '/rss', '/rss.xml', '/atom.xml'];
const TIMEOUT_MS = 15_000;

/** <link rel="alternate" type="application/rss+xml" href="…"> entries in an HTML page. */
export function findFeedLinks(html: string, baseUrl: string): { url: string; title: string }[] {
  const out: { url: string; title: string }[] = [];
  const head = html.slice(0, 200_000);
  for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const get = (name: string) =>
      new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i')
        .exec(tag)
        ?.slice(1)
        .find((v) => v !== undefined);
    const rel = (get('rel') ?? '').toLowerCase().split(/\s+/);
    const type = get('type') ?? '';
    if (!rel.includes('alternate') || !FEED_TYPES.test(type) || /json/i.test(type)) continue;
    const url = safeUrl(get('href'), baseUrl);
    if (url && !out.some((f) => f.url === url)) {
      out.push({ url, title: htmlToText(decodeEntities(get('title') ?? '')) });
    }
  }
  return out;
}

async function get(fetchImpl: typeof fetch, url: string) {
  const { res, body } = await fetchWithTimeout(
    fetchImpl,
    url,
    { headers: { Accept: `${FEED_ACCEPT}, text/html;q=0.7` }, credentials: 'omit' },
    TIMEOUT_MS,
  );
  const text = decodeBody(await body(), res.headers.get('content-type'));
  return { res, text, finalUrl: res.url || url };
}

function tryParse(text: string, url: string, siteFallback: string): DiscoveredFeed | null {
  try {
    const parsed = parseFeed(text);
    return {
      url,
      title: htmlToText(parsed.title) || new URL(url).hostname,
      siteUrl: safeUrl(parsed.siteUrl, url) ?? siteFallback,
    };
  } catch {
    return null;
  }
}

/**
 * Given a site or feed URL, return the feeds it offers. A feed URL returns itself; a page
 * returns its advertised feeds; otherwise the common paths are probed.
 */
export async function discoverFeeds(
  input: string,
  fetchImpl: typeof fetch,
): Promise<DiscoveredFeed[]> {
  const start = safeUrl(/^[a-z]+:\/\//i.test(input.trim()) ? input : `https://${input.trim()}`);
  if (!start) throw new Error('Enter a web address starting with http:// or https://');

  const page = await get(fetchImpl, start);
  if (!page.res.ok) throw new Error(`${new URL(start).hostname} answered HTTP ${page.res.status}`);
  const origin = new URL(page.finalUrl).origin;

  const direct = tryParse(page.text, page.finalUrl, origin);
  if (direct) return [direct];

  const found: DiscoveredFeed[] = [];
  for (const link of findFeedLinks(page.text, page.finalUrl)) {
    try {
      const r = await get(fetchImpl, link.url);
      const f = r.res.ok ? tryParse(r.text, link.url, origin) : null;
      if (f) found.push({ ...f, title: f.title || link.title });
    } catch {
      /* advertised but broken; skip */
    }
  }
  if (found.length) return found;

  for (const path of FALLBACK_PATHS) {
    const url = new URL(path, origin).href;
    try {
      const r = await get(fetchImpl, url);
      const f = r.res.ok ? tryParse(r.text, url, origin) : null;
      if (f) return [f];
    } catch {
      /* try the next path */
    }
  }
  return [];
}
