import { browser } from 'wxt/browser';
import { normalizeSettings } from './defaults';
import type { Feed, Settings } from './types';

export { DEFAULT_SETTINGS, DEFAULT_SPOT, normalizeSettings } from './defaults';

const SETTINGS_KEY = 'settings';
const FEED_PREFIX = 'feed:';
const LAST_VISIT_KEY = 'lastVisitAt';

export const feedKey = (id: string) => `${FEED_PREFIX}${id}`;
export const isFeedKey = (key: string) => key.startsWith(FEED_PREFIX);

export async function getSettings(): Promise<Settings> {
  const got = await browser.storage.sync.get(SETTINGS_KEY);
  return normalizeSettings(got[SETTINGS_KEY]);
}

/**
 * Normalizing on write also turns any reactive Proxy in `patch` into plain arrays/objects;
 * Chrome would otherwise store a proxied array as {"0": …}.
 */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = normalizeSettings({ ...(await getSettings()), ...patch });
  await browser.storage.sync.set({ [SETTINGS_KEY]: next });
  return next;
}

export async function getFeeds(): Promise<Feed[]> {
  const all = await browser.storage.sync.get(null);
  return Object.entries(all)
    .filter(([k]) => isFeedKey(k))
    .map(([, v]) => v as Feed)
    .sort((a, b) => a.order - b.order);
}

export async function saveFeeds(feeds: Feed[]): Promise<void> {
  if (feeds.length === 0) return;
  await browser.storage.sync.set(Object.fromEntries(feeds.map((f) => [feedKey(f.id), f])));
}

export async function removeFeed(id: string): Promise<void> {
  await browser.storage.sync.remove(feedKey(id));
}

export async function getLastVisitAt(): Promise<number | undefined> {
  const got = await browser.storage.local.get(LAST_VISIT_KEY);
  return got[LAST_VISIT_KEY] as number | undefined;
}

/** Everything the new tab reads from storage.local in one call. */
export async function getLocalState(): Promise<Record<string, unknown>> {
  return browser.storage.local.get([LAST_VISIT_KEY, 'weather', 'markets']);
}

export async function setLastVisitAt(t: number): Promise<void> {
  await browser.storage.local.set({ [LAST_VISIT_KEY]: t });
}
