// Formula 1 from Jolpica (api.jolpi.ca, the community successor to the Ergast API; no key):
// the last race's result with constructors, and the next race's date and place. ESPN's F1 feed
// has no constructors, so F1 comes from here rather than lib/extras/scores.ts.
import type { Race, RaceReport, SportsTeam } from '../types';

export const RACING_ORIGINS = ['https://api.jolpi.ca/*'];
const BASE = 'https://api.jolpi.ca/ergast/f1';
/** The whole field: the podium is shown; every driver and team is a spoiler after a race. */
export const lastRaceUrl = `${BASE}/current/last/results.json?limit=30`;
export const nextRaceUrl = `${BASE}/current/next.json`;

/** Followed like a team (Settings → Scores → Formula 1), with one fixed id. */
export const F1: SportsTeam = {
  league: 'racing/f1',
  id: '0',
  name: 'Formula 1',
  abbr: 'F1',
  nickname: 'F1',
};
export const isRacing = (t: Pick<SportsTeam, 'league'>) => t.league === 'racing/f1';

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** The first race in a Jolpica response, or null (none yet this season, or none left). */
export function parseRace(json: unknown): Race | null {
  const r = obj(arr(obj(obj(obj(json).MRData).RaceTable).Races)[0]);
  const name = str(r.raceName);
  const day = str(r.date);
  if (!name || !/^\d{4}-\d\d-\d\d$/.test(day)) return null;
  const date = Date.parse(`${day}T${str(r.time) || '12:00:00Z'}`);
  if (!Number.isFinite(date)) return null;
  const loc = obj(obj(r.Circuit).Location);
  const results = arr(r.Results).map((x) => obj(x));
  const race: Race = {
    name,
    date,
    circuit: str(obj(r.Circuit).circuitName),
    city: str(loc.locality),
    country: str(loc.country),
    podium: results
      .filter((x) => ['1', '2', '3'].includes(str(x.position)))
      .sort((a, b) => Number(a.position) - Number(b.position))
      .map((x) => ({
        position: Number(x.position),
        driver: `${str(obj(x.Driver).givenName)} ${str(obj(x.Driver).familyName)}`.trim(),
        family: str(obj(x.Driver).familyName),
        constructor: str(obj(x.Constructor).name),
      })),
    field: [
      ...new Set(
        results.flatMap((x) => [str(obj(x.Driver).familyName), str(obj(x.Constructor).name)]),
      ),
    ].filter(Boolean),
  };
  return race;
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchRaces(fetchImpl: typeof fetch, now: number): Promise<RaceReport> {
  const [last, next] = await Promise.all([
    getJson(fetchImpl, lastRaceUrl),
    getJson(fetchImpl, nextRaceUrl),
  ]);
  return {
    at: now,
    key: `${F1.league}:${F1.id}`,
    kind: 'race',
    lastRace: parseRace(last),
    nextRace: parseRace(next),
  };
}
