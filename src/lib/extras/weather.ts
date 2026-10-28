// Weather from Open-Meteo (no key). Fetched by the background, cached in storage.local.
import { fetchWithTimeout } from '../engine/fetch';
import type { Units, WeatherPlace, WeatherReport } from '../types';

export const WEATHER_ORIGINS = [
  'https://api.open-meteo.com/*',
  'https://geocoding-api.open-meteo.com/*',
];
const TIMEOUT_MS = 10_000;

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
    timezone: 'auto',
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
  };
}

/** WMO weather interpretation codes → a newspaper word or two. */
export function describeWeather(code: number, isDay = true): string {
  if (code === 0) return isDay ? 'Sunny' : 'Clear';
  if (code === 1) return isDay ? 'Mostly sunny' : 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Cloudy';
  if (code === 45 || code === 48) return 'Fog';
  if (code >= 51 && code <= 57) return 'Drizzle';
  if (code >= 61 && code <= 67) return code >= 65 ? 'Heavy rain' : 'Rain';
  if (code >= 71 && code <= 77) return 'Snow';
  if (code >= 80 && code <= 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code >= 95) return 'Thunderstorms';
  return 'Unsettled';
}

/** The cached report is for this place and these units (settings may have changed since). */
export function reportMatches(
  report: WeatherReport | null | undefined,
  place: WeatherPlace | null,
  units: Units,
): report is WeatherReport {
  return (
    !!report &&
    !!place &&
    report.units === units &&
    Math.abs(report.lat - place.lat) < 1e-3 &&
    Math.abs(report.lon - place.lon) < 1e-3
  );
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
