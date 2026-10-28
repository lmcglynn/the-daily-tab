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
  const rows = await page.eval(`document.querySelectorAll('.feed').length`);
  const sectionNames = await page.eval(
    `[...document.querySelectorAll('.section-name')].map((i) => i.value)`,
  );
  check(rows === 9, `lists ${rows} feeds`);
  check(sectionNames.join() === 'World,Tech,Science', `sections ${sectionNames.join(', ')}`);
  await sleep(1500);
  const statuses = await page.eval(
    `[...document.querySelectorAll('.feed .status')].map((s) => s.textContent.trim())`,
  );
  check(
    statuses.every((s) => /^Updated|Not fetched/.test(s)),
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
  check(after[1].id === first.id, `${first.title} moved down within World`);
  await page.eval(`document.querySelector('[aria-label="Move World down"]').click()`);
  await sleep(400);
  check(
    (await sync()).settings.sections.join() === 'Tech,World,Science',
    'World section moved below Tech',
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
  const local = () => page.eval(`chrome.storage.local.get(['weather', 'market'])`);
  let w = null;
  for (let i = 0; i < 40 && !w; i++) {
    await sleep(250);
    w = (await local()).weather ?? null;
  }
  check(
    typeof w?.temp === 'number' && w.units === 'f',
    `weather fetched: ${w?.temp}°F, code ${w?.code}`,
  );

  step('markets: tick the S&P 500 box (live Yahoo)');
  await gesture(
    `[...document.querySelectorAll('label.choice')].find((l) => l.textContent.includes('S&P 500')).querySelector('input').click()`,
  );
  let m = null;
  for (let i = 0; i < 40 && !m; i++) {
    await sleep(250);
    m = (await local()).market ?? null;
  }
  check(
    (await sync()).settings.showMarket === true && typeof m?.price === 'number',
    `S&P 500 fetched: ${m?.price} (${m?.points?.length} points)`,
  );

  step('units: switch to Celsius refetches');
  await page.eval(`document.querySelector('input[name="units"][value="c"]').click()`);
  let wc = null;
  for (let i = 0; i < 40 && wc?.units !== 'c'; i++) {
    await sleep(250);
    wc = (await local()).weather ?? null;
  }
  check(wc?.units === 'c', `weather refetched in °C: ${wc?.temp}°C`);

  step('new tab shows the weather ear and the S&P 500 box');
  const tab = await browser.newPage();
  await tab.navigate(`chrome-extension://${extId}/newtab.html`);
  await sleep(1200);
  // Visible text only (the ear also carries a screen-reader sentence).
  const ear = await tab.eval(
    `[...document.querySelectorAll('.ear-right [aria-hidden=true]')].map((e) => e.innerText).join(' ').replace(/\\s+/g, ' ').trim()`,
  );
  const tick = await tab.eval(
    `document.querySelector('.ticker')?.innerText.replace(/\\s+/g, ' ').trim() ?? ''`,
  );
  const folio = await tab.eval(`document.querySelector('.folio').innerText.replace(/\\s+/g, ' ')`);
  check(/^-?\d+° \S/.test(ear) && /H -?\d+° · L -?\d+°/.test(ear), `right ear: "${ear}"`);
  check(
    /^S&P 500 [\d,]+\.\d\d [▲▼■] [+−]/.test(tick) && /DELAYED/i.test(tick),
    `ticker: "${tick}"`,
  );
  check(!/NEW SINCE/i.test(ear), `"new since" is not in the ear (folio: "${folio}")`);
  tab.close();

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
