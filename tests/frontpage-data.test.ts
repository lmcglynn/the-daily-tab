import { composeEdition } from '@/lib/edition/compose';
import {
  loadEditionItems,
  markRead,
  moreInSection,
  newStoryCount,
  shownKeys,
  snapshotFromPrefetch,
  withEntry,
  withItems,
} from '@/lib/frontpage-data';
import { muteMatcher } from '@/lib/mute';
import type { Edition } from '@/lib/types';
import { HOUR, NOW, feed, freshDB, item } from './helpers';

const feeds = [feed('w1', 'World', 0), feed('w2', 'World', 1), feed('t1', 'Tech', 2)];

const edition = (over: Partial<Edition>): Edition => ({
  id: 'e',
  number: 1,
  composedAt: NOW,
  leadItemId: 'a',
  leadRelatedItemIds: [],
  secondaryItemIds: [],
  sections: [],
  briefItemIds: [],
  ...over,
});

describe('newStoryCount', () => {
  it('counts placed stories the reader has not been shown', () => {
    const current = edition({ secondaryItemIds: ['b'], briefItemIds: ['c'] });
    const next = edition({
      leadItemId: 'b',
      secondaryItemIds: ['x'],
      sections: [{ category: 'World', itemIds: ['a', 'y'] }],
      briefItemIds: ['c', 'z'],
    });
    expect(newStoryCount(current, next)).toBe(3);
  });

  it('ignores lead-related items (same story, other feeds)', () => {
    const next = edition({ leadItemId: 'a', leadRelatedItemIds: ['a2', 'a3'] });
    expect(newStoryCount(edition({}), next)).toBe(0);
  });
});

describe('loadEditionItems', () => {
  it('loads every item an edition references, skipping pruned ones', async () => {
    const db = freshDB();
    const items = Array.from({ length: 30 }, (_, i) =>
      item({ id: `i${i}`, feedId: feeds[i % 3]!.id, publishedAt: NOW - i * 60_000 }),
    );
    await db.items.bulkPut(items);
    const e = composeEdition({
      items,
      feeds,
      sections: ['World', 'Tech'],
      now: NOW,
      previousNumber: 0,
    })!;
    await db.items.delete(e.briefItemIds[0]!);
    const map = await loadEditionItems(db, e);
    expect(map.has(e.leadItemId)).toBe(true);
    expect(map.has(e.briefItemIds[0]!)).toBe(false);
    expect(map.size).toBe(
      1 +
        e.secondaryItemIds.length +
        (e.leadColumnItemIds ?? []).length +
        e.sections.flatMap((s) => s.itemIds).length +
        e.briefItemIds.length -
        1,
    );
  });
});

describe('moreInSection', () => {
  it('returns the newest unshown stories of that section, one per story', async () => {
    const db = freshDB();
    await db.items.bulkPut([
      item({ id: 'shown', feedId: 'w1', publishedAt: NOW }),
      item({ id: 'same-story', feedId: 'w2', storyId: 'shown', publishedAt: NOW - 1 }),
      item({ id: 'g1', feedId: 'w1', storyId: 'g', publishedAt: NOW - HOUR }),
      item({ id: 'g2', feedId: 'w2', storyId: 'g', publishedAt: NOW - 2 * HOUR }),
      item({ id: 'old', feedId: 'w2', publishedAt: NOW - 5 * HOUR }),
      item({ id: 'tech', feedId: 't1', publishedAt: NOW }),
    ]);
    const shown = shownKeys(new Map([['shown', item({ id: 'shown', feedId: 'w1' })]]));
    const more = await moreInSection(db, feeds, 'World', shown);
    expect(more.map((i) => i.id)).toEqual(['g1', 'old']);
    // Muted stories don't come back through "More in …".
    const muted = muteMatcher(['ferry']);
    await db.items.update('g1', { title: 'Ferry service resumes' });
    const unmuted = await moreInSection(db, feeds, 'World', shown, 6, muted);
    expect(unmuted.map((i) => i.id)).toEqual(['g2', 'old']);
  });
});

describe('copy-on-write helpers', () => {
  it('never mutates the input map', () => {
    const a = item({ id: 'a', feedId: 'w1' });
    const before = new Map([['a', a]]);
    const after = withItems(before, [{ ...a, readAt: 1 }]);
    expect(before.get('a')!.readAt).toBeUndefined();
    expect(after.get('a')!.readAt).toBe(1);

    const m = new Map([['World', ['x']]]);
    expect(withEntry(m, 'World', null).has('World')).toBe(false);
    expect(m.has('World')).toBe(true);
  });
});

describe('snapshotFromPrefetch', () => {
  it('builds a snapshot from the prefetched reads', () => {
    const a = item({ id: 'a', feedId: 'w1' });
    const snap = snapshotFromPrefetch({
      db: { edition: edition({}), items: [a], states: [] },
      sync: {
        settings: { paperName: 'The Ledger' },
        'feed:t1': feeds[2],
        'feed:w1': feeds[0],
        other: 1,
      },
      local: { lastVisitAt: NOW },
    })!;
    expect(snap.items.get('a')).toBe(a);
    expect(snap.feeds.map((f) => f.id)).toEqual(['w1', 't1']);
    expect(snap.settings.paperName).toBe('The Ledger');
    expect(snap.settings.refreshMinutes).toBe(15); // defaults fill the rest
    expect(snap.lastVisitAt).toBe(NOW);
  });

  it('falls back (null) when the database could not be read', () => {
    expect(snapshotFromPrefetch(null)).toBeNull();
    expect(snapshotFromPrefetch({ db: null, sync: {}, local: {} })).toBeNull();
  });
});

describe('markRead', () => {
  it('stores readAt on the item', async () => {
    const db = freshDB();
    await db.items.put(item({ id: 'r', feedId: 'w1' }));
    await markRead(db, 'r', NOW);
    expect((await db.items.get('r'))!.readAt).toBe(NOW);
  });
});
