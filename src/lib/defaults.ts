import type { PinnedLink, Settings, Ticker, WeatherPlace } from './types';

export const DEFAULT_SPOT = '#A4161A';

export const DEFAULT_SETTINGS: Settings = {
  paperName: 'The Daily Tab',
  refreshMinutes: 15,
  theme: 'system',
  photos: 'ink',
  spotColor: DEFAULT_SPOT,
  pinnedLinks: [],
  installedAt: 0,
  sections: ['World', 'Tech', 'Science'],
  weatherPlace: null,
  units: 'f',
  tickers: [],
};

function asPlace(v: unknown): WeatherPlace | null {
  if (!v || typeof v !== 'object') return null;
  const p = v as Record<string, unknown>;
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (typeof p.name !== 'string' || !p.name.trim()) return null;
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lon) <= 180)) return null;
  return { name: p.name, region: typeof p.region === 'string' ? p.region : '', lat, lon };
}

/**
 * Arrays can come back from chrome.storage as {"0": …, "1": …}: Chrome's serializer does not
 * treat a Proxy (e.g. Svelte $state) as an array. Accept either shape.
 */
function asArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.every((k) => /^\d+$/.test(k))) {
      return keys.sort((a, b) => +a - +b).map((k) => (v as Record<string, unknown>)[k]);
    }
  }
  return null;
}

/** Settings as stored (possibly old, partial or malformed) → a complete, well-typed object. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const sections = asArray(r.sections)?.filter(
    (s, i, all): s is string => typeof s === 'string' && s.trim() !== '' && all.indexOf(s) === i,
  );
  const pinned = asArray(r.pinnedLinks)
    ?.filter(
      (p): p is PinnedLink =>
        !!p &&
        typeof (p as PinnedLink).title === 'string' &&
        typeof (p as PinnedLink).url === 'string',
    )
    .map((p) => ({ title: p.title, url: p.url }));
  const minutes = Number(r.refreshMinutes);
  return {
    paperName: str(r.paperName, d.paperName).trim() || d.paperName,
    refreshMinutes: Number.isFinite(minutes) && minutes >= 1 ? minutes : d.refreshMinutes,
    theme: r.theme === 'day' || r.theme === 'night' || r.theme === 'system' ? r.theme : d.theme,
    photos: r.photos === 'ink' || r.photos === 'color' ? r.photos : d.photos,
    spotColor: /^#[0-9a-f]{6}$/i.test(str(r.spotColor, '')) ? (r.spotColor as string) : d.spotColor,
    pinnedLinks: pinned ?? d.pinnedLinks,
    installedAt: typeof r.installedAt === 'number' ? r.installedAt : d.installedAt,
    sections: sections ?? d.sections,
    weatherPlace: asPlace(r.weatherPlace),
    units: r.units === 'c' ? 'c' : 'f',
    tickers: asTickers(r),
  };
}

/** Yahoo symbols: AAPL, ^GSPC, BRK-B, BTC-USD, EURUSD=X, 7203.T … */
export const TICKER_SYMBOL = /^[\^A-Z0-9][A-Z0-9.\-=^]{0,19}$/;
export const MAX_TICKERS = 8;
export const SP500: Ticker = { symbol: '^GSPC', name: 'S&P 500' };

function asTickers(r: Record<string, unknown>): Ticker[] {
  const list = asArray(r.tickers);
  if (!list) {
    // Before the list existed there was a single S&P 500 switch.
    return r.showMarket === true ? [SP500] : [];
  }
  const out: Ticker[] = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const symbol = String((t as Ticker).symbol ?? '')
      .trim()
      .toUpperCase();
    if (!TICKER_SYMBOL.test(symbol) || out.some((o) => o.symbol === symbol)) continue;
    const name = typeof (t as Ticker).name === 'string' ? (t as Ticker).name.trim() : '';
    out.push({ symbol, name: name.slice(0, 60) || symbol });
  }
  return out.slice(0, MAX_TICKERS);
}
