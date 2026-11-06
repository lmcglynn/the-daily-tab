import type { DailyTabDB } from '../db';
import { repeatedSummaries } from '../feed/text';
import type { Edition, Feed, Item } from '../types';
import { composeEdition, outletKey, sameLayout } from './compose';
import { groupStories } from './group';

const GROUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const KEEP_EDITIONS = 20;

/**
 * Blank summaries a feed repeats across stored stories, returning the items changed. Fetching
 * catches repeats within one copy of a feed; these came from several, or have left the feed.
 */
function forgetRepeatedSummaries(items: Item[]): Item[] {
  const byFeed = new Map<string, Item[]>();
  for (const item of items) {
    const list = byFeed.get(item.feedId);
    if (list) list.push(item);
    else byFeed.set(item.feedId, [item]);
  }
  const changed: Item[] = [];
  for (const list of byFeed.values()) {
    const repeated = repeatedSummaries(list);
    for (const item of list) {
      if (!repeated.has(item.summary)) continue;
      item.summary = '';
      changed.push(item);
    }
  }
  return changed;
}

/**
 * Assign storyIds to recent items, persisting only the ones that changed. `feeds` tells which
 * feeds are one outlet (same title), which group only near-copies of each other.
 */
export async function assignStories(
  db: DailyTabDB,
  now: number,
  feeds: Feed[] = [],
): Promise<Item[]> {
  const outletOf = new Map(feeds.map((f) => [f.id, outletKey(f)]));
  return db.transaction('rw', db.items, async () => {
    const recent = await db.items
      .where('publishedAt')
      .aboveOrEqual(now - GROUP_WINDOW_MS)
      .toArray();
    const changed = new Set(forgetRepeatedSummaries(recent));
    const stories = groupStories(recent, undefined, (id) => outletOf.get(id) ?? id);
    const size = new Map<string, number>();
    for (const root of stories.values()) size.set(root, (size.get(root) ?? 0) + 1);
    for (const item of recent) {
      const root = stories.get(item.id)!;
      // Singletons carry no storyId; it marks cross-feed groups only.
      const next = size.get(root)! > 1 ? root : undefined;
      if (next !== item.storyId) {
        if (next) item.storyId = next;
        else delete item.storyId;
        changed.add(item);
      }
    }
    if (changed.size) await db.items.bulkPut([...changed]);
    return recent;
  });
}

export interface PublishResult {
  edition: Edition | null;
  /** True when a new edition was stored (layout differs from the previous one). */
  isNew: boolean;
}

/** Group, compose and store a new edition if the front page changed. */
export async function publishEdition(
  db: DailyTabDB,
  feeds: Feed[],
  sections: string[],
  now: number,
  mutedWords: string[] = [],
  hidden: Set<string> = new Set(),
  skipRoutine = false,
): Promise<PublishResult> {
  await assignStories(db, now, feeds);
  const items = await db.items
    .where('publishedAt')
    .aboveOrEqual(now - 30 * 24 * 60 * 60 * 1000)
    .toArray();
  const prev = await db.latestEdition();
  const edition = composeEdition({
    items,
    feeds,
    sections,
    now,
    previousNumber: prev?.number ?? 0,
    mutedWords,
    hidden,
    skipRoutine,
  });
  if (!edition) return { edition: prev ?? null, isNew: false };
  if (prev && sameLayout(prev, edition)) return { edition: prev, isNew: false };

  await db.transaction('rw', db.editions, async () => {
    await db.editions.put(edition);
    const stale = await db.editions
      .orderBy('composedAt')
      .reverse()
      .offset(KEEP_EDITIONS)
      .primaryKeys();
    await db.editions.bulkDelete(stale);
  });
  return { edition, isNew: true };
}
