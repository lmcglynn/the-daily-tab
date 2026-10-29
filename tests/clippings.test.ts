import { MAX_CLIPPINGS, asClippings, clipFromItem, toggleClipping } from '@/lib/clippings';
import { buildFrontPage } from '@/ui/model';
import * as fx from '../fixtures/frontpage';
import { NOW, feed, item } from './helpers';

const f = { ...feed('a'), title: 'The Guardian' };

describe('clippings', () => {
  it('copies what the clipping needs to outlive the item', () => {
    const i = item({ id: 'x', feedId: 'a', summary: 'Sum.', imageUrl: 'https://i/x.jpg' });
    expect(clipFromItem(i, f, NOW)).toEqual({
      id: 'x',
      title: i.title,
      link: i.link,
      source: 'The Guardian',
      summary: 'Sum.',
      imageUrl: 'https://i/x.jpg',
      publishedAt: i.publishedAt,
      savedAt: NOW,
    });
  });

  it('toggles: saves newest first, removes when saved again, caps the list', () => {
    const a = clipFromItem(item({ id: 'a', feedId: 'a' }), f, NOW);
    const b = clipFromItem(item({ id: 'b', feedId: 'a' }), f, NOW + 1);
    const saved = toggleClipping(toggleClipping([], a), b);
    expect(saved.map((c) => c.id)).toEqual(['b', 'a']);
    expect(toggleClipping(saved, a).map((c) => c.id)).toEqual(['b']);
    const many = Array.from({ length: MAX_CLIPPINGS }, (_, n) => ({ ...a, id: `c${n}` }));
    expect(toggleClipping(many, b)).toHaveLength(MAX_CLIPPINGS);
    expect(toggleClipping(many, b)[0]!.id).toBe('b');
  });

  it('reads stored clippings defensively', () => {
    const good = clipFromItem(item({ id: 'g', feedId: 'a' }), f, NOW);
    expect(
      asClippings([
        good,
        good, // duplicate
        { ...good, id: 'js', link: 'javascript:alert(1)' },
        { ...good, id: 'img', imageUrl: 'data:image/png;base64,AAAA' },
        null,
        { title: 'no id' },
      ]).map((c) => [c.id, c.imageUrl]),
    ).toEqual([
      ['g', undefined],
      ['img', undefined],
    ]);
    expect(asClippings({ 0: good }).map((c) => c.id)).toEqual(['g']); // {"0": …} shape
    expect(asClippings(undefined)).toEqual([]);
  });
});

describe('front page with clippings', () => {
  const base = {
    edition: fx.edition,
    items: new Map(fx.items.map((i) => [i.id, i])),
    feeds: fx.feeds,
    states: fx.states,
    settings: fx.settings,
    lastVisitAt: fx.lastVisitAt,
    now: fx.NOW,
    online: true,
  };

  it('marks saved stories and lists clippings, including ones whose item is gone', () => {
    const v = buildFrontPage({ ...base, clippings: fx.clippings });
    const all = [
      v.lead!,
      ...v.secondary,
      ...v.leadColumn,
      ...v.bands.flatMap((b) => b.stories),
      ...v.brief,
    ];
    const savedOnPage = all.filter((s) => s.saved).map((s) => s.title);
    expect(savedOnPage.some((t) => t.startsWith('Heatwave'))).toBe(true);
    expect(all.filter((s) => s.saved)).toHaveLength(2);
    expect(v.clippings.map((c) => c.title)).toContain(
      'The quiet return of the neighbourhood bookshop',
    );
    expect(v.clippings.every((c) => c.saved)).toBe(true);
    expect(v.clippings.at(-1)).toMatchObject({ source: 'The Guardian', ago: 'Oct 21' });
  });

  it('has no clippings by default', () => {
    expect(buildFrontPage(base).clippings).toEqual([]);
  });
});
