// Fixture front page for the dev preview: invented stories run through the real grouping and
// composing code. Covers long headlines, missing/odd/broken photos, odd dates, a story carried
// by three feeds, read stories, new-since-last-visit stories and a failed feed.
import { composeEdition } from '@/lib/edition/compose';
import { groupStories } from '@/lib/edition/group';
import { normalizeDate } from '@/lib/feed/normalize';
import { feedIdFor } from '@/lib/hash';
import { DEFAULT_SETTINGS } from '@/lib/defaults';
import type {
  Edition,
  Feed,
  FeedState,
  Item,
  MarketReport,
  Settings,
  WeatherReport,
} from '@/lib/types';

/** Tuesday, October 27, 2026, 9:42 a.m. local time. */
export const NOW = new Date(2026, 9, 27, 9, 42).getTime();
const at = (h: number, m = 0, dayOffset = 0) => new Date(2026, 9, 27 + dayOffset, h, m).getTime();

// The fixture's own feed list, independent of the starter feeds (the stories below name these).
const SECTIONS = ['World', 'Tech', 'Science'];
export const feeds: Feed[] = (
  [
    ['World', 'BBC News', 'https://feeds.bbci.co.uk/news/world/rss.xml'],
    ['World', 'NPR', 'https://feeds.npr.org/1001/rss.xml'],
    ['World', 'The Guardian', 'https://www.theguardian.com/world/rss'],
    ['Tech', 'Ars Technica', 'https://feeds.arstechnica.com/arstechnica/index'],
    ['Tech', 'The Verge', 'https://www.theverge.com/rss/index.xml'],
    ['Tech', 'Hacker News', 'https://hnrss.org/frontpage'],
    ['Science', 'Quanta', 'https://www.quantamagazine.org/feed/'],
    ['Science', 'ScienceDaily', 'https://www.sciencedaily.com/rss/all.xml'],
    [
      'Science',
      'Scientific American',
      'https://www.scientificamerican.com/platform/syndication/rss/',
    ],
  ] as const
).map(([category, title, url], order) => ({
  id: feedIdFor(url),
  url,
  siteUrl: `${new URL(url).origin}/`,
  title,
  category,
  order,
}));
const F = Object.fromEntries(feeds.map((f) => [f.title, f.id])) as Record<string, string>;

const pic = (seed: string, w = 1200, h = 800) => `https://picsum.photos/seed/${seed}/${w}/${h}`;

type Raw = [
  feed: string,
  title: string,
  published: number | string,
  summary: string,
  image?: string,
  extra?: Partial<Item>,
];

