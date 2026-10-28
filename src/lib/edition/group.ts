import type { Item } from '../types';

export const STORY_WINDOW_MS = 12 * 60 * 60 * 1000;
export const JACCARD_THRESHOLD = 0.5;
/** Headlines with fewer distinctive words than this never group (too easy to collide). */
const MIN_TOKENS = 3;

const STOPWORDS = new Set(
  (
    'a an and are as at be been but by for from has have he her his how in into is it its of on ' +
    'or our over says said she so than that the their them they this to up was we were what when ' +
    'which who why will with you your after before about amid new just more could would should ' +
    'not no can may might us vs via'
  ).split(' '),
);

/** Lowercase, strip accents and punctuation, drop stopwords, light plural stemming. */
export function headlineTokens(title: string): Set<string> {
  const words = title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ');
  const out = new Set<string>();
  for (const w of words) {
    if (w.length < 2 || STOPWORDS.has(w)) continue;
    out.add(w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Group items that are the same story: different feeds, published within 12 hours of each
 * other, with strongly overlapping headlines. Returns itemId → storyId, where storyId is the
 * id of the earliest item in the group (stable as later coverage arrives).
 */
export function groupStories(
  items: Item[],
  windowMs = STORY_WINDOW_MS,
  threshold = JACCARD_THRESHOLD,
): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.publishedAt - b.publishedAt || (a.id < b.id ? -1 : 1));
  const tokens = sorted.map((i) => headlineTokens(i.title));
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  // Union into the earlier root so the root is always the earliest item.
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };

  const index = new Map<string, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    const mine = tokens[i]!;
    if (mine.size >= MIN_TOKENS) {
      const candidates = new Set<number>();
      for (const t of mine) for (const j of index.get(t) ?? []) candidates.add(j);
      for (const j of candidates) {
        const other = sorted[j]!;
        if (other.feedId === item.feedId) continue;
        if (item.publishedAt - other.publishedAt > windowMs) continue;
        if (jaccard(mine, tokens[j]!) >= threshold) union(i, j);
      }
      for (const t of mine) {
        const list = index.get(t);
        if (list) list.push(i);
        else index.set(t, [i]);
      }
    }
  }

  const out = new Map<string, string>();
  sorted.forEach((item, i) => out.set(item.id, sorted[find(i)]!.id));
  return out;
}
