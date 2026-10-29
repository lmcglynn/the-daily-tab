import { DEFAULT_SETTINGS, normalizeSettings } from '@/lib/defaults';
import { extrasOrigins, refreshExtras } from '@/lib/extras/refresh';
import {
  SPORTS_ORIGINS,
  currentGame,
  fetchScores,
  isLiveOrSoon,
  lastResult,
  parseGame,
  parseTeams,
  scheduleUrl,
  summaryUrl,
  teamUrl,
} from '@/lib/extras/scores';
import type { ScoreReport, Settings, SportsTeam } from '@/lib/types';
import { gameWhen, scoreView, scoreViews } from '@/ui/model';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const NOW = local(27, 9, 42); // Tue Oct 27, 9:42 a.m.
const lakers: SportsTeam = {
  league: 'basketball/nba',
  id: '13',
  name: 'Los Angeles Lakers',
  abbr: 'LAL',
};

// Shaped like ESPN's site API: schedules give scores as {value, displayValue}.
const competitor = (
  id: string,
  name: string,
  homeAway: string,
  score?: number,
  winner?: boolean,
) => ({
  homeAway,
  winner,
  team: {
    id,
    abbreviation: name.slice(0, 3).toUpperCase(),
    shortDisplayName: name,
    displayName: `X ${name}`,
  },
  ...(score !== undefined && { score: { value: score, displayValue: String(score) } }),
});
type Competitor = ReturnType<typeof competitor> | Record<string, unknown>;
const event = (
  id: string,
  date: number,
  state: string,
  detail: string,
  home: Competitor,
  away: Competitor,
) => ({
  id,
  date: new Date(date).toISOString().replace(/:\d\d\.\d+Z$/, 'Z'),
  competitions: [
    {
      status: { type: { state, shortDetail: detail } },
      competitors: [home, away] as Competitor[],
    },
  ],
});

const lostLastNight = event(
  'g1',
  local(26, 19),
  'post',
  'Final',
  competitor('13', 'Lakers', 'home', 129, false),
  competitor('22', 'Trail Blazers', 'away', 136, true),
);
const wonLastWeek = event(
  'g0',
  local(20, 19),
  'post',
  'Final/OT',
  competitor('5', 'Celtics', 'home', 101),
  competitor('13', 'Lakers', 'away', 104, true),
);
const tomorrowAtClippers = event(
  'g2',
  local(28, 19, 30),
  'pre',
  '10/28 - 10:30 PM EDT',
  competitor('12', 'Clippers', 'home'),
  competitor('13', 'Lakers', 'away'),
);
/** Tonight at home, under way. */
const liveTonight = event(
  'g-live',
  local(27, 19),
  'in',
  'End of 1st',
  competitor('13', 'Lakers', 'home', 0),
  competitor('17', 'Devils', 'away', 1),
);
/** The Clippers game, under way: Lakers 74, Clippers 70. */
const liveAtClippers = event(
  'g2',
  local(28, 19, 30),
  'in',
  'Q3 4:12',
  competitor('12', 'Clippers', 'home', 70),
  competitor('13', 'Lakers', 'away', 74),
);

