// Scores from ESPN's site API (unofficial, no key). Per followed team: the last result from its
// schedule, and the next (or in-progress) game from the team endpoint's `nextEvent`, which works
// for every league (soccer schedules list upcoming fixtures only with ?fixture=true).
import type { Game, GameSide, ScoreReport, SportsTeam } from '../types';

export const SPORTS_ORIGINS = ['https://site.api.espn.com/*'];
const BASE = 'https://site.api.espn.com/apis/site/v2/sports';

export const LEAGUES: { id: string; name: string }[] = [
  { id: 'football/nfl', name: 'NFL' },
  { id: 'basketball/nba', name: 'NBA' },
  { id: 'basketball/wnba', name: 'WNBA' },
  { id: 'baseball/mlb', name: 'MLB' },
  { id: 'hockey/nhl', name: 'NHL' },
  { id: 'soccer/usa.1', name: 'MLS' },
  { id: 'soccer/eng.1', name: 'Premier League' },
];
export const LEAGUE_IDS = new Set(LEAGUES.map((l) => l.id));
export const TEAM_ID = /^\d{1,8}$/;

export const teamKey = (t: Pick<SportsTeam, 'league' | 'id'>) => `${t.league}:${t.id}`;
export const teamsUrl = (league: string) => `${BASE}/${league}/teams?limit=1000`;
export const teamUrl = (t: SportsTeam) => `${BASE}/${t.league}/teams/${t.id}`;
export const scheduleUrl = (t: SportsTeam) => `${BASE}/${t.league}/teams/${t.id}/schedule`;

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === 'object' ? (v as Json) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

/** A league's teams, sorted by name. */
export function parseTeams(json: unknown, league: string): SportsTeam[] {
  const teams = arr(obj(arr(obj(arr(obj(json).sports)[0]).leagues)[0]).teams)
    .map((t) => obj(obj(t).team))
    .filter((t) => TEAM_ID.test(str(t.id)) && str(t.displayName))
    .map((t) => ({
      league,
      id: str(t.id),
      name: str(t.displayName),
      abbr: str(t.abbreviation),
    }));
  return teams.sort((a, b) => a.name.localeCompare(b.name));
}

function score(v: unknown): number | undefined {
  // Schedules give {value, displayValue}; scoreboards a plain string.
  const raw = v && typeof v === 'object' ? (obj(v).value ?? obj(v).displayValue) : v;
  const n = Number(raw);
  return raw === undefined || raw === null || raw === '' || !Number.isFinite(n) ? undefined : n;
}

function side(c: Json): GameSide | null {
  const team = obj(c.team);
  const id = str(team.id);
  if (!id) return null;
  const s: GameSide = {
    id,
    name: str(team.shortDisplayName) || str(team.displayName) || str(team.abbreviation),
    abbr: str(team.abbreviation),
  };
  const n = score(c.score);
  if (n !== undefined) s.score = n;
  if (c.winner === true) s.winner = true;
  return s;
}

/** One event → a game, or null if it isn't a two-sided game we can read. */
export function parseGame(event: unknown): Game | null {
  const e = obj(event);
  const comp = obj(arr(e.competitions)[0]);
  const type = obj(obj(comp.status ?? e.status).type);
  const state = str(type.state);
  const date = Date.parse(str(e.date));
  const sides = arr(comp.competitors).map((c) => obj(c));
  const home = sides.find((c) => c.homeAway === 'home');
  const away = sides.find((c) => c.homeAway === 'away');
  const h = home && side(home);
  const a = away && side(away);
  if (!h || !a || !Number.isFinite(date) || !['pre', 'in', 'post'].includes(state)) return null;
  return {
    id: str(e.id),
    date,
    state: state as Game['state'],
    detail: str(type.shortDetail) || str(type.detail) || str(type.description),
    home: h,
    away: a,
  };
}

/** The most recent finished game in a schedule (events aren't always in date order). */
export function lastResult(schedule: unknown, now: number): Game | null {
  const games = arr(obj(schedule).events)
    .map(parseGame)
    .filter((g): g is Game => !!g && g.state === 'post' && g.date <= now);
  return games.sort((a, b) => b.date - a.date)[0] ?? null;
}

/** The team's next or in-progress game, from the team endpoint. */
export function currentGame(team: unknown): Game | null {
  return parseGame(arr(obj(obj(team).team).nextEvent)[0]);
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const res = await fetchImpl(url, { cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export async function fetchTeams(fetchImpl: typeof fetch, league: string): Promise<SportsTeam[]> {
  if (!LEAGUE_IDS.has(league)) throw new Error(`Unknown league ${league}`);
  return parseTeams(await getJson(fetchImpl, teamsUrl(league)), league);
}

export async function fetchScores(
  fetchImpl: typeof fetch,
  team: SportsTeam,
  now: number,
): Promise<ScoreReport> {
  const [teamJson, schedule] = await Promise.all([
    getJson(fetchImpl, teamUrl(team)),
    getJson(fetchImpl, scheduleUrl(team)),
  ]);
  let current = currentGame(teamJson);
  let last = lastResult(schedule, now);
  // Just finished but still the "next event": it's the latest result.
  if (current?.state === 'post') {
    if (!last || current.date >= last.date) last = current;
    current = null;
  }
  return { at: now, key: teamKey(team), last, current };
}

/** A game is on, or starts within 15 minutes: worth checking every couple of minutes. */
export function isLiveOrSoon(report: ScoreReport | undefined, now: number): boolean {
  const g = report?.current;
  if (!g) return false;
  return (
    g.state === 'in' ||
    (g.state === 'pre' && g.date - now < 15 * 60_000 && g.date > now - 4 * 3600_000)
  );
}
