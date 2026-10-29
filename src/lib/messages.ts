import type { DiscoveredFeed } from './feed/discover';
import type { RefreshReport } from './engine/refresh';
import type { SportsTeam, Ticker, WeatherPlace } from './types';

/** Requests to the background service worker. */
export type Request =
  | { type: 'refresh'; force?: boolean }
  | { type: 'discover'; url: string }
  | { type: 'geocode'; query: string }
  | { type: 'quote'; symbol: string }
  | { type: 'teams'; league: string }
  /**
   * Sets the right-click items for what's under the pointer: saved or not (null: not a story),
   * and whether it can be hidden (a story on the page, not in Clippings).
   */
  | { type: 'story-menu'; saved: boolean | null; hideable: boolean }
  | { type: 'compose' };

export type Response<R extends Request> = R extends { type: 'refresh' }
  ? RefreshReport | null
  : R extends { type: 'discover' }
    ? { feeds: DiscoveredFeed[] } | { error: string }
    : R extends { type: 'geocode' }
      ? { places: WeatherPlace[] } | { error: string }
      : R extends { type: 'quote' }
        ? { ticker: Ticker | null } | { error: string }
        : R extends { type: 'teams' }
          ? { teams: SportsTeam[] } | { error: string }
          : R extends { type: 'compose' }
            ? { editionId: string | null }
            : never;

/** From the background to the tab whose right-click menu item was chosen. */
export type TabMessage = { type: 'story-menu-choice'; item: 'clip' | 'hide'; url: string };

/** Broadcasts from the background to open pages. */
export type Broadcast =
  | { type: 'edition-updated'; editionId: string; number: number }
  | { type: 'refresh-state'; running: boolean };
