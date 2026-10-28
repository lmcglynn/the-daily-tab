import { DEFAULT_SPOT } from './defaults';
import type { Settings } from './types';

type Appearance = Pick<Settings, 'theme' | 'photos' | 'spotColor'>;

// Settings arrive asynchronously from storage.sync; a localStorage copy lets the page pick the
// right paper before the first paint instead of flashing the system theme.
const CACHE_KEY = 'daily-tab:appearance';

export function applyAppearance(a: Appearance, root = document.documentElement): void {
  if (a.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = a.theme;
  root.dataset.photos = a.photos;

  if (a.spotColor && a.spotColor.toLowerCase() !== DEFAULT_SPOT.toLowerCase()) {
    root.style.setProperty('--spot-day', a.spotColor);
    // Night paper needs a lighter tint of a custom spot color to stay legible.
    root.style.setProperty('--spot-night', `color-mix(in srgb, ${a.spotColor} 62%, #ffffff)`);
  } else {
    root.style.removeProperty('--spot-day');
    root.style.removeProperty('--spot-night');
  }

  try {
    const { theme, photos, spotColor } = a;
    localStorage.setItem(CACHE_KEY, JSON.stringify({ theme, photos, spotColor }));
  } catch {
    /* storage unavailable: the async settings still apply */
  }
}

export function applyCachedAppearance(): void {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) applyAppearance(JSON.parse(cached) as Appearance);
  } catch {
    /* ignore a corrupt cache */
  }
}
