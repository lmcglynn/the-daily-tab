import { extrasOrigins, refreshExtras } from '@/lib/extras/refresh';
import { MARKET_ORIGINS, parseChart } from '@/lib/extras/market';
import {
  WEATHER_ORIGINS,
  describeWeather,
  forecastUrl,
  parseForecast,
  parseGeocode,
} from '@/lib/extras/weather';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import type { Settings } from '@/lib/types';
import { NOW } from './helpers';

const seattle = {
  name: 'Seattle',
  region: 'Washington, United States',
  lat: 47.6062,
  lon: -122.3321,
};

const forecastJson = {
  current: { temperature_2m: 47.6, weather_code: 61, is_day: 1 },
  daily: { temperature_2m_max: [52.4], temperature_2m_min: [40.6] },
};

const chartJson = {
  chart: {
    result: [
      {
        meta: {
          regularMarketPrice: 7737.01,
          chartPreviousClose: 7722.6,
          regularMarketTime: 1793204240,
          exchangeTimezoneName: 'America/New_York',
        },
        indicators: { quote: [{ close: [7722.1, null, 7730.5, 7737.01] }] },
      },
    ],
  },
};

describe('weather', () => {
  it('parses geocoding results into places', () => {
    expect(
      parseGeocode({
        results: [
          {
            name: 'Seattle',
            latitude: 47.6,
            longitude: -122.3,
            admin1: 'Washington',
            country: 'United States',
          },
          { name: 'Nowhere' },
        ],
      }),
    ).toEqual([{ name: 'Seattle', region: 'Washington, United States', lat: 47.6, lon: -122.3 }]);
    expect(parseGeocode({})).toEqual([]);
  });

  it('builds the forecast URL in the chosen units', () => {
    expect(forecastUrl(seattle, 'f')).toContain('temperature_unit=fahrenheit');
    expect(forecastUrl(seattle, 'c')).toContain('temperature_unit=celsius');
    expect(forecastUrl(seattle, 'f')).toMatch(
      /^https:\/\/api\.open-meteo\.com\/v1\/forecast\?latitude=47\.6062/,
    );
  });

  it('parses a forecast and rejects incomplete ones', () => {
    expect(parseForecast(forecastJson, seattle, 'f', NOW)).toEqual({
      at: NOW,
      lat: seattle.lat,
      lon: seattle.lon,
      units: 'f',
      temp: 47.6,
      code: 61,
      isDay: true,
      high: 52.4,
      low: 40.6,
    });
    expect(parseForecast({ current: {} }, seattle, 'f', NOW)).toBeNull();
  });

  it('describes WMO codes in newspaper words', () => {
    expect(describeWeather(0, true)).toBe('Sunny');
    expect(describeWeather(0, false)).toBe('Clear');
    expect(describeWeather(3)).toBe('Cloudy');
    expect(describeWeather(63)).toBe('Rain');
    expect(describeWeather(95)).toBe('Thunderstorms');
  });
});

describe('market', () => {
  it('parses the S&P 500 chart, dropping null points', () => {
    expect(parseChart(chartJson, NOW)).toEqual({
      at: NOW,
      price: 7737.01,
      previousClose: 7722.6,
      marketTime: 1793204240_000,
      timezone: 'America/New_York',
      points: [7722.1, 7730.5, 7737.01],
    });
  });

  it('returns null when the endpoint changes shape', () => {
    expect(parseChart({ chart: { result: null, error: { code: 'Not Found' } } }, NOW)).toBeNull();
    expect(parseChart('<html>', NOW)).toBeNull();
  });
});

describe('refreshExtras', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, weatherPlace: seattle, showMarket: true };

  const run = async (over: Partial<Parameters<typeof refreshExtras>[0]> = {}) => {
    const calls: string[] = [];
    const written: Record<string, unknown> = {};
    await refreshExtras({
      settings,
      now: NOW,
      fetch: (async (url: RequestInfo | URL) => {
        calls.push(String(url));
        const body = String(url).includes('open-meteo') ? forecastJson : chartJson;
        return new Response(JSON.stringify(body));
      }) as typeof fetch,
      hasAccess: async () => true,
      read: async () => ({}),
      write: async (patch) => void Object.assign(written, patch),
      ...over,
    });
    return { calls, written };
  };

  it('fetches weather and the market and caches them', async () => {
    const { calls, written } = await run();
    expect(calls).toHaveLength(2);
    expect(written.weather).toMatchObject({ temp: 47.6, units: 'f' });
    expect(written.market).toMatchObject({ price: 7737.01 });
  });

  it('skips fresh caches unless forced', async () => {
    const cached = {
      weather: { ...parseForecast(forecastJson, seattle, 'f', NOW - 60_000)! },
      market: { ...parseChart(chartJson, NOW - 60_000)! },
    };
    expect((await run({ read: async () => cached })).calls).toHaveLength(0);
    expect((await run({ read: async () => cached, force: true })).calls).toHaveLength(2);
    // A cache for other units (or another place) is refetched.
    const otherUnits = { ...cached, weather: { ...cached.weather, units: 'c' as const } };
    expect((await run({ read: async () => otherUnits })).calls).toHaveLength(1);
  });

  it('does nothing without permission, and keeps going if a source fails', async () => {
    expect((await run({ hasAccess: async () => false })).calls).toHaveLength(0);
    const { written } = await run({
      fetch: (async (url: RequestInfo | URL) =>
        String(url).includes('yahoo')
          ? new Response('rate limited', { status: 429 })
          : new Response(JSON.stringify(forecastJson))) as typeof fetch,
    });
    expect(written.weather).toBeDefined();
    expect(written.market).toBeUndefined();
  });

  it('lists the host access each extra needs (kept by permission clean-up)', () => {
    expect(extrasOrigins(settings)).toEqual([...WEATHER_ORIGINS, ...MARKET_ORIGINS]);
    expect(extrasOrigins(DEFAULT_SETTINGS)).toEqual([]);
  });
});
