// Weather from Open-Meteo (no key). Fetched by the background, cached in storage.local.
import { fetchWithTimeout } from '../engine/fetch';
import type { Units, WeatherPlace, WeatherReport } from '../types';

import { isWet } from './weather-words';

export { describeWeather, isWet, reportMatches } from './weather-words';

export const WEATHER_ORIGINS = [
  'https://api.open-meteo.com/*',
  'https://geocoding-api.open-meteo.com/*',
];
const TIMEOUT_MS = 10_000;
/** How far ahead the heads-up looks. */
const HEADS_UP_HOURS = 12;
/** Rain counts as coming when the hour's chance of it is at least this (%). */
const LIKELY = 50;

export function geocodeUrl(query: string): string {
  const q = encodeURIComponent(query.trim().slice(0, 80));
  return `https://geocoding-api.open-meteo.com/v1/search?name=${q}&count=6&language=en&format=json`;
}

export function forecastUrl(place: Pick<WeatherPlace, 'lat' | 'lon'>, units: Units): string {
  const p = new URLSearchParams({
    latitude: place.lat.toFixed(4),
    longitude: place.lon.toFixed(4),
    current: 'temperature_2m,weather_code,is_day',
    daily: 'temperature_2m_max,temperature_2m_min',
    hourly: 'precipitation_probability,weather_code',
    forecast_hours: String(HEADS_UP_HOURS + 1),
    timezone: 'auto',
    timeformat: 'unixtime',
    forecast_days: '1',
    temperature_unit: units === 'c' ? 'celsius' : 'fahrenheit',
  });
  return `https://api.open-meteo.com/v1/forecast?${p}`;
}

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v : '');

export function parseGeocode(json: unknown): WeatherPlace[] {
  const results = (json as Json | null)?.results;
  if (!Array.isArray(results)) return [];
  return results.flatMap((r: Json) => {
    const lat = num(r.latitude);
    const lon = num(r.longitude);
    const name = str(r.name);
    if (lat === null || lon === null || !name) return [];
    const region = [str(r.admin1), str(r.country)].filter(Boolean).join(', ');
    return [{ name, region, lat, lon }];
  });
}

/**
 * The first hour after `now` (within 12) where the weather turns: rain likely to start when it's
 * dry now, or a dry hour when it's falling now.
 */
function nextChange(hourly: Json | undefined, codeNow: number, now: number) {
  const times = hourly?.time;
  const codes = hourly?.weather_code;
  const chances = hourly?.precipitation_probability;
  if (!Array.isArray(times) || !Array.isArray(codes)) return undefined;
  const wetNow = isWet(codeNow);
  for (let k = 0; k < times.length; k++) {
    const t = num(times[k]);
    const code = num(codes[k]);
    if (t === null || code === null) continue;
    const at = t * 1000;
    if (at <= now) continue;
    if (at > now + HEADS_UP_HOURS * 3_600_000) break;
    const chance = Array.isArray(chances) ? num(chances[k]) : null;
    const turns = wetNow ? !isWet(code) : isWet(code) && (chance ?? 100) >= LIKELY;
    if (turns) return { at, code };
  }
  return undefined;
}

export function parseForecast(
  json: unknown,
  place: Pick<WeatherPlace, 'lat' | 'lon'>,
  units: Units,
  now: number,
): WeatherReport | null {
  const j = json as Json | null;
  const current = j?.current as Json | undefined;
  const daily = j?.daily as Json | undefined;
  const temp = num(current?.temperature_2m);
  const code = num(current?.weather_code);
  const high = num((daily?.temperature_2m_max as unknown[] | undefined)?.[0]);
  const low = num((daily?.temperature_2m_min as unknown[] | undefined)?.[0]);
  if (temp === null || code === null || high === null || low === null) return null;
  const change = nextChange(j?.hourly as Json | undefined, code, now);
  return {
    at: now,
    lat: place.lat,
    lon: place.lon,
    units,
    temp,
    code,
    isDay: current?.is_day !== 0,
    high,
    low,
    ...(change && { change }),
  };
}

async function getJson(fetchImpl: typeof fetch, url: string): Promise<unknown> {
  const { res, body } = await fetchWithTimeout(
    fetchImpl,
    url,
    { headers: { Accept: 'application/json' }, credentials: 'omit', cache: 'no-store' },
    TIMEOUT_MS,
  );
  const text = new TextDecoder().decode(await body());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(text);
}

export async function geocode(fetchImpl: typeof fetch, query: string): Promise<WeatherPlace[]> {
  if (!query.trim()) return [];
  return parseGeocode(await getJson(fetchImpl, geocodeUrl(query)));
}

export async function fetchWeather(
  fetchImpl: typeof fetch,
  place: WeatherPlace,
  units: Units,
  now: number,
): Promise<WeatherReport | null> {
  return parseForecast(await getJson(fetchImpl, forecastUrl(place, units)), place, units, now);
}

export { getJson };
