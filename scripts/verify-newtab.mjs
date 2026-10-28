// Milestone 3 check against the e2e build in headless Edge:
// - first headlines render from cache in < 100 ms (median of 5 new tabs)
// - a newer edition shows the "New edition · N stories" button without reflowing; clicking shows it
// - opening a story marks it read (muted headline, readAt stored)
// - "More in …" expands a band
// - going offline switches the folio to "Edition of … · offline"
// - corrections list failed feeds
// Usage: npm run verify:newtab
import { findExtensionWorker, launchEdge, sleep } from './edge.mjs';

const failures = [];
const step = (msg) => console.log(`… ${msg}`);
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

/**
 * Expression that runs `body(db, done)` against the extension's IndexedDB. It never creates the
 * database (that would block Dexie's upgrade) and always closes its connection.
 */
const idb = (body) => `new Promise((resolve) => {
  indexedDB.databases().then((dbs) => {
    if (!dbs.some((d) => d.name === 'daily-tab')) return resolve(null);
    const q = indexedDB.open('daily-tab');
    q.onerror = () => resolve(null);
    q.onsuccess = () => {
      const db = q.result;
      const done = (v) => { db.close(); resolve(v); };
      try { (${body})(db, done); } catch (e) { done(null); }
    };
  });
})`;

const browser = await launchEdge({ extensionDir: '.output/edge-mv3-e2e', port: 9335 });
const watchdog = setTimeout(async () => {
  console.log('FAIL watchdog: gave up after 120 s');
  await browser.close();
  process.exit(2);
}, 120_000);

