import { describeWeather, reportMatches } from '@/lib/extras/weather-words';
import type {
  Edition,
  Feed,
  FeedState,
  Item,
  MarketReport,
  PinnedLink,
  Settings,
  WeatherReport,
} from '@/lib/types';
import {
  anchorFor,
  ago,
  clock,
  clockParts,
  dateLine,
  editionName,
  issueNumber,
  shorten,
  splitDeck,
} from './format';

export interface StoryView {
  id: string;
  title: string;
  link: string;
  source: string;
  kicker: string;
  ago: string;
  datetime: string;
  deck: string;
  body: string;
  imageUrl?: string;
  read: boolean;
  isNew: boolean;
}

export interface WeatherView {
  /** "48°" */
  temp: string;
  /** "Cloudy" */
  condition: string;
  /** "H 52 · L 41" */
  range: string;
  place: string;
  /** Plain sentence for assistive tech. */
  label: string;
}

export interface MarketView {
  symbol: string;
  name: string;
  /** Show the symbol beside the name (stocks, ETFs; not indexes). */
  showSymbol: boolean;
  /** "7,737.01" */
  price: string;
  /** "+14.41" */
  change: string;
  /** "0.19%" */
  percent: string;
  direction: 'up' | 'down' | 'flat';
  /** "As of 4:00 p.m. ET" or "Close, Mon Oct 26" */
  asOf: string;
  points: number[];
  previousClose: number;
  label: string;
}

/** First-run chooser: a section and the feeds that fill it. */
export interface SectionChoice {
  name: string;
  feeds: string[];
}

export interface BandView {
  category: string;
  anchor: string;
  stories: StoryView[];
  /** Expanded "More in …" list, or null while collapsed. */
  more: StoryView[] | null;
}

export interface FrontPageView {
  paperName: string;
  clock: { time: string; meridiem: string };
  dateLine: string;
  editionName: string;
  issue: number;
  /** "Updated 9:42", or "Edition of 9:42 · offline". */
  updatedLabel: string;
  offline: boolean;
  newCount: number;
  /** Clock time of the last visit, or null on the first visit. */
  newSince: string | null;
  /** Right ear when a location is set; the "new since" count then moves to the folio. */
  weather: WeatherView | null;
  sections: { name: string; anchor: string }[];
  pinned: PinnedLink[];
  lead: StoryView | null;
  /** Headlines under the lead's text. */
  leadColumn: StoryView[];
  /** Markets box at the foot of the lead's text column (cycled with arrows). */
  markets: MarketView[];
  secondary: StoryView[];
  bands: BandView[];
  brief: StoryView[];
  corrections: string[];
}

export interface FrontPageInput {
  edition: Edition | null;
  items: Map<string, Item>;
  feeds: Feed[];
  states: FeedState[];
  settings: Settings;
  lastVisitAt: number | undefined;
  now: number;
  online: boolean;
  /** Extra items per section, shown when the reader follows "More in …". */
  more?: Map<string, string[]>;
  weather?: WeatherReport | null;
  markets?: Record<string, MarketReport>;
}

const WEATHER_MAX_AGE_MS = 6 * 60 * 60_000;
const MARKET_MAX_AGE_MS = 4 * 24 * 60 * 60_000;

export function weatherView(
  report: WeatherReport | null | undefined,
  settings: Settings,
  now: number,
): WeatherView | null {
  const place = settings.weatherPlace;
  if (!reportMatches(report, place, settings.units) || now - report.at > WEATHER_MAX_AGE_MS) {
    return null;
  }
  const deg = (t: number) => `${Math.round(t)}°`;
  const condition = describeWeather(report.code, report.isDay);
  const unit = settings.units === 'c' ? 'Celsius' : 'Fahrenheit';
  return {
    temp: deg(report.temp),
    condition,
    range: `H ${deg(report.high)} · L ${deg(report.low)}`,
    place: place!.name,
    label: `Weather in ${place!.name}: ${Math.round(report.temp)} degrees ${unit}, ${condition.toLowerCase()}; high ${Math.round(report.high)}, low ${Math.round(report.low)}.`,
  };
}

