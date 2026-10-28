import { browser } from 'wxt/browser';
import { getDB } from '@/lib/db';
import { publishEdition } from '@/lib/edition/publish';
import { refreshFeeds, type RefreshReport } from '@/lib/engine/refresh';
import { discoverFeeds } from '@/lib/feed/discover';
import type { Broadcast, Request } from '@/lib/messages';
import { STARTER_SECTIONS, starterFeeds } from '@/lib/seed';
import { getFeeds, getSettings, isFeedKey, saveFeeds, saveSettings } from '@/lib/storage';

const ALARM = 'refresh';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(async ({ reason }) => {
    if (reason === 'install') await seed();
    await ensureAlarm(true);
    void runRefresh(false);
  });

  browser.runtime.onStartup.addListener(() => void ensureAlarm(false));

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === ALARM) void runRefresh(false);
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
  });

  // A newly granted origin means a feed can be fetched now.
  browser.permissions.onAdded.addListener(() => void runRefresh(false));
});

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
    const { edition, isNew } = await publishEdition(db, feeds, settings.sections, Date.now());
    if (isNew && edition) {
      broadcast({ type: 'edition-updated', editionId: edition.id, number: edition.number });
    }
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
    case 'compose': {
      const [feeds, settings] = await Promise.all([getFeeds(), getSettings()]);
      const { edition, isNew } = await publishEdition(
        getDB(),
        feeds,
        settings.sections,
        Date.now(),
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
