import type { DailyTabDB } from '../db';
import type { Edition, Feed, Item } from '../types';
import { composeEdition, sameLayout } from './compose';
import { groupStories } from './group';

const GROUP_WINDOW_MS = 48 * 60 * 60 * 1000;
const KEEP_EDITIONS = 20;

/** Assign storyIds to recent items, persisting only the ones that changed. */
export async function assignStories(db: DailyTabDB, now: number): Promise<Item[]> {
  return db.transaction('rw', db.items, async () => {
    const recent = await db.items
      .where('publishedAt')
      .aboveOrEqual(now - GROUP_WINDOW_MS)
      .toArray();
    const stories = groupStories(recent);
    const size = new Map<string, number>();
    for (const root of stories.values()) size.set(root, (size.get(root) ?? 0) + 1);
    const changed: Item[] = [];
    for (const item of recent) {
      const root = stories.get(item.id)!;
      // Singletons carry no storyId; it marks cross-feed groups only.
      const next = size.get(root)! > 1 ? root : undefined;
      if (next !== item.storyId) {
        if (next) item.storyId = next;
        else delete item.storyId;
        changed.push(item);
      }
    }
    if (changed.length) await db.items.bulkPut(changed);
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
): Promise<PublishResult> {
  await assignStories(db, now);
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
