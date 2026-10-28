// Opt-in: hits the real starter feeds. Run with `LIVE=1 npx vitest run tests/live.test.ts`.
import { publishEdition } from '@/lib/edition/publish';
import { refreshFeeds } from '@/lib/engine/refresh';
import { STARTER_SECTIONS, starterFeeds } from '@/lib/seed';
import { freshDB } from './helpers';

describe.runIf(process.env.LIVE)('live starter feeds', () => {
  it('refreshes all starter feeds and composes an edition', { timeout: 60_000 }, async () => {
    const db = freshDB();
    const feeds = starterFeeds();
    const report = await refreshFeeds({
      db,
      feeds,
      fetch: (i, init) => fetch(i, init),
      now: () => Date.now(),
      refreshMinutes: 15,
    });
    const states = await db.feedState.toArray();
    for (const f of feeds) {
      const s = states.find((x) => x.feedId === f.id)!;
      const n = await db.items.where('feedId').equals(f.id).count();
      const withImg = (await db.items.where('feedId').equals(f.id).toArray()).filter(
        (i) => i.imageUrl,
      ).length;
      console.log(
        `${f.title.padEnd(14)} ${s.status.padEnd(6)} items=${String(n).padStart(3)} img=${withImg}`,
        s.lastError ?? '',
      );
    }
    console.log('report', report);
    expect(report.failed).toBe(0);
    expect(report.durationMs).toBeLessThan(30_000);

    const { edition } = await publishEdition(db, feeds, STARTER_SECTIONS, Date.now());
    const get = async (id: string) => (await db.items.get(id))!;
    console.log('LEAD', (await get(edition!.leadItemId)).title);
    for (const id of edition!.leadRelatedItemIds) console.log('  also', (await get(id)).title);
    for (const id of edition!.secondaryItemIds) console.log('SECONDARY', (await get(id)).title);
    for (const s of edition!.sections) console.log('BAND', s.category, s.itemIds.length);
    console.log('BRIEF', edition!.briefItemIds.length);
    const sample = await get(edition!.sections[0]!.itemIds[0]!);
    console.log('SAMPLE', JSON.stringify(sample, null, 1));
    expect(edition).not.toBeNull();
  });
});
