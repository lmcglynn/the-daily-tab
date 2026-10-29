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
  console.log('FAIL watchdog: gave up after 150 s');
  await browser.close();
  process.exit(2);
}, 150_000);

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
  const visible = [];
  let fontsLate = 0;
  const TABS = 7;
  const mark = (p, n) => p.eval(`performance.getEntriesByName('${n}')[0]?.startTime`);
  for (let i = 0; i < TABS; i++) {
    const page = await browser.newPage();
    await page.navigate(newtab);
    let t, v;
    for (let j = 0; j < 40 && v === undefined; j++) {
      [t, v] = [await mark(page, 'first-headlines'), await mark(page, 'dt:headlines-visible')];
      if (v === undefined) await sleep(50);
    }
    const headlines = await page.eval(`document.querySelectorAll('article h2, article h3').length`);
    const phases = await page.eval(`(() => {
      const m = (n) => performance.getEntriesByName(n)[0]?.startTime?.toFixed(0);
      const nav = performance.getEntriesByType('navigation')[0];
      return 'response ' + nav.responseEnd.toFixed(0) + ' · script ' + m('dt:script') + ' · data ' + m('dt:data') + ' · headlines ' + m('first-headlines') + ' · visible in final fonts ' + m('dt:headlines-visible');
    })()`);
    console.log(`     tab ${i + 1}: ${phases}`);
    if (await page.eval(`performance.getEntriesByName('dt:fonts-late').length > 0`)) fontsLate++;
    times.push(t ?? Infinity);
    visible.push(v ?? Infinity);
    if (i === 0) check(headlines > 10, `front page shows ${headlines} headlines`);
    page.close();
  }
  // Tab 1 is the cold start (fresh renderer, no code cache); the budget is about warm tabs.
  const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const warm = times.slice(1);
  const list = (a) => a.map((t) => t.toFixed(0)).join(', ');
  check(
    median(warm) < 100,
    `first headlines from cache: median ${median(warm).toFixed(1)} ms (${list(warm)})`,
  );
  console.log(
    `info visible in final fonts: median ${median(visible.slice(1)).toFixed(1)} ms; ` +
      `cold first tab: headlines ${times[0].toFixed(0)} ms, visible ${visible[0].toFixed(0)} ms`,
  );
  check(fontsLate === 0, `headline font ready at first paint in ${TABS - fontsLate}/${TABS} tabs`);

  const page = await browser.newPage();
  await page.send('Page.bringToFront');
  await page.navigate(newtab);
  await sleep(500);

  // Real key events, as typed on the page.
  const press = async (p, k) => {
    const vk = k === 'Enter' ? 13 : k.toUpperCase().charCodeAt(0);
    await p.send('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: k,
      code: k === 'Enter' ? 'Enter' : `Key${k.toUpperCase()}`,
      windowsVirtualKeyCode: vk,
      ...(k.length === 1 && { text: k }),
    });
    await p.send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, windowsVirtualKeyCode: vk });
  };
  const focusedStory = (p) =>
    p.eval(`document.activeElement?.closest('article')?.dataset.story ?? null`);

  step('accessibility structure');
  const a11y = await page.eval(`(() => {
    const q = (s) => document.querySelectorAll(s);
    const headlines = [...q('main .headline')];
    return {
      h1: q('h1').length,
      h1Label: q('h1')[0]?.getAttribute('aria-label'),
      leadH2: !!document.querySelector('.slot-lead article h2.headline'),
      otherH3: headlines.filter((h) => !h.closest('.slot-lead')).every((h) => h.tagName === 'H3'),
      allInArticles: headlines.every((h) => h.closest('article')),
      main: q('main').length,
      skip: document.querySelector('a.skip')?.getAttribute('href'),
      dotsHaveText: [...q('.dot')].every((d) => d.nextElementSibling?.classList.contains('visually-hidden')),
      liveRegion: !!document.querySelector('[role=status][aria-live=polite]'),
      imgAlt: [...q('main img')].every((i) => i.getAttribute('alt') === '' && i.closest('[aria-hidden=true]')),
      lang: document.documentElement.lang,
    };
  })()`);
  check(a11y.h1 === 1 && a11y.h1Label, `one h1 with a plain-text label ("${a11y.h1Label}")`);
  check(a11y.leadH2 && a11y.otherH3, 'lead headline is h2, all others h3');
  check(a11y.allInArticles, 'every story is an <article>');
  check(a11y.main === 1 && a11y.skip === '#front', 'single <main> with a skip link');
  check(a11y.dotsHaveText, '"new" dots carry screen-reader text');
  check(a11y.liveRegion, 'new-edition button sits in a polite live region');
  check(a11y.imgAlt && a11y.lang === 'en', 'decorative photos hidden from AT; lang="en"');

  step('keyboard: j / k');
  await press(page, 'j');
  const s1 = await focusedStory(page);
  await press(page, 'j');
  const s2 = await focusedStory(page);
  await press(page, 'k');
  const s3 = await focusedStory(page);
  const leadId = await page.eval(`document.querySelector('.slot-lead article').dataset.story`);
  check(
    s1 === leadId && s2 && s2 !== s1 && s3 === s1,
    'j moves to the lead, then on; k moves back',
  );
  const ring = await page.eval(
    `getComputedStyle(document.activeElement).outlineStyle + ' ' + document.activeElement.matches(':focus-visible')`,
  );
  check(ring === 'solid true', `focused story shows a focus ring (${ring})`);

  step('keyboard: r');
  await press(page, 'r');
  let updating = false;
  for (let i = 0; i < 10 && !updating; i++) {
    updating = await page.eval(
      `document.querySelector('.refresh')?.textContent.includes('Updating') ?? false`,
    );
    if (!updating) await sleep(50);
  }
  check(updating, 'r starts a refresh ("Updating…" in the folio)');
  for (let i = 0; i < 60; i++) {
    if (!(await page.eval(`document.querySelector('.refresh')?.disabled ?? false`))) break;
    await sleep(250);
  }

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
  await press(page, 'n');
  await sleep(400);
  const shown = await page.eval(
    `document.body.innerText.includes('Verification story arrives in a new edition') && !document.querySelector('.new-edition')`,
  );
  check(shown, 'n shows the new edition');

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

  step('keyboard: s saves the current story to Clippings (and again removes it)');
  await page2.send('Page.bringToFront');
  await press(page2, 'j');
  const savedId = await focusedStory(page2);
  await press(page2, 's');
  await sleep(300);
  const stored = async () =>
    ((await page2.eval(`chrome.storage.local.get('clippings')`)).clippings ?? []).map((c) => c.id);
  const clippingIds = (p) =>
    p.eval(`[...document.querySelectorAll('#clippings article')].map((a) => a.dataset.story)`);
  const pressed = await page2.eval(
    `document.querySelector('article[data-story="${savedId}"] .clip')?.getAttribute('aria-pressed')`,
  );
  check(
    (await stored()).includes(savedId) &&
      (await clippingIds(page2)).includes(savedId) &&
      pressed === 'true',
    `saved ${savedId}: stored, listed under Clippings, button pressed`,
  );
  const page3 = await browser.newPage();
  await page3.navigate(newtab);
  await sleep(600);
  const index = await page3.eval(`document.querySelector('.index')?.innerText ?? ''`);
  check(
    (await clippingIds(page3)).includes(savedId) && /clippings/i.test(index),
    'a new tab shows it, with Clippings in the index',
  );
  await page2.send('Page.bringToFront');
  await press(page2, 's');
  await sleep(400);
  check(
    (await stored()).length === 0 &&
      (await clippingIds(page2)).length === 0 &&
      (await clippingIds(page3)).length === 0,
    'pressing s again removes it, here and in the other open tab',
  );
  page3.close();

  step('right-click menu: "Save to Clippings" and "Hide this story"');
  // The items exist (update rejects for an unknown id).
  const menu = await sw.eval(
    `Promise.all(['clip', 'hide'].map((id) => chrome.contextMenus.update(id, {}))).then(() => 'ok', (e) => e.message)`,
  );
  check(menu === 'ok', `menu items created (${menu})`);
  // A real right-button press on a headline reaches the background without errors.
  const clipTarget = await page2.eval(`(() => {
    const a = document.querySelector('main article[data-story] .headline a');
    const r = a.getBoundingClientRect();
    return { x: r.x + 5, y: r.y + r.height / 2, href: a.href, id: a.closest('article').dataset.story };
  })()`);
  await page2.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: clipTarget.x,
    y: clipTarget.y,
    button: 'right',
    clickCount: 1,
  });
  await page2.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: clipTarget.x,
    y: clipTarget.y,
    button: 'right',
    clickCount: 1,
  });
  await page2.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  // Choosing the item: the background hands the link to the tab, as onClicked does.
  // Like onClicked: only to the tab whose menu was used (other open tabs follow via storage).
  const menuTabId = await page2.eval(`chrome.tabs.getCurrent().then((t) => t.id)`);
  const sendToTabs = (url, item = 'clip') =>
    sw.eval(
      `chrome.tabs.sendMessage(${menuTabId}, { type: 'story-menu-choice', item: ${JSON.stringify(item)}, url: ${JSON.stringify(url)} })`,
    );
  await sendToTabs(clipTarget.href);
  await sleep(300);
  check(
    (await stored()).includes(clipTarget.id),
    `menu choice saved the story under the pointer (${clipTarget.id})`,
  );
  await sendToTabs(clipTarget.href);
  await sleep(300);
  check(
    !(await stored()).includes(clipTarget.id),
    'choosing it again ("Remove from Clippings") removes it',
  );

  // Hide: the first story of the first band goes, and its spot is filled in place.
  const bandState = () =>
    page2.eval(`[...document.querySelectorAll('.band')].map((b) =>
      [...b.querySelectorAll('.band-cell article')].map((a) => ({ id: a.dataset.story, href: a.querySelector('.headline a').href })))`);
  const bandsBefore = await bandState();
  const victim = bandsBefore[0][0];
  await sendToTabs(victim.href, 'hide');
  let bandsAfter = bandsBefore;
  for (let i = 0; i < 20 && bandsAfter[0][0].id === victim.id; i++) {
    await sleep(150);
    bandsAfter = await bandState();
  }
  const hiddenIds = ((await page2.eval(`chrome.storage.local.get('hidden')`)).hidden ?? []).map(
    (h) => h.id,
  );
  const onPage = await page2.eval(`!!document.querySelector('article[data-story="${victim.id}"]')`);
  check(
    !onPage &&
      hiddenIds.includes(victim.id) &&
      bandsAfter[0].length === bandsBefore[0].length &&
      bandsAfter[0].slice(1).every((s, i) => s.id === bandsBefore[0][i + 1].id),
    `hid ${victim.id}: gone, stored, its spot filled by ${bandsAfter[0][0]?.id} (others unmoved)`,
  );
  const page4 = await browser.newPage();
  await page4.navigate(newtab);
  await sleep(600);
  const inNewTab = await page4.eval(
    `!!document.querySelector('article[data-story="${victim.id}"]')`,
  );
  const sameFill = await page4.eval(
    `document.querySelector('.band .band-cell article')?.dataset.story`,
  );
  check(
    !inNewTab && sameFill === bandsAfter[0][0].id,
    'a new tab opens on the same page, without the hidden story',
  );
  page4.close();

  // Undo puts it back where it was.
  const noticeText = await page2.eval(`document.querySelector('.notice-text')?.textContent ?? ''`);
  await page2.eval(`document.querySelector('.notice button').click()`);
  await sleep(300);
  const bandsUndone = await bandState();
  const hiddenAfterUndo = (
    (await page2.eval(`chrome.storage.local.get('hidden')`)).hidden ?? []
  ).map((h) => h.id);
  check(
    /^Hidden: “/.test(noticeText) &&
      bandsUndone[0][0].id === victim.id &&
      !hiddenAfterUndo.includes(victim.id),
    `Undo ("${noticeText}") puts it back in its spot`,
  );

  // h hides the focused story, with the same Undo.
  await page2.eval(`document.querySelector('.band .band-cell .headline a').focus()`);
  await press(page2, 'h');
  let afterH = bandsUndone;
  for (let i = 0; i < 20 && afterH[0][0].id === victim.id; i++) {
    await sleep(150);
    afterH = await bandState();
  }
  const noticeShown = await page2.eval(`!!document.querySelector('.notice')`);
  check(afterH[0][0].id !== victim.id && noticeShown, 'h hides the focused story (Undo offered)');
  await page2.eval(`document.querySelector('.notice button').click()`);
  await sleep(300);
  check((await bandState())[0][0].id === victim.id, 'and Undo brings it back');

  step('search: / opens it, a word from the lead finds the lead, Esc closes it');
  await page2.send('Page.bringToFront');
  await page2.eval(`document.activeElement?.blur()`);
  const leadTitle = await page2.eval(
    `document.querySelector('.slot-lead .headline a').textContent`,
  );
  const searchLeadId = await page2.eval(
    `document.querySelector('.slot-lead article').dataset.story`,
  );
  const word = leadTitle
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length >= 5)
    .sort((a, b) => b.length - a.length)[0];
  await page2.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: '/',
    code: 'Slash',
    windowsVirtualKeyCode: 191,
    text: '/',
  });
  await page2.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: '/',
    windowsVirtualKeyCode: 191,
  });
  let opened = false;
  for (let i = 0; i < 20 && !opened; i++) {
    await sleep(100);
    opened = await page2.eval(`document.querySelector('dialog.search')?.open === true`);
  }
  const focused = await page2.eval(`document.activeElement?.id`);
  const typedSlash = await page2.eval(`document.querySelector('#search-input')?.value`);
  check(
    opened && focused === 'search-input' && typedSlash === '',
    '/ opens search with the box focused',
  );
  await page2.send('Input.insertText', { text: word.slice(0, 4).toLowerCase() });
  let results = [];
  for (let i = 0; i < 20 && !results.includes(searchLeadId); i++) {
    await sleep(100);
    results = await page2.eval(
      `[...document.querySelectorAll('dialog.search article[data-story]')].map((a) => a.dataset.story)`,
    );
  }
  const count = await page2.eval(
    `document.querySelector('dialog.search .count')?.textContent.trim()`,
  );
  check(
    results.includes(searchLeadId),
    `"${word.slice(0, 4).toLowerCase()}" finds the lead ("${leadTitle.slice(0, 50)}…"): ${count}`,
  );
  await page2.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key: 'Escape',
    code: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await page2.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key: 'Escape',
    windowsVirtualKeyCode: 27,
  });
  await sleep(200);
  check(await page2.eval(`!document.querySelector('dialog.search')`), 'Esc closes it');
  await page2.eval(`document.querySelector('.folio-icon[aria-label="Search stories"]').click()`);
  await sleep(200);
  check(
    await page2.eval(`document.querySelector('dialog.search')?.open === true`),
    'the magnifying glass in the date line opens it too',
  );
  const gear = await page2.eval(
    `document.querySelector('.folio-icon[aria-label="Settings"]')?.getAttribute('href') ?? ''`,
  );
  check(
    gear.endsWith('/options.html'),
    `the gear beside it links to Settings (${gear.split('/').pop()})`,
  );
  await page2.eval(`document.querySelector('dialog.search').close()`);
  await sleep(150);

  step('keyboard: o opens the current story');
  await page2.send('Page.bringToFront');
  await press(page2, 'j');
  const target = await page2.eval(`document.activeElement.href`);
  const targetId = await focusedStory(page2);
  await press(page2, 'o');
  let href = newtab;
  for (let i = 0; i < 20 && href.startsWith(newtab); i++) {
    await sleep(150);
    href = await page2.eval('location.href').catch(() => href);
  }
  const marked = await sw.eval(
    idb(`(db, done) => {
      const g = db.transaction('items').objectStore('items').get(${JSON.stringify(targetId)});
      g.onsuccess = () => done(typeof g.result?.readAt === 'number');
    }`),
  );
  check(
    !href.startsWith('chrome-extension://') && marked,
    `o navigated to the story (${target.slice(0, 60)}…) and marked it read`,
  );
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