const RAW: Raw[] = [
  // One story, three feeds: becomes the lead.
  [
    'BBC News',
    'Leaders gather in Geneva as ceasefire talks resume after weeks of deadlock',
    at(7, 55),
    'Delegations from both sides arrived on Monday night for the first direct talks since August.',
    pic('geneva-lake'),
  ],
  [
    'NPR',
    'Ceasefire talks resume in Geneva as leaders gather after weeks of deadlock',
    at(8, 20),
    'Negotiators say a prisoner exchange is the first item on the agenda.',
  ],
  [
    'The Guardian',
    'Geneva ceasefire talks resume as world leaders gather after deadlock',
    at(9, 5),
    'Mediators hope a narrow agreement on humanitarian corridors can open the way to a wider truce. Envoys spent the night revising a draft that both delegations had rejected in September, and officials close to the talks said the mood on Tuesday morning was "cautious but serious". A first plenary session is expected before noon, with working groups on prisoners, aid access and monitoring to follow through the week.',
    pic('geneva-palais'),
  ],
  // World
  [
    'BBC News',
    'Floodwaters recede in northern provinces, leaving thousands without homes',
    at(9, 30),
    'Aid agencies warn that the clean-up could take months as roads remain impassable.',
    pic('flood-river'),
  ],
  [
    'NPR',
    "Election officials in three states say they will begin hand-counting ballots in disputed districts after a judge's late-night ruling upended weeks of careful planning",
    at(8, 45),
    'The ruling, issued just before midnight, orders a full manual recount in eleven districts. County clerks say they will need hundreds of volunteers.',
  ],
  [
    'The Guardian',
    'Heatwave grips southern Europe for a third week as wildfires spread across hillsides',
    at(6, 30),
    'Temperatures above 40C have been recorded in four countries. Firefighters from across the EU have been sent to the worst-hit regions.',
    pic('dry-hills'),
  ],
  [
    'BBC News',
    'Central bank holds rates steady, signalling caution',
    at(5, 15),
    'Policymakers said inflation was easing more slowly than expected.',
    undefined,
    { readAt: at(9, 0) },
  ],
  [
    'NPR',
    'Rescue crews reach remote village cut off by landslide',
    at(4, 0),
    'Helicopters ferried food and medicine to residents who had been stranded for five days.',
    pic('mountain-village', 400, 1200), // very tall original
  ],
  [
    'The Guardian',
    'The quiet return of the town square',
    at(21, 0, -1), // yesterday evening
    'Across Europe, cities are tearing up car parks and giving the space back to markets, benches and trees.',
  ],
  [
    'BBC News',
    'Museum returns looted bronzes after 120 years',
    at(14, 0, -3), // three days ago
    'The handover ceremony was attended by descendants of the original craftsmen.',
  ],
  [
    'NPR',
    'Small towns bet on four-day school weeks to keep teachers',
    'Mon, 26 Oct 2026 23:59:59 -0700', // a timezone far from local
    'Districts say the schedule helps recruitment, but parents worry about childcare.',
  ],
  // Tech
  [
    'Ars Technica',
    'Code-execution flaw in UEFI firmware affects most servers on the planet',
    at(8, 58),
    'Attackers with local access can persist below the operating system. Patches are rolling out, but many vendors have not yet shipped them.',
    pic('server-rack'),
  ],
  [
    'The Verge',
    'This tiny e-ink tablet wants to replace your paper notebook',
    at(9, 20),
    'It weighs less than a paperback and lasts three weeks on a charge.',
    pic('notebook-desk'),
  ],
  ['Hacker News', 'Show HN: A relational database in 500 lines of C', at(9, 35), ''],
  [
    'Ars Technica',
    'Researchers coax a 40-year-old space probe back into talking to Earth',
    at(7, 10),
    'Engineers rewrote a routine for a processor with 64 kilobytes of memory.',
    pic('deep-space'),
  ],
  [
    'The Verge',
    'The best mechanical keyboards for every budget',
    at(6, 0),
    'From silent switches to split layouts, our picks after six months of typing.',
    'https://images.invalid/keyboard.jpg', // broken image
  ],
  [
    'Hacker News',
    'Why we moved our build system back to Make',
    at(7, 45),
    '',
    undefined,
    { readAt: at(8, 0) },
  ],
  [
    'Ars Technica',
    'Supercomputer sets an efficiency record using liquid immersion cooling',
    at(3, 30),
    'The machine delivers 70 gigaflops per watt.',
  ],
  [
    'The Verge',
    'Streaming service raises prices again and adds an ad-supported tier in 12 countries',
    at(2, 0),
    'The cheapest plan now includes four minutes of ads an hour.',
  ],
  ['Hacker News', "Ask HN: What's your favourite underrated programming book?", at(1, 0), ''],
  [
    'Ars Technica',
    'A remarkably long headline about a regulatory fight over satellite spectrum that has dragged on for years and now heads to a court that has never ruled on the question before',
    at(22, 30, -1),
    'Both companies say the other is blocking rural broadband.',
  ],
  // Science
  [
    'Quanta',
    'Mathematicians prove a decades-old conjecture about how knots untangle',
    at(8, 0),
    'The proof shows that every knot can be simplified without ever making it more tangled first.',
    pic('rope-knot'),
  ],
  [
    'ScienceDaily',
    'Coral reefs show surprising resilience after marine heatwave, study finds',
    at(7, 30),
    'Surveys found that 60 percent of bleached colonies had recovered within a year.',
    pic('coral', 80, 80), // tiny original
  ],
  [
    'Scientific American',
    'Ancient genomes reveal early farming routes across the Mediterranean',
    at(6, 40),
    'Analysis of 300 individuals traces two separate waves of migration.',
  ],
  [
    'ScienceDaily',
    'New battery chemistry could double the range of electric aircraft',
    at(9, 10),
    'A lithium-sulfur cell survived 1,000 charge cycles in the lab.',
  ],
  [
    'Quanta',
    "The physicist who wants to measure time's arrow",
    at(5, 0),
    'A new experiment aims to catch entropy in the act.',
    pic('clock-tower'),
  ],
  [
    'Scientific American',
    'Deep-sea microbes thrive on hydrogen split from water by natural radiation',
    at(4, 20),
    'The finding widens the search for life on icy moons.',
  ],
  [
    'ScienceDaily',
    'Sleep deprivation alters gut bacteria within days',
    at(3, 0),
    'Volunteers who slept four hours a night showed measurable changes.',
  ],
  [
    'Scientific American',
    'Gravitational waves hint at a hidden population of intermediate black holes',
    '2100-01-01T00:00:00Z', // bogus future date → treated as fetch time
    'Three events fall in a mass range that models struggle to explain.',
  ],
  [
    'ScienceDaily',
    'Bees can count to four, and perhaps further',
    at(18, 0, -1),
    'Trained bees picked the fourth landmark more often than chance.',
  ],
  [
    'Quanta',
    'What is entropy, really?',
    at(10, 0, -2),
    'An explainer on disorder and information.',
  ],
];

