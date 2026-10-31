import { normalizeSettings } from '@/lib/defaults';
import { composeEdition, editionItemIds } from '@/lib/edition/compose';
import { routineKind } from '@/lib/routine';
import { HOUR, NOW, feed, item } from './helpers';

const kind = (title: string) => routineKind({ title });

describe('routine posts', () => {
  it('recognises the bulk service posts seen in the starter feeds', () => {
    expect(
      kind('How to watch Lakers vs. Warriors: TV channel and streaming options for October 30'),
    ).toBe('listings');
    expect(
      kind("High school girls' volleyball: Wednesday's City Section playoff scores, schedule"),
    ).toBe('roundups');
    expect(kind("High school football: Thursday's scores")).toBe('roundups');
    expect(kind('The Mini Crossword: Friday, October 30, 2026')).toBe('puzzles');
    expect(
      kind(
        'Connections: Sports Edition today: Hints and answers for Oct. 30, 2026, puzzle No. 767',
      ),
    ).toBe('puzzles');
    expect(kind('Donate to ICIJ')).toBe('appeals');
    expect(
      kind(
        'The Sephora Savings Event is officially back — these are the deals I’m shopping as a beauty writer',
      ),
    ).toBe('shopping');
  });

  it('leaves news that shares their words alone', () => {
    for (const title of [
      'Israeli election results show Netanyahu is far from defeated',
      'U.S. approves $2.1 billion sale of Patriot interceptors to Ukraine',
      'Does trading multiple first-round picks ever actually work?',
      'Brewers win World Series for first time, beat Rays in Game 5: Live updates and reaction',
      'How to watch the eclipse safely, according to astronomers',
      'Nithya Raman’s Husband Brings Her Hollywood Connections',
      'Supporters rally outside the courthouse',
    ]) {
      expect(kind(title), title).toBeNull();
    }
  });

  it('is on unless the reader turns it off', () => {
    expect(normalizeSettings({}).skipRoutine).toBe(true);
    expect(normalizeSettings({ skipRoutine: false }).skipRoutine).toBe(false);
  });

  it('keeps routine posts off the page, other stories filling in', () => {
    const feeds = [feed('a', 'Sports', 0), feed('b', 'Sports', 1)];
    const items = [
      item({
        id: 'tv',
        feedId: 'a',
        title: 'How to watch Jets vs. Panthers: TV channel and streaming options',
      }),
      item({ id: 'quiz', feedId: 'b', title: 'The Mini Crossword: Friday, October 30, 2026' }),
      ...Array.from({ length: 6 }, (_, i) =>
        item({ id: `s${i}`, feedId: i % 2 ? 'a' : 'b', publishedAt: NOW - (i + 2) * HOUR }),
      ),
    ];
    const compose = (skipRoutine: boolean) =>
      editionItemIds(
        composeEdition({
          items,
          feeds,
          sections: ['Sports'],
          now: NOW,
          previousNumber: 0,
          skipRoutine,
        })!,
      );
    expect(compose(false)).toEqual(expect.arrayContaining(['tv', 'quiz']));
    expect(compose(true)).not.toContain('tv');
    expect(compose(true)).not.toContain('quiz');
    expect(compose(true)).toHaveLength(6);
  });
});