describe('ESPN parsing', () => {
  it('lists a league’s teams by name', () => {
    const json = {
      sports: [
        {
          leagues: [
            {
              teams: [
                { team: { id: '13', displayName: 'Los Angeles Lakers', abbreviation: 'LAL' } },
                { team: { id: '1', displayName: 'Atlanta Hawks', abbreviation: 'ATL' } },
                { team: { id: 'x', displayName: 'Bad id' } },
              ],
            },
          ],
        },
      ],
    };
    expect(parseTeams(json, 'basketball/nba').map((t) => t.name)).toEqual([
      'Atlanta Hawks',
      'Los Angeles Lakers',
    ]);
    expect(parseTeams({}, 'basketball/nba')).toEqual([]);
  });

  it('reads a game: sides, scores (object or plain string), winner, status', () => {
    expect(parseGame(lostLastNight)).toMatchObject({
      state: 'post',
      detail: 'Final',
      home: { id: '13', name: 'Lakers', score: 129 },
      away: { id: '22', name: 'Trail Blazers', score: 136, winner: true },
    });
    const scoreboardStyle = event(
      'g9',
      NOW,
      'in',
      'Q1',
      { ...competitor('12', 'Clippers', 'home'), score: '58' },
      competitor('13', 'Lakers', 'away'),
    );
    expect(parseGame(scoreboardStyle)!.home.score).toBe(58);
    expect(parseGame({ competitions: [] })).toBeNull();
  });

  it('finds the latest result in an unsorted schedule, ignoring games not yet played', () => {
    const schedule = { events: [lostLastNight, tomorrowAtClippers, wonLastWeek] };
    expect(lastResult(schedule, NOW)!.id).toBe('g1');
    expect(lastResult({ events: [] }, NOW)).toBeNull();
  });

  it('takes the next game from the team endpoint', () => {
    expect(currentGame({ team: { nextEvent: [tomorrowAtClippers] } })!.id).toBe('g2');
    expect(currentGame({ team: {} })).toBeNull();
  });

  it('fetches both, and treats a just-finished "next event" as the latest result', async () => {
    const finished = event(
      'g2',
      local(28, 19, 30),
      'post',
      'Final',
      competitor('12', 'Clippers', 'home', 99),
      competitor('13', 'Lakers', 'away', 110, true),
    );
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === teamUrl(lakers)) {
        return new Response(JSON.stringify({ team: { nextEvent: [finished] } }));
      }
      if (u === scheduleUrl(lakers)) {
        return new Response(JSON.stringify({ events: [lostLastNight] }));
      }
      return new Response('', { status: 404 });
    }) as typeof fetch;
    const r = await fetchScores(fetchImpl, lakers, local(29, 1));
    expect(r).toMatchObject({ key: 'basketball/nba:13', current: null, last: { id: 'g2' } });
  });

  it('finds a game in progress in the schedule, which the team endpoint skips', async () => {
    // As ESPN answered for the Avalanche mid-game: nextEvent already points at the next game.
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u === teamUrl(lakers)) {
        return new Response(JSON.stringify({ team: { nextEvent: [tomorrowAtClippers] } }));
      }
      return new Response(JSON.stringify({ events: [wonLastWeek, liveTonight, lostLastNight] }));
    }) as typeof fetch;
    const r = await fetchScores(fetchImpl, lakers, local(27, 20));
    expect(r.current).toMatchObject({ id: 'g-live', state: 'in', detail: 'End of 1st' });
    expect(r.last!.id).toBe('g1');
    expect(scoreView(lakers, r, local(27, 20))).toMatchObject({
      live: true,
      score: '0–1',
      opponent: 'vs. Devils',
    });
  });

  it('takes a live game’s score from its summary when the schedule leaves it empty (NBA)', async () => {
    // As ESPN answered for the Warriors mid-game: state "in", no scores in the schedule.
    const noScores = event(
      'g-live',
      local(27, 19),
      'in',
      '28.8 - 3rd',
      competitor('13', 'Lakers', 'home'),
      competitor('17', 'Devils', 'away'),
    );
    const summary = {
      header: {
        competitions: [
          {
            status: { type: { state: 'in', shortDetail: '28.8 - 3rd' } },
            competitors: [
              { homeAway: 'home', team: { id: '13' }, score: '91' },
              { homeAway: 'away', team: { id: '17' }, score: '79' },
            ],
          },
        ],
      },
    };
    const calls: string[] = [];
    const fetchImpl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      calls.push(u);
      if (u === teamUrl(lakers)) {
        return new Response(JSON.stringify({ team: { nextEvent: [tomorrowAtClippers] } }));
      }
      if (u === summaryUrl(lakers, 'g-live')) return new Response(JSON.stringify(summary));
      return new Response(JSON.stringify({ events: [lostLastNight, noScores] }));
    }) as typeof fetch;
    const r = await fetchScores(fetchImpl, lakers, local(27, 20));
    expect(r.current).toMatchObject({
      state: 'in',
      home: { name: 'Lakers', score: 91 },
      away: { name: 'Devils', score: 79 },
    });
    expect(calls).toContain(summaryUrl(lakers, 'g-live'));
    expect(scoreView(lakers, r, local(27, 20))).toMatchObject({ live: true, score: '91–79' });
    // A summary that has ended the game makes it the latest result.
    summary.header.competitions[0]!.status.type = { state: 'post', shortDetail: 'Final' };
    const done = await fetchScores(fetchImpl, lakers, local(27, 22));
    expect(done.current).toBeNull();
    expect(done.last).toMatchObject({ id: 'g-live', detail: 'Final', home: { score: 91 } });
  });

  it('knows when a game is on or about to start', () => {
    const report = (current: unknown): ScoreReport => ({
      at: NOW,
      key: 'k',
      last: null,
      current: parseGame(current),
    });
    expect(isLiveOrSoon(report(tomorrowAtClippers), NOW)).toBe(false);
    expect(isLiveOrSoon(report(tomorrowAtClippers), local(28, 19, 20))).toBe(true); // 10 min out
    expect(isLiveOrSoon(report(liveAtClippers), local(28, 20, 30))).toBe(true);
  });
});

