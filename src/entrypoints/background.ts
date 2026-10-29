import { browser } from 'wxt/browser';
import { getDB } from '@/lib/db';
import { publishEdition } from '@/lib/edition/publish';
import { refreshFeeds, type RefreshReport } from '@/lib/engine/refresh';
import { lookupTicker } from '@/lib/extras/market';
import { MARKETS_KEY, SCORES_KEY, WEATHER_KEY, refreshExtras } from '@/lib/extras/refresh';
import { fetchTeams } from '@/lib/extras/scores';
import { geocode } from '@/lib/extras/weather';
import { discoverFeeds } from '@/lib/feed/discover';
import type { Broadcast, Request } from '@/lib/messages';
import { STARTER_SECTIONS, starterFeeds } from '@/lib/seed';
import { getFeeds, getSettings, isFeedKey, saveFeeds, saveSettings } from '@/lib/storage';

const ALARM = 'refresh';
/** One-off, while a followed team is playing: keeps the scores box current between refreshes. */
const SCORES_ALARM = 'scores';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') await seed();
    // The single-quote cache from before the tickers list.
    if (reason === 'update') await browser.storage.local.remove('market');
    await ensureAlarm(true);
    void runRefresh(false);
  });

  browser.runtime.onStartup.addListener(() => void ensureAlarm(false));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runRefresh(false);
    if (alarm.name === SCORES_ALARM) void runExtras(false);
  });

  browser.runtime.onMessage.addListener((msg: Request, _sender, sendResponse) => {
    handle(msg).then(sendResponse, (e: unknown) => sendResponse({ error: String(e) }));
    return true; // async response
  });

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    const settings = changes.settings;
    const oldMin = (settings?.oldValue as { refreshMinutes?: number } | undefined)?.refreshMinutes;
    const newMin = (settings?.newValue as { refreshMinutes?: number } | undefined)?.refreshMinutes;
    if (settings && oldMin !== newMin) void ensureAlarm(true);
    if (Object.keys(changes).some(isFeedKey)) scheduleFeedsChanged();
    else if (settings && layoutKey(settings.oldValue) !== layoutKey(settings.newValue)) {
      // Section order and muted topics change the layout but need no fetch.
      scheduleCompose();
    }
    if (settings && extrasKey(settings.oldValue) !== extrasKey(settings.newValue)) {
      // New place, units or ticker toggle: fetch now rather than at the next alarm.
      void runExtras(true);
    }
  });

  // A newly granted origin means a feed (or the weather/market source) can be fetched now.
  browser.permissions.onAdded.addListener(() => {
    void runRefresh(false);
    void runExtras(true);
  });
});

const extrasKey = (v: unknown) => {
  const s = (v ?? {}) as {
    weatherPlace?: unknown;
    units?: unknown;
    tickers?: unknown;
    teams?: unknown;
  };
  return JSON.stringify([s.weatherPlace ?? null, s.units ?? 'f', s.tickers ?? [], s.teams ?? []]);
};

async function runExtras(force: boolean): Promise<void> {
  try {
    const { liveScores } = await refreshExtras({
      settings: await getSettings(),
      fetch: (input, init) => fetch(input, init),
      now: Date.now(),
      force,
      hasAccess: (origins) => browser.permissions.contains({ origins }),
      read: () => browser.storage.local.get([WEATHER_KEY, MARKETS_KEY, SCORES_KEY]),
      write: (patch) => browser.storage.local.set(patch),
    });
    if (liveScores) await browser.alarms.create(SCORES_ALARM, { delayInMinutes: 2 });
    else await browser.alarms.clear(SCORES_ALARM);
  } catch (e) {
    console.warn('[daily-tab] weather/market refresh failed', e);
  }
}

async function seed() {
  const existing = await getFeeds();
  const settings = await getSettings();
  if (existing.length === 0) await saveFeeds(starterFeeds());
  await saveSettings({
    installedAt: settings.installedAt || Date.now(),
    sections: settings.sections.length ? settings.sections : STARTER_SECTIONS,
  });
}

async function ensureAlarm(reset: boolean) {
  const { refreshMinutes } = await getSettings();
  const current = await browser.alarms.get(ALARM);
  if (current && !reset && current.periodInMinutes === refreshMinutes) return;
  await browser.alarms.create(ALARM, {
    periodInMinutes: refreshMinutes,
    delayInMinutes: refreshMinutes,
  });
}

let feedsChangedTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleFeedsChanged() {
  clearTimeout(feedsChangedTimer);
  // New feeds have no fetch state, so a normal refresh picks them up; removed ones get pruned.
  feedsChangedTimer = setTimeout(() => void runRefresh(false), 1500);
}

const layoutKey = (v: unknown) => {
  const s = (v ?? {}) as { sections?: unknown; mutedWords?: unknown };
  return JSON.stringify([s.sections ?? [], s.mutedWords ?? []]);
};

let composeTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleCompose() {
  clearTimeout(composeTimer);
  composeTimer = setTimeout(() => void handle({ type: 'compose' }), 800);
}

let running: Promise<RefreshReport | null> | null = null;

function runRefresh(force: boolean): Promise<RefreshReport | null> {
  running ??= doRefresh(force).finally(() => {
    running = null;
  });
  return running;
}

async function doRefresh(force: boolean): Promise<RefreshReport | null> {
  broadcast({ type: 'refresh-state', running: true });
  try {
    const [feeds, settings] = await Promise.all([getFeeds(), getSettings()]);
    const db = getDB();
    const report = await refreshFeeds({
      db,
      feeds,
      fetch: (input, init) => fetch(input, init),
      now: () => Date.now(),
      refreshMinutes: settings.refreshMinutes,
      force,
      hasAccess: (url) => browser.permissions.contains({ origins: [`${new URL(url).origin}/*`] }),
    });
    const { edition, isNew } = await publishEdition(
      db,
      feeds,
      settings.sections,
      Date.now(),
      settings.mutedWords,
    );
    if (isNew && edition) {
      broadcast({ type: 'edition-updated', editionId: edition.id, number: edition.number });
    }
    // Weather and the S&P 500 keep their own (longer) freshness windows unless forced.
    await runExtras(force);
    console.info('[daily-tab] refresh', report, isNew ? `edition ${edition?.number}` : '');
    return report;
  } catch (e) {
    console.error('[daily-tab] refresh failed', e);
    return null;
  } finally {
    broadcast({ type: 'refresh-state', running: false });
  }
}

async function handle(msg: Request): Promise<unknown> {
  switch (msg.type) {
    case 'refresh':
      return runRefresh(!!msg.force);
    case 'discover':
      try {
        return { feeds: await discoverFeeds(msg.url, (i, init) => fetch(i, init)) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    case 'geocode':
      try {
        return { places: await geocode((i, init) => fetch(i, init), msg.query) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    case 'quote':
      try {
        return { ticker: await lookupTicker((i, init) => fetch(i, init), msg.symbol) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    case 'teams':
      try {
        return { teams: await fetchTeams((i, init) => fetch(i, init), msg.league) };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    case 'compose': {
      const [feeds, settings] = await Promise.all([getFeeds(), getSettings()]);
      const { edition, isNew } = await publishEdition(
        getDB(),
        feeds,
        settings.sections,
        Date.now(),
        settings.mutedWords,
      );
      if (isNew && edition) {
        broadcast({ type: 'edition-updated', editionId: edition.id, number: edition.number });
      }
      return { editionId: edition?.id ?? null };
    }
  }
}

function broadcast(msg: Broadcast) {
  // No listeners (no tab open) is normal; ignore the rejection.
  browser.runtime.sendMessage(msg).catch(() => undefined);
}
