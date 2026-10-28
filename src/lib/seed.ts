import { feedIdFor } from './hash';
import type { Feed } from './types';

// Verified 2026-10-27: every URL returned a valid feed (BBC, NPR, Guardian, Ars, HN,
// Quanta, ScienceDaily: RSS 2.0; The Verge: Atom; Nature: RSS 1.0).
const STARTER: [category: string, title: string, url: string, siteUrl: string][] = [
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
    'Tech',
    'Ars Technica',
    'https://feeds.arstechnica.com/arstechnica/index',
    'https://arstechnica.com/',
  ],
  ['Tech', 'The Verge', 'https://www.theverge.com/rss/index.xml', 'https://www.theverge.com/'],
  ['Tech', 'Hacker News', 'https://hnrss.org/frontpage', 'https://news.ycombinator.com/'],
  ['Science', 'Quanta', 'https://www.quantamagazine.org/feed/', 'https://www.quantamagazine.org/'],
  [
    'Science',
    'ScienceDaily',
    'https://www.sciencedaily.com/rss/all.xml',
    'https://www.sciencedaily.com/',
  ],
  ['Science', 'Nature', 'https://www.nature.com/nature.rss', 'https://www.nature.com/nature'],
];

export const STARTER_SECTIONS = ['World', 'Tech', 'Science'];

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
