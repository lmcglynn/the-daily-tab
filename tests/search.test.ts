import { searchIndex, searchStories } from '@/lib/search';
import { HOUR, NOW, item } from './helpers';

const items = [
  item({
    id: 'old-title',
    feedId: 'f',
    title: 'Ukraine talks resume',
    publishedAt: NOW - 9 * HOUR,
  }),
  item({
    id: 'new-summary',
    feedId: 'f',
    title: 'Europe’s week in review',
    summary: 'Ukraine talks resumed on Monday.',
    publishedAt: NOW - HOUR,
  }),
  item({ id: 'accents', feedId: 'f', title: 'Pokémon league opens in Zürich', publishedAt: NOW }),
  item({ id: 'other', feedId: 'f', title: 'Markets rally', publishedAt: NOW }),
];
const index = searchIndex(items);
const ids = (q: string) => searchStories(index, q).items.map((i) => i.id);

describe('search', () => {
  it('needs every word, in the headline or the summary', () => {
    expect(ids('ukraine talks')).toEqual(['old-title', 'new-summary']);
    expect(ids('ukraine rally')).toEqual([]);
  });

  it('puts headline matches first, then the newest', () => {
    // new-summary is newer, but old-title has both words in its headline.
    expect(ids('talks')[0]).toBe('old-title');
  });

  it('matches the start of words, ignoring capitals and accents', () => {
    expect(ids('ukr')).toEqual(['old-title', 'new-summary']);
    expect(ids('pokemon zurich')).toEqual(['accents']);
    expect(ids('kraine')).toEqual([]); // not inside a word
  });

  it('treats the query as text, not a pattern', () => {
    expect(ids('(.*')).toEqual([]);
  });

  it('returns nothing for an empty query, and caps the list', () => {
    expect(searchStories(index, '   ')).toEqual({ items: [], total: 0 });
    const many = searchIndex(
      Array.from({ length: 60 }, (_, n) => item({ id: `m${n}`, feedId: 'f', title: 'Same words' })),
    );
    const r = searchStories(many, 'same', 40);
    expect(r.items).toHaveLength(40);
    expect(r.total).toBe(60);
  });
});
