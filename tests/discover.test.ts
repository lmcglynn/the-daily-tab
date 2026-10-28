import { discoverFeeds, findFeedLinks } from '@/lib/feed/discover';
import { fixture, mockFetch } from './helpers';

const html = (body: string) => () =>
  new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('findFeedLinks', () => {
  it('finds RSS and Atom alternates, resolving relative hrefs', () => {
    expect(findFeedLinks(fixture('site.html'), 'https://site.example.com/blog/')).toEqual([
      { url: 'https://site.example.com/feed.xml', title: 'Example & Co – Feed' },
      { url: 'https://cdn.example.com/atom.xml', title: '' },
    ]);
  });
});

describe('discoverFeeds', () => {
  it('returns the feed itself when given a feed URL', async () => {
    const url = 'https://site.example.com/feed.xml';
    const feeds = await discoverFeeds(url, mockFetch({ [url]: fixture('rss2.xml') }));
    expect(feeds).toEqual([
      { url, title: 'Example World News', siteUrl: 'https://news.example.com/world' },
    ]);
  });

  it('follows <link rel="alternate"> from a page', async () => {
    const fetchImpl = mockFetch({
      'https://site.example.com/': html(fixture('site.html')),
      'https://site.example.com/feed.xml': fixture('rss2.xml'),
      'https://cdn.example.com/atom.xml': fixture('atom.xml'),
    });
    const feeds = await discoverFeeds('site.example.com', fetchImpl);
    expect(feeds.map((f) => f.url)).toEqual([
      'https://site.example.com/feed.xml',
      'https://cdn.example.com/atom.xml',
    ]);
  });

  it('falls back to common feed paths', async () => {
    const fetchImpl = mockFetch({
      'https://plain.example.com/': html('<html><head></head></html>'),
      'https://plain.example.com/rss.xml': fixture('rss1.xml'),
    });
    const feeds = await discoverFeeds('https://plain.example.com/', fetchImpl);
    expect(feeds).toHaveLength(1);
    expect(feeds[0]!.url).toBe('https://plain.example.com/rss.xml');
    expect(fetchImpl.calls.map((c) => c.url)).toEqual([
      'https://plain.example.com/',
      'https://plain.example.com/feed',
      'https://plain.example.com/rss',
      'https://plain.example.com/rss.xml',
    ]);
  });

  it('rejects non-http input', async () => {
    await expect(discoverFeeds('javascript:alert(1)', mockFetch({}))).rejects.toThrow();
  });
});
