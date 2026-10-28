<script lang="ts">
  import { onMount } from 'svelte';
  import { browser } from 'wxt/browser';
  import { applyAppearance } from '@/lib/appearance';
  import { contrast, DAY_PAPER, MIN_TEXT_CONTRAST } from '@/lib/color';
  import { getDB } from '@/lib/db';
  import { DEFAULT_SETTINGS, DEFAULT_SPOT } from '@/lib/defaults';
  import type { DiscoveredFeed } from '@/lib/feed/discover';
  import {
    changedFeeds,
    makeFeed,
    moveFeed,
    moveItem,
    renameSection,
    renumber,
    sectionList,
    unusedOrigins,
  } from '@/lib/feeds-edit';
  import { feedIdFor } from '@/lib/hash';
  import type { Broadcast } from '@/lib/messages';
  import type { OpmlFeed } from '@/lib/opml';
  import { originPatterns } from '@/lib/seed';
  import {
    getFeeds,
    getSettings,
    isFeedKey,
    removeFeed,
    saveFeeds,
    saveSettings,
  } from '@/lib/storage';
  import type { Feed, FeedState, PhotoStyle, PinnedLink, Settings, Theme } from '@/lib/types';
  import { clock } from '@/ui/format';
  import AddFeed from './AddFeed.svelte';
  import FeedSections from './FeedSections.svelte';
  import OpmlTools from './OpmlTools.svelte';
  import PinnedLinks from './PinnedLinks.svelte';

  const db = getDB();

  let settings = $state.raw<Settings>(DEFAULT_SETTINGS);
  let feeds = $state.raw<Feed[]>([]);
  let states = $state.raw(new Map<string, FeedState>());
  let granted = $state.raw(new Set<string>());
  let loaded = $state(false);
  let now = $state(Date.now());
  let refreshing = $state(false);
  let refreshNote = $state('');

  const sections = $derived(sectionList(settings.sections, feeds));
  const spotContrast = $derived(contrast(settings.spotColor, DAY_PAPER));

  // Load and sync ---------------------------------------------------------------------------

  async function loadAll() {
    const [s, f, st, perms] = await Promise.all([
      getSettings(),
      getFeeds(),
      db.feedState.toArray(),
      browser.permissions.getAll(),
    ]);
    settings = s;
    feeds = f;
    states = new Map(st.map((x) => [x.feedId, x]));
    granted = new Set(perms.origins ?? []);
    applyAppearance(s);
    loaded = true;
    // Access granted only for looking around on a site, never used by a feed, goes back.
    void releaseUnused(f);
  }

  async function reloadStates() {
    const st = await db.feedState.toArray();
    states = new Map(st.map((x) => [x.feedId, x]));
    now = Date.now();
  }

  async function reloadGranted() {
    granted = new Set((await browser.permissions.getAll()).origins ?? []);
  }

  // Writes ----------------------------------------------------------------------------------

  async function patchSettings(patch: Partial<Settings>) {
    settings = { ...settings, ...patch };
    applyAppearance(settings);
    await saveSettings(patch);
  }

  /** Write only the feeds that changed (storage.sync allows 120 writes a minute). */
  async function commitFeeds(next: Feed[], nextSections: string[] = settings.sections) {
    const before = feeds;
    feeds = next;
    const removed = before.filter((f) => !next.some((n) => n.id === f.id));
    await Promise.all([
      saveFeeds(changedFeeds(before, next)),
      ...removed.map((f) => removeFeed(f.id)),
    ]);
    if (JSON.stringify(nextSections) !== JSON.stringify(settings.sections)) {
      await patchSettings({ sections: nextSections });
    }
    if (removed.length) await releaseUnused(next);
  }

  async function releaseUnused(list: Feed[]) {
    try {
      const all = (await browser.permissions.getAll()).origins ?? [];
      const extra = unusedOrigins(all, list);
      if (extra.length) await browser.permissions.remove({ origins: extra });
    } catch {
      // Required (manifest) host permissions can't be removed; nothing else to do.
    }
    await reloadGranted();
  }

  // Feed and section edits ------------------------------------------------------------------

  function addFeed(d: DiscoveredFeed, section: string): Promise<string | null> {
    if (feeds.some((f) => f.id === feedIdFor(d.url))) return Promise.resolve('Already subscribed.');
    return browser.permissions.request({ origins: originPatterns([d.url]) }).then(async (ok) => {
      if (!ok) return `Permission to read ${new URL(d.url).hostname} was not granted.`;
      const nextSections = sections.includes(section) ? sections : [...sections, section];
      const feed = makeFeed(d, section, feeds.length);
      await commitFeeds(renumber([...feeds, feed], nextSections), nextSections);
      await releaseUnused(feeds);
      return null;
    });
  }

  function importFeeds(list: OpmlFeed[]): Promise<string | null> {
    if (list.length === 0) return Promise.resolve(null);
    return browser.permissions
      .request({ origins: originPatterns(list.map((f) => f.url)) })
      .then(async (ok) => {
        if (!ok) return 'Permission to read those sites was not granted; nothing was imported.';
        const nextSections = [...sections];
        for (const f of list) if (!nextSections.includes(f.category)) nextSections.push(f.category);
        const added = list.map((f, i) => makeFeed(f, f.category, feeds.length + i));
        await commitFeeds(renumber([...feeds, ...added], nextSections), nextSections);
        await reloadGranted();
        return null;
      });
  }

  function allow(f: Feed) {
    void browser.permissions.request({ origins: originPatterns([f.url]) }).then(reloadGranted);
  }

  const onmovefeed = (id: string, section: string, index: number) =>
    void commitFeeds(moveFeed(feeds, sections, id, section, index), sections);

  const onmovesection = (name: string, index: number) => {
    const next = moveItem(sections, sections.indexOf(name), index);
    void commitFeeds(renumber(feeds, next), next);
  };

  const onrename = (id: string, title: string) =>
    void commitFeeds(feeds.map((f) => (f.id === id ? { ...f, title } : f)));

  const onremove = (id: string) =>
    void commitFeeds(
      feeds.filter((f) => f.id !== id),
      sections,
    );

  const onrenamesection = (from: string, to: string) => {
    const r = renameSection(feeds, sections, from, to);
    void commitFeeds(renumber(r.feeds, r.sections), r.sections);
  };

  const onremovesection = (name: string) =>
    void patchSettings({ sections: sections.filter((s) => s !== name) });

  const onaddsection = (name: string) => {
    if (!sections.includes(name)) void patchSettings({ sections: [...sections, name] });
  };

  // Paper name: saved after a pause in typing (storage.sync write limits).
  let nameTimer: ReturnType<typeof setTimeout> | undefined;
  function editName(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    clearTimeout(nameTimer);
    nameTimer = setTimeout(
      () => void patchSettings({ paperName: value.trim() || 'The Daily Tab' }),
      500,
    );
  }

  let spotTimer: ReturnType<typeof setTimeout> | undefined;
  function editSpot(e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value;
    settings = { ...settings, spotColor: value };
    applyAppearance(settings);
    clearTimeout(spotTimer);
    spotTimer = setTimeout(() => void patchSettings({ spotColor: value }), 400);
  }

  async function refreshNow() {
    refreshing = true;
    refreshNote = '';
    try {
      const report = (await browser.runtime.sendMessage({ type: 'refresh', force: true })) as {
        fetched: number;
        notModified: number;
        failed: number;
        newItems: number;
      } | null;
      if (report) {
        const failed = report.failed ? `, ${report.failed} failed` : '';
        refreshNote = `Checked ${report.fetched + report.notModified} feeds at ${clock(Date.now())}: ${report.newItems} new ${report.newItems === 1 ? 'story' : 'stories'}${failed}.`;
      }
    } finally {
      refreshing = false;
      void reloadStates();
    }
  }

  onMount(() => {
    void loadAll();
    const onStorage = (changes: Record<string, unknown>, area: string) => {
      if (area !== 'sync') return;
      if ('settings' in changes) {
        void getSettings().then((s) => {
          settings = s;
          applyAppearance(s);
        });
      }
      if (Object.keys(changes).some(isFeedKey)) void getFeeds().then((f) => (feeds = f));
    };
    const onMessage = (msg: Broadcast) => {
      if (msg.type === 'refresh-state' && !msg.running) void reloadStates();
    };
    browser.storage.onChanged.addListener(onStorage);
    browser.runtime.onMessage.addListener(onMessage);
    browser.permissions.onAdded.addListener(reloadGranted);
    browser.permissions.onRemoved.addListener(reloadGranted);
    const tick = setInterval(() => (now = Date.now()), 30_000);
    return () => {
      browser.storage.onChanged.removeListener(onStorage);
      browser.runtime.onMessage.removeListener(onMessage);
      browser.permissions.onAdded.removeListener(reloadGranted);
      browser.permissions.onRemoved.removeListener(reloadGranted);
      clearInterval(tick);
    };
  });

  const themes: { value: Theme; label: string }[] = [
    { value: 'system', label: 'Follow Windows' },
    { value: 'day', label: 'Day edition' },
    { value: 'night', label: 'Night edition' },
  ];
  const photoStyles: { value: PhotoStyle; label: string }[] = [
    { value: 'ink', label: 'Black and white, color on hover' },
    { value: 'color', label: 'Full color' },
  ];
  const intervals = [5, 10, 15, 30, 60, 120];
