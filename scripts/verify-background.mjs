// Milestone 1 check: with no extension page open, the service worker refreshes the starter
// feeds and composes an edition, on install and again on the refresh alarm.
// Uses the e2e build (starter origins pre-granted; headless Edge can't answer the prompt).
// Usage: npm run verify:background
import { findExtensionWorker, launchEdge, sleep } from './edge.mjs';

const browser = await launchEdge({ extensionDir: '.output/edge-mv3-e2e' });
try {
  const { session: sw, extId } = await findExtensionWorker(browser);

  const dbSummary = () =>
    sw.eval(`new Promise((resolve, reject) => {
      const req = indexedDB.open('daily-tab');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(['items', 'editions', 'feedState'], 'readonly');
        const out = {};
        const count = (name) => new Promise((r) => { const c = tx.objectStore(name).count(); c.onsuccess = () => r(c.result); });
        const all = (name) => new Promise((r) => { const c = tx.objectStore(name).getAll(); c.onsuccess = () => r(c.result); });
        Promise.all([count('items'), all('editions'), all('feedState')]).then(([items, editions, states]) => {
          resolve({
            items,
            editions: editions.map((e) => ({ number: e.number, lead: e.leadItemId, sections: e.sections.map((s) => s.category + ':' + s.itemIds.length).join(' '), brief: e.briefItemIds.length })),
            states: states.map((s) => s.status + (s.lastError ? ' (' + s.lastError + ')' : '')),
          });
        });
      };
    })`);

  const feeds = await sw.eval(
    `chrome.storage.sync.get(null).then((all) => Object.keys(all).filter((k) => k.startsWith('feed:')).length)`,
  );
  const alarm = await sw.eval(`chrome.alarms.get('refresh')`);
  const access = await sw.eval(
    `chrome.permissions.contains({ origins: ['https://feeds.bbci.co.uk/*'] })`,
  );
  console.log(
    `seeded feeds: ${feeds}; alarm: every ${alarm?.periodInMinutes} min; host access: ${access}`,
  );
  const openExtPages = (await browser.targets()).filter(
    (t) => t.type === 'page' && t.url.startsWith(`chrome-extension://${extId}`),
  ).length;
  console.log(`extension pages open: ${openExtPages}`);

  // onInstalled → refresh in the background.
  let summary;
  for (let i = 0; i < 60; i++) {
    await sleep(500);
    summary = await dbSummary();
    if (summary.editions.length > 0) break;
  }
  console.log('after install:', JSON.stringify(summary));

  // Alarm path: fire the refresh alarm soon and check the worker handles it.
  const lastFetched = () =>
    sw.eval(`new Promise((resolve) => {
      const req = indexedDB.open('daily-tab');
      req.onsuccess = () => {
        const db = req.result;
        const g = db.transaction('feedState').objectStore('feedState').getAll();
        g.onsuccess = () => {
          db.close();
          const done = g.result.filter((s) => s.lastFetchedAt).length;
          resolve({ max: Math.max(0, ...g.result.map((s) => s.lastFetchedAt || 0)), done });
        };
      };
    })`);
  // Seeding on install also schedules a (cheap, conditional) refresh ~1.5 s later, and a slow
  // feed can hold a refresh open until its 15 s timeout. An alarm during a running refresh
  // joins it rather than starting another, so wait until every feed has a result and things
  // have been quiet for 3 s.
  for (let quiet = 0, last = await lastFetched(); quiet < 6 || last.done < feeds;) {
    await sleep(500);
    const now = await lastFetched();
    quiet = now.max === last.max ? quiet + 1 : 0;
    last = now;
  }
  const before = (await dbSummary()).editions.length;
  await sw.eval(`chrome.alarms.create('refresh', { when: Date.now() + 1000 })`);
  const t0 = (await lastFetched()).max;
  let t1 = t0;
  for (let i = 0; i < 40 && t1 <= t0; i++) {
    await sleep(500);
    t1 = (await lastFetched()).max;
  }
  console.log(
    `alarm refresh ran: ${t1 > t0} (editions ${before} → ${(await dbSummary()).editions.length}; unchanged layout is not re-published)`,
  );
  sw.close();
  if (!summary?.editions.length || t1 <= t0) process.exitCode = 1;
  else console.log('OK');
} finally {
  await browser.close();
}
