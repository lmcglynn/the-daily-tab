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

/**
 * A light stemmer: the forms of a word headlines use for the same event share a stem
 * ("indicts", "indicted" → "indict"; "strikes", "striking", "strike" → "strik";
 * "dies", "died", "die" → "di"). Consistent rather than linguistically right.
 */
export function stem(word: string): string {
  let s = word;
  if (/^[a-z]ie[sd]$/.test(s)) return `${s[0]}i`;
  if (s.length > 5 && s.endsWith('ing')) s = s.slice(0, -3);
  else if (s.length > 4 && (s.endsWith('ied') || s.endsWith('ies'))) s = `${s.slice(0, -3)}y`;
  else if (s.length > 4 && s.endsWith('ed')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('es') && !s.endsWith('ses')) s = s.slice(0, -2);
  else if (s.length > 3 && s.endsWith('s') && !/(ss|us|is)$/.test(s)) s = s.slice(0, -1);
  if (s.length > 2 && s.endsWith('e')) s = s.slice(0, -1);
  if (s.length > 3 && s.endsWith('y')) s = `${s.slice(0, -1)}i`;
  // "ramming" → "ramm" → "ram", "planned" → "plan"
  if (s.length > 3 && /([b-df-hj-km-rtv-z])\1$/.test(s)) s = s.slice(0, -1);
  return s;
}

const words = (text: string) =>
  text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]s\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length >= 2 && !STOPWORDS.has(w));

/** Lowercase, strip accents and punctuation, drop stopwords, stem. */
export function headlineTokens(title: string): Set<string> {
  return new Set(words(title).map(stem));
}

/** The summary's first sentence: the facts a headline is written from. */
export function firstSentence(summary: string): string {
  const flat = summary.replace(/\s+/g, ' ').trim();
  const end = flat.search(/[.!?](\s|$)/);
  return (end === -1 ? flat : flat.slice(0, end + 1)).slice(0, 240);
}

/** Headline and first sentence, as stems: what two items are compared on. */
export function storyTokens(item: Pick<Item, 'title' | 'summary'>): Set<string> {
  return new Set(words(`${item.title} ${firstSentence(item.summary)}`).map(stem));
}

/**
 * How rare each stem is across a set of stories (inverse document frequency): a name or a
 * specific word ("indict", "houston") says more about which event a story is than "man".
 */
export function rarity(sets: Set<string>[]): (token: string) => number {
  const df = new Map<string, number>();
  for (const s of sets) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const n = sets.length;
  // Worked out once: grouping compares every pair within the window.
  const weights = new Map([...df].map(([t, d]) => [t, Math.log(1 + n / d)]));
  return (t) => weights.get(t) ?? Math.log(1 + n);
}

/** Overlap of two stories, each word weighted by its rarity (a weighted Jaccard index). */
export function weightedOverlap(
  a: Set<string>,
  b: Set<string>,
  weight: (token: string) => number,
): number {
  let shared = 0;
  let all = 0;
  for (const t of a) {
    const w = weight(t);
    all += w;
    if (b.has(t)) shared += w;
  }
  for (const t of b) if (!a.has(t)) all += weight(t);
  return all ? shared / all : 0;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Across outlets: the share of rarity-weighted words (headline and first sentence) two stories
 * must have in common. Tuned on a day of the starter feeds: above it, pairs were the same event
 * worded differently ("ICE Agent Indicted…" / "…indicts ICE agent accused of using SUV…").
 */
export const OVERLAP_THRESHOLD = 0.22;
/**
 * Within one outlet only near-copies group (a story posted twice): an outlet's series share
 * most words ("How to watch Lakers vs. Warriors…", "…vs. Knicks…") and are different stories.
 */
const SAME_OUTLET_OVERLAP = 0.8;

/**
 * Group items that are the same story, published within 12 hours of each other. From different
 * outlets: headlines half the same, or headline-and-first-sentence words overlapping enough once
 * weighted by rarity. From the same outlet: the same headline and near-identical text. Returns
 * itemId → storyId, where storyId is the id of the earliest item in the group (stable as later
 * coverage arrives). `outletOf` names a feed's outlet (feeds with the same title are one);
 * without it each feed is its own outlet.
 */
export function groupStories(
  items: Item[],
  windowMs = STORY_WINDOW_MS,
  outletOf: (feedId: string) => string = (feedId) => feedId,
): Map<string, string> {
  const sorted = [...items].sort((a, b) => a.publishedAt - b.publishedAt || (a.id < b.id ? -1 : 1));
  const heads = sorted.map((i) => headlineTokens(i.title));
  const texts = sorted.map(storyTokens);
  const weight = rarity(texts);
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

  // Candidates share a headline word, or a word of the text that isn't everywhere ("Trump",
  // "says"): pairs sharing neither can't reach either threshold, and most pairs are such.
  const common = Math.max(5, sorted.length / 10);
  const df = new Map<string, number>();
  for (const s of texts) for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
  const keys = sorted.map(
    (_, i) => new Set([...heads[i]!, ...[...texts[i]!].filter((t) => df.get(t)! <= common)]),
  );
  const index = new Map<string, number[]>();
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]!;
    if (heads[i]!.size < MIN_TOKENS) continue;
    const candidates = new Set<number>();
    for (const t of keys[i]!) for (const j of index.get(t) ?? []) candidates.add(j);
    for (const t of keys[i]!) {
      const list = index.get(t);
      if (list) list.push(i);
      else index.set(t, [i]);
    }
    for (const j of candidates) {
      const other = sorted[j]!;
      if (item.publishedAt - other.publishedAt > windowMs) continue;
      const head = jaccard(heads[i]!, heads[j]!);
      const same =
        outletOf(item.feedId) === outletOf(other.feedId)
          ? head === 1 && weightedOverlap(texts[i]!, texts[j]!, weight) >= SAME_OUTLET_OVERLAP
          : head >= JACCARD_THRESHOLD ||
            weightedOverlap(texts[i]!, texts[j]!, weight) >= OVERLAP_THRESHOLD;
      if (same) union(i, j);
    }
  }

  const out = new Map<string, string>();
  sorted.forEach((item, i) => out.set(item.id, sorted[find(i)]!.id));
  return out;
}
