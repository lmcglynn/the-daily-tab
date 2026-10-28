import type { Settings } from './types';

export const DEFAULT_SPOT = '#A4161A';

export const DEFAULT_SETTINGS: Settings = {
  paperName: 'The Daily Tab',
  refreshMinutes: 15,
  theme: 'system',
  photos: 'ink',
  spotColor: DEFAULT_SPOT,
  pinnedLinks: [],
  installedAt: 0,
  sections: ['World', 'Tech', 'Science'],
};