describe('scores box view', () => {
  const report = (last: unknown, current: unknown): ScoreReport => ({
    at: NOW - 60_000,
    key: 'basketball/nba:13',
    last: parseGame(last),
    current: parseGame(current),
  });

  it('shows the last result with the team’s score first, and the next game', () => {
    expect(scoreView(lakers, report(lostLastNight, tomorrowAtClippers), NOW)).toMatchObject({
      team: 'Los Angeles Lakers',
      score: '129–136',
      result: 'L',
      opponent: 'vs. Trail Blazers',
      status: 'Final · Yesterday',
      next: 'Next: Tomorrow at Clippers, 7:30 p.m.',
      live: false,
    });
    expect(scoreView(lakers, report(lostLastNight, tomorrowAtClippers), NOW).label).toBe(
      'Los Angeles Lakers lost 129 to 136 vs. Trail Blazers, Final, Yesterday. Next: Tomorrow at Clippers, 7:30 p.m.',
    );
    const won = scoreView(lakers, report(wonLastWeek, null), NOW);
    expect(won).toMatchObject({ score: '104–101', result: 'W', opponent: 'at Celtics', next: '' });
    expect(won.status).toBe('Final/OT · Oct 20'); // a week ago: a date, not "Tue"
    expect(won.label).toMatch(/^Los Angeles Lakers won 104 to 101 at Celtics/);
  });

  it('shows a game in progress as live, with when the score was taken', () => {
    const v = scoreView(lakers, report(lostLastNight, liveAtClippers), NOW);
    expect(v).toMatchObject({
      score: '74–70',
      result: 'Live',
      live: true,
      opponent: 'at Clippers',
    });
    expect(v.status).toBe('Q3 4:12 · as of 9:41');
  });

  it('calls a level soccer match a draw', () => {
    const arsenal = { league: 'soccer/eng.1', id: '359', name: 'Arsenal', abbr: 'ARS' };
    const draw = event(
      'm',
      local(25, 10),
      'post',
      'FT',
      competitor('359', 'Arsenal', 'home', 1),
      competitor('364', 'Liverpool', 'away', 1),
    );
    expect(
      scoreView(arsenal, { ...report(draw, null), key: 'soccer/eng.1:359' }, NOW),
    ).toMatchObject({ result: 'D', score: '1–1', status: 'FT · Sun' });
  });

  it('formats game times like a paper', () => {
    expect(gameWhen(local(27, 19, 30), NOW)).toBe('Tonight, 7:30 p.m.');
    expect(gameWhen(local(27, 13, 5), NOW)).toBe('Today, 1:05 p.m.');
    expect(gameWhen(local(28, 16, 5), NOW)).toBe('Tomorrow, 4:05 p.m.');
    expect(gameWhen(local(32, 13), NOW)).toBe('Sun, 1:00 p.m.'); // Nov 1
    expect(gameWhen(local(39, 13), NOW)).toBe('Nov 8, 1:00 p.m.');
  });

  it('puts live games first, each group in the reader’s order', () => {
    const team = (id: string, name: string) => ({ ...lakers, id, name });
    const settings = {
      ...DEFAULT_SETTINGS,
      teams: [team('1', 'A'), team('2', 'B live'), team('3', 'C'), team('4', 'D live')],
    };
    const r = (id: string, live: boolean): ScoreReport => ({
      ...report(lostLastNight, live ? liveAtClippers : tomorrowAtClippers),
      key: `basketball/nba:${id}`,
    });
    const scores = Object.fromEntries(
      [r('1', false), r('2', true), r('3', false), r('4', true)].map((x) => [x.key, x]),
    );
    // Rename sides so each report is about its own team id.
    for (const [key, x] of Object.entries(scores)) {
      const id = key.split(':')[1]!;
      for (const g of [x.last, x.current]) if (g) g.away = { ...g.away, id };
      if (x.last) x.last.home = { ...x.last.home, id };
    }
    expect(scoreViews(scores, settings, NOW).map((v) => [v.team, v.live])).toEqual([
      ['B live', true],
      ['D live', true],
      ['A', false],
      ['C', false],
    ]);
  });

  it('puts teams in their offseason last: no next game, or none for two weeks', () => {
    const team = (id: string, name: string) => ({ ...lakers, id, name });
    const settings = {
      ...DEFAULT_SETTINGS,
      teams: [team('1', 'Done'), team('2', 'Far'), team('3', 'Soon'), team('4', 'Live')],
    };
    const game = (when: number, state: 'pre' | 'in', id: string) => ({
      ...parseGame(state === 'in' ? liveAtClippers : tomorrowAtClippers)!,
      date: when,
      away: { id, name: 'Us', abbr: 'US' },
    });
    const r = (id: string, current: ScoreReport['current']): ScoreReport => ({
      at: NOW,
      key: `basketball/nba:${id}`,
      last: { ...parseGame(lostLastNight)!, home: { id, name: 'Us', abbr: 'US', score: 1 } },
      current,
    });
    const scores = Object.fromEntries(
      [
        r('1', null), // season over: no next game
        r('2', game(NOW + 20 * 86_400_000, 'pre', '2')), // next game three weeks out
        r('3', game(NOW + 13 * 86_400_000, 'pre', '3')), // within two weeks: in season
        r('4', game(NOW - 3_600_000, 'in', '4')),
      ].map((x) => [x.key, x]),
    );
    expect(scoreViews(scores, settings, NOW).map((v) => [v.team, v.offseason])).toEqual([
      ['Live', false],
      ['Soon', false],
      ['Done', true],
      ['Far', true],
    ]);
  });

  it('lists teams in the reader’s order, skipping ones with no recent report', () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      teams: [lakers, { ...lakers, id: '99', name: 'Nobody' }],
    };
    const views = scoreViews({ 'basketball/nba:13': report(lostLastNight, null) }, settings, NOW);
    expect(views.map((v) => v.team)).toEqual(['Los Angeles Lakers']);
    const old = { ...report(lostLastNight, null), at: NOW - 5 * 86_400_000 };
    expect(scoreViews({ 'basketball/nba:13': old }, settings, NOW)).toEqual([]);
  });
});

