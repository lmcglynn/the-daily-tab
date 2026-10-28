import { normalizeDate, normalizeEntries } from '@/lib/feed/normalize';
import { FeedParseError, parseFeed } from '@/lib/feed/parse';
import { HOUR, NOW, fixture } from './helpers';

const FEED = { id: 'f1', url: 'https://feeds.example.com/world/rss.xml' };

describe('parseFeed', () => {
  it('parses RSS 2.0 with media thumbnails and enclosures', () => {
    const p = parseFeed(fixture('rss2.xml'));
    expect(p.format).toBe('rss2');
    expect(p.title).toBe('Example World News');
    expect(p.siteUrl).toBe('https://news.example.com/world');
    expect(p.entries[0]).toMatchObject({
      guid: 'https://news.example.com/world/123',
      title: 'Leaders meet in Geneva as ceasefire talks resume',
      imageUrl: 'https://img.example.com/976/geneva.jpg', // widest thumbnail
    });
    expect(p.entries[1]!.imageUrl).toBe('https://img.example.com/floods.jpg');
  });

  it('parses Atom 1.0, including xhtml content and enclosure links', () => {
    const p = parseFeed(fixture('atom.xml'));
    expect(p.format).toBe('atom');
    expect(p.siteUrl).toBe('https://tech.example.com');
    expect(p.entries[0]).toMatchObject({
      title: 'New chip doubles battery life, maker says',
      link: 'https://tech.example.com/2026/10/27/chip',
      author: 'Ada Writer',
      published: '2026-10-27T08:30:00-04:00',
    });
    expect(p.entries[1]!.title).toContain('XHTML');
    expect(p.entries[1]!.link).toBe('https://tech.example.com/xhtml');
    expect(p.entries[1]!.imageUrl).toBe('https://img.example.com/xhtml.png');
  });

  it('parses RSS 1.0 (RDF)', () => {
    const p = parseFeed(fixture('rss1.xml'));
    expect(p.format).toBe('rss1');
    expect(p.entries).toHaveLength(2);
    expect(p.entries[0]).toMatchObject({
      title: 'Ancient genomes reveal early farming routes',
      link: 'https://science.example.com/articles/s41586-026-0001',
      published: '2026-10-27',
      author: 'A. Researcher',
    });
  });

  it('rejects HTML pages and non-XML', () => {
    expect(() => parseFeed(fixture('site.html'))).toThrow(FeedParseError);
    expect(() => parseFeed('{"json": true}')).toThrow(FeedParseError);
  });

  it('ignores DTDs with entity declarations', () => {
    const xml = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;">]>
      <rss version="2.0"><channel><title>T</title><item><title>Hi</title><link>https://x.example/1</link></item></channel></rss>`;
    expect(parseFeed(xml).entries[0]!.title).toBe('Hi');
  });
});

describe('normalizeEntries', () => {
  const items = normalizeEntries(FEED, parseFeed(fixture('rss2.xml')), NOW);

  it('produces plain-text summaries with no markup', () => {
    expect(items[0]!.summary).toBe(
      'Delegations arrived on Monday for a third round of talks & negotiations.',
    );
    for (const i of items) expect(i.summary).not.toMatch(/[<>]/);
  });

  it('drops non-http links, too-old items and duplicates', () => {
    const titles = items.map((i) => i.title);
    expect(titles).not.toContain('Item with a javascript link');
    expect(titles).not.toContain('Item from long ago');
    expect(titles.filter((t) => t.startsWith('Leaders meet'))).toHaveLength(1);
  });

  it('resolves relative links against the site URL', () => {
    expect(items.find((i) => i.title.startsWith('Floods'))!.link).toBe(
      'https://news.example.com/world/124',
    );
  });

  it('falls back to fetch time for bad or future dates', () => {
    expect(items.find((i) => i.title.includes('unparseable'))!.publishedAt).toBe(NOW);
    expect(items.find((i) => i.title.includes('future'))!.publishedAt).toBe(NOW);
  });

  it('pulls a real image from content, skipping pixels, and resolves protocol-relative URLs', () => {
    expect(items.find((i) => i.title.includes('unparseable'))!.imageUrl).toBe(
      'https://img.example.com/protocol-relative.jpg',
    );
  });

  it('derives stable ids from feed id + guid', () => {
    const again = normalizeEntries(FEED, parseFeed(fixture('rss2.xml')), NOW + HOUR);
    expect(again.map((i) => i.id)).toEqual(items.map((i) => i.id));
    const other = normalizeEntries({ ...FEED, id: 'f2' }, parseFeed(fixture('rss2.xml')), NOW);
    expect(other[0]!.id).not.toBe(items[0]!.id);
  });

  it('strips Hacker News boilerplate summaries', () => {
    const [hn] = normalizeEntries(FEED, parseFeed(fixture('hn.xml')), NOW);
    expect(hn!.summary).toBe('');
    expect(hn!.link).toBe('https://example.dev/tinydb');
  });

  it('uses dc:date for RSS 1.0', () => {
    const [first] = normalizeEntries(FEED, parseFeed(fixture('rss1.xml')), NOW);
    expect(first!.publishedAt).toBe(Date.parse('2026-10-27'));
  });
});

describe('normalizeDate', () => {
  it('handles RFC 822, ISO 8601 and a space-separated variant', () => {
    expect(normalizeDate('Tue, 27 Oct 2026 08:15:00 GMT', NOW)).toBe(
      Date.parse('2026-10-27T08:15:00Z'),
    );
    expect(normalizeDate('2026-10-27T08:15:00+01:00', NOW)).toBe(
      Date.parse('2026-10-27T07:15:00Z'),
    );
    // No zone: parsed as local time; a day earlier keeps it in the past in every time zone.
    expect(normalizeDate('2026-10-26 08:15:00', NOW)).not.toBe(NOW);
    expect(normalizeDate(undefined, NOW)).toBe(NOW);
  });
});
