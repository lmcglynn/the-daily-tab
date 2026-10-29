/** A subscribed feed. Stored in chrome.storage.sync, one key per feed (`feed:<id>`). */
export interface Feed {
  id: string;
  url: string;
  siteUrl: string;
  title: string;
  category: string;
  order: number;
}

export type FeedStatus = 'pending' | 'ok' | 'error' | 'no-permission';

/** Per-feed fetch bookkeeping. Changes on every refresh, so it lives in IndexedDB, not sync. */
export interface FeedState {
  feedId: string;
  status: FeedStatus;
  etag?: string;
  lastModified?: string;
  lastFetchedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastErrorAt?: number;
  failCount: number;
  /** Backoff: don't fetch again before this time. */
  nextFetchAt?: number;
  /** Date of the feed's newest entry when last fetched, even one too old to keep. */
  latestItemAt?: number;
}

export interface Item {
  /** hash(feedId + guid|link) */
  id: string;
  feedId: string;
  title: string;
  link: string;
  /** Plain text, ≤ ~300 chars. Never HTML. */
  summary: string;
  imageUrl?: string;
  author?: string;
  publishedAt: number;
  /** First time this item was seen. */
  fetchedAt: number;
  readAt?: number;
  /** Shared by items that are the same story across feeds. */
  storyId?: string;
}

/** A story the reader saved (lib/clippings.ts): a copy that outlives the item. */
export interface Clipping {
  /** The item's id. */
  id: string;
  title: string;
  link: string;
  /** Feed title when saved. */
  source: string;
  summary: string;
  imageUrl?: string;
  publishedAt: number;
  savedAt: number;
}

/** A story the reader hid from the page (lib/hidden.ts). */
export interface HiddenStory {
  id: string;
  storyId?: string;
  at: number;
}

export interface EditionSection {
  category: string;
  itemIds: string[];
}

export interface Edition {
  id: string;
  number: number;
  composedAt: number;
  leadItemId: string;
  /** Same-story items from other feeds (not shown; they lend the lead a fuller body). */
  leadRelatedItemIds: string[];
  secondaryItemIds: string[];
  /** Headlines under the lead's text. Absent in editions composed before it existed. */
  leadColumnItemIds?: string[];
  sections: EditionSection[];
  briefItemIds: string[];
}

export type Units = 'f' | 'c';

/** A place picked in Settings (Open-Meteo geocoding). */
export interface WeatherPlace {
  name: string;
  /** "Washington, United States" */
  region: string;
  lat: number;
  lon: number;
}

/** Latest weather, cached by the background in chrome.storage.local. */
export interface WeatherReport {
  at: number;
  lat: number;
  lon: number;
  units: Units;
  temp: number;
  code: number;
  isDay: boolean;
  high: number;
  low: number;
}

/** A ticker the reader follows (Yahoo symbol, e.g. ^GSPC, AAPL, BTC-USD). */
export interface Ticker {
  symbol: string;
  /** Display name, e.g. "S&P 500" or "Apple Inc." */
  name: string;
}

/** Latest quote for one ticker, cached by the background in chrome.storage.local. */
export interface MarketReport {
  at: number;
  symbol: string;
  name: string;
  /** "USD", "EUR"… (shown only in the spoken label). */
  currency: string;
  price: number;
  previousClose: number;
  /** Exchange time of `price`. */
  marketTime: number;
  /** IANA zone of the exchange, for "As of 4:00 p.m. ET". */
  timezone: string;
  /** Intraday prices, oldest first, for the sparkline. */
  points: number[];
}

/** A team the reader follows in the scores box (ESPN ids). */
export interface SportsTeam {
  /** ESPN sport/league path, e.g. "basketball/nba" (see lib/extras/scores.ts LEAGUES). */
  league: string;
  id: string;
  /** "Los Angeles Lakers" */
  name: string;
  abbr: string;
}

export interface GameSide {
  id: string;
  /** Short name, e.g. "Lakers". */
  name: string;
  abbr: string;
  score?: number;
  winner?: boolean;
}

export interface Game {
  id: string;
  date: number;
  state: 'pre' | 'in' | 'post';
  /** ESPN's short status: "Final", "Final/OT", "FT", "Q3 4:12", "Top 5th"… */
  detail: string;
  home: GameSide;
  away: GameSide;
}

/** Latest scores for one followed team, cached by the background in chrome.storage.local. */
export interface ScoreReport {
  at: number;
  /** league:id */
  key: string;
  last: Game | null;
  /** The next game, or the one in progress. */
  current: Game | null;
  /** While a game is in progress, the one after it. */
  next?: Game | null;
}

export type Theme = 'system' | 'day' | 'night';
export type PhotoStyle = 'ink' | 'color';

export interface PinnedLink {
  title: string;
  url: string;
}

export interface Settings {
  paperName: string;
  refreshMinutes: number;
  theme: Theme;
  photos: PhotoStyle;
  /** Day spot color; the night tint is derived unless this is the default. */
  spotColor: string;
  pinnedLinks: PinnedLink[];
  installedAt: number;
  /** Section (category) order, used for the index, bands and "top section". */
  sections: string[];
  /** Weather location for the right ear; null hides the weather. */
  weatherPlace: WeatherPlace | null;
  units: Units;
  /** Markets box under the lead story, in display order; empty hides it. */
  tickers: Ticker[];
  /** Words and phrases whose stories are left off the front page (see lib/mute.ts). */
  mutedWords: string[];
  /** Scores box under the markets, in display order; empty hides it. */
  teams: SportsTeam[];
}
