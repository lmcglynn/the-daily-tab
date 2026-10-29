import type { Clipping, Feed, Item } from './types';

/** Saved stories live in chrome.storage.local: per device, never pruned with the items. */
export const CLIPPINGS_KEY = 'clippings';
export const MAX_CLIPPINGS = 200;

const isWebUrl = (u: unknown): u is string => typeof u === 'string' && /^https?:\/\//i.test(u);

/** A self-contained copy of a story, so it outlives the item (pruned after 30 days). */
export function clipFromItem(item: Item, feed: Feed | undefined, now: number): Clipping {
  const clip: Clipping = {
    id: item.id,
    title: item.title,
    link: item.link,
    source: feed?.title ?? '',
    summary: item.summary,
    publishedAt: item.publishedAt,
    savedAt: now,
  };
  if (item.imageUrl) clip.imageUrl = item.imageUrl;
  return clip;
}

/** Save it (newest first) or, if already saved, remove it. */
export function toggleClipping(list: Clipping[], clip: Clipping): Clipping[] {
  if (list.some((c) => c.id === clip.id)) return list.filter((c) => c.id !== clip.id);
  return [clip, ...list].slice(0, MAX_CLIPPINGS);
}

/** Clippings as stored, tolerating anything malformed (and the {"0": …} array shape). */
export function asClippings(raw: unknown): Clipping[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const out: Clipping[] = [];
  for (const c of list as Partial<Clipping>[]) {
    if (!c || typeof c.id !== 'string' || typeof c.title !== 'string' || !isWebUrl(c.link)) {
      continue;
    }
    if (out.some((o) => o.id === c.id)) continue;
    const clip: Clipping = {
      id: c.id,
      title: c.title,
      link: c.link,
      source: typeof c.source === 'string' ? c.source : '',
      summary: typeof c.summary === 'string' ? c.summary : '',
      publishedAt: typeof c.publishedAt === 'number' ? c.publishedAt : 0,
      savedAt: typeof c.savedAt === 'number' ? c.savedAt : 0,
    };
    if (isWebUrl(c.imageUrl)) clip.imageUrl = c.imageUrl;
    out.push(clip);
  }
  return out.slice(0, MAX_CLIPPINGS);
}
