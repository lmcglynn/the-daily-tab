// Spoiler mode: while it's on, the scores box is hidden and stories naming the reader's teams, or
// the teams they're playing or just played, are left off the page like muted topics.
import { cleanMutedWords } from './mute';
import type { Game, ScoreReport, Settings, SportsTeam } from './types';

/** A finished game's opponent stays a spoiler this long after the start (game plus a day). */
const RECENT_MS = 27 * 60 * 60 * 1000;

/** "Lakers" for the Los Angeles Lakers: stored when followed, else from a game, else the last word. */
function nickname(team: SportsTeam, games: Game[]): string {
  if (team.nickname) return team.nickname;
  const side = games.flatMap((g) => [g.home, g.away]).find((s) => s.id === team.id);
  return side?.name || team.name.split(' ').at(-1) || team.name;
}

/** Names that give a result away: each team (full name and nickname) and its recent opponents. */
export function spoilerWords(
  teams: SportsTeam[],
  scores: Record<string, ScoreReport | undefined>,
  now: number,
): string[] {
  const words: string[] = [];
  for (const team of teams) {
    const report = scores[`${team.league}:${team.id}`];
    const games = [report?.current, report?.last].filter((g): g is Game => !!g);
    words.push(team.name, nickname(team, games));
    for (const g of games) {
      const recent = g.state === 'in' || (g.state === 'post' && now - g.date <= RECENT_MS);
      if (!recent) continue;
      const other = g.home.id === team.id ? g.away : g.home;
      if (other.name) words.push(other.name);
    }
  }
  return cleanMutedWords(words);
}

/** Muted topics, plus the spoiler words while spoiler mode is on. */
export function blockedWords(
  settings: Pick<Settings, 'mutedWords' | 'spoilerMode' | 'teams'>,
  scores: Record<string, ScoreReport | undefined>,
  now: number,
): string[] {
  if (!settings.spoilerMode || settings.teams.length === 0) return settings.mutedWords;
  // Not capped like the reader's own list: every spoiler word must count.
  return [...settings.mutedWords, ...spoilerWords(settings.teams, scores, now)];
}
