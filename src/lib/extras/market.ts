// Market quotes from Yahoo Finance's chart endpoint (no key, unofficial, delayed). Any Yahoo
// symbol works: indexes (^GSPC), stocks (AAPL), ETFs, crypto (BTC-USD), currencies (EURUSD=X).
// If the endpoint stops answering in this shape, parseChart returns null and the ticker is
// simply left out of the box.
import type { MarketReport, Ticker } from '../types';
import { getJson } from './weather';

export const MARKET_ORIGINS = ['https://query1.finance.yahoo.com/*'];
const MAX_POINTS = 80;

/** Short newspaper names for well-known indexes (Yahoo's own are long). */
const INDEX_NAMES: Record<string, string> = {
  '^GSPC': 'S&P 500',
  '^DJI': 'Dow',
  '^IXIC': 'Nasdaq',
  '^RUT': 'Russell 2000',
  '^VIX': 'VIX',
  '^FTSE': 'FTSE 100',
  '^GDAXI': 'DAX',
  '^N225': 'Nikkei 225',
  '^HSI': 'Hang Seng',
  '^STOXX50E': 'Euro Stoxx 50',
};

/** One-click additions in Settings. */
export const TICKER_PRESETS: Ticker[] = [
  { symbol: '^GSPC', name: 'S&P 500' },
  { symbol: '^DJI', name: 'Dow' },
  { symbol: '^IXIC', name: 'Nasdaq' },
  { symbol: '^RUT', name: 'Russell 2000' },
  { symbol: 'BTC-USD', name: 'Bitcoin' },
];

export function chartUrl(symbol: string): string {
  return `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m`;
}

type Json = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

function result(json: unknown): Json | undefined {
  const r = ((json as Json | null)?.chart as Json | undefined)?.result;
  return Array.isArray(r) ? (r[0] as Json | undefined) : undefined;
}

export function displayName(symbol: string, meta: Json | undefined): string {
  return INDEX_NAMES[symbol] ?? (str(meta?.shortName) || str(meta?.longName) || symbol);
}

export function parseChart(json: unknown, now: number, fallback?: Ticker): MarketReport | null {
  const r = result(json);
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

  const symbol = str(meta?.symbol) || fallback?.symbol || '';
  return {
    at: now,
    symbol,
    // The reader's chosen name wins; otherwise Yahoo's.
    name: fallback?.name || displayName(symbol, meta),
    currency: str(meta?.currency),
    price,
    previousClose,
    marketTime: marketTime * 1000,
    timezone: str(meta?.exchangeTimezoneName) || 'America/New_York',
    points,
  };
}

/** Check a symbol exists and get its display name; null if Yahoo doesn't know it. */
export async function lookupTicker(
  fetchImpl: typeof fetch,
  symbol: string,
): Promise<Ticker | null> {
  try {
    const json = await getJson(fetchImpl, chartUrl(symbol));
    const r = result(json);
    const meta = r?.meta as Json | undefined;
    if (num(meta?.regularMarketPrice) === null) return null;
    const canonical = str(meta?.symbol) || symbol;
    return { symbol: canonical, name: displayName(canonical, meta) };
  } catch (e) {
    if (e instanceof Error && /^HTTP 404/.test(e.message)) return null;
    throw e;
  }
}

export async function fetchQuote(
  fetchImpl: typeof fetch,
  ticker: Ticker,
  now: number,
): Promise<MarketReport | null> {
  return parseChart(await getJson(fetchImpl, chartUrl(ticker.symbol)), now, ticker);
}
