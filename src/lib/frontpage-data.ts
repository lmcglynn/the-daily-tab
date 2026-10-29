// Everything the new tab reads, all from local storage; no network on this path.
import { asClippings } from './clippings';
import { asHidden } from './hidden';
import type { DailyTabDB } from './db';
import { editionItemIds } from './edition/compose';
import { normalizeSettings } from './defaults';
import { getFeeds, getLocalState, getSettings, isFeedKey } from './storage';
import type {
  Clipping,
  Edition,
  Feed,
  FeedState,
  HiddenStory,
  Item,
  MarketReport,
  ScoreReport,
  Settings,
  WeatherReport,
} from './types';

export interface Snapshot {
  edition: Edition | null;
  items: Map<string, Item>;
  feeds: Feed[];
  states: FeedState[];
  settings: Settings;
  /** The previous visit, used for "new since"; this visit is recorded when the page is left. */
  lastVisitAt: number | undefined;
  /** Cached by the background (lib/extras); shown only if they match current settings. */
  weather: WeatherReport | null;
  /** Quotes by symbol. */
  markets: Record<string, MarketReport>;
  /** Saved stories, newest first. */
  clippings: Clipping[];
  /** Scores by league:id. */
  scores: Record<string, ScoreReport>;
  /** Stories the reader hid. */
  hidden: HiddenStory[];
}

/** Pull the storage.local values the front page uses, tolerating anything malformed. */
export function localExtras(local: Record<string, unknown>) {
  const lastVisitAt = local.lastVisitAt;
  const weather = local.weather as WeatherReport | undefined;
  const markets: Record<string, MarketReport> = {};
  if (local.markets && typeof local.markets === 'object') {
    for (const [symbol, q] of Object.entries(local.markets as Record<string, MarketReport>)) {
      if (q && typeof q.price === 'number' && typeof q.previousClose === 'number') {
        markets[symbol] = q;
      }
    }
  }
  return {
    lastVisitAt: typeof lastVisitAt === 'number' ? lastVisitAt : undefined,
    weather: weather && typeof weather.temp === 'number' ? weather : null,
    markets,
    clippings: asClippings(local.clippings),
    scores: asScores(local.scores),
    hidden: asHidden(local.hidden, Date.now()),
  };
}

function asScores(v: unknown): Record<string, ScoreReport> {
  const out: Record<string, ScoreReport> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [key, r] of Object.entries(v as Record<string, ScoreReport>)) {
    if (r && typeof r.at === 'number' && ('last' in r || 'current' in r)) out[key] = r;
  }
  return out;
}

/** What public/prefetch.js leaves on globalThis.__dailyTabPrefetch. */
export interface PrefetchRaw {
  db: { edition: Edition | null; items: Item[]; states: FeedState[] } | null;
  sync: Record<string, unknown>;
  local: Record<string, unknown>;
}

/** Build a snapshot from the prefetched reads; null means "fall back to Dexie". */
export function snapshotFromPrefetch(raw: PrefetchRaw | null): Snapshot | null {
  if (!raw?.db) return null;
  const feeds = Object.entries(raw.sync)
    .filter(([k]) => isFeedKey(k))
    .map(([, v]) => v as Feed)
    .sort((a, b) => a.order - b.order);
  return {
    edition: raw.db.edition,
    items: new Map(raw.db.items.map((i) => [i.id, i])),
    feeds,
    states: raw.db.states,
    settings: normalizeSettings(raw.sync.settings),
    ...localExtras(raw.local),
  };
}

const prefetchSlot = globalThis as { __dailyTabPrefetch?: Promise<PrefetchRaw | null> };

/**
 * Load everything the front page shows. `getDb` is only awaited on the fallback path, so the
 * new tab can paint without Dexie having loaded.
 */
export async function loadSnapshot(getDb: () => Promise<DailyTabDB>): Promise<Snapshot> {
  // First load of a new tab: the reads started during HTML parsing (consumed once).
  const prefetched = prefetchSlot.__dailyTabPrefetch;
  if (prefetched) {
    delete prefetchSlot.__dailyTabPrefetch;
    const snap = snapshotFromPrefetch(await prefetched);
    if (snap) return snap;
  }
  const db = await getDb();
  const editionP = db.latestEdition();
  const itemsP = editionP.then((e) => (e ? loadEditionItems(db, e) : new Map<string, Item>()));
  const [edition, items, feeds, states, settings, local] = await Promise.all([
    editionP,
    itemsP,
    getFeeds(),
    db.feedState.toArray(),
    getSettings(),
    getLocalState(),
  ]);
  return { edition: edition ?? null, items, feeds, states, settings, ...localExtras(local) };
}

export async function loadEditionItems(
  db: DailyTabDB,
  edition: Edition,
): Promise<Map<string, Item>> {
  const ids = editionItemIds(edition);
  const found = await db.items.bulkGet(ids);
  const map = new Map<string, Item>();
  for (const item of found) if (item) map.set(item.id, item);
  return map;
}

/** Stories in `next` that the reader hasn't been shown in `current`. */
export function newStoryCount(current: Edition | null, next: Edition): number {
  const shown = new Set(current ? editionItemIds(current) : []);
  const placed = [
    next.leadItemId,
    ...next.secondaryItemIds,
    ...(next.leadColumnItemIds ?? []),
    ...next.sections.flatMap((s) => s.itemIds),
    ...next.briefItemIds,
  ];
  return placed.filter((id) => !shown.has(id)).length;
}

/**
 * The next newest stories in a section that aren't already on the page. `exclude` holds the
 * item ids and story ids already shown, so other feeds' versions of a story are skipped too.
 */
export async function moreInSection(
  db: DailyTabDB,
  feeds: Feed[],
  category: string,
  exclude: Set<string>,
  limit = 6,
  muted: (item: Item) => boolean = () => false,
): Promise<Item[]> {
  const feedIds = feeds.filter((f) => f.category === category).map((f) => f.id);
  if (feedIds.length === 0) return [];
  const items = await db.items.where('feedId').anyOf(feedIds).toArray();
  const seenStories = new Set<string>();
  return items
    .filter((i) => !exclude.has(i.id) && !(i.storyId && exclude.has(i.storyId)) && !muted(i))
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .filter((i) => {
      const key = i.storyId ?? i.id;
      if (seenStories.has(key)) return false;
      seenStories.add(key);
      return true;
    })
    .slice(0, limit);
}

// Copy-on-write helpers: the page holds these maps as immutable state and swaps them whole.

export function withItems(items: Map<string, Item>, add: Item[]): Map<string, Item> {
  const next = new Map(items);
  for (const item of add) next.set(item.id, item);
  return next;
}

export function withEntry<V>(map: Map<string, V>, key: string, value: V | null): Map<string, V> {
  const next = new Map(map);
  if (value === null) next.delete(key);
  else next.set(key, value);
  return next;
}

/** Item ids and story ids currently on the page. */
export function shownKeys(items: Map<string, Item>): Set<string> {
  const keys = new Set<string>();
  for (const item of items.values()) {
    keys.add(item.id);
    if (item.storyId) keys.add(item.storyId);
  }
  return keys;
}

export async function markRead(db: DailyTabDB, id: string, now: number): Promise<void> {
  await db.items.update(id, { readAt: now });
}
