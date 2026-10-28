// Front-page keyboard shortcuts. Edge leaves focus in the address bar on a new tab, so these work
// once the page has focus (a click, or Tab from the address bar); nothing relies on autofocus.

export type KeyAction = 'next' | 'prev' | 'open' | 'refresh' | 'new';

interface KeyLike {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

const isTyping = (t: Element | null) =>
  !!t && ((t as HTMLElement).isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

const isControl = (t: Element | null) => !!t && /^(A|BUTTON|SUMMARY)$/.test(t.tagName);

export function keyAction(e: KeyLike): KeyAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return null;
  const target = e.target instanceof Element ? e.target : null;
  if (isTyping(target)) return null;
  switch (e.key) {
    case 'j':
      return 'next';
    case 'k':
      return 'prev';
    case 'o':
      return 'open';
    // On a link or button Enter already activates it; elsewhere it opens the current story.
    case 'Enter':
      return isControl(target) ? null : 'open';
    case 'r':
      return 'refresh';
    case 'n':
      return 'new';
    default:
      return null;
  }
}

/** Next index when stepping through `count` stories from `current` (-1 = none yet). */
export function step(current: number, count: number, dir: 1 | -1): number {
  if (count === 0) return -1;
  if (current < 0) return dir === 1 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + dir));
}
