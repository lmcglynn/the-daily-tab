import { composeEdition, editionItemIds } from '@/lib/edition/compose';
import { findReplacement, replaceInEdition, slotOf } from '@/lib/edition/replace';
import { asHidden, hiddenKeys, hideItem, isHidden } from '@/lib/hidden';
import type { Edition, Item } from '@/lib/types';
import { HOUR, NOW, feed, item } from './helpers';

const DAY = 24 * HOUR;

describe('hidden stories', () => {
  it('records the item and its story, once, and hides every feed’s version', () => {
    const a = item({ id: 'a', feedId: 'f', storyId: 's1' });
    let list = hideItem([], a, NOW);
    list = hideItem(list, a, NOW + 1);
    expect(list).toEqual([{ id: 'a', storyId: 's1', at: NOW }]);
    const keys = hiddenKeys(list);
    expect(isHidden(keys, item({ id: 'b', feedId: 'g', storyId: 's1' }))).toBe(true);
    expect(isHidden(keys, item({ id: 'c', feedId: 'g' }))).toBe(false);
  });

  it('reads the stored list defensively and forgets entries after 30 days', () => {
    expect(
      asHidden(
        [{ id: 'new', at: NOW - DAY }, { id: 'old', at: NOW - 31 * DAY }, { id: 7, at: NOW }, null],
        NOW,
      ).map((h) => h.id),
    ).toEqual(['new']);
    expect(asHidden({ 0: { id: 'x', at: NOW } }, NOW)).toHaveLength(1); // {"0": …} shape
    expect(asHidden(undefined, NOW)).toEqual([]);
  });
});

const edition: Edition = {
  id: 'e',
  number: 1,
  composedAt: NOW,
  leadItemId: 'lead',
  leadRelatedItemIds: ['lead-elsewhere'],
  secondaryItemIds: ['sec1', 'sec2'],
  leadColumnItemIds: ['col1'],
  sections: [
    { category: 'World', itemIds: ['w1', 'w2'] },
    { category: 'Tech', itemIds: ['t1'] },
  ],
  briefItemIds: ['b1', 'b2'],
};

describe('replacing a hidden story in place', () => {
  it('finds where a story sits', () => {
    expect(slotOf(edition, 'lead')).toEqual({ kind: 'lead' });
    expect(slotOf(edition, 'sec2')).toEqual({ kind: 'secondary' });
    expect(slotOf(edition, 'col1')).toEqual({ kind: 'leadColumn' });
    expect(slotOf(edition, 'w2')).toEqual({ kind: 'band', category: 'World' });
    expect(slotOf(edition, 'b1')).toEqual({ kind: 'brief' });
    expect(slotOf(edition, 'lead-elsewhere')).toBeNull();
  });

  it('swaps the story for its replacement, leaving everything else where it was', () => {
    const e = replaceInEdition(edition, 'w1', 'w9');
    expect(e.sections[0]!.itemIds).toEqual(['w9', 'w2']);
    expect(e.secondaryItemIds).toEqual(edition.secondaryItemIds);
    expect(replaceInEdition(edition, 'lead', 'new-lead')).toMatchObject({
      leadItemId: 'new-lead',
      leadRelatedItemIds: [],
    });
  });

  it('without a replacement, closes the gap; an emptied band goes', () => {
    const e = replaceInEdition(edition, 't1', null);
    expect(e.sections.map((s) => s.category)).toEqual(['World']);
    expect(replaceInEdition(edition, 'b1', null).briefItemIds).toEqual(['b2']);
  });

  it('never leaves the lead empty: the first story beside it moves up', () => {
    const e = replaceInEdition(edition, 'lead', null);
    expect(e).toMatchObject({ leadItemId: 'sec1', secondaryItemIds: ['sec2'] });
    expect(editionItemIds(e)).not.toContain('lead');
  });

  describe('choosing the replacement', () => {
    const categoryOf = new Map([
      ['wf', 'World'],
      ['tf', 'Tech'],
    ]);
    const pool: Item[] = [
      item({ id: 'tech-photo', feedId: 'tf', publishedAt: NOW - HOUR, imageUrl: 'https://i/1' }),
      item({ id: 'world-new', feedId: 'wf', publishedAt: NOW - 2 * HOUR }),
      item({
        id: 'world-photo',
        feedId: 'wf',
        publishedAt: NOW - 3 * HOUR,
        imageUrl: 'https://i/2',
      }),
      item({ id: 'shown', feedId: 'wf', publishedAt: NOW }),
      item({ id: 'same-story', feedId: 'tf', storyId: 'shown', publishedAt: NOW }),
      item({ id: 'muted', feedId: 'wf', publishedAt: NOW, title: 'Crypto news' }),
      item({ id: 'unknown-feed', feedId: 'gone', publishedAt: NOW }),
    ];
    const opts = {
      categoryOf,
      category: 'World',
      exclude: new Set(['shown']),
      muted: (i: Item) => i.title.startsWith('Crypto'),
    };
    const pick = (slot: Parameters<typeof findReplacement>[1], over = {}) =>
      findReplacement(pool, slot, { ...opts, ...over })?.id ?? null;

    it('a band takes its own section’s newest story, skipping shown, muted and unknown', () => {
      expect(pick({ kind: 'band', category: 'World' })).toBe('world-new');
      expect(pick({ kind: 'band', category: 'Science' }, { category: 'Science' })).toBeNull();
    });

    it('the lead and the stories beside it prefer a photo, from the same section first', () => {
      expect(pick({ kind: 'lead' })).toBe('world-photo');
      expect(pick({ kind: 'secondary' }, { category: 'Science' })).toBe('tech-photo');
    });

    it('the lead column and In Brief take the newest of any section', () => {
      expect(pick({ kind: 'brief' })).toBe('tech-photo');
      expect(pick({ kind: 'leadColumn' })).toBe('tech-photo');
    });
  });
});

describe('later editions', () => {
  it('leave hidden stories out, in every feed’s version', () => {
    const feeds = [feed('a', 'World', 0), feed('b', 'World', 1)];
    const items = [
      item({ id: 'h1', feedId: 'a', storyId: 'h1', publishedAt: NOW - HOUR }),
      item({ id: 'h2', feedId: 'b', storyId: 'h1', publishedAt: NOW - HOUR }),
      ...Array.from({ length: 6 }, (_, i) =>
        item({ id: `s${i}`, feedId: i % 2 ? 'a' : 'b', publishedAt: NOW - (i + 2) * HOUR }),
      ),
    ];
    const hidden = hiddenKeys(hideItem([], items[0]!, NOW));
    const e = composeEdition({
      items,
      feeds,
      sections: ['World'],
      now: NOW,
      previousNumber: 0,
      hidden,
    })!;
    const placed = editionItemIds(e);
    expect(placed).not.toContain('h1');
    expect(placed).not.toContain('h2');
    expect(placed).toContain('s0');
  });
});