describe('followed teams in settings', () => {
  it('keeps valid teams only, without duplicates, at most 8', () => {
    const s = normalizeSettings({
      teams: [
        lakers,
        lakers,
        { ...lakers, league: 'curling/world' },
        { ...lakers, id: '../x' },
        { ...lakers, name: ' ' },
        ...Array.from({ length: 10 }, (_, i) => ({ ...lakers, id: String(100 + i) })),
      ],
    });
    expect(s.teams[0]).toEqual(lakers);
    expect(s.teams).toHaveLength(8);
    expect(normalizeSettings({}).teams).toEqual([]);
  });
});

describe('refreshExtras: scores', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, teams: [lakers] };
  const fetchFor = (next: unknown, calls: string[]) =>
    (async (url: RequestInfo | URL) => {
      calls.push(String(url));
      if (String(url) === teamUrl(lakers)) {
        return new Response(JSON.stringify({ team: { nextEvent: [next] } }));
      }
      return new Response(JSON.stringify({ events: [lostLastNight] }));
    }) as typeof fetch;

  it('fetches followed teams into storage and reports when a game is on', async () => {
    const calls: string[] = [];
    const written: Record<string, unknown> = {};
    const result = await refreshExtras({
      settings,
      now: NOW,
      fetch: fetchFor(tomorrowAtClippers, calls),
      hasAccess: async () => true,
      read: async () => ({}),
      write: async (patch) => void Object.assign(written, patch),
    });
    expect(calls).toHaveLength(2);
    expect((written.scores as Record<string, ScoreReport>)['basketball/nba:13']).toMatchObject({
      last: { id: 'g1' },
      current: { id: 'g2' },
    });
    expect(result.liveScores).toBe(false);
  });

  it('checks again sooner while a game is on', async () => {
    const cached = (current: unknown): ScoreReport => ({
      at: NOW - 2 * 60_000,
      key: 'basketball/nba:13',
      last: parseGame(lostLastNight),
      current: parseGame(current),
    });
    const run = async (current: unknown) => {
      const calls: string[] = [];
      const result = await refreshExtras({
        settings,
        now: NOW,
        fetch: fetchFor(current, calls),
        hasAccess: async () => true,
        read: async () => ({ scores: { 'basketball/nba:13': cached(current) } }),
        write: async () => undefined,
      });
      return { calls, result };
    };
    // Two minutes old is stale during a game; otherwise it waits ten.
    const live = await run(liveAtClippers);
    expect(live.calls).toHaveLength(2);
    expect(live.result.liveScores).toBe(true);
    expect((await run(tomorrowAtClippers)).calls).toHaveLength(0);
  });

  it('needs ESPN access only while following a team', () => {
    expect(extrasOrigins(settings)).toEqual(SPORTS_ORIGINS);
    expect(extrasOrigins(DEFAULT_SETTINGS)).toEqual([]);
  });
});
