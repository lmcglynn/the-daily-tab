// "Hide this story": take a story off the page in place, filling its spot from stories the
// reader hasn't been shown, so nothing else on the page moves.
import type { Edition, Item } from '../types';

export type Slot =
  | { kind: 'lead' }
  | { kind: 'secondary' }
  | { kind: 'leadColumn' }
  | { kind: 'band'; category: string }
  | { kind: 'brief' };

/** Where a story sits on the page, or null if it isn't placed (e.g. lent to the lead). */
export function slotOf(e: Edition, id: string): Slot | null {
  if (e.leadItemId === id) return { kind: 'lead' };
  if (e.secondaryItemIds.includes(id)) return { kind: 'secondary' };
  if (e.leadColumnItemIds?.includes(id)) return { kind: 'leadColumn' };
  const band = e.sections.find((s) => s.itemIds.includes(id));
  if (band) return { kind: 'band', category: band.category };
  if (e.briefItemIds.includes(id)) return { kind: 'brief' };
  return null;
}

export interface ReplacementOptions {
  /** feedId → section */
  categoryOf: Map<string, string>;
  /** Section of the story being hidden. */
  category: string;
  /** Item ids and story ids that can't be used (on the page, hidden). */
  exclude: Set<string>;
  muted: (item: Item) => boolean;
}

/**
 * The story to put in a hidden story's spot: a section band takes one from its own section;
 * the lead and the stories beside it prefer a photo, from the same section first; the lead
 * column and In Brief take the newest of any section. Null if nothing is left.
 */
export function findReplacement(items: Item[], slot: Slot, opts: ReplacementOptions): Item | null {
  const free = items
    .filter(
      (i) =>
        opts.categoryOf.has(i.feedId) &&
        !opts.exclude.has(i.id) &&
        !(i.storyId && opts.exclude.has(i.storyId)) &&
        !opts.muted(i),
    )
    .sort((a, b) => b.publishedAt - a.publishedAt || (a.id < b.id ? -1 : 1));
  const same = (i: Item) => opts.categoryOf.get(i.feedId) === opts.category;
  const photo = (i: Item) => !!i.imageUrl;
  const first = (...tests: ((i: Item) => boolean)[]) => {
    for (const test of tests) {
      const hit = free.find(test);
      if (hit) return hit;
    }
    return null;
  };
  switch (slot.kind) {
    case 'band':
      return first(same);
    case 'lead':
    case 'secondary':
      return first(
        (i) => same(i) && photo(i),
        photo,
        same,
        () => true,
      );
    default:
      return first(() => true);
  }
}

/**
 * The edition with `id` replaced by `replacement`, or removed when there's none. The lead is
 * never left empty: without a replacement, the first story beside it moves up.
 */
export function replaceInEdition(e: Edition, id: string, replacement: string | null): Edition {
  const swap = (ids: string[]) =>
    replacement ? ids.map((x) => (x === id ? replacement : x)) : ids.filter((x) => x !== id);
  if (e.leadItemId === id) {
    if (replacement) return { ...e, leadItemId: replacement, leadRelatedItemIds: [] };
    const promote = (key: 'secondaryItemIds' | 'leadColumnItemIds' | 'briefItemIds') => {
      const list = e[key] ?? [];
      return list.length
        ? { ...e, leadItemId: list[0]!, leadRelatedItemIds: [], [key]: list.slice(1) }
        : null;
    };
    return (
      promote('secondaryItemIds') ?? promote('leadColumnItemIds') ?? promote('briefItemIds') ?? e
    );
  }
  return {
    ...e,
    secondaryItemIds: swap(e.secondaryItemIds),
    ...(e.leadColumnItemIds && { leadColumnItemIds: swap(e.leadColumnItemIds) }),
    sections: e.sections
      .map((s) => ({ ...s, itemIds: swap(s.itemIds) }))
      .filter((s) => s.itemIds.length > 0),
    briefItemIds: swap(e.briefItemIds),
  };
}
