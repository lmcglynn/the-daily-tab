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

  it('leads with the story carried by three feeds, with headlines under it', () => {
    const v = buildFrontPage(base);
    expect(v.lead!.title).toMatch(/Geneva/);
    expect(v.lead!.deck).toMatch(/^Mediators hope/);
    expect(v.lead!.body.length).toBeGreaterThan(100);
    expect(v.leadColumn).toHaveLength(4);
    const placed = new Set([v.lead!.id, ...v.secondary.map((s) => s.id)]);
    expect(v.leadColumn.every((s) => !placed.has(s.id))).toBe(true);
  });

  it('lists the lead’s other outlets, and calls a story with fresh coverage developing', () => {
    const v = buildFrontPage(base);
    expect(v.lead!.coverage!.map((c) => c.source).sort()).toEqual(['BBC News', 'NPR']);
    expect(v.lead!.coverage!.every((c) => c.link.startsWith('https://'))).toBe(true);
    // Fixture coverage: 7:55 (first), 8:20 and 9:05; the page is at 9:42.
    expect(v.lead!.developing).toBe(true);
    expect(buildFrontPage({ ...base, now: fx.NOW + 2 * 3_600_000 }).lead!.developing).toBe(false);
    expect(v.secondary.every((s) => s.coverage === undefined && !s.developing)).toBe(true);
  });

  it('shows weather in the ear and moves the new count to the folio', () => {
    const settings = {
      ...fx.settings,
      weatherPlace: {
        name: 'Seattle',
        region: 'Washington, United States',
        lat: 47.6,
        lon: -122.3,
      },
    };
    const weather = {
      at: fx.NOW - 10 * 60_000,
      lat: 47.6,
      lon: -122.3,
      units: 'f' as const,
      temp: 47.6,
      code: 3,
      isDay: true,
      high: 52.4,
      low: 40.6,
    };
    const v = buildFrontPage({ ...base, settings, weather });
    expect(v.weather).toMatchObject({ temp: '48°', condition: 'Cloudy', range: 'H 52° · L 41°' });
    expect(v.weather!.label).toMatch(/^Weather in Seattle: 48 degrees Fahrenheit, cloudy/);
    // Switching units (until the next fetch) or a stale report hides it instead of lying.
    expect(
      buildFrontPage({ ...base, settings: { ...settings, units: 'c' }, weather }).weather,
    ).toBeNull();
    expect(
      buildFrontPage({ ...base, settings, weather: { ...weather, at: fx.NOW - 7 * 3600_000 } })
        .weather,
    ).toBeNull();
  });

  describe('markets box', () => {
    const spx = {
      at: fx.NOW,
      symbol: '^GSPC',
      name: 'S&P 500',
      currency: 'USD',
      price: 7737.01,
      previousClose: 7722.6,
      marketTime: Date.parse('2026-10-27T13:40:00Z'), // 9:40 a.m. ET
      timezone: 'America/New_York',
      points: [7722, 7730, 7737],
    };
    const aapl = { ...spx, symbol: 'AAPL', name: 'Apple Inc.', price: 340, previousClose: 343.1 };
    const eur = {
      ...spx,
      symbol: 'EURUSD=X',
      name: 'EUR/USD',
      price: 1.1152,
      previousClose: 1.1131,
      timezone: 'Europe/London',
    };
    const tickers = (...symbols: string[]) =>
      symbols.map((symbol) => ({
        symbol,
        name: { '^GSPC': 'S&P 500', AAPL: 'Apple', 'EURUSD=X': 'Euro' }[symbol]!,
      }));
    const markets = { '^GSPC': spx, AAPL: aapl, 'EURUSD=X': eur };

    it('lists quotes in the reader’s order, skipping missing or stale ones', () => {
      const settings = { ...fx.settings, tickers: tickers('AAPL', '^GSPC', 'EURUSD=X') };
      const stale = { ...markets, 'EURUSD=X': { ...eur, at: fx.NOW - 5 * 86_400_000 } };
      const v = buildFrontPage({ ...base, settings, markets: stale });
      expect(v.markets.map((m) => m.symbol)).toEqual(['AAPL', '^GSPC']);
      expect(
        buildFrontPage({ ...base, settings: { ...fx.settings, tickers: [] }, markets }).markets,
      ).toEqual([]);
    });

    it('formats an index', () => {
      const v = buildFrontPage({
        ...base,
        settings: { ...fx.settings, tickers: tickers('^GSPC') },
        markets,
      });
      expect(v.markets[0]).toMatchObject({
        name: 'S&P 500',
        showSymbol: false,
        price: '7,737.01',
        change: '+14.41',
        percent: '0.19%',
        direction: 'up',
        asOf: 'As of 9:40 a.m. ET',
      });
      expect(v.markets[0]!.label).toMatch(/^S&P 500 7,737.01, up 14.41 points or 0.19 percent/);
    });

    it('formats a stock (reader’s name, symbol shown) and a currency (4 decimals)', () => {
      const settings = { ...fx.settings, tickers: tickers('AAPL', 'EURUSD=X') };
      const [stock, fx2] = buildFrontPage({ ...base, settings, markets }).markets;
      expect(stock).toMatchObject({
        name: 'Apple',
        showSymbol: true,
        change: '−3.10',
        direction: 'down',
      });
      expect(stock!.label).toMatch(/^Apple 340.00 USD, down 3.10 or 0.90 percent/);
      expect(fx2).toMatchObject({ price: '1.1152', change: '+0.0021' });
      expect(fx2!.asOf).toMatch(/^As of \d+:\d\d [ap]\.m\. \S+$/);
    });
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

  it('counts new stories only among the In Brief stories with room on the page', () => {
    // Every story new since the last visit, so In Brief's share of the count is visible.
    const all = buildFrontPage({ ...base, lastVisitAt: 0 });
    expect(all.brief.length).toBeGreaterThan(2);
    for (const shown of [0, 2]) {
      const cut = buildFrontPage({ ...base, lastVisitAt: 0, briefShown: shown });
      expect(cut.newCount).toBe(all.newCount - (all.brief.length - shown));
    }
  });

  it('marks read and new stories', () => {
    const v = buildFrontPage(base);
    const all = [
      v.lead!,
      ...v.secondary,
      ...v.leadColumn,
      ...v.bands.flatMap((b) => b.stories),
      ...v.brief,
    ];
    expect(all.find((s) => s.title.startsWith('Central bank'))!.read).toBe(true);
    expect(all.find((s) => s.title.startsWith('Floodwaters'))!.isNew).toBe(true);
    expect(all.find((s) => s.title.startsWith('Heatwave'))!.isNew).toBe(false);
  });

  it('reports failed feeds as corrections', () => {
    expect(buildFrontPage(base).corrections).toEqual([
      'Scientific American could not be reached at 9:42.',
    ]);
  });

  it('prints one correction when two same-named feeds fail alike', () => {
    const sci = fx.feeds.find((f) => f.title === 'Scientific American')!;
    const twin = { ...sci, id: 'sci-twin', url: 'https://www.scientificamerican.com/other/' };
    const state = fx.states.find((s) => s.feedId === sci.id)!;
    const v = buildFrontPage({
      ...base,
      feeds: [...fx.feeds, twin],
      states: [...fx.states, { ...state, feedId: twin.id }],
    });
    expect(v.corrections).toEqual(['Scientific American could not be reached at 9:42.']);
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
