// Loads .output/edge-mv3 into a throwaway headless Edge profile, opens a new tab and prints
// what it shows. Usage: node scripts/smoke-edge.mjs
import { launchEdge, waitForTarget, sleep } from './edge.mjs';

const browser = await launchEdge({ extensionDir: '.output/edge-mv3' });
try {
  const sw = await waitForTarget(
    browser,
    (t) =>
      t.type === 'service_worker' &&
      t.url.startsWith('chrome-extension://') &&
      t.url.endsWith('/background.js'),
  );
  const extId = new URL(sw.url).host;
  console.log(`service worker: ${sw.url}`);

  const page = await browser.newPage('edge://newtab/');
  await sleep(1500);
  const href = await page.eval('location.href');
  const text = await page.eval('document.body.innerText.slice(0, 300)');
  console.log(`new tab url:    ${href}`);
  console.log(`new tab text:   ${JSON.stringify(text)}`);
  if (!href.startsWith(`chrome-extension://${extId}/newtab.html`)) {
    throw new Error('new tab is not overridden by the extension');
  }
  page.close();
  console.log('OK');
} finally {
  await browser.close();
}
