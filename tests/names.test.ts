import { composeEdition } from '@/lib/edition/compose';
import { headlineNames, ordinaryWords } from '@/lib/edition/group';
import { HOUR, NOW, feed, item } from './helpers';

const names = (title: string, summary = '') => [...headlineNames({ title, summary })];

describe('names in a headline', () => {
  it('takes capitalised words after the first in a sentence-case headline', () => {
    expect(names('Beer-fueled Brewers take to streets, continue World Series party')).toEqual(
      expect.arrayContaining(['brewer']),
    );
    expect(names('Judge considers whether Letitia James should be removed')).toEqual([
      'letitia',
      'jam',
    ]);
  });

  it('in a title-case headline, counts only words the summary capitalises too', () => {
    expect(
      names(
        'Court Rejects Erin Patterson’s Appeal in Mushroom Murders Case',
        'An Australian court rejected an appeal by Erin Patterson against her conviction.',
      ),
    ).toEqual(['erin', 'patterson']);
    expect(names('Court Rejects Appeal in Mushroom Murders Case')).toEqual([]); // no summary
  });

  it('skips abbreviations and calendar words', () => {
    expect(names('NFL Week 8: Lions beat Vikings on Thursday in October')).toEqual(
      expect.not.arrayContaining(['nfl', 'thursdai', 'octob']),
    );
  });

  it('knows ordinary words from the lower case they appear in elsewhere', () => {
    const ordinary = ordinaryWords([
      { title: 'First Alert Forecast: rain on the way', summary: 'A forecast of heavy rain.' },
    ]);
    expect(ordinary.has('forecast')).toBe(true);
    expect(ordinary.has('alert')).toBe(false);
  });
});

describe('one story per name on the page', () => {
  const feeds = [feed('a', 'Sports', 0), feed('b', 'Sports', 1), feed('c', 'World', 2)];
  const story = (id: string, feedId: string, title: string, hoursAgo: number) =>
    item({ id, feedId, title, summary: `${title}.`, publishedAt: NOW - hoursAgo * HOUR });
  // Plenty of unrelated stories, so "Brewers" is an unusual name in Sports.
  const filler = Array.from({ length: 40 }, (_, n) =>
    story(`f${n}`, n % 2 ? 'a' : 'b', `Match report number ${n} from the weekend`, 6 + n / 10),
  );

  it('keeps a band and In Brief from repeating a name, other stories filling in', () => {
    const items = [
      story('b1', 'a', 'Beer-fueled Brewers take to streets for the party', 1),
      story('b2', 'b', 'Sights and sounds from the Brewers parade', 2),
      story('b3', 'a', 'Are the Brewers favourites again next year?', 3),
      story('w1', 'c', 'Leaders meet for talks in the capital', 1),
      ...filler,
    ];
    const e = composeEdition({
      items,
      feeds,
      sections: ['Sports', 'World'],
      now: NOW,
      previousNumber: 0,
    })!;
    const placed = [
      e.leadItemId,
      ...e.secondaryItemIds,
      ...(e.leadColumnItemIds ?? []),
      ...e.sections.flatMap((s) => s.itemIds),
      ...e.briefItemIds,
    ];
    expect(placed.filter((id) => id.startsWith('b'))).toHaveLength(1);
    expect(e.sections.find((s) => s.category === 'Sports')!.itemIds).toHaveLength(4);
  });

  it('still fills a band with a repeated name when nothing else is left', () => {
    const items = [
      story('b1', 'a', 'Beer-fueled Brewers take to streets for the party', 1),
      story('b2', 'b', 'Sights and sounds from the Brewers parade', 2),
      story('w1', 'c', 'Leaders meet for talks in the capital', 1),
    ];
    const e = composeEdition({
      items,
      feeds,
      sections: ['Sports', 'World'],
      now: NOW,
      previousNumber: 0,
    })!;
    const all = [
      e.leadItemId,
      ...e.secondaryItemIds,
      ...(e.leadColumnItemIds ?? []),
      ...e.sections.flatMap((s) => s.itemIds),
      ...e.briefItemIds,
    ];
    expect(all).toEqual(expect.arrayContaining(['b1', 'b2']));
  });

  it('doesn’t hold back stories over a name most of them share', () => {
    const items = [
      ...Array.from({ length: 12 }, (_, n) =>
        story(`t${n}`, n % 2 ? 'a' : 'b', `Talks with Trump on topic number ${n}`, n / 4),
      ),
    ];
    const e = composeEdition({ items, feeds, sections: ['Sports'], now: NOW, previousNumber: 0 })!;
    expect(e.sections[0]!.itemIds).toHaveLength(4);
    // The newest stories are taken in order: nothing was skipped over the shared name.
    const placed = [
      e.leadItemId,
      ...e.secondaryItemIds,
      ...(e.leadColumnItemIds ?? []),
      ...e.sections[0]!.itemIds,
    ];
    expect(placed).toEqual(expect.arrayContaining(['t0', 't1', 't2']));
  });
});
