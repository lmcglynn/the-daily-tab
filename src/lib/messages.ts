import type { DiscoveredFeed } from './feed/discover';
import type { RefreshReport } from './engine/refresh';

/** Requests to the background service worker. */
export type Request =
  { type: 'refresh'; force?: boolean } | { type: 'discover'; url: string } | { type: 'compose' };

export type Response<R extends Request> = R extends { type: 'refresh' }
  ? RefreshReport | null
  : R extends { type: 'discover' }
    ? { feeds: DiscoveredFeed[] } | { error: string }
    : R extends { type: 'compose' }
      ? { editionId: string | null }
      : never;

/** Broadcasts from the background to open pages. */
export type Broadcast =
  | { type: 'edition-updated'; editionId: string; number: number }
  | { type: 'refresh-state'; running: boolean };
