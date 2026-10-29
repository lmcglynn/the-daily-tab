// Weather and market data ride along with each feed refresh. Results go to storage.local
// (they change often; storage.sync has write limits) where the new tab reads them.
import type { MarketReport, ScoreReport, Settings, WeatherReport } from '../types';
import { fetchQuote, MARKET_ORIGINS } from './market';
import { fetchScores, isLiveOrSoon, SPORTS_ORIGINS, teamKey } from './scores';
import { fetchWeather, reportMatches, WEATHER_ORIGINS } from './weather';

export const WEATHER_KEY = 'weather';
/** Record<symbol, MarketReport> */
export const MARKETS_KEY = 'markets';
/** Record<league:id, ScoreReport> */
export const SCORES_KEY = 'scores';
const WEATHER_EVERY_MS = 25 * 60_000;
const MARKET_EVERY_MS = 10 * 60_000;
const SCORES_EVERY_MS = 10 * 60_000;
/** While a followed team is playing (or about to). */
const LIVE_SCORES_EVERY_MS = 90_000;

export interface ExtrasDeps {
  settings: Settings;
  fetch: typeof fetch;
  now: number;
  /** Re-fetch even if the cache is fresh (settings just changed, manual refresh). */
  force?: boolean;
  hasAccess: (origins: string[]) => Promise<boolean>;
  read: () => Promise<{
    weather?: WeatherReport;
    markets?: Record<string, MarketReport>;
    scores?: Record<string, ScoreReport>;
  }>;
  write: (patch: Record<string, unknown>) => Promise<void>;
}

/** Host patterns the extras need, so permission clean-up keeps them. */
export function extrasOrigins(settings: Settings): string[] {
  return [
    ...(settings.weatherPlace ? WEATHER_ORIGINS : []),
    ...(settings.tickers.length ? MARKET_ORIGINS : []),
    ...(settings.teams.length ? SPORTS_ORIGINS : []),
  ];
}

export interface ExtrasResult {
  /** A followed team is playing or about to: check again in a couple of minutes. */
  liveScores: boolean;
}

export async function refreshExtras(deps: ExtrasDeps): Promise<ExtrasResult> {
  const { settings, now } = deps;
  const cached = await deps.read();
  const patch: Record<string, unknown> = {};

  const place = settings.weatherPlace;
  const weatherFresh =
    reportMatches(cached.weather, place, settings.units) &&
    now - cached.weather.at < WEATHER_EVERY_MS;
  if (place && (deps.force || !weatherFresh) && (await deps.hasAccess(WEATHER_ORIGINS))) {
    try {
      const report = await fetchWeather(deps.fetch, place, settings.units, now);
      if (report) patch[WEATHER_KEY] = report;
    } catch (e) {
      console.warn('[daily-tab] weather unavailable', e);
    }
  }

  // Markets: keep only followed tickers; refetch the stale ones. A ticker that fails keeps
  // its last good quote (the new tab hides quotes older than a few days).
  const before = cached.markets ?? {};
  const markets: Record<string, MarketReport> = {};
  for (const t of settings.tickers) if (before[t.symbol]) markets[t.symbol] = before[t.symbol]!;
  const stale = settings.tickers.filter(
    (t) => deps.force || !markets[t.symbol] || now - markets[t.symbol]!.at >= MARKET_EVERY_MS,
  );
  let changed = Object.keys(markets).length !== Object.keys(before).length;
  if (stale.length && (await deps.hasAccess(MARKET_ORIGINS))) {
    const quotes = await Promise.allSettled(stale.map((t) => fetchQuote(deps.fetch, t, now)));
    quotes.forEach((q, i) => {
      if (q.status === 'fulfilled' && q.value) {
        markets[stale[i]!.symbol] = q.value;
        changed = true;
      } else if (q.status === 'rejected') {
        console.warn(`[daily-tab] quote unavailable for ${stale[i]!.symbol}`, q.reason);
      }
    });
  }
  if (changed) patch[MARKETS_KEY] = markets;

  // Scores: same pattern, with a short window while a game is on.
  const scoresBefore = cached.scores ?? {};
  const scores: Record<string, ScoreReport> = {};
  for (const t of settings.teams) {
    const r = scoresBefore[teamKey(t)];
    if (r) scores[teamKey(t)] = r;
  }
  const staleTeams = settings.teams.filter((t) => {
    const r = scores[teamKey(t)];
    if (deps.force || !r) return true;
    return now - r.at >= (isLiveOrSoon(r, now) ? LIVE_SCORES_EVERY_MS : SCORES_EVERY_MS);
  });
  let scoresChanged = Object.keys(scores).length !== Object.keys(scoresBefore).length;
  if (staleTeams.length && (await deps.hasAccess(SPORTS_ORIGINS))) {
    const results = await Promise.allSettled(
      staleTeams.map((t) => fetchScores(deps.fetch, t, now)),
    );
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        scores[r.value.key] = r.value;
        scoresChanged = true;
      } else {
        console.warn(`[daily-tab] scores unavailable for ${staleTeams[i]!.name}`, r.reason);
      }
    });
  }
  if (scoresChanged) patch[SCORES_KEY] = scores;

  if (Object.keys(patch).length) await deps.write(patch);
  return { liveScores: Object.values(scores).some((r) => isLiveOrSoon(r, now)) };
}
