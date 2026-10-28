/** A subscribed feed. Stored in chrome.storage.sync, one key per feed (`feed:<id>`). */
export interface Feed {
  id: string;
  url: string;
  siteUrl: string;
  title: string;
  category: string;
  order: number;
}

export type FeedStatus = 'pending' | 'ok' | 'error' | 'no-permission';

/** Per-feed fetch bookkeeping. Changes on every refresh, so it lives in IndexedDB, not sync. */
export interface FeedState {
  feedId: string;
  status: FeedStatus;
  etag?: string;
  lastModified?: string;
  lastFetchedAt?: number;
  lastSuccessAt?: number;
  lastError?: string;
  lastErrorAt?: number;
  failCount: number;
  /** Backoff: don't fetch again before this time. */
  nextFetchAt?: number;
}

export interface Item {
  /** hash(feedId + guid|link) */
  id: string;
  feedId: string;
  title: string;
  link: string;
  /** Plain text, ≤ ~300 chars. Never HTML. */
  summary: string;
  imageUrl?: string;
  author?: string;
  publishedAt: number;
  /** First time this item was seen. */
  fetchedAt: number;
  readAt?: number;
  /** Shared by items that are the same story across feeds. */
  storyId?: string;
}

export interface EditionSection {
  category: string;
  itemIds: string[];
}

export interface Edition {
  id: string;
  number: number;
  composedAt: number;
  leadItemId: string;
  /** Same-story items from other feeds ("Also: NPR, Guardian"). */
  leadRelatedItemIds: string[];
  secondaryItemIds: string[];
  sections: EditionSection[];
  briefItemIds: string[];
}

export type Theme = 'system' | 'day' | 'night';
export type PhotoStyle = 'ink' | 'color';

export interface PinnedLink {
  title: string;
  url: string;
}

export interface Settings {
  paperName: string;
  refreshMinutes: number;
  theme: Theme;
  photos: PhotoStyle;
  /** Day spot color; the night tint is derived unless this is the default. */
  spotColor: string;
  pinnedLinks: PinnedLink[];
  installedAt: number;
  /** Section (category) order, used for the index, bands and "top section". */
  sections: string[];
}
