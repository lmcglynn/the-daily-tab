import { extrasOrigins, refreshExtras } from '@/lib/extras/refresh';
import { MARKET_ORIGINS, chartUrl, lookupTicker, parseChart } from '@/lib/extras/market';
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
          symbol: '^GSPC',
          currency: 'USD',
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

const chart = (symbol: string, price: number, previousClose: number, shortName = symbol) => ({
  chart: {
    result: [
      {
        meta: {
          symbol,
          shortName,
          currency: 'USD',
          regularMarketPrice: price,
          chartPreviousClose: previousClose,
          regularMarketTime: 1793204240,
          exchangeTimezoneName: 'America/New_York',
        },
        indicators: { quote: [{ close: [previousClose, null, price] }] },
      },
    ],
  },
});
const notFound = { chart: { result: null, error: { code: 'Not Found' } } };

describe('market', () => {
  it('parses a chart, dropping null points; the reader’s name wins', () => {
    expect(parseChart(chartJson, NOW)).toEqual({
      at: NOW,
      symbol: '^GSPC',
      name: 'S&P 500',
      currency: 'USD',
      price: 7737.01,
      previousClose: 7722.6,
      marketTime: 1793204240_000,
      timezone: 'America/New_York',
      points: [7722.1, 7730.5, 7737.01],
    });
    const named = parseChart(chart('AAPL', 340, 343.1, 'Apple Inc.'), NOW, {
      symbol: 'AAPL',
      name: 'Apple',
    });
    expect(named!.name).toBe('Apple');
  });

  it('returns null when the endpoint changes shape', () => {
    expect(parseChart(notFound, NOW)).toBeNull();
    expect(parseChart('<html>', NOW)).toBeNull();
  });

  it('builds per-symbol URLs, escaping ^ and =', () => {
    expect(chartUrl('^GSPC')).toContain('/chart/%5EGSPC?');
    expect(chartUrl('EURUSD=X')).toContain('/chart/EURUSD%3DX?');
  });

  it('looks up a ticker: canonical symbol and a newspaper name for indexes', async () => {
    const respond = (body: unknown, status = 200) =>
      (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(
      await lookupTicker(respond(chart('^DJI', 1, 1, 'Dow Jones Industrial Average')), '^dji'),
    ).toEqual({
      symbol: '^DJI',
      name: 'Dow',
    });
    expect(await lookupTicker(respond(chart('AAPL', 1, 1, 'Apple Inc.')), 'AAPL')).toEqual({
      symbol: 'AAPL',
      name: 'Apple Inc.',
    });
    expect(await lookupTicker(respond(notFound, 404), 'NOPE')).toBeNull();
  });
});

describe('refreshExtras', () => {
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    weatherPlace: seattle,
    tickers: [
      { symbol: '^GSPC', name: 'S&P 500' },
      { symbol: 'AAPL', name: 'Apple' },
    ],
  };
  const quotes: Record<string, unknown> = {
    '%5EGSPC': chart('^GSPC', 7737.01, 7722.6),
    AAPL: chart('AAPL', 340, 343.1),
  };

  const run = async (over: Partial<Parameters<typeof refreshExtras>[0]> = {}) => {
    const calls: string[] = [];
    const written: Record<string, unknown> = {};
    await refreshExtras({
      settings,
      now: NOW,
      fetch: (async (url: RequestInfo | URL) => {
        const u = String(url);
        calls.push(u);
        if (u.includes('open-meteo')) return new Response(JSON.stringify(forecastJson));
        const symbol = /\/chart\/([^?]+)/.exec(u)![1]!;
        return quotes[symbol]
          ? new Response(JSON.stringify(quotes[symbol]))
          : new Response(JSON.stringify(notFound), { status: 404 });
      }) as typeof fetch,
      hasAccess: async () => true,
      read: async () => ({}),
      write: async (patch) => void Object.assign(written, patch),
      ...over,
    });
    return { calls, written };
  };

  it('fetches weather and every ticker, caching quotes by symbol', async () => {
    const { calls, written } = await run();
    expect(calls).toHaveLength(3);
    expect(written.weather).toMatchObject({ temp: 47.6, units: 'f' });
    const markets = written.markets as Record<string, { price: number; name: string }>;
    expect(Object.keys(markets).sort()).toEqual(['AAPL', '^GSPC']);
    expect(markets.AAPL).toMatchObject({ price: 340, name: 'Apple' });
  });

  it('skips fresh caches unless forced, and drops unfollowed tickers', async () => {
    const fresh = {
      weather: { ...parseForecast(forecastJson, seattle, 'f', NOW - 60_000)! },
      markets: {
        '^GSPC': parseChart(quotes['%5EGSPC'], NOW - 60_000)!,
        AAPL: parseChart(quotes.AAPL, NOW - 60_000)!,
      },
    };
    expect((await run({ read: async () => fresh })).calls).toHaveLength(0);
    expect((await run({ read: async () => fresh, force: true })).calls).toHaveLength(3);
    // A cache for other units is refetched; a quote for a removed ticker is dropped.
    const withOld = {
      ...fresh,
      weather: { ...fresh.weather, units: 'c' as const },
      markets: { ...fresh.markets, TSLA: parseChart(chart('TSLA', 1, 1), NOW - 60_000)! },
    };
    const { calls, written } = await run({ read: async () => withOld });
    expect(calls).toHaveLength(1);
    expect(Object.keys(written.markets as object).sort()).toEqual(['AAPL', '^GSPC']);
  });

  it('keeps a ticker’s last good quote when its fetch fails', async () => {
    const old = { '^GSPC': parseChart(quotes['%5EGSPC'], NOW - 3600_000)! };
    const { written } = await run({
      read: async () => ({ markets: old }),
      fetch: (async (url: RequestInfo | URL) =>
        String(url).includes('AAPL')
          ? new Response(JSON.stringify(quotes.AAPL))
          : String(url).includes('yahoo')
            ? new Response('rate limited', { status: 429 })
            : new Response(JSON.stringify(forecastJson))) as typeof fetch,
    });
    const markets = written.markets as Record<string, { at: number }>;
    expect(markets['^GSPC']!.at).toBe(NOW - 3600_000);
    expect(markets.AAPL!.at).toBe(NOW);
  });

  it('does nothing without permission', async () => {
    expect((await run({ hasAccess: async () => false })).calls).toHaveLength(0);
  });

  it('lists the host access each extra needs (kept by permission clean-up)', () => {
    expect(extrasOrigins(settings)).toEqual([...WEATHER_ORIGINS, ...MARKET_ORIGINS]);
    expect(extrasOrigins(DEFAULT_SETTINGS)).toEqual([]);
  });
});
