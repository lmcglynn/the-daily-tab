import { ago, clockParts, editionName, issueNumber, splitDeck } from '@/ui/format';
import { buildFrontPage, type FrontPageInput } from '@/ui/model';
import * as fx from '../fixtures/frontpage';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

describe('format', () => {
  it('formats the clock with a separate meridiem', () => {
    expect(clockParts(local(27, 9, 42))).toEqual({ time: '9:42', meridiem: 'a.m.' });
    expect(clockParts(local(27, 0, 5))).toEqual({ time: '12:05', meridiem: 'a.m.' });
    expect(clockParts(local(27, 13, 0))).toEqual({ time: '1:00', meridiem: 'p.m.' });
  });

  it('names the edition by time of day', () => {
    expect(editionName(local(27, 6))).toBe('Morning Edition');
    expect(editionName(local(27, 13))).toBe('Afternoon Edition');
    expect(editionName(local(27, 19))).toBe('Evening Edition');
    expect(editionName(local(27, 23))).toBe('Late Edition');
    expect(editionName(local(27, 2))).toBe('Late Edition');
  });

  it('numbers issues by days since install, install day = No. 1', () => {
    expect(issueNumber(local(27, 8), local(27, 23))).toBe(1);
    expect(issueNumber(local(1, 12), local(27, 9))).toBe(27);
    expect(issueNumber(0, local(27, 9))).toBe(1);
  });

  it('formats ages compactly', () => {
    const now = local(27, 9, 42);
    expect(ago(now - 20_000, now)).toBe('now');
    expect(ago(local(27, 9, 30), now)).toBe('12m');
    expect(ago(local(27, 6, 40), now)).toBe('3h');
    expect(ago(local(26, 22), now)).toBe('11h'); // under 12 h: hours, even across midnight
    expect(ago(local(26, 21), now)).toBe('Yesterday');
    expect(ago(local(26, 8), now)).toBe('Yesterday');
    expect(ago(local(24, 8), now)).toBe('Sat');
    expect(ago(local(10, 8), now)).toBe('Oct 10');
    expect(ago(now + 60_000, now)).toBe('now');
  });

  it('splits a deck from the body at a sentence boundary', () => {
    expect(
      splitDeck('Delegations arrived on Monday night for talks. A second round is planned.'),
    ).toEqual({
      deck: 'Delegations arrived on Monday night for talks.',
      body: 'A second round is planned.',
    });
    expect(splitDeck('Officials met in the U.S. capital on Monday. More follows.').deck).toBe(
      'Officials met in the U.S. capital on Monday.',
    );
    expect(splitDeck('One sentence only.')).toEqual({ deck: 'One sentence only.', body: '' });
  });

  it('prefers a first paragraph (standfirst) as the deck', () => {
    expect(
      splitDeck('Royal tour comes as poll suggests support\nKing Charles has confirmed.\nMore.'),
    ).toEqual({
      deck: 'Royal tour comes as poll suggests support',
      body: 'King Charles has confirmed. More.',
    });
  });
});

describe('buildFrontPage', () => {
  const base: FrontPageInput = {
    edition: fx.edition,
    items: new Map(fx.items.map((i) => [i.id, i])),
    feeds: fx.feeds,
    states: fx.states,
    settings: fx.settings,
    lastVisitAt: fx.lastVisitAt,
    now: fx.NOW,
    online: true,
  };

  it('leads with the story carried by three feeds and lists the others', () => {
    const v = buildFrontPage(base);
    expect(v.lead!.title).toMatch(/Geneva/);
    expect(v.lead!.related.map((r) => r.source).sort()).toEqual(['BBC News', 'NPR']);
    expect(v.lead!.deck).toMatch(/^Mediators hope/);
    expect(v.lead!.body.length).toBeGreaterThan(100);
  });

  it('builds the folio line and ears', () => {
    const v = buildFrontPage(base);
    expect(v.dateLine).toBe('Tuesday, October 27, 2026');
    expect(v.editionName).toBe('Morning Edition');
    expect(v.issue).toBe(27);
    expect(v.updatedLabel).toBe('Updated 9:42');
    expect(v.newSince).toBe('8:10');
    expect(v.newCount).toBeGreaterThan(0);
    expect(v.sections.map((s) => s.name)).toEqual(['World', 'Tech', 'Science']);
  });

  it('marks read and new stories', () => {
    const v = buildFrontPage(base);
    const all = [v.lead!, ...v.secondary, ...v.bands.flatMap((b) => b.stories), ...v.brief];
    expect(all.find((s) => s.title.startsWith('Central bank'))!.read).toBe(true);
    expect(all.find((s) => s.title.startsWith('Floodwaters'))!.isNew).toBe(true);
    expect(all.find((s) => s.title.startsWith('Heatwave'))!.isNew).toBe(false);
  });

  it('reports failed feeds as corrections', () => {
    expect(buildFrontPage(base).corrections).toEqual(['Nature could not be reached at 9:42.']);
  });

  it('labels offline and first-run folios', () => {
    expect(buildFrontPage({ ...base, online: false }).updatedLabel).toMatch(
      /^Edition of \d+:\d\d · offline$/,
    );
    const first = buildFrontPage({ ...base, edition: null, lastVisitAt: undefined });
    expect(first.updatedLabel).toBe('First edition to follow');
    expect(first.lead).toBeNull();
    expect(first.newSince).toBeNull();
  });

  it('includes the fixture edge cases', () => {
    const titles = fx.items.map((i) => i.title);
    expect(Math.max(...titles.map((t) => t.length))).toBeGreaterThan(150);
    expect(fx.items.filter((i) => !i.imageUrl).length).toBeGreaterThan(10);
    expect(new Set(fx.items.filter((i) => i.storyId).map((i) => i.feedId)).size).toBe(3);
  });
});
