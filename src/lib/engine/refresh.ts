import type { DailyTabDB } from '../db';
import { MAX_AGE_MS } from '../feed/normalize';
import type { Feed, FeedState, Item } from '../types';
import { FETCH_TIMEOUT_MS, fetchFeed } from './fetch';

export const MAX_PARALLEL = 6;
export const MAX_ITEMS_PER_FEED = 200;
export const MAX_BACKOFF_MS = 6 * 60 * 60 * 1000;

export interface RefreshDeps {
  db: DailyTabDB;
  feeds: Feed[];
  fetch: typeof fetch;
  now: () => number;
  refreshMinutes: number;
  /** Ignore backoff windows (manual refresh). */
  force?: boolean;
  /** Host permission check; feeds without access are skipped and marked. */
  hasAccess?: (url: string) => Promise<boolean>;
  concurrency?: number;
  timeoutMs?: number;
  /** Waits before retrying a transient failure (see fetchFeed); [] disables retries. */
  retryDelaysMs?: number[];
}

export interface RefreshReport {
  fetched: number;
  notModified: number;
  failed: number;
  skipped: number;
  newItems: number;
  durationMs: number;
}

/** Wait after the Nth consecutive failure: the interval doubled per failure, capped at 6 h. */
export function backoffMs(refreshMinutes: number, failCount: number): number {
  return Math.min(refreshMinutes * 60_000 * 2 ** failCount, MAX_BACKOFF_MS);
}

/** Run `fn` over `inputs` with at most `limit` in flight. */
export async function runPool<T>(
  inputs: T[],
  limit: number,
  fn: (input: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < inputs.length) {
      const input = inputs[next++]!;
      await fn(input);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, inputs.length) }, worker));
}

export async function refreshFeeds(deps: RefreshDeps): Promise<RefreshReport> {
  const { db } = deps;
  const started = deps.now();
  const report: RefreshReport = {
    fetched: 0,
    notModified: 0,
    failed: 0,
    skipped: 0,
    newItems: 0,
    durationMs: 0,
  };

  await runPool(deps.feeds, deps.concurrency ?? MAX_PARALLEL, async (feed) => {
    const prev: FeedState = (await db.feedState.get(feed.id)) ?? {
      feedId: feed.id,
      status: 'pending',
      failCount: 0,
    };
    const now = deps.now();

    if (!deps.force && prev.nextFetchAt && prev.nextFetchAt > now) {
      report.skipped++;
      return;
    }
    if (deps.hasAccess && !(await deps.hasAccess(feed.url))) {
      report.skipped++;
      await db.feedState.put({ ...prev, status: 'no-permission' });
      return;
    }

    const outcome = await fetchFeed(feed, prev, {
      fetch: deps.fetch,
      now,
      timeoutMs: deps.timeoutMs ?? FETCH_TIMEOUT_MS,
      ...(deps.retryDelaysMs && { retryDelaysMs: deps.retryDelaysMs }),
    });
    const next: FeedState = { ...prev, lastFetchedAt: now };

    if (outcome.kind === 'error') {
      report.failed++;
      next.status = 'error';
      next.failCount = prev.failCount + 1;
      next.lastError = outcome.error;
      next.lastErrorAt = now;
      next.nextFetchAt = now + backoffMs(deps.refreshMinutes, next.failCount);
    } else {
      next.status = 'ok';
      next.failCount = 0;
      next.lastSuccessAt = now;
      delete next.nextFetchAt;
      if (outcome.kind === 'not-modified') {
        report.notModified++;
      } else {
        report.fetched++;
        report.newItems += await storeItems(db, outcome.items);
        if (outcome.etag) next.etag = outcome.etag;
        else delete next.etag;
        if (outcome.lastModified) next.lastModified = outcome.lastModified;
        else delete next.lastModified;
      }
    }
    await db.feedState.put(next);
  });

  await prune(
    db,
    deps.feeds.map((f) => f.id),
    deps.now(),
  );
  report.durationMs = deps.now() - started;
  return report;
}

/**
 * Upsert items, keeping what the reader and the grouper added (readAt, storyId) and the
 * first-seen time. Runs in one transaction so a concurrent "mark read" is never lost.
 * Returns the number of items not seen before.
 */
export async function storeItems(db: DailyTabDB, items: Item[]): Promise<number> {
  if (items.length === 0) return 0;
  return db.transaction('rw', db.items, async () => {
    const existing = await db.items.bulkGet(items.map((i) => i.id));
    let added = 0;
    const merged = items.map((item, i) => {
      const old = existing[i];
      if (!old) {
        added++;
        return item;
      }
      const m: Item = { ...item, fetchedAt: old.fetchedAt, publishedAt: old.publishedAt };
      if (old.readAt) m.readAt = old.readAt;
      if (old.storyId) m.storyId = old.storyId;
      return m;
    });
    await db.items.bulkPut(merged);
    return added;
  });
}

/** Keep at most 200 items per feed and nothing older than 30 days; drop removed feeds. */
export async function prune(db: DailyTabDB, feedIds: string[], now: number): Promise<number> {
  return db.transaction('rw', db.items, db.feedState, async () => {
    let removed = await db.items
      .where('publishedAt')
      .below(now - MAX_AGE_MS)
      .delete();

    const orphanIds = await db.items.where('feedId').noneOf(feedIds).primaryKeys();
    await db.items.bulkDelete(orphanIds);
    removed += orphanIds.length;
    await db.feedState.where('feedId').noneOf(feedIds).delete();

    for (const feedId of feedIds) {
      const overflow = await db.items
        .where('[feedId+publishedAt]')
        .between([feedId, -Infinity], [feedId, Infinity])
        .reverse()
        .offset(MAX_ITEMS_PER_FEED)
        .primaryKeys();
      await db.items.bulkDelete(overflow);
      removed += overflow.length;
    }
    return removed;
  });
}