</script>

<main>
  <header class="top">
    <h1>Settings</h1>
    <p class="sub">{settings.paperName}</p>
  </header>

  {#if loaded}
    <section aria-labelledby="paper-h">
      <h2 id="paper-h">Paper</h2>
      <label class="field">
        <span>Name on the masthead</span>
        <input type="text" maxlength="40" value={settings.paperName} oninput={editName} />
      </label>
    </section>

    <section aria-labelledby="feeds-h">
      <h2 id="feeds-h">Sections and feeds</h2>
      <p class="hint">
        Drag sections and feeds by their handle to reorder them, or use the arrows. The order here
        is the order of the front page.
      </p>
      <h3>Add a feed</h3>
      <AddFeed {sections} {feeds} onadd={addFeed} onrelease={() => void releaseUnused(feeds)} />
      <h3>Your sections</h3>
      <FeedSections
        {sections}
        {feeds}
        {states}
        {granted}
        {now}
        {onmovefeed}
        {onmovesection}
        {onrename}
        {onremove}
        {onrenamesection}
        {onremovesection}
        {onaddsection}
        onallow={allow}
      />
    </section>

    <section aria-labelledby="look-h">
      <h2 id="look-h">Appearance</h2>
      <fieldset>
        <legend>Edition</legend>
        {#each themes as t (t.value)}
          <label class="choice">
            <input
              type="radio"
              name="theme"
              value={t.value}
              checked={settings.theme === t.value}
              onchange={() => void patchSettings({ theme: t.value })}
            />
            {t.label}
          </label>
        {/each}
      </fieldset>
      <fieldset>
        <legend>Photos</legend>
        {#each photoStyles as p (p.value)}
          <label class="choice">
            <input
              type="radio"
              name="photos"
              value={p.value}
              checked={settings.photos === p.value}
              onchange={() => void patchSettings({ photos: p.value })}
            />
            {p.label}
          </label>
        {/each}
      </fieldset>
      <fieldset>
        <legend>Spot color</legend>
        <p class="hint">Used only for section kickers, “new” dots and focus rings.</p>
        <div class="spot">
          <input
            type="color"
            value={settings.spotColor}
            oninput={editSpot}
            aria-label="Spot color"
          />
          <span class="swatch day">WORLD</span>
          <span class="swatch night">WORLD</span>
          {#if settings.spotColor.toLowerCase() !== DEFAULT_SPOT.toLowerCase()}
            <button
              type="button"
              class="link"
              onclick={() => void patchSettings({ spotColor: DEFAULT_SPOT })}
              >Reset to press red</button
            >
          {/if}
        </div>
        {#if spotContrast < MIN_TEXT_CONTRAST}
          <p class="error" role="status">
            This color is hard to read on day paper ({spotContrast.toFixed(1)}:1; kickers need
            {MIN_TEXT_CONTRAST}:1). Choose a darker shade.
          </p>
        {/if}
      </fieldset>
    </section>

    <section aria-labelledby="pinned-h">
      <h2 id="pinned-h">Pinned links</h2>
      <PinnedLinks
        links={settings.pinnedLinks}
        onchange={(links: PinnedLink[]) => void patchSettings({ pinnedLinks: links })}
      />
    </section>

    <section aria-labelledby="refresh-h">
      <h2 id="refresh-h">Refresh</h2>
      <div class="row">
        <label class="field">
          <span>Check feeds every</span>
          <select
            id="refresh-interval"
            value={settings.refreshMinutes}
            onchange={(e) =>
              void patchSettings({
                refreshMinutes: Number((e.currentTarget as HTMLSelectElement).value),
              })}
          >
            {#each intervals as m (m)}
              <option value={m}
                >{m < 60 ? `${m} minutes` : `${m / 60} hour${m > 60 ? 's' : ''}`}</option
              >
            {/each}
          </select>
        </label>
        <button type="button" onclick={refreshNow} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh now'}
        </button>
      </div>
      {#if refreshNote}<p class="hint" role="status">{refreshNote}</p>{/if}
      <p class="hint">
        A feed that fails is retried less often (twice the interval each time, up to 6 hours).
      </p>
    </section>

    <section aria-labelledby="opml-h">
      <h2 id="opml-h">Import and export</h2>
      <p class="hint">
        OPML is the standard subscription list format; most feed readers can import and export it.
      </p>
      <OpmlTools {feeds} {sections} paperName={settings.paperName} onimport={importFeeds} />
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 820px;
    margin: 0 auto;
    padding: 32px 24px 80px;
  }
  .top {
    border-bottom: 1px solid var(--rule-ink);
    padding-bottom: 14px;
    margin-bottom: 8px;
  }
  h1 {
    font-size: 28px;
    font-weight: 600;
  }
  .sub {
    color: var(--ink-2);
    margin-top: 4px;
  }
  section {
    padding: 22px 0 26px;
    border-bottom: 1px solid var(--rule);
  }
  h2 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 10px;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 18px 0 8px;
    color: var(--ink-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 16px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .choice {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 3px 0;
  }
  .row {
    display: flex;
    gap: 12px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .spot {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .spot input[type='color'] {
    width: 44px;
    height: 32px;
    padding: 2px;
  }
  .swatch {
    font:
      700 11.5px/1 'Libre Franklin',
      'Segoe UI',
      sans-serif;
    letter-spacing: 0.14em;
    padding: 8px 10px;
    border: 1px solid var(--rule);
  }
  .swatch.day {
    background: #f4f1ea;
    color: var(--spot-day, #a4161a);
  }
  .swatch.night {
    background: #16140f;
    color: var(--spot-night, #e5645e);
  }
</style>
