// Pure edits to the feed list and section order, used by the settings page. Every function
// returns new arrays; `order` is renumbered so feeds sort by (section, position).
import { feedIdFor } from './hash';
import type { Feed } from './types';

/** Sections in display order: the saved order, then any category only feeds mention. */
export function sectionList(saved: string[], feeds: Feed[]): string[] {
  const out = saved.filter((s, i) => s && saved.indexOf(s) === i);
  for (const f of [...feeds].sort((a, b) => a.order - b.order)) {
    if (!out.includes(f.category)) out.push(f.category);
  }
  return out;
}

export function feedsIn(feeds: Feed[], section: string): Feed[] {
  return feeds.filter((f) => f.category === section).sort((a, b) => a.order - b.order);
}

/** Renumber `order` by section, then current order. */
export function renumber(feeds: Feed[], sections: string[]): Feed[] {
  const rank = (f: Feed) => {
    const i = sections.indexOf(f.category);
    return i === -1 ? sections.length : i;
  };
  return [...feeds]
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
    .map((f, order) => (f.order === order ? f : { ...f, order }));
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

/** Move a feed into `section` at `index` (position among that section's feeds). */
export function moveFeed(
  feeds: Feed[],
  sections: string[],
  id: string,
  section: string,
  index: number,
): Feed[] {
  const feed = feeds.find((f) => f.id === id);
  if (!feed) return feeds;
  const all = sectionList(sections.includes(section) ? sections : [...sections, section], feeds);
  const ordered: Feed[] = [];
  for (const s of all) {
    const list = feedsIn(feeds, s).filter((f) => f.id !== id);
    if (s === section) {
      list.splice(Math.max(0, Math.min(index, list.length)), 0, { ...feed, category: section });
    }
    ordered.push(...list);
  }
  return ordered.map((f, order) => (f.order === order ? f : { ...f, order }));
}

export function renameSection(
  feeds: Feed[],
  sections: string[],
  from: string,
  to: string,
): { feeds: Feed[]; sections: string[] } {
  const name = to.trim();
  if (!name || name === from) return { feeds, sections };
  const merged = sections.includes(name);
  return {
    feeds: feeds.map((f) => (f.category === from ? { ...f, category: name } : f)),
    sections: merged
      ? sections.filter((s) => s !== from)
      : sections.map((s) => (s === from ? name : s)),
  };
}

/** Feeds whose stored value differs (by id) between two lists. */
export function changedFeeds(before: Feed[], after: Feed[]): Feed[] {
  const old = new Map(before.map((f) => [f.id, f]));
  return after.filter((f) => {
    const o = old.get(f.id);
    return (
      !o ||
      o.url !== f.url ||
      o.title !== f.title ||
      o.category !== f.category ||
      o.order !== f.order ||
      o.siteUrl !== f.siteUrl
    );
  });
}

export function makeFeed(
  d: { url: string; title: string; siteUrl: string },
  category: string,
  order: number,
): Feed {
  return {
    id: feedIdFor(d.url),
    url: d.url,
    siteUrl: d.siteUrl,
    title: d.title.trim().slice(0, 80) || new URL(d.url).hostname,
    category,
    order,
  };
}

/** Host-permission patterns no feed needs any more (to release after edits). */
export function unusedOrigins(granted: string[], feeds: Feed[]): string[] {
  const used = new Set(feeds.map((f) => `${new URL(f.url).origin}/*`));
  return granted.filter((o) => /^https?:\/\//.test(o) && !used.has(o));
}
