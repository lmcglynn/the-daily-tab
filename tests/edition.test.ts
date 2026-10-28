import { composeEdition, editionItemIds, sameLayout, sectionOrder } from '@/lib/edition/compose';
import { groupStories, headlineTokens, jaccard } from '@/lib/edition/group';
import { assignStories, publishEdition } from '@/lib/edition/publish';
import type { Item } from '@/lib/types';
import { HOUR, NOW, feed, freshDB, item } from './helpers';

const feeds = [
  feed('bbc', 'World', 0),
  feed('npr', 'World', 1),
  feed('guardian', 'World', 2),
  feed('ars', 'Tech', 3),
  feed('verge', 'Tech', 4),
  feed('nature', 'Science', 5),
];
const ids = Object.fromEntries(feeds.map((f) => [f.id, f.id]));

describe('headline grouping', () => {
  it('normalizes headlines into comparable tokens', () => {
    const a = headlineTokens('Leaders meet in Geneva as ceasefire talks resume');
    const b = headlineTokens("Ceasefire talks resume as leaders meet in Geneva's old town");
    expect(jaccard(a, b)).toBeGreaterThanOrEqual(0.5);
  });

  it('groups the same story across three feeds within 12 hours', () => {
    const items = [
      item({
        id: 'x1',
        feedId: ids.bbc!,
        title: 'Leaders meet in Geneva as ceasefire talks resume',
        publishedAt: NOW - 3 * HOUR,
      }),
      item({
        id: 'x2',
        feedId: ids.npr!,
        title: 'Ceasefire talks resume as leaders meet in Geneva',
        publishedAt: NOW - 2 * HOUR,
      }),
      item({
        id: 'x3',
        feedId: ids.guardian!,
        title: 'Geneva ceasefire talks resume as world leaders meet',
        publishedAt: NOW - HOUR,
      }),
      item({ id: 'y', feedId: ids.ars!, title: 'New chip doubles battery life, maker says' }),
    ];
    const g = groupStories(items);
    expect(g.get('x1')).toBe('x1');
    expect(g.get('x2')).toBe('x1');
    expect(g.get('x3')).toBe('x1');
    expect(g.get('y')).toBe('y');
  });

  it('does not group items from the same feed or more than 12 hours apart', () => {
    const t = 'Leaders meet in Geneva as ceasefire talks resume';
    const g = groupStories([
      item({ id: 'a', feedId: ids.bbc!, title: t, publishedAt: NOW - 20 * HOUR }),
      item({ id: 'b', feedId: ids.bbc!, title: t, publishedAt: NOW - 2 * HOUR }),
      item({ id: 'c', feedId: ids.npr!, title: t, publishedAt: NOW - 6 * HOUR }),
    ]);
    expect(g.get('a')).toBe('a');
    expect(g.get('b')).toBe('c'); // b and c are 4 h apart, different feeds
  });

  it('ignores very short headlines', () => {
    const g = groupStories([
      item({ id: 'a', feedId: ids.bbc!, title: 'Live updates' }),
      item({ id: 'b', feedId: ids.npr!, title: 'Live updates' }),
    ]);
    expect(g.get('b')).toBe('b');
  });
});

function frontPageItems(): Item[] {
  return [
    // A story covered by three World feeds
    item({
      id: 'g1',
      feedId: ids.bbc!,
      storyId: 'g1',
      title: 'Geneva talks',
      publishedAt: NOW - 3 * HOUR,
    }),
    item({
      id: 'g2',
      feedId: ids.npr!,
      storyId: 'g1',
      title: 'Geneva talks',
      publishedAt: NOW - 2 * HOUR,
      imageUrl: 'https://i/g2.jpg',
    }),
    item({
      id: 'g3',
      feedId: ids.guardian!,
      storyId: 'g1',
      title: 'Geneva talks',
      publishedAt: NOW - HOUR,
    }),
    // Another two-feed story
    item({ id: 'h1', feedId: ids.ars!, storyId: 'h1', publishedAt: NOW - 2 * HOUR }),
    item({ id: 'h2', feedId: ids.verge!, storyId: 'h1', publishedAt: NOW - HOUR }),
    // Singles
    ...Array.from({ length: 6 }, (_, i) =>
      item({
        id: `w${i}`,
        feedId: ids.bbc!,
        publishedAt: NOW - (10 + i) * 60_000,
        imageUrl: i < 2 ? `https://i/w${i}.jpg` : undefined,
      }),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      item({
        id: `t${i}`,
        feedId: ids.ars!,
        publishedAt: NOW - (20 + i) * 60_000,
        imageUrl: i < 2 ? `https://i/t${i}.jpg` : undefined,
      }),
    ),
    ...Array.from({ length: 6 }, (_, i) =>
      item({
        id: `s${i}`,
        feedId: ids.nature!,
        publishedAt: NOW - (30 + i) * 60_000,
        imageUrl: i === 0 ? 'https://i/s0.jpg' : undefined,
      }),
    ),
    ...Array.from({ length: 12 }, (_, i) =>
      item({ id: `old${i}`, feedId: ids.verge!, publishedAt: NOW - (5 + i) * HOUR }),
    ),
  ];
}

