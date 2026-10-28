// Weather and market data ride along with each feed refresh. Results go to storage.local
// (they change often; storage.sync has write limits) where the new tab reads them.
import type { MarketReport, Settings, WeatherReport } from '../types';
import { fetchMarket, MARKET_ORIGINS } from './market';
import { fetchWeather, reportMatches, WEATHER_ORIGINS } from './weather';

export const WEATHER_KEY = 'weather';
export const MARKET_KEY = 'market';
const WEATHER_EVERY_MS = 25 * 60_000;
const MARKET_EVERY_MS = 10 * 60_000;

export interface ExtrasDeps {
  settings: Settings;
  fetch: typeof fetch;
  now: number;
  /** Re-fetch even if the cache is fresh (settings just changed, manual refresh). */
  force?: boolean;
  hasAccess: (origins: string[]) => Promise<boolean>;
  read: () => Promise<{ weather?: WeatherReport; market?: MarketReport }>;
  write: (patch: Record<string, unknown>) => Promise<void>;
}

/** Host patterns the extras need, so permission clean-up keeps them. */
export function extrasOrigins(settings: Settings): string[] {
  return [
    ...(settings.weatherPlace ? WEATHER_ORIGINS : []),
    ...(settings.showMarket ? MARKET_ORIGINS : []),
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

  const marketFresh = !!cached.market && now - cached.market.at < MARKET_EVERY_MS;
  if (
    settings.showMarket &&
    (deps.force || !marketFresh) &&
    (await deps.hasAccess(MARKET_ORIGINS))
  ) {
    try {
      const report = await fetchMarket(deps.fetch, now);
      if (report) patch[MARKET_KEY] = report;
    } catch (e) {
      console.warn('[daily-tab] market data unavailable', e);
    }
  }

  if (Object.keys(patch).length) await deps.write(patch);
}
