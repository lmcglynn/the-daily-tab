import { describeWeather, reportMatches } from '@/lib/extras/weather-words';
import { isRaceReport } from '@/lib/types';
import type {
  Clipping,
  Edition,
  Feed,
  FeedState,
  Item,
  Game,
  MarketReport,
  PinnedLink,
  Race,
  RaceReport,
  ScoreReport,
  Settings,
  SportsReport,
  SportsTeam,
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
  /** In the reader's clippings. */
  saved: boolean;
  /** Lead only: the same story from other outlets ("Also covered by"). */
  coverage?: { id: string; source: string; link: string }[];
  /** Lead only: another outlet has joined the story in the last hour. */
  developing?: boolean;
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

export interface ScoreView {
  kind: 'game';
  key: string;
  /** "Los Angeles Lakers" */
  team: string;
  /** "129–136", the team's score first; empty before a first result. */
  score: string;
  /** "W", "L", "T"/"D" (soccer), "Live", or empty. */
  result: string;
  /** "vs. Trail Blazers" / "at Clippers" */
  opponent: string;
  /** "Final", "Final · Tue", "Q3 4:12", or "No recent games". */
  status: string;
  /** "Next: Tonight at Clippers, 7:30 p.m." */
  next: string;
  live: boolean;
  /** No next game, or none for two weeks: shown after the teams in season. */
  offseason: boolean;
  label: string;
}

/** Formula 1 in the scores box: the last race's podium and the next race. */
export interface RaceView {
  kind: 'race';
  key: string;
  /** "Formula 1" (what the carousel's arrows name). */
  team: string;
  /** "F1 · United States GP", or "F1 · No races yet". */
  race: string;
  /** "Final · Sun", "Final · Oct 25". */
  status: string;
  /** Family names: "Antonelli", with "Mercedes". */
  podium: { position: number; driver: string; constructor: string }[];
  /** Beside the podium under a "Next:" label, a line each: "Sun, Nov 1", "1:00 p.m.", "Mexico City". */
  next: string[];
  live: false;
  offseason: boolean;
  label: string;
}

export type SportsView = ScoreView | RaceView;

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
  /** Scores box under it, one followed team at a time (none in spoiler mode). */
  scores: SportsView[];
  /** The spoiler-mode switch: shown when the reader follows teams. */
  spoilers: { available: boolean; on: boolean };
  secondary: StoryView[];
  bands: BandView[];
  brief: StoryView[];
  /** Saved stories, newest first. */
  clippings: StoryView[];
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
  /** How many In Brief stories the page has room for; the rest aren't counted as shown. */
  briefShown?: number;
  weather?: WeatherReport | null;
  markets?: Record<string, MarketReport>;
  clippings?: Clipping[];
  scores?: Record<string, SportsReport>;
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

const SCORES_MAX_AGE_MS = 4 * 24 * 60 * 60_000;

/**
 * Live games first, then teams in season, then teams in their offseason; each group in the
 * reader's order. A team with no recent report is left out.
 */
export function scoreViews(
  scores: Record<string, SportsReport> | undefined,
  settings: Settings,
  now: number,
): SportsView[] {
  const views = settings.teams.flatMap((t): SportsView[] => {
    const report = scores?.[`${t.league}:${t.id}`];
    if (!report || now - report.at > SCORES_MAX_AGE_MS) return [];
    if (isRaceReport(report)) {
      return report.lastRace || report.nextRace ? [raceView(report, now)] : [];
    }
    if (!report.last && !report.current) return [];
    return [scoreView(t, report, now)];
  });
  const rank = (v: SportsView) => (v.live ? 0 : v.offseason ? 2 : 1);
  // Array sort is stable: within a rank, the reader's order stands.
  return views.sort((a, b) => rank(a) - rank(b));
}

/** A team whose next game is further off than this is treated as out of season. */
export const OFFSEASON_AFTER_MS = 14 * 86_400_000;

const dayStart = (t: number) => new Date(t).setHours(0, 0, 0, 0);
const time12 = (t: number) => `${clock(t)} ${clockParts(t).meridiem}`;

/** "Tonight, 7:30 p.m.", "Tomorrow, 4:05 p.m.", "Sun, 1:00 p.m.", "Nov 8, 4:05 p.m." */
export function gameWhen(t: number, now: number): string {
  const days = Math.round((dayStart(t) - dayStart(now)) / 86_400_000);
  let day: string;
  if (days === 0) day = new Date(t).getHours() >= 17 ? 'Tonight' : 'Today';
  else if (days === 1) day = 'Tomorrow';
  else if (days > 1 && days < 7)
    day = new Date(t).toLocaleDateString('en-US', { weekday: 'short' });
  else day = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${day}, ${time12(t)}`;
}

/** "" for today, "Tue" this past week, "Oct 16" before that. */
function playedOn(t: number, now: number): string {
  const days = Math.round((dayStart(now) - dayStart(t)) / 86_400_000);
  if (days <= 0) return '';
  if (days === 1) return 'Yesterday';
  if (days < 7) return new Date(t).toLocaleDateString('en-US', { weekday: 'short' });
  return new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function sides(g: Game, teamId: string) {
  const mine = g.home.id === teamId ? g.home : g.away;
  const other = mine === g.home ? g.away : g.home;
  const where = mine === g.home ? 'vs.' : 'at';
  return { mine, other, opponent: `${where} ${other.name}` };
}

/** "Mexico City": the city names the Grand Prix; the country is said aloud only. */
const racePlace = (r: Race) => r.city || r.country || r.circuit;

/** "Sun, Nov 1" this week, "Tomorrow", "Today"; further off, "Nov 8". */
function raceDay(t: number, now: number): string {
  const days = Math.round((dayStart(t) - dayStart(now)) / 86_400_000);
  const date = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) {
    return `${new Date(t).toLocaleDateString('en-US', { weekday: 'short' })}, ${date}`;
  }
  return date;
}

export function raceView(report: RaceReport, now: number): RaceView {
  const last = report.lastRace;
  const next =
    report.nextRace && report.nextRace.date > now - 3 * 3600_000 ? report.nextRace : null;
  const on = last ? playedOn(last.date, now) : '';
  const status = last ? (on ? `Final · ${on}` : 'Final') : '';
  const podium = (last?.podium ?? []).map((p) => ({
    position: p.position,
    driver: p.family || p.driver,
    constructor: p.constructor,
  }));
  const nextLines = next ? [raceDay(next.date, now), time12(next.date), racePlace(next)] : [];
  const nextText = next
    ? `Next: ${next.name}, ${raceDay(next.date, now)} at ${time12(next.date)}, ${[next.city, next.country].filter(Boolean).join(', ')}`
    : '';
  const spoken = last
    ? `Formula 1, ${last.name}: ${last.podium.map((p) => `${p.position}, ${p.driver}, ${p.constructor}`).join('; ')}.`
    : 'Formula 1: no races yet this season.';
  return {
    kind: 'race',
    key: report.key,
    team: 'Formula 1',
    // "F1 · United States GP": the box is narrow.
    race: `F1 · ${last ? last.name.replace(/\s*Grand Prix$/, ' GP') : 'No races yet'}`,
    status,
    podium,
    next: nextLines,
    live: false,
    offseason: !next || next.date - now > OFFSEASON_AFTER_MS,
    label: nextText ? `${spoken} ${nextText}.` : spoken,
  };
}

export function scoreView(team: SportsTeam, report: ScoreReport, now: number): ScoreView {
  const live = report.current?.state === 'in' ? report.current : null;
  const shown = live ?? report.last;
  const upcoming =
    report.current?.state === 'pre'
      ? report.current
      : report.next?.state === 'pre'
        ? report.next
        : null;
  const soccer = team.league.startsWith('soccer/');

  let score = '';
  let result = '';
  let opponent = '';
  let status = 'No recent games';
  let spoken = `${team.name}: no recent games.`;
  if (shown) {
    const { mine, other, opponent: opp } = sides(shown, team.id);
    opponent = opp;
    const a = mine.score ?? 0;
    const b = other.score ?? 0;
    score = `${a}–${b}`;
    if (live) {
      result = 'Live';
      status = `${shown.detail} · as of ${clock(report.at)}`;
      spoken = `${team.name}, live: ${a} to ${b} ${opp}, ${shown.detail}.`;
    } else {
      result = mine.winner
        ? 'W'
        : other.winner
          ? 'L'
          : a === b
            ? soccer
              ? 'D'
              : 'T'
            : a > b
              ? 'W'
              : 'L';
      const on = playedOn(shown.date, now);
      status = on ? `${shown.detail} · ${on}` : shown.detail;
      const verb = result === 'W' ? 'won' : result === 'L' ? 'lost' : 'drew';
      spoken = `${team.name} ${verb} ${a} to ${b} ${opp}, ${status.replace(' · ', ', ')}.`;
    }
  }
  const next = upcoming
    ? `Next: ${gameWhen(upcoming.date, now).replace(', ', ` ${sides(upcoming, team.id).opponent}, `)}`
    : '';
  return {
    kind: 'game',
    key: `${team.league}:${team.id}`,
    team: team.name,
    score,
    result,
    opponent,
    status,
    next,
    live: !!live,
    offseason: !live && (!upcoming || upcoming.date - now > OFFSEASON_AFTER_MS),
    label: next ? `${spoken} ${next.replace(/\.$/, '')}.` : spoken,
  };
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
  const clippings = input.clippings ?? [];
  const savedIds = new Set(clippings.map((c) => c.id));

  const story = (id: string, deckMax: number): StoryView | null => {
    const item = items.get(id);
    if (!item) return null;
    return itemView(item, feedById.get(item.feedId), now, {
      deckMax,
      lastVisitAt: input.lastVisitAt,
      saved: savedIds,
    });
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
      const related = edition.leadRelatedItemIds
        .map((id) => items.get(id))
        .filter((i): i is Item => !!i);
      lead.coverage = related
        .map((i) => ({ id: i.id, source: feedById.get(i.feedId)?.title ?? '', link: i.link }))
        .filter((c) => c.source);
      lead.developing = isDeveloping([items.get(edition.leadItemId)!, ...related], now);
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
    ...brief.slice(0, input.briefShown ?? brief.length),
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
    scores: edition && !settings.spoilerMode ? scoreViews(input.scores, settings, now) : [],
    spoilers: { available: settings.teams.length > 0, on: settings.spoilerMode },
    secondary,
    bands,
    brief,
    clippings: clippings.map((c) => clippingView(c, now)),
    corrections: edition ? corrections(input.states, feedById) : [],
  };
}

const DEVELOPING_WINDOW_MS = 60 * 60_000;

/**
 * A story is developing when an outlet other than the first to report it has published on it
 * in the last hour: the story is still drawing coverage.
 */
export function isDeveloping(group: Pick<Item, 'publishedAt'>[], now: number): boolean {
  if (group.length < 2) return false;
  const [, ...followers] = [...group].sort((a, b) => a.publishedAt - b.publishedAt);
  return followers.some((i) => i.publishedAt <= now && now - i.publishedAt <= DEVELOPING_WINDOW_MS);
}

/** A stored story as the page shows it (also used for search results). */
export function itemView(
  item: Item,
  feed: Feed | undefined,
  now: number,
  opts: { deckMax?: number; lastVisitAt?: number | undefined; saved?: Set<string> } = {},
): StoryView {
  const { deck, body } = splitDeck(item.summary);
  const view: StoryView = {
    id: item.id,
    title: item.title,
    link: item.link,
    source: feed?.title ?? '',
    kicker: feed?.category ?? '',
    ago: ago(item.publishedAt, now),
    datetime: new Date(item.publishedAt).toISOString(),
    deck: opts.deckMax ? shorten(deck, opts.deckMax) : '',
    body,
    read: !!item.readAt,
    isNew: opts.lastVisitAt !== undefined && item.fetchedAt > opts.lastVisitAt,
    saved: !!opts.saved?.has(item.id),
  };
  if (item.imageUrl) view.imageUrl = item.imageUrl;
  return view;
}

function clippingView(c: Clipping, now: number): StoryView {
  const view: StoryView = {
    id: c.id,
    title: c.title,
    link: c.link,
    source: c.source,
    kicker: '',
    ago: c.publishedAt ? ago(c.publishedAt, now) : '',
    datetime: new Date(c.publishedAt || c.savedAt).toISOString(),
    deck: '',
    body: '',
    read: false,
    isNew: false,
    saved: true,
  };
  if (c.imageUrl) view.imageUrl = c.imageUrl;
  return view;
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
