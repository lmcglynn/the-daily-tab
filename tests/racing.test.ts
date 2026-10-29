import { DEFAULT_SETTINGS } from '@/lib/defaults';
import {
  F1,
  fetchRaces,
  lastRaceUrl,
  nextRaceUrl,
  parseRace,
  RACING_ORIGINS,
} from '@/lib/extras/racing';
import { extrasOrigins, refreshExtras } from '@/lib/extras/refresh';
import { SPORTS_ORIGINS } from '@/lib/extras/scores';
import { asScores } from '@/lib/frontpage-data';
import { spoilerWords } from '@/lib/spoilers';
import type { RaceReport, Settings } from '@/lib/types';
import { raceView, scoreViews } from '@/ui/model';
import * as fx from '../fixtures/frontpage';

const local = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();
const NOW = local(27, 9, 42); // Tue Oct 27, 9:42 a.m.

// Shaped like Jolpica (Ergast) answers.
const result = (position: number, given: string, family: string, team: string) => ({
  position: String(position),
  Driver: { givenName: given, familyName: family, code: family.slice(0, 3).toUpperCase() },
  Constructor: { name: team },
});
const races = (race: Record<string, unknown> | null) => ({
  MRData: { RaceTable: { Races: race ? [race] : [] } },
});
const austin = races({
  raceName: 'United States Grand Prix',
  date: '2026-10-25',
  time: '20:00:00Z',
  Circuit: {
    circuitName: 'Circuit of the Americas',
    Location: { locality: 'Austin', country: 'USA' },
  },
  // Out of order, with the whole field.
  Results: [
    result(3, 'Max', 'Verstappen', 'Red Bull'),
    result(1, 'Andrea Kimi', 'Antonelli', 'Mercedes'),
    result(2, 'Charles', 'Leclerc', 'Ferrari'),
    result(4, 'George', 'Russell', 'Mercedes'),
  ],
});
const mexico = races({
  raceName: 'Mexico City Grand Prix',
  date: '2026-11-01',
  time: '20:00:00Z',
  Circuit: {
    circuitName: 'Autódromo Hermanos Rodríguez',
    Location: { locality: 'Mexico City', country: 'Mexico' },
  },
});

describe('Formula 1 from Jolpica', () => {
  it('reads the last race: podium in order with constructors, and the whole field', () => {
    const race = parseRace(austin)!;
    expect(race).toMatchObject({
      name: 'United States Grand Prix',
      date: Date.parse('2026-10-25T20:00:00Z'),
      city: 'Austin',
      country: 'USA',
    });
    expect(race.podium.map((p) => `${p.position} ${p.driver} (${p.constructor})`)).toEqual([
      '1 Andrea Kimi Antonelli (Mercedes)',
      '2 Charles Leclerc (Ferrari)',
      '3 Max Verstappen (Red Bull)',
    ]);
    expect(race.field).toEqual([
      'Verstappen',
      'Red Bull',
      'Antonelli',
      'Mercedes',
      'Leclerc',
      'Ferrari',
      'Russell',
    ]);
  });

  it('reads the next race, and nothing when the season has none left', () => {
    expect(parseRace(mexico)).toMatchObject({ name: 'Mexico City Grand Prix', podium: [] });
    expect(parseRace(races(null))).toBeNull();
    expect(parseRace({})).toBeNull();
  });

  it('fetches both into one report', async () => {
    const fetchImpl = (async (url: RequestInfo | URL) =>
      new Response(
        JSON.stringify(
          String(url) === lastRaceUrl ? austin : String(url) === nextRaceUrl ? mexico : {},
        ),
      )) as typeof fetch;
    const r = await fetchRaces(fetchImpl, NOW);
    expect(r).toMatchObject({ key: 'racing/f1:0', kind: 'race', at: NOW });
    expect(r.lastRace!.name).toBe('United States Grand Prix');
    expect(r.nextRace!.name).toBe('Mexico City Grand Prix');
  });
});

describe('Formula 1 in the scores box', () => {
  const report = (): RaceReport => ({
    at: NOW,
    key: 'racing/f1:0',
    kind: 'race',
    lastRace: { ...parseRace(austin)!, date: local(25, 13) },
    nextRace: { ...parseRace(mexico)!, date: local(32, 13) },
  });

  it('shows the race, its podium with constructors, and when and where the next one is', () => {
    expect(raceView(report(), NOW)).toMatchObject({
      kind: 'race',
      race: 'F1 · United States GP',
      status: 'Final · Sun',
      podium: [
        { position: 1, driver: 'A. Antonelli', constructor: 'Mercedes' },
        { position: 2, driver: 'C. Leclerc', constructor: 'Ferrari' },
        { position: 3, driver: 'M. Verstappen', constructor: 'Red Bull' },
      ],
      next: 'Next: Sun, 1:00 p.m. · Mexico City, Mexico',
      live: false,
      offseason: false,
    });
    expect(raceView(report(), NOW).label).toMatch(
      /^Formula 1, United States Grand Prix: 1, Andrea Kimi Antonelli, Mercedes; 2, Charles Leclerc/,
    );
  });

  it('goes last between seasons (no next race, or none for two weeks)', () => {
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      teams: [F1, ...fx.settings.teams.slice(0, 1)],
    };
    const scores = { ...fx.scores, 'racing/f1:0': { ...report(), nextRace: null } };
    const views = scoreViews(scores, settings, fx.NOW);
    expect(views.map((v) => v.kind)).toEqual(['game', 'race']);
    expect(views.at(-1)!.offseason).toBe(true);
  });

  it('survives the trip through storage', () => {
    expect(asScores({ 'racing/f1:0': report(), junk: { at: 1, kind: 'other' } })).toEqual({
      'racing/f1:0': report(),
    });
  });

  it('spoiler mode hides F1 stories, and for a day after a race its drivers and teams', () => {
    const scores = { 'racing/f1:0': report() };
    const dayAfter = spoilerWords([F1], scores, local(26, 9));
    expect(dayAfter).toEqual(
      expect.arrayContaining([
        'F1',
        'Grand Prix',
        'United States Grand Prix',
        'Antonelli',
        'Red Bull',
        'Russell',
      ]),
    );
    const later = spoilerWords([F1], scores, local(28, 9));
    expect(later).toContain('F1');
    expect(later).not.toContain('Antonelli');
  });
});

describe('refreshExtras: Formula 1', () => {
  it('fetches F1 from Jolpica, with its own host access', async () => {
    const calls: string[] = [];
    const written: Record<string, unknown> = {};
    const settings: Settings = { ...DEFAULT_SETTINGS, teams: [F1] };
    await refreshExtras({
      settings,
      now: NOW,
      fetch: (async (url: RequestInfo | URL) => {
        calls.push(String(url));
        return new Response(JSON.stringify(String(url) === lastRaceUrl ? austin : mexico));
      }) as typeof fetch,
      hasAccess: async (origins) => origins === RACING_ORIGINS,
      read: async () => ({}),
      write: async (patch) => void Object.assign(written, patch),
    });
    expect(calls.sort()).toEqual([lastRaceUrl, nextRaceUrl].sort());
    expect((written.scores as Record<string, RaceReport>)['racing/f1:0']!.kind).toBe('race');
    expect(extrasOrigins(settings)).toEqual(RACING_ORIGINS);
    expect(extrasOrigins({ ...settings, teams: [F1, fx.settings.teams[0]!] })).toEqual([
      ...SPORTS_ORIGINS,
      ...RACING_ORIGINS,
    ]);
  });
});
