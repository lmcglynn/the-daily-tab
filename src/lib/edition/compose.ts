import type { Edition, Feed, Item } from '../types';
import { STORY_WINDOW_MS } from './group';

export const SECONDARY_COUNT = 3;
export const BAND_SIZE = 4;
export const BRIEF_COUNT = 12;
/** Front page draws from the last day and a half; quiet feeds fall back to the newest items. */
const POOL_WINDOW_MS = 36 * 60 * 60 * 1000;
const POOL_MIN = 24;
const POOL_FALLBACK = 150;

export interface ComposeInput {
  items: Item[];
  feeds: Feed[];
  /** Preferred section order; categories not listed follow in feed order. */
  sections: string[];
  now: number;
  previousNumber: number;
}

export function sectionOrder(feeds: Feed[], preferred: string[]): string[] {
  const present = new Set(feeds.map((f) => f.category));
  const ordered = preferred.filter((s) => present.has(s));
  for (const f of [...feeds].sort((a, b) => a.order - b.order)) {
    if (!ordered.includes(f.category)) ordered.push(f.category);
  }
  return ordered;
}

const newestFirst = (a: Item, b: Item) => b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : 1);
const storyOf = (i: Item) => i.storyId ?? i.id;

/**
 * Lay out an edition:
 * - Lead: the largest same-story group across feeds in the last 12 h; otherwise the newest
 *   photo story from the top section.
 * - Secondary: newest photo stories from the other sections.
 * - Section bands: newest remaining stories per section.
 * - In Brief: the rest, newest first.
 * Each story (storyId) appears once.
 */
export function composeEdition(input: ComposeInput): Edition | null {
  const { feeds, now } = input;
  const categoryOf = new Map(feeds.map((f) => [f.id, f.category]));
  const sections = sectionOrder(feeds, input.sections);

  const known = input.items.filter((i) => categoryOf.has(i.feedId)).sort(newestFirst);
  let pool = known.filter((i) => i.publishedAt >= now - POOL_WINDOW_MS);
  if (pool.length < POOL_MIN) pool = known.slice(0, POOL_FALLBACK);
  if (pool.length === 0) return null;

  const used = new Set<string>();
  const take = (i: Item) => {
    used.add(storyOf(i));
    return i.id;
  };
  const free = (i: Item) => !used.has(storyOf(i));
  const cat = (i: Item) => categoryOf.get(i.feedId)!;

  // Lead
  const groups = new Map<string, Item[]>();
  for (const i of pool) {
    if (i.publishedAt < now - STORY_WINDOW_MS || !i.storyId) continue;
    const g = groups.get(i.storyId);
    if (g) g.push(i);
    else groups.set(i.storyId, [i]);
  }
  const feedCount = (g: Item[]) => new Set(g.map((i) => i.feedId)).size;
  const best = [...groups.values()]
    .filter((g) => feedCount(g) >= 2)
    .sort((a, b) => feedCount(b) - feedCount(a) || newestFirst(a[0]!, b[0]!))[0];

  let lead: Item;
  let related: Item[] = [];
  if (best) {
    const rank = (i: Item) => sections.indexOf(cat(i));
    const byPreference = [...best].sort(
      (a, b) => +!!b.imageUrl - +!!a.imageUrl || rank(a) - rank(b) || newestFirst(a, b),
    );
    lead = byPreference[0]!;
    const seenFeeds = new Set([lead.feedId]);
    related = byPreference
      .slice(1)
      .filter((i) => !seenFeeds.has(i.feedId) && seenFeeds.add(i.feedId));
  } else {
    const top = sections[0];
    lead =
      pool.find((i) => cat(i) === top && i.imageUrl) ??
      pool.find((i) => cat(i) === top) ??
      pool.find((i) => i.imageUrl) ??
      pool[0]!;
  }
  const leadItemId = take(lead);

  // Secondary: round-robin over the other sections, photo stories from feeds not yet on the
  // page first, then any photo story, then (if short) the lead's section and photo-less ones.
  const secondary: string[] = [];
  const feedsUsed = new Set([lead.feedId]);
  const others = sections.filter((s) => s !== cat(lead));
  const fill = (accept: (i: Item) => boolean) => {
    let progress = true;
    while (secondary.length < SECONDARY_COUNT && progress) {
      progress = false;
      for (const s of others) {
        if (secondary.length >= SECONDARY_COUNT) break;
        const pick = pool.find((i) => free(i) && cat(i) === s && accept(i));
        if (pick) {
          feedsUsed.add(pick.feedId);
          secondary.push(take(pick));
          progress = true;
        }
      }
    }
  };
  const photo = (i: Item) => !!i.imageUrl;
  const freshPhoto = (i: Item) => photo(i) && !feedsUsed.has(i.feedId);
  fill(freshPhoto);
  fill(photo);
  if (secondary.length < SECONDARY_COUNT) {
    others.push(cat(lead));
    fill(freshPhoto);
    fill(photo);
    fill(() => true);
  }

  // Section bands
  const bands = sections
    .map((category) => {
      const itemIds: string[] = [];
      for (const i of pool) {
        if (itemIds.length >= BAND_SIZE) break;
        if (cat(i) === category && free(i)) itemIds.push(take(i));
      }
      return { category, itemIds };
    })
    .filter((b) => b.itemIds.length > 0);

  // In Brief
  const briefItemIds: string[] = [];
  for (const i of pool) {
    if (briefItemIds.length >= BRIEF_COUNT) break;
    if (free(i)) briefItemIds.push(take(i));
  }

  return {
    id: `ed-${now}`,
    number: input.previousNumber + 1,
    composedAt: now,
    leadItemId,
    leadRelatedItemIds: related.map((i) => i.id),
    secondaryItemIds: secondary,
    sections: bands,
    briefItemIds,
  };
}

export function editionItemIds(e: Edition): string[] {
  return [
    e.leadItemId,
    ...e.leadRelatedItemIds,
    ...e.secondaryItemIds,
    ...e.sections.flatMap((s) => s.itemIds),
    ...e.briefItemIds,
  ];
}

/** Same layout, ignoring id/number/time: no need to announce a "new edition". */
export function sameLayout(a: Edition, b: Edition): boolean {
  const key = (e: Edition) =>
    JSON.stringify([e.leadItemId, e.secondaryItemIds, e.sections, e.briefItemIds]);
  return key(a) === key(b);
}
