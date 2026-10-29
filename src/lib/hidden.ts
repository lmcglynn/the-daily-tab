import type { HiddenStory, Item } from './types';

/** Stories the reader hid ("Hide this story"); chrome.storage.local, per device. */
export const HIDDEN_KEY = 'hidden';
/** Items are pruned after 30 days, so a hidden story can't come back after that. */
const KEEP_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_HIDDEN = 1000;

export function hideItem(list: HiddenStory[], item: Item, now: number): HiddenStory[] {
  if (list.some((h) => h.id === item.id)) return list;
  const entry: HiddenStory = { id: item.id, at: now };
  if (item.storyId) entry.storyId = item.storyId;
  return [entry, ...list].slice(0, MAX_HIDDEN);
}

/** Item ids and story ids to leave out: hiding a story hides every feed's version of it. */
export function hiddenKeys(list: HiddenStory[]): Set<string> {
  const keys = new Set<string>();
  for (const h of list) {
    keys.add(h.id);
    if (h.storyId) keys.add(h.storyId);
  }
  return keys;
}

export const isHidden = (keys: Set<string>, item: Pick<Item, 'id' | 'storyId'>) =>
  keys.has(item.id) || (!!item.storyId && keys.has(item.storyId));

/** As stored, tolerating anything malformed; entries older than 30 days are dropped. */
export function asHidden(raw: unknown, now: number): HiddenStory[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object'
      ? Object.values(raw as Record<string, unknown>)
      : [];
  const out: HiddenStory[] = [];
  for (const h of list as Partial<HiddenStory>[]) {
    if (!h || typeof h.id !== 'string' || typeof h.at !== 'number') continue;
    if (now - h.at > KEEP_MS) continue;
    const entry: HiddenStory = { id: h.id, at: h.at };
    if (typeof h.storyId === 'string') entry.storyId = h.storyId;
    out.push(entry);
  }
  return out.slice(0, MAX_HIDDEN);
}
