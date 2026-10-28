// Text colors must reach 4.5:1 on both papers, including where the grain darkens (day) or
// lightens (night) the paper most.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', 'src', 'styles', 'tokens.css'), 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/--([\w-]+):\s*(?:var\(--[\w-]+,\s*)?(#[0-9a-f]{6})/gi)].map((m) => [
      m[1]!,
      m[2]!,
    ]),
  );
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const ratio = (a: number[], b: number[]) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1! + 0.05) / (l2! + 0.05);
};
/** Paper under the strongest grain speck: 4% black (day) or 3% white (night). */
const grained = (paper: number[], toward: number, amount: number) =>
  paper.map((v) => v * (1 - amount) + toward * amount);

const day = block(':root');
const night = block(":root[data-theme='night']");

describe.each([
  ['day', day, grained(rgb(day.paper!), 0, 0.04)],
  ['night', night, grained(rgb(night.paper!), 1, 0.03)],
])('%s edition', (_name, tokens, worstPaper) => {
  it.each(['ink', 'ink-2', 'ink-muted', 'spot'])('%s ≥ 4.5:1 on paper and grain', (token) => {
    const fg = rgb(tokens[token]!);
    expect(ratio(fg, rgb(tokens.paper!))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(fg, worstPaper)).toBeGreaterThanOrEqual(4.5);
  });
});

it('night tokens match between the explicit and the system-dark blocks', () => {
  const sys = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
  for (const [k, v] of Object.entries(night)) {
    if (k === 'grain') continue;
    expect(sys).toContain(`--${k}: ${k === 'spot' ? `var(--spot-night, ${v})` : v}`);
  }
});
