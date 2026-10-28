// Budgets: new-tab JS < 100 KB gzipped (excluding fonts); fonts < 300 KB total.
// Usage: npm run build:edge && npm run size
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';

const OUT = '.output/edge-mv3';
const JS_BUDGET = 100 * 1024;
const FONT_BUDGET = 300 * 1024;

const html = readFileSync(join(OUT, 'newtab.html'), 'utf8');
const refs = [
  ...html.matchAll(/<script[^>]+src="([^"]+)"/g),
  ...html.matchAll(/<link[^>]+rel="modulepreload"[^>]+href="([^"]+)"/g),
].map((m) => m[1].replace(/^\//, ''));

// Follow static imports so chunks loaded by the entry are counted too.
const seen = new Set();
const queue = [...refs];
while (queue.length) {
  const rel = queue.shift();
  if (seen.has(rel)) continue;
  seen.add(rel);
  const src = readFileSync(join(OUT, rel), 'utf8');
  for (const m of src.matchAll(/(?:import|from)\s*["']\.?\/?([^"']+\.js)["']/g)) {
    const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : '';
    const target = m[1].startsWith('chunks/') ? m[1] : dir + m[1];
    queue.push(target.replace(/^\.\//, ''));
  }
}

// Heavy modules that must stay off the new tab's critical path (see CLAUDE.md): the feed
// parser belongs to the background, Dexie is imported lazily.
const FORBIDDEN = [
  ['fast-xml-parser', /XMLParser|tagValueProcessor/],
  ['Dexie', /Dexie\.version|DexieError/],
];
let leaked = false;

let js = 0;
for (const rel of seen) {
  const src = readFileSync(join(OUT, rel));
  const gz = gzipSync(src).length;
  js += gz;
  console.log(`  ${rel.padEnd(40)} ${(gz / 1024).toFixed(1).padStart(6)} KB gz`);
  for (const [name, re] of FORBIDDEN) {
    if (re.test(src.toString('utf8'))) {
      console.log(`  ! ${name} is on the new tab's critical path (in ${rel})`);
      leaked = true;
    }
  }
}
if (leaked) process.exitCode = 1;

const fontDir = join(OUT, 'assets');
const fonts = readdirSync(fontDir).filter((f) => f.endsWith('.woff2'));
const fontBytes = fonts.reduce((sum, f) => sum + statSync(join(fontDir, f)).size, 0);

const line = (label, bytes, budget) =>
  `${label.padEnd(22)} ${(bytes / 1024).toFixed(1).padStart(6)} KB / ${budget / 1024} KB ${
    bytes <= budget ? 'OK' : 'OVER'
  }`;
console.log(line('new-tab JS (gzipped)', js, JS_BUDGET));
console.log(line(`fonts (${fonts.length} woff2)`, fontBytes, FONT_BUDGET));
if (js > JS_BUDGET || fontBytes > FONT_BUDGET) process.exitCode = 1;
