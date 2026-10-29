import { DEFAULT_SETTINGS, normalizeSettings } from '@/lib/defaults';
import { composeEdition, editionItemIds } from '@/lib/edition/compose';
import { parseTeams } from '@/lib/extras/scores';
import { muteMatcher } from '@/lib/mute';
import { blockedWords, spoilerWords } from '@/lib/spoilers';
import type { Game, ScoreReport, SportsTeam } from '@/lib/types';
import { buildFrontPage } from '@/ui/model';
import * as fx from '../fixtures/frontpage';
import { HOUR, NOW, feed, item } from './helpers';

const lakers: SportsTeam = {
  league: 'basketball/nba',
  id: '13',
  name: 'Los Angeles Lakers',
  abbr: 'LAL',
  nickname: 'Lakers',
};
const game = (over: Partial<Game>): Game => ({
  id: 'g',
  date: NOW - HOUR,
  state: 'post',
  detail: 'Final',
  home: { id: '13', name: 'Lakers', abbr: 'LAL', score: 101 },
  away: { id: '12', name: 'Clippers', abbr: 'LAC', score: 99 },
  ...over,
});
const report = (last: Game | null, current: Game | null): ScoreReport => ({
  at: NOW,
  key: 'basketball/nba:13',
  last,
  current,
});

describe('spoiler words', () => {
  it('names the team (full name and nickname) and the team it just played', () => {
    expect(spoilerWords([lakers], { 'basketball/nba:13': report(game({}), null) }, NOW)).toEqual([
      'Los Angeles Lakers',
      'Lakers',
      'Clippers',
    ]);
  });

  it('includes the opponent of a game in progress, not of next week’s or last week’s', () => {
    const live = game({ state: 'in', away: { id: '9', name: 'Warriors', abbr: 'GS' } });
    const upcoming = game({
      state: 'pre',
      date: NOW + 3 * 24 * HOUR,
      away: { id: '2', name: 'Celtics', abbr: 'BOS' },
    });
    const oldGame = game({
      date: NOW - 3 * 24 * HOUR,
      away: { id: '5', name: 'Bulls', abbr: 'CHI' },
    });
    expect(spoilerWords([lakers], { 'basketball/nba:13': report(oldGame, live) }, NOW)).toEqual([
      'Los Angeles Lakers',
      'Lakers',
      'Warriors',
    ]);
    expect(spoilerWords([lakers], { 'basketball/nba:13': report(oldGame, upcoming) }, NOW)).toEqual(
      ['Los Angeles Lakers', 'Lakers'],
    );
  });

  it('finds a nickname for teams followed before nicknames were stored', () => {
    const older: SportsTeam = { ...lakers };
    delete older.nickname;
    // From a game the team played…
    expect(spoilerWords([older], { 'basketball/nba:13': report(game({}), null) }, NOW)).toContain(
      'Lakers',
    );
    // …or, with no games, the last word of its name.
    const kings = { league: 'hockey/nhl', id: '8', name: 'Los Angeles Kings', abbr: 'LA' };
    expect(spoilerWords([kings], {}, NOW)).toEqual(['Los Angeles Kings', 'Kings']);
  });

  it('adds them to muted topics only while spoiler mode is on', () => {
    const settings = { ...DEFAULT_SETTINGS, mutedWords: ['crypto'], teams: [lakers] };
    const scores = { 'basketball/nba:13': report(game({}), null) };
    expect(blockedWords(settings, scores, NOW)).toEqual(['crypto']);
    expect(blockedWords({ ...settings, spoilerMode: true }, scores, NOW)).toEqual([
      'crypto',
      'Los Angeles Lakers',
      'Lakers',
      'Clippers',
    ]);
    expect(blockedWords({ ...settings, teams: [], spoilerMode: true }, scores, NOW)).toEqual([
      'crypto',
    ]);
  });

  it('keeps those stories off the page, other stories filling in', () => {
    const feeds = [feed('a', 'Sports', 0), feed('b', 'Sports', 1)];
    const items = [
      item({ id: 'spoiler', feedId: 'a', title: 'Clippers stun Lakers at the buzzer' }),
      item({ id: 'possessive', feedId: 'b', title: 'Inside the Lakers’ comeback' }),
      ...Array.from({ length: 6 }, (_, i) =>
        item({ id: `s${i}`, feedId: i % 2 ? 'a' : 'b', publishedAt: NOW - (i + 2) * HOUR }),
      ),
    ];
    const words = blockedWords(
      { ...DEFAULT_SETTINGS, teams: [lakers], spoilerMode: true },
      { 'basketball/nba:13': report(game({}), null) },
      NOW,
    );
    const e = composeEdition({
      items,
      feeds,
      sections: ['Sports'],
      now: NOW,
      previousNumber: 0,
      mutedWords: words,
    })!;
    expect(editionItemIds(e)).not.toContain('spoiler');
    expect(editionItemIds(e)).not.toContain('possessive');
    expect(muteMatcher(words)({ title: 'Lakeside homes', summary: '' })).toBe(false);
  });
});

describe('spoiler mode on the page', () => {
  const base = {
    edition: fx.edition,
    items: new Map(fx.items.map((i) => [i.id, i])),
    feeds: fx.feeds,
    states: fx.states,
    settings: fx.settings,
    lastVisitAt: fx.lastVisitAt,
    now: fx.NOW,
    online: true,
    scores: fx.scores,
  };

  it('hides the scores box, and offers the switch only to readers who follow teams', () => {
    const off = buildFrontPage(base);
    expect(off.scores.length).toBeGreaterThan(0);
    expect(off.spoilers).toEqual({ available: true, on: false });
    const on = buildFrontPage({ ...base, settings: { ...fx.settings, spoilerMode: true } });
    expect(on.scores).toEqual([]);
    expect(on.spoilers).toEqual({ available: true, on: true });
    expect(
      buildFrontPage({ ...base, settings: { ...fx.settings, teams: [] } }).spoilers.available,
    ).toBe(false);
  });
});

describe('settings', () => {
  it('stores spoiler mode and team nicknames', () => {
    expect(normalizeSettings({}).spoilerMode).toBe(false);
    expect(normalizeSettings({ spoilerMode: true }).spoilerMode).toBe(true);
    expect(normalizeSettings({ spoilerMode: 'yes' }).spoilerMode).toBe(false);
    expect(normalizeSettings({ teams: [lakers] }).teams[0]!.nickname).toBe('Lakers');
  });

  it('takes the nickname from ESPN when following a team', () => {
    const json = {
      sports: [
        {
          leagues: [
            {
              teams: [
                {
                  team: {
                    id: '13',
                    displayName: 'Los Angeles Lakers',
                    shortDisplayName: 'Lakers',
                    abbreviation: 'LAL',
                  },
                },
              ],
            },
          ],
        },
      ],
    };
    expect(parseTeams(json, 'basketball/nba')[0]).toEqual(lakers);
  });
});
