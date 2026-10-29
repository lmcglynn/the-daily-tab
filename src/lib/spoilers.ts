// Spoiler mode: while it's on, the scores box is hidden and stories naming the reader's teams, or
// the teams they're playing or just played, are left off the page like muted topics.
import { cleanMutedWords } from './mute';
import { isRaceReport } from './types';
import type { Game, Settings, SportsReport, SportsTeam } from './types';

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
  scores: Record<string, SportsReport | undefined>,
  now: number,
): string[] {
  const words: string[] = [];
  for (const team of teams) {
    const report = scores[`${team.league}:${team.id}`];
    if (isRaceReport(report) || team.league === 'racing/f1') {
      // F1 stories always; for a day after a race, its name and every driver and team in it.
      words.push('Formula 1', 'Formula One', 'F1', 'Grand Prix');
      const race = isRaceReport(report) ? report.lastRace : null;
      if (race && now - race.date <= RECENT_MS) words.push(race.name, ...race.field);
      continue;
    }
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
  scores: Record<string, SportsReport | undefined>,
  now: number,
): string[] {
  if (!settings.spoilerMode || settings.teams.length === 0) return settings.mutedWords;
  // Not capped like the reader's own list: every spoiler word must count.
  return [...settings.mutedWords, ...spoilerWords(settings.teams, scores, now)];
}
