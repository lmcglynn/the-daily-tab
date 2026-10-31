// Routine posts: service pieces outlets publish in bulk that crowd stories off the page. Kept to
// shapes that don't occur in news headlines (a TV listing, a scores roundup, a puzzle, a
// fundraising appeal); "results" or "sale" alone appear in real stories ("election results",
// "sale of Patriot interceptors") and are left alone.
import type { Item } from './types';

export const ROUTINE_KINDS: { kind: string; label: string; patterns: RegExp[] }[] = [
  {
    kind: 'listings',
    label: 'TV listings',
    patterns: [/^how to watch\b.*\b(tv|stream)/i, /\btv channels? and streaming\b/i],
  },
  {
    kind: 'roundups',
    label: 'score roundups',
    patterns: [
      /^high school\b[^:]*:.*\b(scores|results|schedule)\b/i,
      /\b(scores|results),? (and )?schedule\b/i,
    ],
  },
  {
    kind: 'puzzles',
    label: 'puzzles',
    patterns: [
      /^the mini crossword\b/i,
      /\bcrossword:? (puzzle|answers)\b/i,
      /\bhints and answers\b/i,
      /^(wordle|strands|spelling bee)\b/i,
    ],
  },
  {
    kind: 'appeals',
    label: 'fundraising appeals',
    patterns: [/^(donate|support us|support our)\b/i, /\bbecome a (member|subscriber)\b/i],
  },
  {
    kind: 'shopping',
    label: 'shopping roundups',
    patterns: [/\bdeals (i|we)['’](m|re) shopping\b/i, /\b(best|top) [\w-]+ deals\b/i],
  },
];

/** Which kind of routine post a story is, or null for a story. Judged on the headline. */
export function routineKind(item: Pick<Item, 'title'>): string | null {
  for (const k of ROUTINE_KINDS) if (k.patterns.some((p) => p.test(item.title))) return k.kind;
  return null;
}

export const isRoutine = (item: Pick<Item, 'title'>) => routineKind(item) !== null;
