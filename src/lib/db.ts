import Dexie, { type Table } from 'dexie';
import type { Edition, FeedState, Item } from './types';

export class DailyTabDB extends Dexie {
  items!: Table<Item, string>;
  editions!: Table<Edition, string>;
  feedState!: Table<FeedState, string>;

  constructor(name = 'daily-tab') {
    super(name);
    this.version(1).stores({
      items: 'id, feedId, publishedAt, [feedId+publishedAt], storyId',
      editions: 'id, composedAt',
      feedState: 'feedId',
    });
  }

  latestEdition(): Promise<Edition | undefined> {
    return this.editions.orderBy('composedAt').last();
  }
}

let shared: DailyTabDB | undefined;
export const getDB = () => (shared ??= new DailyTabDB());
