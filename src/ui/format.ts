const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** "9:42" and "a.m." separately, so the ear can set the meridiem small. */
export function clockParts(t: number): { time: string; meridiem: string } {
  const d = new Date(t);
  const h = d.getHours();
  return {
    time: `${h % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')}`,
    meridiem: h < 12 ? 'a.m.' : 'p.m.',
  };
}

export const clock = (t: number) => clockParts(t).time;

export function dateLine(t: number): string {
  return new Date(t).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

/** "Dec 13, 2025" */
export function shortDate(t: number): string {
  return new Date(t).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function editionName(t: number): string {
  const h = new Date(t).getHours();
  if (h >= 5 && h < 12) return 'Morning Edition';
  if (h >= 12 && h < 17) return 'Afternoon Edition';
  if (h >= 17 && h < 22) return 'Evening Edition';
  return 'Late Edition';
}

const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Issue number: days since install, counting the install day as No. 1. */
export function issueNumber(installedAt: number, now: number): number {
  if (!installedAt || installedAt > now) return 1;
  return Math.round((startOfDay(now) - startOfDay(installedAt)) / DAY) + 1;
}

/** Compact age for bylines: "now", "12m", "3h", "Yesterday", "Mon", "Oct 21". */
export function ago(t: number, now: number): string {
  const diff = Math.max(0, now - t);
  if (diff < MIN) return 'now';
  if (diff < HOUR) return `${Math.floor(diff / MIN)}m`;
  if (diff < 12 * HOUR || startOfDay(t) === startOfDay(now)) return `${Math.floor(diff / HOUR)}h`;
  if (startOfDay(t) === startOfDay(now) - DAY) return 'Yesterday';
  const d = new Date(t);
  if (diff < 6 * DAY) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const flat = (s: string) => s.replace(/\s*\n\s*/g, ' ').trim();

/**
 * Split a summary into a deck and the remaining body. A first paragraph (a standfirst) of
 * reasonable length is the deck; otherwise the first sentence, which must be long enough that
 * "U.S." or "Dr." don't end it.
 */
export function splitDeck(summary: string): { deck: string; body: string } {
  const nl = summary.indexOf('\n');
  if (nl >= 20 && nl <= 300) {
    return { deck: summary.slice(0, nl).trim(), body: flat(summary.slice(nl + 1)) };
  }
  const text = flat(summary);
  const m = /^(.{40,240}?[.!?…][”’"')]?)\s+(?=[A-Z“‘"'(0-9])/.exec(text);
  if (m) return { deck: m[1]!.trim(), body: text.slice(m[0].length).trim() };
  return { deck: text, body: '' };
}

export function shorten(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return (space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.\-–—]+$/, '') + '…';
}

export const anchorFor = (category: string) =>
  `section-${category.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
