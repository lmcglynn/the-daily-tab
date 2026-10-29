import { keyAction, step } from '@/ui/keys';

const el = (tagName: string, extra: Record<string, unknown> = {}) => {
  const node = Object.create(Element.prototype) as Element;
  Object.defineProperty(node, 'tagName', { value: tagName });
  for (const [k, v] of Object.entries(extra)) Object.defineProperty(node, k, { value: v });
  return node;
};

// Vitest runs in Node: provide a minimal Element for instanceof checks.
beforeAll(() => {
  if (typeof globalThis.Element === 'undefined') {
    (globalThis as { Element?: unknown }).Element = class {};
  }
});

const press = (key: string, target: EventTarget | null = null, mods: Partial<KeyboardEvent> = {}) =>
  keyAction({
    key,
    target,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    defaultPrevented: false,
    ...mods,
  });

describe('keyAction', () => {
  it('maps j/k/o/s/r/n', () => {
    expect(press('j')).toBe('next');
    expect(press('k')).toBe('prev');
    expect(press('o')).toBe('open');
    expect(press('s')).toBe('save');
    expect(press('h')).toBe('hide');
    expect(press('r')).toBe('refresh');
    expect(press('n')).toBe('new');
    expect(press('x')).toBeNull();
  });

  it('ignores keys while typing or with modifiers', () => {
    expect(press('j', el('INPUT'))).toBeNull();
    expect(press('j', el('TEXTAREA'))).toBeNull();
    expect(press('j', el('DIV', { isContentEditable: true }))).toBeNull();
    expect(press('r', null, { ctrlKey: true })).toBeNull();
    expect(press('n', null, { defaultPrevented: true })).toBeNull();
  });

  it('leaves Enter to links and buttons, opens the current story elsewhere', () => {
    expect(press('Enter', el('A'))).toBeNull();
    expect(press('Enter', el('BUTTON'))).toBeNull();
    expect(press('Enter', el('BODY'))).toBe('open');
    expect(press('o', el('A'))).toBe('open');
  });
});

describe('step', () => {
  it('starts at the first (or last) story and clamps at the ends', () => {
    expect(step(-1, 5, 1)).toBe(0);
    expect(step(-1, 5, -1)).toBe(4);
    expect(step(2, 5, 1)).toBe(3);
    expect(step(4, 5, 1)).toBe(4);
    expect(step(0, 5, -1)).toBe(0);
    expect(step(-1, 0, 1)).toBe(-1);
  });
});
