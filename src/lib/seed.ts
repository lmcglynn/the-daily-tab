import { feedIdFor } from './hash';
import type { Feed } from './types';

// The maintainer's own list, exported from Settings as OPML on 2026-10-28. Verify starter feeds
// from the extension's service worker (`npm run verify:background`), not only curl: a feed that
// redirects to another origin (as Nature did, to idp.nature.com) fails there.
const STARTER: [category: string, title: string, url: string, siteUrl: string][] = [
  [
    'National',
    'Washington Post',
    'https://www.washingtonpost.com/arcio/rss/category/national/',
    'https://www.washingtonpost.com/',
  ],
  ['National', 'Axios', 'https://api.axios.com/feed/', 'https://www.axios.com/'],
  ['National', 'LA Times', 'https://www.latimes.com/index.rss', 'https://www.latimes.com/'],
  [
    'National',
    'NBC News',
    'https://feeds.nbcnews.com/nbcnews/public/news',
    'https://www.nbcnews.com/',
  ],
  [
    'National',
    'PBS News',
    'https://www.pbs.org/newshour/feeds/rss/headlines',
    'https://www.pbs.org/newshour/',
  ],
  [
    'National',
    'Wall Street Journal',
    'https://feeds.content.dowjones.io/public/rss/RSSUSnews',
    'https://www.wsj.com/us-news/',
  ],
  ['National', 'Vox', 'https://www.vox.com/rss/index.xml', 'https://www.vox.com/'],
  [
    'National',
    'New York Times',
    'https://rss.nytimes.com/services/xml/rss/nyt/US.xml',
    'https://www.nytimes.com/section/us',
  ],
  ['National', 'TIME', 'https://time.com/feed/', 'https://time.com/'],
  [
    'World',
    'BBC News',
    'https://feeds.bbci.co.uk/news/world/rss.xml',
    'https://www.bbc.co.uk/news/world',
  ],
  ['World', 'NPR', 'https://feeds.npr.org/1001/rss.xml', 'https://www.npr.org/'],
  [
    'World',
    'The Guardian',
    'https://www.theguardian.com/world/rss',
    'https://www.theguardian.com/world',
  ],
  [
    'World',
    'Washington Post',
    'https://www.washingtonpost.com/arcio/rss/category/world/',
    'https://www.washingtonpost.com/',
  ],
  [
    'World',
    'New York Times',
    'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
    'https://www.nytimes.com/section/world',
  ],
  [
    'Sports',
    'The Athletic',
    'https://www.nytimes.com/athletic/rss/news/',
    'https://www.nytimes.com/athletic/news/',
  ],
  ['Sports', 'ESPN', 'https://www.espn.com/espn/rss/news', 'https://www.espn.com/'],
  ['Sports', 'LA Times', 'https://www.latimes.com/sports/rss2.0.xml', 'https://www.latimes.com/'],
  [
    'Investigative',
    'ProPublica',
    'https://www.propublica.org/feeds/propublica/main',
    'https://www.propublica.org/',
  ],
  ['Investigative', 'ICIJ', 'https://www.icij.org/feed/', 'https://www.icij.org/'],
  ['Investigative', 'Reveal', 'https://revealnews.org/feed/', 'https://revealnews.org/'],
  [
    'Investigative',
    'bellingcat',
    'https://www.bellingcat.com/feed/',
    'https://www.bellingcat.com/',
  ],
  ['Investigative', 'The Intercept', 'https://theintercept.com/feed/', 'https://theintercept.com/'],
  ['Culture', 'The New Yorker', 'https://www.newyorker.com/feed/rss', 'https://www.newyorker.com/'],
  [
    'Los Angeles',
    'NBC Los Angeles',
    'https://www.nbclosangeles.com/?rss=y',
    'https://www.nbclosangeles.com/',
  ],
  ['Los Angeles', 'KTLA', 'https://ktla.com/feed/', 'https://ktla.com/'],
  ['Science', 'Quanta', 'https://www.quantamagazine.org/feed/', 'https://www.quantamagazine.org/'],
  [
    'Science',
    'ScienceDaily',
    'https://www.sciencedaily.com/rss/all.xml',
    'https://www.sciencedaily.com/',
  ],
  [
    'Tech',
    'Ars Technica',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://arstechnica.com/',
  ],
  ['Tech', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com/'],
  ['Tech', 'Hacker News', 'https://hnrss.org/frontpage', 'https://news.ycombinator.com/'],
];

export const STARTER_SECTIONS = [...new Set(STARTER.map(([category]) => category))];

export function starterFeeds(): Feed[] {
  return STARTER.map(([category, title, url, siteUrl], order) => ({
    id: feedIdFor(url),
    url,
    siteUrl,
    title,
    category,
    order,
  }));
}

/** Host-permission match patterns covering the given feeds. */
export function originPatterns(urls: string[]): string[] {
  return [...new Set(urls.map((u) => `${new URL(u).origin}/*`))];
}
