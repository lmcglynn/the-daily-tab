import type { PinnedLink, Settings } from './types';

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

/**
 * Arrays can come back from chrome.storage as {"0": …, "1": …}: Chrome's serializer does not
 * treat a Proxy (e.g. Svelte $state) as an array. Accept either shape.
 */
function asArray(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (keys.every((k) => /^\d+$/.test(k))) {
      return keys.sort((a, b) => +a - +b).map((k) => (v as Record<string, unknown>)[k]);
    }
  }
  return null;
}

/** Settings as stored (possibly old, partial or malformed) → a complete, well-typed object. */
export function normalizeSettings(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_SETTINGS;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  const sections = asArray(r.sections)?.filter(
    (s, i, all): s is string => typeof s === 'string' && s.trim() !== '' && all.indexOf(s) === i,
  );
  const pinned = asArray(r.pinnedLinks)
    ?.filter(
      (p): p is PinnedLink =>
        !!p &&
        typeof (p as PinnedLink).title === 'string' &&
        typeof (p as PinnedLink).url === 'string',
    )
    .map((p) => ({ title: p.title, url: p.url }));
  const minutes = Number(r.refreshMinutes);
  return {
    paperName: str(r.paperName, d.paperName).trim() || d.paperName,
    refreshMinutes: Number.isFinite(minutes) && minutes >= 1 ? minutes : d.refreshMinutes,
    theme: r.theme === 'day' || r.theme === 'night' || r.theme === 'system' ? r.theme : d.theme,
    photos: r.photos === 'ink' || r.photos === 'color' ? r.photos : d.photos,
    spotColor: /^#[0-9a-f]{6}$/i.test(str(r.spotColor, '')) ? (r.spotColor as string) : d.spotColor,
    pinnedLinks: pinned ?? d.pinnedLinks,
    installedAt: typeof r.installedAt === 'number' ? r.installedAt : d.installedAt,
    sections: sections ?? d.sections,
  };
}
