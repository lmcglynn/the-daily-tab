import { normalizeSettings } from '@/lib/defaults';
import { composeEdition } from '@/lib/edition/compose';
import { cleanMutedWords, MAX_MUTED, muteMatcher } from '@/lib/mute';
import { HOUR, NOW, feed, item } from './helpers';

const story = (title: string, summary = '') => ({ title, summary });

describe('muteMatcher', () => {
  const muted = muteMatcher(['crypto', 'Taylor Swift', 'drone', 'Pokémon', 'C++']);

  it('matches whole words in the headline or summary, ignoring case and accents', () => {
    expect(muted(story('Crypto markets tumble'))).toBe(true);
    expect(muted(story('Markets tumble', 'Investors fled crypto overnight.'))).toBe(true);
    expect(muted(story('New Pokemon game announced'))).toBe(true);
    expect(muted(story('Why C++ still matters'))).toBe(true);
  });

  it('matches phrases across any spacing, and plurals and possessives', () => {
    expect(muted(story('Taylor  Swift announces tour'))).toBe(true);
    expect(muted(story('Swift, Taylor: a profile'))).toBe(false);
    expect(muted(story('Drones spotted over airport'))).toBe(true);
    expect(muted(story('Taylor Swift’s new album'))).toBe(true);
  });

  it('does not match inside other words', () => {
    expect(muted(story('Cryptography conference opens'))).toBe(false);
    expect(muted(story('Droned on for hours'))).toBe(false);
    expect(muted(story('Swiftly approved budget'))).toBe(false);
  });

  it('mutes nothing with no words', () => {
    expect(muteMatcher([])(story('Anything at all'))).toBe(false);
    expect(muteMatcher(['  '])(story('Anything at all'))).toBe(false);
  });
});

describe('cleanMutedWords', () => {
  it('trims, collapses spaces, drops duplicates ignoring case and accents, and caps', () => {
    expect(
      cleanMutedWords([' crypto ', 'Crypto', 'Taylor   Swift', '', 7, 'pokémon', 'Pokemon']),
    ).toEqual(['crypto', 'Taylor Swift', 'pokémon']);
    expect(cleanMutedWords(Array.from({ length: 80 }, (_, i) => `w${i}`))).toHaveLength(MAX_MUTED);
  });

  it('is applied when settings are read, including the {"0": …} storage shape', () => {
    expect(normalizeSettings({ mutedWords: { 0: 'crypto', 1: 'CRYPTO' } }).mutedWords).toEqual([
      'crypto',
    ]);
    expect(normalizeSettings({}).mutedWords).toEqual([]);
  });
});

describe('composeEdition with muted topics', () => {
  it('leaves muted stories off the page and fills the space with others', () => {
    const feeds = [feed('a', 'World', 0), feed('b', 'World', 1)];
    const items = [
      item({
        id: 'm1',
        feedId: 'a',
        storyId: 'm1',
        title: 'Crypto exchange collapses',
        imageUrl: 'https://i/1.jpg',
      }),
      item({ id: 'm2', feedId: 'b', storyId: 'm1', title: 'Crypto exchange collapses overnight' }),
      ...Array.from({ length: 8 }, (_, i) =>
        item({ id: `s${i}`, feedId: i % 2 ? 'a' : 'b', publishedAt: NOW - (i + 1) * HOUR }),
      ),
    ];
    const plain = composeEdition({
      items,
      feeds,
      sections: ['World'],
      now: NOW,
      previousNumber: 0,
    })!;
    expect(plain.leadItemId).toBe('m1');
    const e = composeEdition({
      items,
      feeds,
      sections: ['World'],
      now: NOW,
      previousNumber: 0,
      mutedWords: ['crypto'],
    })!;
    const placed = [
      e.leadItemId,
      ...e.leadRelatedItemIds,
      ...e.secondaryItemIds,
      ...(e.leadColumnItemIds ?? []),
      ...e.sections.flatMap((s) => s.itemIds),
      ...e.briefItemIds,
    ];
    expect(placed).not.toContain('m1');
    expect(placed).not.toContain('m2');
    expect(placed).toHaveLength(8);
  });
});
