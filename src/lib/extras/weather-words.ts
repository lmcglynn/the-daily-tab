// Pure weather helpers for the new tab. No imports beyond types: anything that pulls in the
// fetch/feed code here would drag the XML parser into the new tab's bundle.
import type { Units, WeatherPlace, WeatherReport } from '../types';

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
