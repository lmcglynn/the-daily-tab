// S&P 500 from Yahoo Finance's chart endpoint (no key, unofficial, delayed). If it ever stops
// answering in this shape, parseChart returns null and the box simply isn't shown.
import type { MarketReport } from '../types';
import { getJson } from './weather';

export const MARKET_ORIGINS = ['https://query1.finance.yahoo.com/*'];
export const MARKET_URL =
  'https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=5m';
const MAX_POINTS = 80;

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseChart(json: unknown, now: number): MarketReport | null {
  const result = ((json as Json | null)?.chart as Json | undefined)?.result;
  const r = Array.isArray(result) ? (result[0] as Json | undefined) : undefined;
  const meta = r?.meta as Json | undefined;
  const price = num(meta?.regularMarketPrice);
  const previousClose = num(meta?.chartPreviousClose) ?? num(meta?.previousClose);
  const marketTime = num(meta?.regularMarketTime);
  if (price === null || previousClose === null || marketTime === null) return null;

  const quote = ((r?.indicators as Json | undefined)?.quote as Json[] | undefined)?.[0];
  const closes = Array.isArray(quote?.close)
    ? (quote.close as unknown[]).map(num).filter((v): v is number => v !== null)
    : [];
  // Evenly thin long series; the sparkline is ~120 px wide.
  const step = Math.max(1, Math.ceil(closes.length / MAX_POINTS));
  const points = closes.filter((_, i) => i % step === 0 || i === closes.length - 1);

  return {
    at: now,
    price,
    previousClose,
    marketTime: marketTime * 1000,
    timezone:
      typeof meta?.exchangeTimezoneName === 'string'
        ? meta.exchangeTimezoneName
        : 'America/New_York',
    points,
  };
}

export async function fetchMarket(
  fetchImpl: typeof fetch,
  now: number,
): Promise<MarketReport | null> {
  return parseChart(await getJson(fetchImpl, MARKET_URL), now);
}
