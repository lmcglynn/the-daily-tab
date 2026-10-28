// Weather and market data ride along with each feed refresh. Results go to storage.local
// (they change often; storage.sync has write limits) where the new tab reads them.
import type { MarketReport, Settings, WeatherReport } from '../types';
import { fetchQuote, MARKET_ORIGINS } from './market';
import { fetchWeather, reportMatches, WEATHER_ORIGINS } from './weather';

export const WEATHER_KEY = 'weather';
/** Record<symbol, MarketReport> */
export const MARKETS_KEY = 'markets';
const WEATHER_EVERY_MS = 25 * 60_000;
const MARKET_EVERY_MS = 10 * 60_000;

export interface ExtrasDeps {
  settings: Settings;
  fetch: typeof fetch;
  now: number;
  /** Re-fetch even if the cache is fresh (settings just changed, manual refresh). */
  force?: boolean;
  hasAccess: (origins: string[]) => Promise<boolean>;
  read: () => Promise<{ weather?: WeatherReport; markets?: Record<string, MarketReport> }>;
  write: (patch: Record<string, unknown>) => Promise<void>;
}

/** Host patterns the extras need, so permission clean-up keeps them. */
export function extrasOrigins(settings: Settings): string[] {
  return [
    ...(settings.weatherPlace ? WEATHER_ORIGINS : []),
    ...(settings.tickers.length ? MARKET_ORIGINS : []),
  ];
}

export async function refreshExtras(deps: ExtrasDeps): Promise<void> {
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

  if (Object.keys(patch).length) await deps.write(patch);
}