try {
  const { session: sw, extId } = await findExtensionWorker(browser);
  const newtab = `chrome-extension://${extId}/newtab.html`;

  step('waiting for the first edition from the install-time refresh');
  const editionCount = () =>
    sw.eval(
      idb(`(db, done) => {
        if (!db.objectStoreNames.contains('editions')) return done(0);
        const c = db.transaction('editions').objectStore('editions').count();
        c.onsuccess = () => done(c.result);
      }`),
    );
  for (let i = 0; i < 60 && !(await editionCount()); i++) await sleep(500);
  check((await editionCount()) > 0, 'background composed a first edition');

  step('timing first headlines from cache');
  const times = [];
  for (let i = 0; i < 5; i++) {
    const page = await browser.newPage();
    await page.navigate(newtab);
    let t;
    for (let j = 0; j < 40 && t === undefined; j++) {
      t = await page.eval(`performance.getEntriesByName('first-headlines')[0]?.startTime`);
      if (t === undefined) await sleep(50);
    }
    const headlines = await page.eval(`document.querySelectorAll('article h2, article h3').length`);
    const phases = await page.eval(`(() => {
      const m = (n) => performance.getEntriesByName(n)[0]?.startTime?.toFixed(0);
      const nav = performance.getEntriesByType('navigation')[0];
      return 'response ' + nav.responseEnd.toFixed(0) + ' · script ' + m('dt:script') + ' · data ' + m('dt:data') + ' · headlines ' + m('first-headlines');
    })()`);
    console.log(`     tab ${i + 1}: ${phases}`);
    times.push(t ?? Infinity);
    if (i === 0) check(headlines > 10, `front page shows ${headlines} headlines`);
    page.close();
  }
  times.sort((a, b) => a - b);
  const median = times[2];
  check(
    median < 100,
    `first headlines from cache: median ${median.toFixed(1)} ms (${times.map((t) => t.toFixed(0)).join(', ')})`,
  );

  const page = await browser.newPage();
  await page.navigate(newtab);
  await sleep(500);

  step('read state (middle-click, no navigation)');
  const readId = await page.eval(`(() => {
    const a = document.querySelector('.band .headline a');
    a.dispatchEvent(new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    return a.closest('article').dataset.story;
  })()`);
  await sleep(300);
  const readClass = await page.eval(
    `document.querySelector('[data-story="${readId}"]').classList.contains('read')`,
  );
  const readAt = await page.eval(
    idb(`(db, done) => {
      const g = db.transaction('items').objectStore('items').get(${JSON.stringify(readId)});
      g.onsuccess = () => done(g.result?.readAt);
    }`),
  );
  check(
    readClass && typeof readAt === 'number',
    'opening a story marks it read (view + IndexedDB)',
  );

  step('More in …');
  await page.eval(`document.querySelector('.jump button').click()`);
  await sleep(300);
  const moreCount = await page.eval(`document.querySelectorAll('.more li').length`);
  check(moreCount > 0, `"More in …" expands with ${moreCount} more stories`);

  step('new edition while the page is open');
  const scrollBefore = await page.eval(`(scrollTo(0, 400), scrollY)`);
  const titleBefore = await page.eval(`document.querySelector('.slot-lead h2').textContent`);
  await page.eval(`(async () => {
    const all = await chrome.storage.sync.get(null);
    const feed = Object.entries(all).find(([k, v]) => k.startsWith('feed:') && v.category === 'World')[1];
    const now = Date.now();
    await ${idb(`(db, done) => {
      const tx = db.transaction('items', 'readwrite');
      tx.objectStore('items').put({ id: 'verify-new', feedId: feed.id, title: 'Verification story arrives in a new edition', link: 'https://example.com/verify', summary: '', publishedAt: now, fetchedAt: now });
      tx.oncomplete = () => done(true);
    }`)};
    await chrome.runtime.sendMessage({ type: 'compose' });
  })()`);
  let button = null;
  for (let i = 0; i < 20 && !button; i++) {
    await sleep(150);
    button = await page.eval(
      `document.querySelector('.new-edition')?.textContent.trim().replace(/\\s+/g, ' ') ?? null`,
    );
  }
  const titleDuring = await page.eval(`document.querySelector('.slot-lead h2').textContent`);
  const scrollDuring = await page.eval('scrollY');
  check(!!button && /^New edition · \d+ stor(y|ies)$/.test(button), `button reads "${button}"`);
  check(
    titleDuring === titleBefore && scrollDuring === scrollBefore,
    'page did not reflow while the button waits',
  );
  await page.eval(`document.querySelector('.new-edition')?.click()`);
  await sleep(400);
  const shown = await page.eval(
    `document.body.innerText.includes('Verification story arrives in a new edition') && !document.querySelector('.new-edition')`,
  );
  check(shown, 'clicking the button shows the new edition');

  step('offline folio');
  await page.send('Network.enable');
  const network = (offline) =>
    page.send('Network.emulateNetworkConditions', {
      offline,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
  await network(true);
  await sleep(300);
  const folio = await page.eval(`document.querySelector('.folio').innerText.replace(/\\s+/g, ' ')`);
  check(/EDITION OF \d+:\d\d · OFFLINE/i.test(folio), `offline folio: "${folio}"`);
  await network(false);

  step('corrections box');
  await page.eval(
    idb(`(db, done) => {
      const tx = db.transaction('feedState', 'readwrite');
      const s = tx.objectStore('feedState');
      const g = s.getAll();
      g.onsuccess = () => s.put({ ...g.result[0], status: 'error', lastError: 'Could not be reached', lastErrorAt: Date.now() });
      tx.oncomplete = () => done(true);
    }`),
  );
  const page2 = await browser.newPage();
  await page2.navigate(newtab);
  await sleep(500);
  const corrections = await page2.eval(
    `(document.querySelector('.corrections')?.innerText ?? '').replace(/\\s+/g, ' ').trim()`,
  );
  check(/could not be reached at \d+:\d\d/i.test(corrections), `corrections box: "${corrections}"`);
  page2.close();
  page.close();
  sw.close();
} finally {
  clearTimeout(watchdog);
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else console.log('\nOK');
