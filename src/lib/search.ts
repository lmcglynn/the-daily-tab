// Search over the stories stored on this device (about 30 days). Pure and in memory: the page
// loads the items once when search opens and filters them on every keystroke.
import type { Item } from './types';

/** Lowercase without accents, so "pokemon" finds "Pokémon". */
export const foldText = (s: string) => s.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export interface SearchEntry {
  item: Item;
  title: string;
  text: string;
}

export const searchIndex = (items: Item[]): SearchEntry[] =>
  items.map((item) => ({
    item,
    title: foldText(item.title),
    text: foldText(`${item.title}\n${item.summary}`),
  }));

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface SearchResult {
  items: Item[];
  /** Matches before the limit. */
  total: number;
}

/**
 * Stories whose headline or summary has every word of the query, each matching the start of a
 * word ("ukr" finds "Ukraine"). Stories with every word in the headline come first, then the
 * rest; newest first within each.
 */
export function searchStories(index: SearchEntry[], query: string, limit = 40): SearchResult {
  const words = foldText(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return { items: [], total: 0 };
  const res = words.map((w) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(w)}`, 'u'));
  const hits = index.filter((e) => res.every((re) => re.test(e.text)));
  const inTitle = (e: SearchEntry) => res.every((re) => re.test(e.title));
  hits.sort(
    (a, b) =>
      Number(inTitle(b)) - Number(inTitle(a)) ||
      b.item.publishedAt - a.item.publishedAt ||
      (a.item.id < b.item.id ? -1 : 1),
  );
  return { items: hits.slice(0, limit).map((e) => e.item), total: hits.length };
}
