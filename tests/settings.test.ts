import { contrast } from '@/lib/color';
import {
  changedFeeds,
  feedsIn,
  makeFeed,
  moveFeed,
  moveItem,
  renameSection,
  renumber,
  sectionList,
  unusedOrigins,
} from '@/lib/feeds-edit';
import { parseOpml, toOpml } from '@/lib/opml';
import type { Feed } from '@/lib/types';
import { feed } from './helpers';

const feeds: Feed[] = [
  feed('a', 'World', 0),
  feed('b', 'World', 1),
  feed('c', 'Tech', 2),
  feed('d', 'Tech', 3),
  feed('e', 'Science', 4),
];
const sections = ['World', 'Tech', 'Science'];
const ids = (list: Feed[]) => list.map((f) => f.id).join(',');

describe('feed list editing', () => {
  it('lists saved sections first, then categories only feeds mention', () => {
    expect(sectionList(['Tech', 'Empty'], feeds)).toEqual(['Tech', 'Empty', 'World', 'Science']);
  });

  it('moves a feed within its section', () => {
    const next = moveFeed(feeds, sections, 'b', 'World', 0);
    expect(ids(feedsIn(next, 'World'))).toBe('b,a');
    expect(next.map((f) => f.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves a feed to another section at a position', () => {
    const next = moveFeed(feeds, sections, 'a', 'Tech', 1);
    expect(ids(feedsIn(next, 'Tech'))).toBe('c,a,d');
    expect(next.find((f) => f.id === 'a')!.category).toBe('Tech');
    expect(ids(feedsIn(next, 'World'))).toBe('b');
  });

  it('renumbers by section order', () => {
    const next = renumber(feeds, ['Science', 'World', 'Tech']);
    expect(ids(next)).toBe('e,a,b,c,d');
    expect(next.map((f) => f.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('moves items in a list', () => {
    expect(moveItem(['x', 'y', 'z'], 2, 0)).toEqual(['z', 'x', 'y']);
    expect(moveItem(['x', 'y', 'z'], 0, 9)).toEqual(['y', 'z', 'x']);
  });

  it('renames a section, merging into an existing one of that name', () => {
    const r = renameSection(feeds, sections, 'Science', 'Research');
    expect(r.sections).toEqual(['World', 'Tech', 'Research']);
    expect(r.feeds.find((f) => f.id === 'e')!.category).toBe('Research');
    const m = renameSection(feeds, sections, 'Science', 'Tech');
    expect(m.sections).toEqual(['World', 'Tech']);
    expect(feedsIn(m.feeds, 'Tech')).toHaveLength(3);
  });

  it('reports only the feeds that changed (to limit storage.sync writes)', () => {
    const next = moveFeed(feeds, sections, 'b', 'World', 0);
    expect(ids(changedFeeds(feeds, next))).toBe('b,a');
  });

  it('builds a feed with a stable id from its URL', () => {
    const f = makeFeed(
      { url: 'https://x.example/feed', title: '  X  ', siteUrl: 'https://x.example/' },
      'Tech',
      7,
    );
    expect(f).toMatchObject({ title: 'X', category: 'Tech', order: 7 });
    expect(f.id).toBe(
      makeFeed({ url: 'https://x.example/feed', title: '', siteUrl: '' }, 'W', 0).id,
    );
  });

  it('finds host permissions no feed needs', () => {
    expect(unusedOrigins(['https://a.example.com/*', 'https://www.bbc.co.uk/*'], feeds)).toEqual([
      'https://www.bbc.co.uk/*',
    ]);
  });
});

describe('OPML', () => {
  const opml = `<?xml version="1.0"?>
<opml version="1.0"><head><title>Mine</title></head><body>
  <outline text="News">
    <outline type="rss" text="BBC &amp; Co" xmlUrl="https://feeds.bbci.co.uk/news/world/rss.xml" htmlUrl="https://www.bbc.co.uk/news"/>
    <outline type="rss" text="Dup" xmlUrl="https://feeds.bbci.co.uk/news/world/rss.xml"/>
  </outline>
  <outline text="Loose" title="Loose feed" xmlUrl="https://loose.example/feed" category="/Science,Space"/>
  <outline text="Bad" xmlUrl="javascript:alert(1)"/>
  <outline text="Empty folder"/>
</body></opml>`;

  it('imports feeds with folder names as sections, skipping duplicates and bad URLs', () => {
    expect(parseOpml(opml)).toEqual([
      {
        url: 'https://feeds.bbci.co.uk/news/world/rss.xml',
        title: 'BBC & Co',
        siteUrl: 'https://www.bbc.co.uk/news',
        category: 'News',
      },
      {
        url: 'https://loose.example/feed',
        title: 'Loose feed',
        siteUrl: 'https://loose.example/',
        category: 'Science',
      },
    ]);
  });

  it('rejects files that are not OPML', () => {
    expect(() => parseOpml('<rss><channel/></rss>')).toThrow(/not OPML/);
  });

  it('round-trips through export, escaping attributes', () => {
    const list = [{ ...feed('q', 'World', 0), title: 'Q & "A" <News>' }, feed('r', 'Tech', 1)];
    const xml = toOpml(list, ['Tech', 'World'], 'The Daily Tab', new Date(0));
    expect(xml).toContain('Q &amp; &quot;A&quot; &lt;News&gt;');
    expect(xml.indexOf('text="Tech"')).toBeLessThan(xml.indexOf('text="World"'));
    expect(parseOpml(xml)).toEqual([
      { url: list[1]!.url, title: 'R', siteUrl: list[1]!.siteUrl, category: 'Tech' },
      { url: list[0]!.url, title: 'Q & "A" <News>', siteUrl: list[0]!.siteUrl, category: 'World' },
    ]);
  });
});

describe('contrast', () => {
  it('matches the default spot color against day paper', () => {
    expect(contrast('#A4161A', '#F4F1EA')).toBeGreaterThan(6.5);
    expect(contrast('#FFD700', '#F4F1EA')).toBeLessThan(2);
    expect(contrast('nope', '#fff')).toBe(0);
  });
});