describe('composeEdition', () => {
  const sections = ['World', 'Tech', 'Science'];

  it('leads with the largest cross-feed story, preferring the item with a photo', () => {
    const e = composeEdition({
      items: frontPageItems(),
      feeds,
      sections,
      now: NOW,
      previousNumber: 4,
    })!;
    expect(e.leadItemId).toBe('g2');
    expect(e.leadRelatedItemIds.sort()).toEqual(['g1', 'g3']);
    expect(e.number).toBe(5);
  });

  it('falls back to the newest photo story from the top section', () => {
    const items = frontPageItems().map(({ storyId: _s, ...i }) => i);
    const e = composeEdition({ items, feeds, sections, now: NOW, previousNumber: 0 })!;
    expect(e.leadItemId).toBe('w0');
  });

  it('fills secondary slots with photo stories from other sections first', () => {
    const e = composeEdition({
      items: frontPageItems(),
      feeds,
      sections,
      now: NOW,
      previousNumber: 0,
    })!;
    expect(e.secondaryItemIds).toEqual(['t0', 's0', 't1']);
  });

  it('builds section bands of up to 4 and an In Brief of the rest, newest first', () => {
    const e = composeEdition({
      items: frontPageItems(),
      feeds,
      sections,
      now: NOW,
      previousNumber: 0,
    })!;
    expect(e.sections.map((s) => s.category)).toEqual(['World', 'Tech', 'Science']);
    for (const s of e.sections) expect(s.itemIds.length).toBeLessThanOrEqual(4);
    expect(e.sections[0]!.itemIds).toEqual(['w0', 'w1', 'w2', 'w3']);
    expect(e.briefItemIds.length).toBeGreaterThan(0);
    expect(e.briefItemIds.length).toBeLessThanOrEqual(12);
    const all = frontPageItems();
    const times = e.briefItemIds.map((id) => all.find((i) => i.id === id)!.publishedAt);
    expect([...times].sort((a, b) => b - a)).toEqual(times);
  });

  it('places each story only once', () => {
    const e = composeEdition({
      items: frontPageItems(),
      feeds,
      sections,
      now: NOW,
      previousNumber: 0,
    })!;
    const placed = [
      e.leadItemId,
      ...e.secondaryItemIds,
      ...e.sections.flatMap((s) => s.itemIds),
      ...e.briefItemIds,
    ];
    expect(new Set(placed).size).toBe(placed.length);
    // h1 and h2 are one story: exactly one of them is placed (the newer, h2).
    expect(placed.filter((id) => id === 'h1' || id === 'h2')).toEqual(['h2']);
    expect(editionItemIds(e)).toContain('g1');
  });

  it('returns null when there is nothing to print', () => {
    expect(composeEdition({ items: [], feeds, sections, now: NOW, previousNumber: 0 })).toBeNull();
  });

  it('orders sections by preference, then by feed order', () => {
    expect(sectionOrder(feeds, ['Science'])).toEqual(['Science', 'World', 'Tech']);
  });
});

describe('publishEdition', () => {
  it('groups, composes and stores; skips identical layouts', async () => {
    const db = freshDB();
    await db.items.bulkPut([
      item({
        id: 'x1',
        feedId: ids.bbc!,
        title: 'Leaders meet in Geneva as ceasefire talks resume',
        publishedAt: NOW - 3 * HOUR,
      }),
      item({
        id: 'x2',
        feedId: ids.npr!,
        title: 'Ceasefire talks resume as leaders meet in Geneva',
        publishedAt: NOW - 2 * HOUR,
      }),
      item({
        id: 'x3',
        feedId: ids.guardian!,
        title: 'Geneva ceasefire talks resume as world leaders meet',
        publishedAt: NOW - HOUR,
      }),
      item({ id: 'y', feedId: ids.ars!, title: 'New chip doubles battery life, maker says' }),
    ]);
    const first = await publishEdition(db, feeds, ['World', 'Tech'], NOW);
    expect(first.isNew).toBe(true);
    expect(first.edition!.number).toBe(1);
    expect([first.edition!.leadItemId, ...first.edition!.leadRelatedItemIds].sort()).toEqual([
      'x1',
      'x2',
      'x3',
    ]);
    expect((await db.items.get('x3'))!.storyId).toBe('x1');
    expect((await db.items.get('y'))!.storyId).toBeUndefined();

    const second = await publishEdition(db, feeds, ['World', 'Tech'], NOW + 60_000);
    expect(second.isNew).toBe(false);
    expect(await db.editions.count()).toBe(1);
    expect(sameLayout(first.edition!, second.edition!)).toBe(true);
  });

  it('clears a stale storyId when an item no longer groups', async () => {
    const db = freshDB();
    await db.items.put(item({ id: 'lonely', feedId: ids.bbc!, storyId: 'gone' }));
    await assignStories(db, NOW);
    expect((await db.items.get('lonely'))!.storyId).toBeUndefined();
  });
});