/** Quotes in the reader's order; tickers with no recent quote are left out. */
export function marketViews(
  markets: Record<string, MarketReport> | undefined,
  settings: Settings,
  now: number,
): MarketView[] {
  return settings.tickers.flatMap((t) => {
    const report = markets?.[t.symbol];
    const view = report ? marketView({ ...report, name: t.name || report.name }, now) : null;
    return view ? [view] : [];
  });
}

const zoneLabel = (tz: string, t: number) => {
  if (tz === 'America/New_York') return 'ET';
  if (tz === 'UTC' || tz === 'Etc/UTC') return 'UTC';
  try {
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' })
        .formatToParts(t)
        .find((p) => p.type === 'timeZoneName')?.value ?? ''
    );
  } catch {
    return '';
  }
};

export function marketView(
  report: MarketReport | null | undefined,
  now: number,
): MarketView | null {
  if (!report || now - report.at > MARKET_MAX_AGE_MS) return null;
  const diff = report.price - report.previousClose;
  const pct = report.previousClose ? (diff / report.previousClose) * 100 : 0;
  // Currencies trade in small units: 1.1152, not 1.12.
  const digits = Math.abs(report.price) < 10 ? 4 : 2;
  const direction = Math.abs(diff) < 0.5 * 10 ** -digits ? 'flat' : diff > 0 ? 'up' : 'down';
  const fmt = (n: number) =>
    n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });

  const tz = report.timezone;
  const day = (t: number, zone?: string) =>
    new Date(t).toLocaleDateString('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
  let asOf: string;
  try {
    if (day(report.marketTime, tz) === day(now, tz)) {
      const time = new Date(report.marketTime)
        .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz })
        .replace(' AM', ' a.m.')
        .replace(' PM', ' p.m.');
      const zone = zoneLabel(tz, report.marketTime);
      asOf = `As of ${time}${zone ? ` ${zone}` : ''}`;
    } else {
      const date = new Date(report.marketTime).toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        timeZone: tz,
      });
      asOf = `Close, ${date}`;
    }
  } catch {
    asOf = '';
  }

  const word = direction === 'up' ? 'up' : direction === 'down' ? 'down' : 'unchanged';
  const name = report.name || report.symbol;
  // Indexes have newspaper names; for stocks, ETFs and the like the symbol helps.
  const showSymbol = !report.symbol.startsWith('^') && name.toUpperCase() !== report.symbol;
  const units = report.symbol.startsWith('^') ? ' points' : '';
  return {
    symbol: report.symbol,
    name,
    showSymbol,
    price: fmt(report.price),
    change: `${diff >= 0 ? '+' : '−'}${fmt(Math.abs(diff))}`,
    percent: `${Math.abs(pct).toFixed(2)}%`,
    direction,
    asOf,
    points: report.points,
    previousClose: report.previousClose,
    label: `${name} ${fmt(report.price)}${report.currency && !units ? ` ${report.currency}` : ''}, ${word} ${fmt(Math.abs(diff))}${units} or ${Math.abs(pct).toFixed(2)} percent. ${asOf}.`,
  };
}

