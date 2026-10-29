// Milestone 4 check: drives the settings page in headless Edge (e2e build) and asserts what
// lands in chrome.storage.sync. Adding a feed uses an origin the e2e build already has, since
// headless Edge cannot answer a permission prompt. Usage: npm run verify:settings
import { resolve } from 'node:path';
import { findExtensionWorker, launchEdge, sleep } from './edge.mjs';

const failures = [];
const step = (msg) => console.log(`… ${msg}`);
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) failures.push(msg);
};

const browser = await launchEdge({ extensionDir: '.output/edge-mv3-e2e', port: 9337 });
const watchdog = setTimeout(async () => {
  console.log('FAIL watchdog: gave up after 150 s');
  await browser.close();
  process.exit(2);
}, 150_000);

try {
  const { session: sw, extId } = await findExtensionWorker(browser);
  sw.close();
  const page = await browser.newPage();
  await page.navigate(`chrome-extension://${extId}/options.html`);
  for (let i = 0; i < 40; i++) {
    if (await page.eval(`document.querySelectorAll('.feed').length > 0`)) break;
    await sleep(150);
  }

  const sync = () => page.eval(`chrome.storage.sync.get(null)`);
  const feedsOf = (all) =>
    Object.entries(all)
      .filter(([k]) => k.startsWith('feed:'))
      .map(([, v]) => v)
      .sort((a, b) => a.order - b.order);
  // Svelte listens for real events; set a value then dispatch.
  const setValue = (selector, value, type = 'change') =>
    page.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      el.value = ${JSON.stringify(value)};
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event(${JSON.stringify(type)}, { bubbles: true }));
    })()`);
  const clickText = (text, scope = 'button') =>
    page.eval(
      `[...document.querySelectorAll(${JSON.stringify(scope)})].find((b) => b.textContent.trim() === ${JSON.stringify(text)}).click()`,
    );

  step('initial render');
  // Expectations come from what the extension seeded, so changing the starter list needs no edit.
  const seeded = await sync();
  const seededSections = seeded.settings.sections;
  const rows = await page.eval(`document.querySelectorAll('.feed').length`);
  const sectionNames = await page.eval(
    `[...document.querySelectorAll('.section-name')].map((i) => i.value)`,
  );
  check(rows === feedsOf(seeded).length, `lists ${rows} feeds`);
  check(sectionNames.join() === seededSections.join(), `sections ${sectionNames.join(', ')}`);
  await sleep(1500);
  const statuses = await page.eval(
    `[...document.querySelectorAll('.feed .status')].map((s) => s.textContent.trim())`,
  );
  // Every starter origin is granted in the e2e build. Some sites refuse headless Edge, so
  // "Failed …" is a fair status here; "Needs permission" is not.
  check(
    statuses.length === rows &&
      statuses.every((s) => /^(Updated|Not fetched|Failed|Working, but no new stories)/.test(s)),
    `feed status lines (e.g. "${statuses[0]}")`,
  );

  step('paper name');
  await setValue('input[maxlength="40"]', 'The Morning Ledger', 'input');
  await sleep(800);
  check((await sync()).settings?.paperName === 'The Morning Ledger', 'paper name saved');

  step('reorder feeds and sections with the arrow buttons');
  let before = feedsOf(await sync());
  const first = before[0];
  await page.eval(`document.querySelector('[aria-label="Move ${first.title} down"]').click()`);
  await sleep(400);
  let after = feedsOf(await sync());
  check(after[1].id === first.id, `${first.title} moved down within ${first.category}`);
  const [top, next, ...rest] = seededSections;
  await page.eval(`document.querySelector('[aria-label="Move ${top} down"]').click()`);
  await sleep(400);
  check(
    (await sync()).settings.sections.join() === [next, top, ...rest].join(),
    `${top} section moved below ${next}`,
  );

  step('drag a feed into another section');
  before = feedsOf(await sync());
  const dragged = before.find((f) => f.category === 'Science');
  await page.eval(`(() => {
    const dt = new DataTransfer();
    const grip = document.querySelector('.feed[data-key="${dragged.id}"] .grip');
    grip.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
    const list = document.querySelector('ul[aria-label="Feeds in Tech"]');
    const box = list.getBoundingClientRect();
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt, clientX: box.left + 20, clientY: box.top + 2 };
    list.dispatchEvent(new DragEvent('dragover', opts));
    list.dispatchEvent(new DragEvent('drop', opts));
    grip.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  })()`);
  await sleep(500);
  after = feedsOf(await sync());
  const moved = after.find((f) => f.id === dragged.id);
  const techFirst = after.filter((f) => f.category === 'Tech')[0];
  check(
    moved.category === 'Tech' && techFirst.id === dragged.id,
    `dragged ${dragged.title} to the top of Tech`,
  );

  step('rename a feed and a section');
  await setValue(`.feed[data-key="${dragged.id}"] input.title`, 'Renamed Feed');
  await sleep(400);
  check(
    feedsOf(await sync()).find((f) => f.id === dragged.id).title === 'Renamed Feed',
    'feed renamed',
  );
  await setValue(`section[data-key="Science"] .section-name`, 'Research');
  await sleep(500);
  const renamed = await sync();
  check(
    renamed.settings.sections.includes('Research') &&
      feedsOf(renamed).every((f) => f.category !== 'Science'),
    'section renamed (feeds follow)',
  );

  step('remove a feed (two-step confirm)');
  const victim = feedsOf(await sync()).at(-1);
  await page.eval(`document.querySelector('[aria-label="Remove ${victim.title}"]').click()`);
  await sleep(150);
  await page.eval(`document.querySelector('.feed[data-key="${victim.id}"] button.danger').click()`);
  await sleep(400);
  check(!(`feed:${victim.id}` in (await sync())), `removed ${victim.title}`);

  step('appearance');
  await page.eval(`document.querySelector('input[name="theme"][value="night"]').click()`);
  await sleep(300);
  check(
    (await page.eval(`document.documentElement.dataset.theme`)) === 'night' &&
      (await sync()).settings.theme === 'night',
    'night edition applied and saved',
  );
  await page.eval(`document.querySelector('input[name="photos"][value="color"]').click()`);
  await sleep(300);
  check((await sync()).settings.photos === 'color', 'photo style saved');
  await setValue('input[type="color"]', '#ffd700', 'input');
  await sleep(700);
  const warning = await page.eval(`document.body.innerText.includes('hard to read on day paper')`);
  check(
    warning && (await sync()).settings.spotColor === '#ffd700',
    'light spot color saved with a contrast warning',
  );
  await clickText('Reset to press red');
  await sleep(300);

  step('refresh interval');
  await setValue('#refresh-interval', '30');
  await sleep(800);
  check((await sync()).settings.refreshMinutes === 30, 'refresh interval saved');
  const alarm = await page.eval(`chrome.alarms.get('refresh')`);
  check(alarm?.periodInMinutes === 30, `alarm rescheduled to ${alarm?.periodInMinutes} min`);

  step('pinned links');
  await clickText('Add link');
  await sleep(150);
  await setValue('.links li:last-child input[maxlength="24"]', 'Mail');
  await setValue('.links li:last-child input[inputmode="url"]', 'outlook.live.com');
  await sleep(400);
  const pinned = (await sync()).settings.pinnedLinks;
  check(
    pinned.length === 1 && pinned[0].url === 'https://outlook.live.com/',
    `pinned link saved (${JSON.stringify(pinned)})`,
  );

  step('muted topics: mute a word from the current lead, and the page is recomposed without it');
  const latest = () =>
    page.eval(`new Promise((resolve) => {
      const q = indexedDB.open('daily-tab');
      q.onsuccess = () => {
        const db = q.result;
        const tx = db.transaction(['editions', 'items'], 'readonly');
        const c = tx.objectStore('editions').index('composedAt').openCursor(null, 'prev');
        c.onsuccess = () => {
          const e = c.result?.value;
          if (!e) { db.close(); return resolve(null); }
          const ids = [e.leadItemId, ...e.secondaryItemIds, ...(e.leadColumnItemIds || []),
            ...e.sections.flatMap((s) => s.itemIds), ...e.briefItemIds];
          const items = [];
          ids.forEach((id) => { const g = tx.objectStore('items').get(id); g.onsuccess = () => g.result && items.push(g.result); });
          tx.oncomplete = () => { db.close(); resolve({ id: e.id, lead: e.leadItemId, items }); };
        };
      };
    })`);
  let pageBefore;
  for (let i = 0; i < 40 && !(pageBefore = await latest()); i++) await sleep(500);
  const leadTitle = pageBefore.items.find((i) => i.id === pageBefore.lead).title;
  const word = leadTitle
    .split(/[^A-Za-z]+/)
    .filter((w) => w.length >= 5)
    .sort((a, b) => b.length - a.length)[0];
  await setValue('form.mute-form input', word, 'input');
  await page.eval(`document.querySelector('form.mute-form').requestSubmit()`);
  await sleep(600);
  check(
    JSON.stringify((await sync()).settings.mutedWords) === JSON.stringify([word]),
    `muted "${word}" (from "${leadTitle}")`,
  );
  let pageAfter = pageBefore;
  for (let i = 0; i < 20 && pageAfter.id === pageBefore.id; i++) {
    await sleep(500);
    pageAfter = await latest();
  }
  const re = new RegExp(`\\b${word}`, 'i');
  const leaks = pageAfter.items.filter((i) => re.test(i.title) || re.test(i.summary));
  check(
    pageAfter.id !== pageBefore.id && pageAfter.lead !== pageBefore.lead && leaks.length === 0,
    `recomposed without it (new lead: "${pageAfter.items.find((i) => i.id === pageAfter.lead)?.title}"; ${leaks.length} mentions left)`,
  );
  const countText = await page.eval(`document.querySelector('.muted .count')?.textContent.trim()`);
  check(/^hides \d+ recent stor/.test(countText ?? ''), `count shown ("${countText}")`);
  await page.eval(`document.querySelector('[aria-label="Unmute ${word}"]').click()`);
  await sleep(400);
  check((await sync()).settings.mutedWords.length === 0, 'unmuted');

  step('hidden stories: Settings counts them and shows them again');
  await page.eval(
    `chrome.storage.local.set({ hidden: [{ id: 'x1', at: Date.now() }, { id: 'x2', at: Date.now() }] })`,
  );
  await sleep(400);
  const hiddenLine = await page.eval(
    `document.querySelector('.hidden-stories')?.textContent.replace(/\\s+/g, ' ').trim() ?? ''`,
  );
  check(/hidden 2 stories/.test(hiddenLine), `Settings says: "${hiddenLine}"`);
  await clickText('Show them again');
  await sleep(400);
  const left = (await page.eval(`chrome.storage.local.get('hidden')`)).hidden ?? [];
  const lineGone = await page.eval(`!document.querySelector('.hidden-stories')`);
  check(left.length === 0 && lineGone, '"Show them again" clears the list');

  step('add a feed (origin already granted in the e2e build)');
  await setValue('form.add input', 'https://www.theguardian.com/uk/technology/rss', 'input');
  await page.eval(`document.querySelector('form.add select').value = 'Tech'`);
  await page.eval(`document.querySelector('form.add select').dispatchEvent(new Event('change'))`);
  // Permission requests need a user gesture; a real click is one, so mark these evals as such.
  const gesture = (expression) =>
    page.send('Runtime.evaluate', { expression, userGesture: true, awaitPromise: false });
  await gesture(`document.querySelector('form.add').requestSubmit()`);
  let found = null;
  for (let i = 0; i < 60 && !found; i++) {
    await sleep(250);
    found = await page.eval(
      `document.querySelector('.results li strong')?.textContent ?? document.querySelector('.error')?.textContent ?? null`,
    );
  }
  const listed = await page.eval(`!!document.querySelector('.results li strong')`);
  check(listed, `discovery found "${found}"`);
  await gesture(
    `[...document.querySelectorAll('.results button')].find((b) => b.textContent === 'Add')?.click()`,
  );
  await sleep(800);
  const addedFeed = feedsOf(await sync()).find((f) => f.url.includes('/uk/technology/rss'));
  check(addedFeed?.category === 'Tech', `subscribed to ${addedFeed?.title} in Tech`);

  step('weather: find a city, use it (live Open-Meteo)');
  await setValue('form.find input', 'Seattle', 'input');
  await gesture(`document.querySelector('form.find').requestSubmit()`);
  let placeFound = false;
  for (let i = 0; i < 40 && !placeFound; i++) {
    await sleep(250);
    placeFound = await page.eval(`!!document.querySelector('.places li')`);
  }
  check(placeFound, 'geocoding listed places for "Seattle"');
  await page.eval(`document.querySelector('.places li button').click()`);
  await sleep(300);
  const place = (await sync()).settings.weatherPlace;
  check(
    place?.name === 'Seattle' && Array.isArray((await sync()).settings.sections),
    `place saved (${place?.name}, ${place?.region}); sections still an array`,
  );
  const local = () => page.eval(`chrome.storage.local.get(['weather', 'markets', 'scores'])`);
  let w = null;
  for (let i = 0; i < 40 && !w; i++) {
    await sleep(250);
    w = (await local()).weather ?? null;
  }
  check(
    typeof w?.temp === 'number' && w.units === 'f',
    `weather fetched: ${w?.temp}°F, code ${w?.code}`,
  );

  step('markets: quick-add the S&P 500, type AAPL, reject a fake symbol (live Yahoo)');
  const tickers = async () => (await sync()).settings.tickers.map((t) => t.symbol).join(',');
  const until = async (fn, tries = 40) => {
    for (let i = 0; i < tries; i++) {
      const v = await fn();
      if (v) return v;
      await sleep(250);
    }
    return null;
  };
  await gesture(
    `[...document.querySelectorAll('.presets .chip')].find((b) => b.textContent.trim() === 'S&P 500').click()`,
  );
  await until(async () => (await tickers()) === '^GSPC');
  await setValue('form.find:last-of-type input', 'aapl', 'input');
  await gesture(`[...document.querySelectorAll('form.find')].at(-1).requestSubmit()`);
  await until(async () => (await tickers()).includes('AAPL'));
  const saved = (await sync()).settings.tickers;
  check(
    saved.map((t) => t.symbol).join() === '^GSPC,AAPL' && Array.isArray(saved),
    `tickers saved: ${saved.map((t) => `${t.name} (${t.symbol})`).join(', ')}`,
  );
  await setValue('form.find:last-of-type input', 'NOTAREALTICKER', 'input');
  await gesture(`[...document.querySelectorAll('form.find')].at(-1).requestSubmit()`);
  const rejected = await until(() =>
    page.eval(
      `[...document.querySelectorAll('[role=alert]')].map((e) => e.textContent).find((t) => t.includes('NOTAREALTICKER')) ?? null`,
    ),
  );
  check(!!rejected && (await tickers()) === '^GSPC,AAPL', `unknown symbol rejected: "${rejected}"`);
  await page.eval(`document.querySelector('[aria-label="Move Apple Inc. up"]').click()`);
  await until(async () => (await tickers()) === 'AAPL,^GSPC');
  check((await tickers()) === 'AAPL,^GSPC', 'reordered: Apple first');
  const m = await until(async () => {
    const q = (await local()).markets;
    return q?.AAPL && q['^GSPC'] ? q : null;
  });
  check(
    typeof m?.AAPL?.price === 'number' && typeof m?.['^GSPC']?.price === 'number',
    `quotes fetched: AAPL ${m?.AAPL?.price}, ^GSPC ${m?.['^GSPC']?.price}`,
  );

  step('units: switch to Celsius refetches');
  await page.eval(`document.querySelector('input[name="units"][value="c"]').click()`);
  let wc = null;
  for (let i = 0; i < 40 && wc?.units !== 'c'; i++) {
    await sleep(250);
    wc = (await local()).weather ?? null;
  }
  check(wc?.units === 'c', `weather refetched in °C: ${wc?.temp}°C`);

  step('scores: follow the Lakers (live ESPN)');
  await setValue('form.pick select', 'basketball/nba');
  await gesture(`document.querySelector('form.pick').requestSubmit()`);
  let teamOptions = [];
  for (let i = 0; i < 40 && teamOptions.length === 0; i++) {
    await sleep(250);
    teamOptions = await page.eval(
      `[...document.querySelectorAll('.pick:not(form) select option')].map((o) => [o.value, o.textContent.trim()])`,
    );
  }
  const pageErrors = await page.eval(
    `[...document.querySelectorAll('.error')].map((e) => e.textContent).join(' | ')`,
  );
  // ESPN answers a normal Edge window but refuses headless Edge (as LA Times does).
  const espnRefused = teamOptions.length === 0 && /NBA teams: HTTP 403/.test(pageErrors);
  if (espnRefused) {
    console.log(
      'skip ESPN refuses headless Edge (HTTP 403); run: HEADED=1 npm run verify:settings',
    );
  } else {
    const lakersOption = teamOptions.find(([, name]) => name === 'Los Angeles Lakers');
    check(
      teamOptions.length === 30 && !!lakersOption,
      `NBA teams listed (${teamOptions.length}, Lakers id ${lakersOption?.[0]}) ${pageErrors}`,
    );
    await setValue('.pick:not(form) select', lakersOption[0]);
    await clickText('Follow');
    await sleep(400);
    const followed = (await sync()).settings.teams;
    check(
      followed.length === 1 && followed[0].name === 'Los Angeles Lakers',
      `following ${followed.map((t) => `${t.name} (${t.league}:${t.id})`).join(', ')}`,
    );
    let report = null;
    for (let i = 0; i < 40 && !report; i++) {
      await sleep(250);
      report = (await local()).scores?.[`basketball/nba:${lakersOption[0]}`] ?? null;
    }
    const show = (g) =>
      g
        ? `${g.away.abbr} ${g.away.score ?? ''} @ ${g.home.abbr} ${g.home.score ?? ''} ${g.detail}`
        : '—';
    check(
      !!report && (!!report.last || !!report.current),
      `scores fetched: last ${show(report?.last)}; next ${show(report?.current)}`,
    );
  }

  step('new tab shows the weather ear and cycles the markets box');
  const tab = await browser.newPage();
  await tab.navigate(`chrome-extension://${extId}/newtab.html`);
  await sleep(1200);
  // Visible text only (the ear also carries a screen-reader sentence).
  const ear = await tab.eval(
    `[...document.querySelectorAll('.ear-right [aria-hidden=true]')].map((e) => e.innerText).join(' ').replace(/\\s+/g, ' ').trim()`,
  );
  // Visible quote text and the box height (cycling must not change it).
  const box = () =>
    tab.eval(`(() => {
      const t = document.querySelector('.ticker');
      if (!t) return null;
      const quote = [...t.querySelectorAll('.quote [aria-hidden=true]')].map((e) => e.innerText).join(' ').replace(/\\s+/g, ' ').trim();
      return { quote, pos: t.querySelector('.pos')?.textContent, h: t.getBoundingClientRect().height };
    })()`);
  const folio = await tab.eval(`document.querySelector('.folio').innerText.replace(/\\s+/g, ' ')`);
  check(/^-?\d+° \S/.test(ear) && /H -?\d+° · L -?\d+°/.test(ear), `right ear: "${ear}"`);
  check(!/NEW SINCE/i.test(ear), `"new since" is not in the ear (folio: "${folio}")`);
  const shown1 = await box();
  check(
    /^APPLE INC\.\s+AAPL [\d,]+\.\d\d [▲▼■] [+−]/i.test(shown1?.quote ?? '') &&
      shown1?.pos === '1 of 2',
    `box starts on Apple: "${shown1?.quote}" [${shown1?.pos}]`,
  );
  await tab.eval(`document.querySelector('.ticker button[aria-label^="Next"]').click()`);
  await sleep(150);
  const shown2 = await box();
  check(
    /^S&P 500 [\d,]+\.\d\d [▲▼■] [+−]/.test(shown2?.quote ?? '') && shown2?.pos === '2 of 2',
    `next arrow shows the S&P 500: "${shown2?.quote}" [${shown2?.pos}]`,
  );
  check(shown1?.h === shown2?.h, `box height unchanged while cycling (${shown1?.h}px)`);
  await tab.eval(`(() => {
    const t = document.querySelector('.ticker');
    t.querySelector('button').focus();
    t.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  })()`);
  await sleep(150);
  check((await box())?.pos === '1 of 2', '→ key on the box wraps back to Apple');
  const scoresBox = await tab.eval(`(() => {
    const b = document.querySelector('.scores');
    if (!b) return null;
    const text = [...b.querySelectorAll('.game [aria-hidden=true]')].map((e) => e.innerText).join(' ').replace(/\\s+/g, ' ').trim();
    return { text, h: b.getBoundingClientRect().height, label: b.querySelector('.visually-hidden')?.textContent };
  })()`);
  if (!espnRefused) {
    check(
      /^LOS ANGELES LAKERS/.test(scoresBox?.text ?? '') && scoresBox?.h === shown1?.h,
      `scores box: "${scoresBox?.text}" (height ${scoresBox?.h}px, same as markets)`,
    );
    console.log(`     spoken: ${scoresBox?.label}`);
  }
  tab.close();
  // The choice is remembered for the next tab.
  const tab2 = await browser.newPage();
  await tab2.navigate(`chrome-extension://${extId}/newtab.html`);
  await sleep(800);
  await tab2.eval(`document.querySelector('.ticker button[aria-label^="Next"]').click()`);
  tab2.close();
  const tab3 = await browser.newPage();
  await tab3.navigate(`chrome-extension://${extId}/newtab.html`);
  await sleep(800);
  const remembered = await tab3.eval(`document.querySelector('.ticker .pos')?.textContent`);
  check(remembered === '2 of 2', `last-viewed ticker remembered in the next tab (${remembered})`);
  tab3.close();

  step('OPML import preview');
  const docNode = await page.send('DOM.getDocument');
  const { nodeId } = await page.send('DOM.querySelector', {
    nodeId: docNode.root.nodeId,
    selector: 'input[type="file"]',
  });
  await page.send('DOM.setFileInputFiles', {
    nodeId,
    files: [resolve('fixtures/feeds/subscriptions.opml')],
  });
  await sleep(500);
  const preview = await page.eval(
    `document.querySelector('[aria-label="Import preview"]')?.innerText.replace(/\\s+/g, ' ') ?? ''`,
  );
  check(
    /has 2 new feeds in Space, Culture, and 1 you already follow/.test(preview),
    `preview: "${preview}"`,
  );

  page.close();
} finally {
  clearTimeout(watchdog);
  await browser.close();
}

if (failures.length) {
  console.log(`\n${failures.length} check(s) failed`);
  process.exitCode = 1;
} else console.log('\nOK');
