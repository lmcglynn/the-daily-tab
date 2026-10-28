import type { Edition, Feed, FeedState, Item, PinnedLink, Settings } from '@/lib/types';
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
  /** Other feeds carrying the same story. */
  related: { source: string; link: string; title: string }[];
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
  sections: { name: string; anchor: string }[];
  pinned: PinnedLink[];
  lead: StoryView | null;
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
      related: [],
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
      const related = stories(edition.leadRelatedItemIds, 0);
      lead.related = related.map((r) => ({ source: r.source, link: r.link, title: r.title }));
      // A one-sentence summary leaves the lead's columns empty; borrow the fullest
      // summary from the same story elsewhere.
      if (!lead.body) {
        const fuller = edition.leadRelatedItemIds
          .map((id) => (items.get(id)?.summary ?? '').replace(/\s*\n\s*/g, ' '))
          .sort((a, b) => b.length - a.length)[0];
        if (fuller && fuller !== lead.deck) lead.body = fuller;
      }
    }
  }

  const secondary = edition ? stories(edition.secondaryItemIds, 170) : [];
  const bands: BandView[] = (edition?.sections ?? []).map((s) => ({
    category: s.category,
    anchor: anchorFor(s.category),
    stories: stories(s.itemIds, 150),
    more: input.more?.has(s.category) ? stories(input.more.get(s.category)!, 0) : null,
  }));
  const brief = edition ? stories(edition.briefItemIds, 0) : [];

  const all = [lead, ...secondary, ...bands.flatMap((b) => b.stories), ...brief].filter(
    (s): s is StoryView => s !== null,
  );

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
    sections: bands.map((b) => ({ name: b.category, anchor: b.anchor })),
    pinned: settings.pinnedLinks,
    lead,
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
  return out;
}