export function buildFrontPage(input: FrontPageInput): FrontPageView {
  const { edition, items, feeds, settings, now } = input;
  const feedById = new Map(feeds.map((f) => [f.id, f]));

  const story = (id: string, deckMax: number): StoryView | null => {
    const item = items.get(id);
    if (!item) return null;
    const feed = feedById.get(item.feedId);
    const { deck, body } = splitDeck(item.summary);
    const view: StoryView = {
      id: item.id,
      title: item.title,
      link: item.link,
      source: feed?.title ?? '',
      kicker: feed?.category ?? '',
      ago: ago(item.publishedAt, now),
      datetime: new Date(item.publishedAt).toISOString(),
      deck: deckMax ? shorten(deck, deckMax) : '',
      body,
      read: !!item.readAt,
      isNew: input.lastVisitAt !== undefined && item.fetchedAt > input.lastVisitAt,
    };
    if (item.imageUrl) view.imageUrl = item.imageUrl;
    return view;
  };
  const stories = (ids: string[], deckMax: number) =>
    ids.map((id) => story(id, deckMax)).filter((s): s is StoryView => s !== null);

  let lead: StoryView | null = null;
  if (edition) {
    lead = story(edition.leadItemId, 260);
    if (lead) {
      // A one-sentence summary leaves the lead's text empty; borrow the fullest summary
      // of the same story from another feed.
      if (!lead.body) {
        const fuller = edition.leadRelatedItemIds
          .map((id) => (items.get(id)?.summary ?? '').replace(/\s*\n\s*/g, ' '))
          .sort((a, b) => b.length - a.length)[0];
        if (fuller && fuller !== lead.deck) lead.body = fuller;
      }
    }
  }

  const secondary = edition ? stories(edition.secondaryItemIds, 170) : [];
  const leadColumn = edition ? stories(edition.leadColumnItemIds ?? [], 0) : [];
  const bands: BandView[] = (edition?.sections ?? []).map((s) => ({
    category: s.category,
    anchor: anchorFor(s.category),
    stories: stories(s.itemIds, 150),
    more: input.more?.has(s.category) ? stories(input.more.get(s.category)!, 0) : null,
  }));
  const brief = edition ? stories(edition.briefItemIds, 0) : [];

  const all = [
    lead,
    ...secondary,
    ...leadColumn,
    ...bands.flatMap((b) => b.stories),
    ...brief,
  ].filter((s): s is StoryView => s !== null);

  let updatedLabel: string;
  if (!edition) updatedLabel = input.online ? 'First edition to follow' : 'Offline';
  else if (input.online) updatedLabel = `Updated ${clock(edition.composedAt)}`;
  else updatedLabel = `Edition of ${clock(edition.composedAt)} · offline`;

  return {
    paperName: settings.paperName || 'The Daily Tab',
    clock: clockParts(now),
    dateLine: dateLine(now),
    editionName: editionName(now),
    issue: issueNumber(settings.installedAt, now),
    updatedLabel,
    offline: !input.online,
    newCount: all.filter((s) => s.isNew).length,
    newSince: input.lastVisitAt ? clock(input.lastVisitAt) : null,
    weather: weatherView(input.weather, settings, now),
    sections: bands.map((b) => ({ name: b.category, anchor: b.anchor })),
    pinned: settings.pinnedLinks,
    lead,
    leadColumn,
    markets: edition ? marketViews(input.markets, settings, now) : [],
    secondary,
    bands,
    brief,
    corrections: edition ? corrections(input.states, feedById) : [],
  };
}

function corrections(states: FeedState[], feedById: Map<string, Feed>): string[] {
  const out: string[] = [];
  for (const s of states) {
    const feed = feedById.get(s.feedId);
    if (!feed) continue;
    if (s.status === 'no-permission') {
      out.push(`${feed.title} is waiting for permission to be read; allow it in Settings.`);
      continue;
    }
    if (s.status !== 'error') continue;
    const at = s.lastErrorAt ? ` at ${clock(s.lastErrorAt)}` : '';
    const err = s.lastError ?? '';
    if (/^HTTP \d/.test(err)) out.push(`${feed.title} answered with an error (${err})${at}.`);
    else if (/feed|xml/i.test(err)) out.push(`${feed.title} sent a feed we could not read${at}.`);
    else out.push(`${feed.title} could not be reached${at}.`);
  }
  // Two feeds from one outlet (same title) failing together read as one note, once.
  return [...new Set(out)];
}
