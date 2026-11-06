import { itemId } from '../hash';
import type { Feed, Item } from '../types';
import type { ParsedEntry, ParsedFeed } from './parse';
import {
  cleanTitle,
  firstImageSrc,
  htmlToText,
  repeatedSummaries,
  safeUrl,
  summarize,
  truncate,
} from './text';

export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** Clock skew we tolerate before treating a date as bogus "future" news. */
const FUTURE_SLACK_MS = 10 * 60 * 1000;

/**
 * WordPress image CDNs (Photon, VIP) serve originals that can be 7000+ px and over a megabyte;
 * they honour `w=`, and plain WordPress ignores it. 1200 px covers the lead at 2x.
 */
export function sizedImage(url: string): string {
  try {
    const u = new URL(url);
    if (!u.pathname.includes('/wp-content/uploads/')) return url;
    if (u.searchParams.has('w') || u.searchParams.has('resize') || u.searchParams.has('fit')) {
      return url;
    }
    u.searchParams.set('w', '1200');
    return u.href;
  } catch {
    return url;
  }
}

/** Parse a feed date. Missing, unparsable or future dates fall back to `fetchedAt`. */
export function normalizeDate(raw: string | undefined, fetchedAt: number): number {
  if (!raw) return fetchedAt;
  let t = Date.parse(raw);
  if (Number.isNaN(t)) {
    // Common oddities: "2026-10-27 09:15:00" (space, no zone) and RFC 822 with a stray weekday.
    t = Date.parse(raw.replace(' ', 'T'));
    if (Number.isNaN(t)) t = Date.parse(raw.replace(/^[A-Za-z]{3,},?\s*/, ''));
  }
  if (Number.isNaN(t) || t > fetchedAt + FUTURE_SLACK_MS) return fetchedAt;
  return t;
}

/** The newest dated entry in a feed (undated entries don't count), or undefined. */
export function newestEntryAt(parsed: ParsedFeed, fetchedAt: number): number | undefined {
  let newest: number | undefined;
  for (const e of parsed.entries) {
    if (!e.published) continue;
    const t = normalizeDate(e.published, fetchedAt);
    if (newest === undefined || t > newest) newest = t;
  }
  return newest;
}

/** The story's first text that isn't one the feed repeats; empty if it has no other. */
function entrySummary(e: ParsedEntry, title: string, repeated: Set<string>): string {
  for (const html of [e.summaryHtml, e.excerptHtml, e.contentHtml]) {
    if (!html) continue;
    const summary = summarize(html, title);
    if (!repeated.has(summary)) return summary;
  }
  return '';
}

export function normalizeEntries(
  feed: Pick<Feed, 'id' | 'url'>,
  parsed: ParsedFeed,
  fetchedAt: number,
): Item[] {
  const base = safeUrl(parsed.siteUrl, feed.url) ?? feed.url;
  const seen = new Set<string>();
  const items: Item[] = [];
  const repeated = repeatedSummaries(
    parsed.entries.map((e) => {
      const title = cleanTitle(e.title);
      return { title, summary: entrySummary(e, title, new Set()) };
    }),
  );

  for (const e of parsed.entries) {
    const link = safeUrl(e.link, base) ?? safeUrl(e.guid);
    if (!link) continue;

    const html = e.summaryHtml || e.excerptHtml || e.contentHtml || '';
    const title = cleanTitle(e.title) || truncate(htmlToText(html), 120);
    if (!title) continue;

    const id = itemId(feed.id, e.guid || link);
    if (seen.has(id) || seen.has(link)) continue;
    seen.add(id);
    seen.add(link);

    const publishedAt = normalizeDate(e.published, fetchedAt);
    if (publishedAt < fetchedAt - MAX_AGE_MS) continue;

    const imageUrl =
      safeUrl(e.imageUrl, link) ??
      safeUrl(firstImageSrc(e.contentHtml ?? '') ?? firstImageSrc(e.summaryHtml ?? ''), link);

    const item: Item = {
      id,
      feedId: feed.id,
      title,
      link,
      summary: entrySummary(e, title, repeated),
      publishedAt,
      fetchedAt,
    };
    if (imageUrl) item.imageUrl = sizedImage(imageUrl);
    const author = e.author ? truncate(htmlToText(e.author), 80) : '';
    if (author) item.author = author;
    items.push(item);
  }
  return items;
}
