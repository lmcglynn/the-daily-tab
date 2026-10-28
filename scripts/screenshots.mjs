// Captures the fixture front page (built into .preview-dist) with headless Edge.
// Usage: npm run screenshots  [-- --only=day-1440]
import { createServer } from 'node:http';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { launchEdge, sleep } from './edge.mjs';

const DIST = resolve('.preview-dist');
const OUT = resolve('screenshots');
const PORT = 5299;
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);
/** --fold: capture just the first screen (for close inspection) into screenshots/fold-*.png */
const fold = process.argv.includes('--fold');
/** --clip=<selector>: capture just that element at 2x into screenshots/clip-*.png */
const clipSel = process.argv.find((a) => a.startsWith('--clip='))?.slice(7);

const SHOTS = [];
for (const theme of ['day', 'night']) {
  for (const width of [1440, 1024, 390]) SHOTS.push({ name: `${theme}-${width}`, theme, width });
}
SHOTS.push({ name: 'state-firstrun-1440', theme: 'day', width: 1440, state: 'firstrun' });
SHOTS.push({ name: 'state-offline-1440', theme: 'day', width: 1440, state: 'offline' });
SHOTS.push({ name: 'state-color-night-1440', theme: 'night', width: 1440, photos: 'color' });

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = join(DIST, path === '/' ? 'index.html' : path);
  if (!file.startsWith(DIST) || !existsSync(file)) {
    res.writeHead(404).end();
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}).listen(PORT);

mkdirSync(OUT, { recursive: true });
const browser = await launchEdge({ port: 9334 });
try {
  for (const shot of SHOTS.filter((s) => !only || s.name === only)) {
    const page = await browser.newPage();
    const mobile = shot.width < 600;
    const scale = mobile ? 2 : 1;
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height: mobile ? 844 : 900,
      deviceScaleFactor: scale,
      mobile,
    });
    const q = new URLSearchParams({
      theme: shot.theme,
      photos: shot.photos ?? 'ink',
      state: shot.state ?? 'normal',
      toolbar: '0',
    });
    await page.navigate(`http://127.0.0.1:${PORT}/?${q}`);
    // Fonts, then every image either loaded or failed (lazy ones are forced eager).
    await page.eval(`(async () => {
      document.querySelectorAll('img[loading=lazy]').forEach((i) => (i.loading = 'eager'));
      await document.fonts.ready;
      await Promise.all([...document.images].map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 8000); })));
    })()`);
    await sleep(300);
    const height = fold
      ? mobile
        ? 844
        : 900
      : await page.eval('Math.ceil(document.documentElement.scrollHeight)');
    await page.send('Emulation.setDeviceMetricsOverride', {
      width: shot.width,
      height,
      deviceScaleFactor: scale,
      mobile,
    });
    await sleep(200);
    const clip = clipSel
      ? await page.eval(
          `(() => { const r = document.querySelector(${JSON.stringify(clipSel)})?.getBoundingClientRect(); return r && { x: r.x - 12, y: r.y + scrollY - 12, width: r.width + 24, height: r.height + 24, scale: 2 }; })()`,
        )
      : null;
    const { data } = await page.send('Page.captureScreenshot', {
      format: 'png',
      ...(clip && { clip, captureBeyondViewport: true }),
    });
    const prefix = clip ? 'clip-' : fold ? 'fold-' : '';
    const file = join(OUT, `${prefix}${shot.name}.png`);
    writeFileSync(file, Buffer.from(data, 'base64'));
    console.log(`${shot.name}: ${shot.width}×${height} → ${file}`);
    page.close();
  }
} finally {
  await browser.close();
  server.close();
}
