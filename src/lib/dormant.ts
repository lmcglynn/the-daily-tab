import type { FeedState } from './types';

/** A feed that answers but has published nothing for this long is flagged in Settings. */
export const QUIET_AFTER_MS = 14 * 24 * 60 * 60 * 1000;

/** When a working feed last published, if that was more than two weeks ago; else null. */
export function quietSince(state: FeedState | undefined, now: number): number | null {
  if (state?.status !== 'ok' || state.latestItemAt === undefined) return null;
  return now - state.latestItemAt > QUIET_AFTER_MS ? state.latestItemAt : null;
}
