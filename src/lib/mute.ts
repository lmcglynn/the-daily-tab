import { foldText as fold } from './search';
import type { Item } from './types';

export const MAX_MUTED = 50;
export const MAX_MUTED_LENGTH = 60;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Trimmed, single-spaced, no duplicates (ignoring case and accents), at most 50. */
export function cleanMutedWords(list: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const word = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_MUTED_LENGTH);
    const key = fold(word);
    if (!word || seen.has(key)) continue;
    seen.add(key);
    out.push(word);
  }
  return out.slice(0, MAX_MUTED);
}

/**
 * True for a story whose headline or summary mentions a muted word or phrase: whole words,
 * ignoring case and accents, plus plurals and possessives ("drone" mutes "drones", "Musk’s").
 */
export function muteMatcher(words: string[]): (item: Pick<Item, 'title' | 'summary'>) => boolean {
  const parts = words
    .map((w) => fold(w).trim())
    .filter(Boolean)
    .map((w) => w.split(/\s+/).map(escape).join('\\s+'));
  if (parts.length === 0) return () => false;
  const re = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${parts.join('|')})(?:['’]s|es|s)?(?![\\p{L}\\p{N}])`,
    'u',
  );
  return (item) => re.test(fold(`${item.title}\n${item.summary}`));
}