function buildItems(): Item[] {
  return RAW.map(([feed, title, published, summary, image, extra], n) => {
    const fetchedAt = NOW - 5 * 60_000;
    const publishedAt =
      typeof published === 'string' ? normalizeDate(published, fetchedAt) : published;
    const item: Item = {
      id: `fx${n}`,
      feedId: F[feed]!,
      title,
      link: `https://example.com/story/${n}`,
      summary,
      publishedAt,
      // First seen shortly after publication (or at fetch time for bogus dates).
      fetchedAt: Math.min(publishedAt + 3 * 60_000, fetchedAt),
      ...extra,
    };
    if (image) item.imageUrl = image;
    return item;
  });
}

export const items: Item[] = (() => {
  const list = buildItems();
  const stories = groupStories(list);
  const size = new Map<string, number>();
  for (const root of stories.values()) size.set(root, (size.get(root) ?? 0) + 1);
  for (const i of list) {
    const root = stories.get(i.id)!;
    if (size.get(root)! > 1) i.storyId = root;
  }
  return list;
})();

export const settings: Settings = {
  ...DEFAULT_SETTINGS,
  sections: SECTIONS,
  installedAt: new Date(2026, 9, 1, 12, 0).getTime(), // → No. 27
  pinnedLinks: [
    { title: 'Mail', url: 'https://outlook.live.com/' },
    { title: 'Calendar', url: 'https://calendar.google.com/' },
    { title: 'GitHub', url: 'https://github.com/' },
    { title: 'Wikipedia', url: 'https://en.wikipedia.org/' },
  ],
  weatherPlace: {
    name: 'Seattle',
    region: 'Washington, United States',
    lat: 47.6062,
    lon: -122.3321,
  },
  units: 'f',
  tickers: [
    { symbol: '^GSPC', name: 'S&P 500' },
    { symbol: '^DJI', name: 'Dow' },
    { symbol: 'AAPL', name: 'Apple Inc.' },
  ],
};

export const lastVisitAt = at(8, 10);

export const weather: WeatherReport = {
  at: NOW - 12 * 60_000,
  lat: 47.6062,
  lon: -122.3321,
  units: 'f',
  temp: 47.6,
  code: 3,
  isDay: true,
  high: 52.4,
  low: 40.6,
};

/** A morning's trading (deterministic walk so screenshots are stable). */
function quote(symbol: string, name: string, previousClose: number, drift: number): MarketReport {
  const points: number[] = [];
  let v = previousClose;
  for (let i = 0; i < 26; i++) {
    v += (Math.sin(i / 3) * 4 + (i > 8 ? 1.6 : -2.2) * drift) * (previousClose / 7700);
    points.push(Math.round(v * 100) / 100);
  }
  return {
    at: NOW - 3 * 60_000,
    symbol,
    name,
    currency: 'USD',
    price: points.at(-1)!,
    previousClose,
    marketTime: NOW - 15 * 60_000,
    timezone: 'America/New_York',
    points,
  };
}

export const markets: Record<string, MarketReport> = {
  '^GSPC': quote('^GSPC', 'S&P 500', 7722.6, 1),
  '^DJI': quote('^DJI', 'Dow Jones Industrial Average', 52610.2, -1.4),
  AAPL: quote('AAPL', 'Apple Inc.', 343.1, 0.8),
};

export const states: FeedState[] = feeds.map((f) =>
  f.title === 'Scientific American'
    ? {
        feedId: f.id,
        status: 'error',
        failCount: 1,
        lastError: 'Could not be reached',
        lastErrorAt: NOW,
        lastSuccessAt: at(6, 50),
      }
    : { feedId: f.id, status: 'ok', failCount: 0, lastSuccessAt: NOW },
);

export const edition: Edition = composeEdition({
  items,
  feeds,
  sections: settings.sections,
  now: NOW,
  previousNumber: 41,
})!;
