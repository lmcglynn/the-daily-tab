<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { browser } from 'wxt/browser';
  import { applyAppearance } from '@/lib/appearance';
  import type { DailyTabDB } from '@/lib/db';
  import { DEFAULT_SETTINGS } from '@/lib/defaults';
  import {
    loadEditionItems,
    loadSnapshot,
    markRead,
    moreInSection,
    newStoryCount,
    shownKeys,
    withEntry,
    withItems,
    type Snapshot,
  } from '@/lib/frontpage-data';
  import type { Broadcast } from '@/lib/messages';
  import { originPatterns } from '@/lib/seed';
  import { getFeeds, isFeedKey, removeFeed, saveSettings, setLastVisitAt } from '@/lib/storage';
  import type { Edition, Item, Settings } from '@/lib/types';
  import FrontPage from '@/ui/FrontPage.svelte';
  import { keyAction, step } from '@/ui/keys';
  import { buildFrontPage } from '@/ui/model';

  // Dexie isn't needed for the first paint (public/prefetch.js reads the cache), so it loads
  // after; everything that writes or reads more waits for it.
  const dbReady: Promise<DailyTabDB> = import('@/lib/db').then((m) => m.getDB());
  const openedAt = Date.now();

  let snap = $state.raw<Snapshot | null>(null);
  let now = $state(openedAt);
  let online = $state(navigator.onLine);
  let pending = $state.raw<{ edition: Edition; items: Map<string, Item>; count: number } | null>(
    null,
  );
  let fresh = $state(false);
  let refreshing = $state(false);
  let more = $state.raw(new Map<string, string[]>());
  let starting = $state(false);
  let startError = $state('');

  const view = $derived(snap ? buildFrontPage({ ...snap, now, online, more }) : null);

  const firstRun = $derived(
    snap && !snap.edition
      ? {
          busy: starting,
          error: startError,
          sections: snap.settings.sections
            .concat(snap.feeds.map((f) => f.category))
            .filter((c, i, all) => all.indexOf(c) === i)
            .map((name) => ({
              name,
              feeds: snap!.feeds.filter((f) => f.category === name).map((f) => f.title),
            }))
            .filter((s) => s.feeds.length > 0),
        }
      : null,
  );

  // Load ------------------------------------------------------------------------------------

  async function load() {
    snap = await loadSnapshot(() => dbReady);
    performance.mark('dt:data');
    applyAppearance(snap.settings);
    await tick();
    // Budget (< 100 ms, scripts/verify-newtab.mjs): headlines from cache are in the page.
    performance.mark('first-headlines');
    if (!snap.edition) void resumeFirstRun();
    // Faces are preloaded and font-display: block, so text first paints in its real typeface.
    // Also record when that is (after the first layout pulls the fonts in).
    requestAnimationFrame(() => {
      void document.fonts.ready.then(() => {
        performance.mark('dt:headlines-visible');
        if (!document.fonts.check('700 20px "Playfair Display"')) {
          performance.mark('dt:fonts-late');
        }
      });
    });
  }

  // Live updates ----------------------------------------------------------------------------

  async function onEdition(id: string) {
    if (!snap || snap.edition?.id === id || pending?.edition.id === id) return;
    const db = await dbReady;
    const edition = await db.editions.get(id);
    if (!edition) return;
    const items = await loadEditionItems(db, edition);
    if (!snap.edition) {
      // The first edition replaces the chooser directly; there is nothing to reflow.
      snap = { ...snap, edition, items };
      starting = false;
      fade();
      return;
    }
    const count = newStoryCount(snap.edition, edition);
    // A reshuffle with no new stories isn't worth interrupting for; the next tab shows it.
    if (count > 0) pending = { edition, items, count };
  }

  function showNewEdition() {
    if (!snap || !pending) return;
    snap = { ...snap, edition: pending.edition, items: pending.items };
    pending = null;
    more = new Map();
    window.scrollTo({ top: 0 });
    fade();
  }

  function fade() {
    fresh = false;
    requestAnimationFrame(() => (fresh = true));
  }

  async function reloadStates() {
    if (snap) snap = { ...snap, states: await (await dbReady).feedState.toArray() };
  }

  function onMessage(msg: Broadcast) {
    if (msg.type === 'edition-updated') void onEdition(msg.editionId);
    if (msg.type === 'refresh-state') {
      refreshing = msg.running;
      if (!msg.running) void reloadStates();
    }
  }

  function onStorage(changes: Record<string, { newValue?: unknown }>, area: string) {
    if (!snap) return;
    if (area === 'sync' && changes.settings) {
      const settings = { ...DEFAULT_SETTINGS, ...(changes.settings.newValue as Partial<Settings>) };
      snap = { ...snap, settings };
      applyAppearance(settings);
    }
    if (area === 'sync' && Object.keys(changes).some(isFeedKey)) {
      void getFeeds().then((feeds) => snap && (snap = { ...snap, feeds }));
    }
  }

  // Reader actions --------------------------------------------------------------------------

  function open(id: string, e: MouseEvent) {
    if (!snap) return;
    const item = snap.items.get(id);
    if (!item) return;
    const t = Date.now();
    const write = dbReady.then((db) => markRead(db, id, t));
    snap = { ...snap, items: withItems(snap.items, [{ ...item, readAt: t }]) };

    // A plain click leaves the page; give the write a moment to land first.
    const plain = e.type === 'click' && e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey;
    if (plain && !e.altKey) {
      e.preventDefault();
      void Promise.race([write, new Promise((r) => setTimeout(r, 150))]).finally(() => {
        location.href = item.link;
      });
    }
  }

  async function toggleMore(category: string) {
    if (!snap) return;
    if (more.has(category)) {
      more = withEntry(more, category, null);
      return;
    }
    const extra = await moreInSection(await dbReady, snap.feeds, category, shownKeys(snap.items));
    snap = { ...snap, items: withItems(snap.items, extra) };
    more = withEntry(
      more,
      category,
      extra.map((i) => i.id),
    );
  }

  async function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      await browser.runtime.sendMessage({ type: 'refresh', force: true });
    } catch {
      /* worker restarting; the alarm will catch up */
    } finally {
      refreshing = false;
      void reloadStates();
    }
  }

  // First run -------------------------------------------------------------------------------

  function chosenFeeds(sections: string[]) {
    return snap ? snap.feeds.filter((f) => sections.includes(f.category)) : [];
  }

  /** Called from the chooser's click: the permission request must happen inside the gesture. */
  function start(sections: string[]) {
    if (!snap) return;
    const feeds = chosenFeeds(sections);
    starting = true;
    startError = '';
    browser.permissions
      .request({ origins: originPatterns(feeds.map((f) => f.url)) })
      .then(async (granted) => {
        if (!granted) {
          starting = false;
          startError =
            'Without permission to read these sites, there is nothing to print. Try again when ready.';
          return;
        }
        const dropped = snap!.feeds.filter((f) => !sections.includes(f.category));
        await Promise.all(dropped.map((f) => removeFeed(f.id)));
        await saveSettings({ sections });
        await press();
      })
      .catch((e: unknown) => {
        starting = false;
        startError = e instanceof Error ? e.message : String(e);
      });
  }

  /** Access already granted (e.g. a reinstall) but no edition yet: go straight to press. */
  async function resumeFirstRun() {
    if (!snap || snap.feeds.length === 0) return;
    const origins = originPatterns(snap.feeds.map((f) => f.url));
    if (await browser.permissions.contains({ origins })) {
      starting = true;
      await press();
    }
  }

  async function press() {
    await browser.runtime.sendMessage({ type: 'refresh', force: true }).catch(() => undefined);
    const edition = await (await dbReady).latestEdition();
    if (edition) await onEdition(edition.id);
    else if (snap && !snap.edition) {
      starting = false;
      startError = navigator.onLine
        ? 'None of the feeds could be reached just now. Try again in a moment.'
        : 'You appear to be offline. The first edition will print when you reconnect.';
    }
  }

  // Keyboard --------------------------------------------------------------------------------

  /** Headline links in reading order: lead, secondary, bands (and "More"), In Brief. */
  const storyLinks = () => [
    ...document.querySelectorAll<HTMLAnchorElement>('main article[data-story] .headline a'),
  ];

  let current = -1;

  function onKey(e: KeyboardEvent) {
    const action = keyAction(e);
    if (!action || !snap?.edition) return;
    e.preventDefault();
    const links = storyLinks();
    // Tabbing or clicking moves the reading position too.
    const focused = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (focused !== -1) current = focused;

    if (action === 'next' || action === 'prev') {
      current = step(current, links.length, action === 'next' ? 1 : -1);
      const link = links[current];
      if (!link) return;
      link.focus({ preventScroll: true });
      link.closest('article')?.scrollIntoView({ block: 'nearest' });
    } else if (action === 'open') {
      (links[current] ?? links[0])?.click();
    } else if (action === 'refresh') {
      void refresh();
    } else if (action === 'new') {
      showNewEdition();
    }
  }

  // Lifecycle -------------------------------------------------------------------------------

  onMount(() => {
    void load();
    document.addEventListener('keydown', onKey);

    browser.runtime.onMessage.addListener(onMessage);
    browser.storage.onChanged.addListener(onStorage);
    const setOnline = () => (online = navigator.onLine);
    addEventListener('online', setOnline);
    addEventListener('offline', setOnline);

    // "New since your last visit" compares against when this page was opened, recorded as
    // the page is left, so stories that arrive while it's open still count as new next time.
    const leave = () => void setLastVisitAt(openedAt);
    const onVisibility = () => document.visibilityState === 'hidden' && leave();
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', onVisibility);

    const clock = setInterval(() => (now = Date.now()), 30_000);

    return () => {
      document.removeEventListener('keydown', onKey);
      browser.runtime.onMessage.removeListener(onMessage);
      browser.storage.onChanged.removeListener(onStorage);
      removeEventListener('online', setOnline);
      removeEventListener('offline', setOnline);
      removeEventListener('pagehide', leave);
      document.removeEventListener('visibilitychange', onVisibility);
      clearInterval(clock);
    };
  });
</script>

{#if view}
  <FrontPage
    {view}
    {firstRun}
    {fresh}
    {refreshing}
    newEdition={pending ? { count: pending.count } : null}
    onopen={open}
    onmore={toggleMore}
    onshownew={showNewEdition}
    onstart={start}
    onrefresh={refresh}
    settingsUrl={browser.runtime.getURL('/options.html')}
  />
{/if}
