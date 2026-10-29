import { decodeBody, fetchFeed } from '@/lib/engine/fetch';
import { quietSince } from '@/lib/dormant';
import {
  MAX_BACKOFF_MS,
  MAX_ITEMS_PER_FEED,
  backoffMs,
  prune,
  refreshFeeds,
  runPool,
  storeItems,
} from '@/lib/engine/refresh';
import { HOUR, NOW, feed, fixture, freshDB, item, mockFetch } from './helpers';

const DAY = 24 * HOUR;

describe('fetchFeed', () => {
  it('sends conditional headers and handles 304', async () => {
    const f = feed('a');
    const fetchImpl = mockFetch({ [f.url]: () => new Response(null, { status: 304 }) });
    const out = await fetchFeed(
      f,
      { etag: '"v1"', lastModified: 'Tue, 27 Oct 2026 08:00:00 GMT' },
      {
        fetch: fetchImpl,
        now: NOW,
      },
    );
    expect(out.kind).toBe('not-modified');
    expect(fetchImpl.calls[0]!.headers.get('if-none-match')).toBe('"v1"');
    expect(fetchImpl.calls[0]!.headers.get('if-modified-since')).toBe(
      'Tue, 27 Oct 2026 08:00:00 GMT',
    );
  });

  it('returns etag and last-modified from a 200', async () => {
    const f = feed('a');
    const fetchImpl = mockFetch({
      [f.url]: () =>
        new Response(fixture('rss2.xml'), {
          headers: { etag: '"v2"', 'last-modified': 'Wed, 28 Oct 2026 00:00:00 GMT' },
        }),
    });
    const out = await fetchFeed(f, {}, { fetch: fetchImpl, now: NOW });
    expect(out).toMatchObject({
      kind: 'ok',
      etag: '"v2"',
      lastModified: 'Wed, 28 Oct 2026 00:00:00 GMT',
    });
  });

  it('times out slow feeds', async () => {
    const f = feed('slow');
    const fetchImpl = ((_: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener('abort', () =>
          rej(new DOMException('aborted', 'AbortError')),
        );
      })) as typeof fetch;
    const out = await fetchFeed(f, {}, { fetch: fetchImpl, now: NOW, timeoutMs: 30 });
    expect(out).toEqual({ kind: 'error', error: 'Timed out after 0.03 s' });
  });

  it('reports HTTP errors and non-feeds', async () => {
    const f = feed('a');
    expect(
      await fetchFeed(
        f,
        {},
        {
          fetch: mockFetch({ [f.url]: () => new Response('', { status: 503 }) }),
          now: NOW,
          retryDelaysMs: [],
        },
      ),
    ).toMatchObject({ kind: 'error', error: 'HTTP 503' });
    expect(
      await fetchFeed(
        f,
        {},
        { fetch: mockFetch({ [f.url]: '<html><body>hi</body></html>' }), now: NOW },
      ),
    ).toMatchObject({ kind: 'error', error: 'Not an RSS or Atom feed' });
  });
});

describe('fetchFeed retries', () => {
  const flaky = (failures: number) => {
    let calls = 0;
    const impl = (async () => {
      calls++;
      if (calls <= failures) throw new TypeError('Failed to fetch'); // e.g. a sign-in bounce
      return new Response(fixture('rss2.xml'));
    }) as unknown as typeof fetch;
    return { impl, calls: () => calls };
  };

  it('retries transient network failures and succeeds', async () => {
    const f = flaky(2);
    const out = await fetchFeed(feed('a'), {}, { fetch: f.impl, now: NOW, retryDelaysMs: [1, 1] });
    expect(out.kind).toBe('ok');
    expect(f.calls()).toBe(3);
  });

  it('gives up after the last retry', async () => {
    const f = flaky(5);
    const out = await fetchFeed(feed('a'), {}, { fetch: f.impl, now: NOW, retryDelaysMs: [1, 1] });
    expect(out).toEqual({ kind: 'error', error: 'Could not be reached' });
    expect(f.calls()).toBe(3);
  });

  it('does not retry permanent errors', async () => {
    const f = feed('a');
    const fetchImpl = mockFetch({ [f.url]: () => new Response('', { status: 404 }) });
    await fetchFeed(f, {}, { fetch: fetchImpl, now: NOW, retryDelaysMs: [1, 1] });
    expect(fetchImpl.calls).toHaveLength(1);
  });
});

describe('decodeBody', () => {
  it('honours the XML encoding declaration', () => {
    const xml =
      '<?xml version="1.0" encoding="ISO-8859-1"?><rss><channel><title>Café</title></channel></rss>';
    const bytes = Uint8Array.from(xml, (c) => c.charCodeAt(0)); // Latin-1 bytes
    expect(decodeBody(bytes.buffer, 'application/xml')).toContain('Café');
  });

  it('prefers the HTTP charset', () => {
    const bytes = new TextEncoder().encode('<?xml version="1.0" encoding="ISO-8859-1"?><x>é</x>');
    expect(decodeBody(bytes.buffer, 'text/xml; charset=utf-8')).toContain('<x>é</x>');
  });
});

describe('runPool', () => {
  it('never runs more than the limit at once', async () => {
    let active = 0;
    let peak = 0;
    await runPool(
      Array.from({ length: 20 }, (_, i) => i),
      6,
      async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 2));
        active--;
      },
    );
    expect(peak).toBe(6);
  });
});

describe('backoffMs', () => {
  it('doubles the interval per failure and caps at 6 hours', () => {
    expect(backoffMs(15, 1)).toBe(30 * 60_000);
    expect(backoffMs(15, 2)).toBe(60 * 60_000);
    expect(backoffMs(15, 10)).toBe(MAX_BACKOFF_MS);
  });
});

describe('refreshFeeds', () => {
  it('fetches, stores, and records success state', async () => {
    const db = freshDB();
    const f = feed('a');
    const report = await refreshFeeds({
      db,
      feeds: [f],
      fetch: mockFetch({
        [f.url]: () => new Response(fixture('rss2.xml'), { headers: { etag: '"e"' } }),
      }),
      now: () => NOW,
      refreshMinutes: 15,
    });
    expect(report).toMatchObject({ fetched: 1, failed: 0, newItems: 4 });
    expect(await db.items.count()).toBe(4);
    expect(await db.feedState.get(f.id)).toMatchObject({
      status: 'ok',
      etag: '"e"',
      failCount: 0,
      lastSuccessAt: NOW,
    });
  });

  it('remembers the newest entry date, even when every entry is too old to keep', async () => {
    const db = freshDB();
    const f = feed('quiet');
    const old = Date.parse('2025-12-13T08:01:00Z');
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>Quiet</title>
      <item><title>Last story before the pause</title><link>https://quiet.example.com/a</link>
        <pubDate>${new Date(old).toUTCString()}</pubDate></item>
      <item><title>An older story still</title><link>https://quiet.example.com/b</link>
        <pubDate>${new Date(old - 5 * DAY).toUTCString()}</pubDate></item>
    </channel></rss>`;
    let status = 200;
    const run = () =>
      refreshFeeds({
        db,
        feeds: [f],
        fetch: mockFetch({
          [f.url]: () => (status === 304 ? new Response(null, { status }) : new Response(rss)),
        }),
        now: () => NOW,
        refreshMinutes: 15,
        force: true,
      });
    await run();
    expect(await db.items.count()).toBe(0);
    const state = (await db.feedState.get(f.id))!;
    expect(state).toMatchObject({ status: 'ok', latestItemAt: old });
    expect(quietSince(state, NOW)).toBe(old);
    // "Not modified" keeps what we knew.
    status = 304;
    await run();
    expect((await db.feedState.get(f.id))!.latestItemAt).toBe(old);
  });

  it('flags a feed as quiet only after two weeks without a story', () => {
    const base = { feedId: 'x', status: 'ok' as const, failCount: 0 };
    expect(quietSince({ ...base, latestItemAt: NOW - 13 * DAY }, NOW)).toBeNull();
    expect(quietSince({ ...base, latestItemAt: NOW - 15 * DAY }, NOW)).toBe(NOW - 15 * DAY);
    expect(quietSince({ ...base }, NOW)).toBeNull(); // no dated entries
    expect(quietSince({ ...base, status: 'error', latestItemAt: NOW - 90 * DAY }, NOW)).toBeNull(); // failures are reported as failures
  });

  it('backs off after failures and skips the feed until then', async () => {
    const db = freshDB();
    const f = feed('down');
    const fetchImpl = mockFetch({ [f.url]: () => new Response('', { status: 500 }) });
    const run = (now: number, force = false) =>
      refreshFeeds({ db, feeds: [f], fetch: fetchImpl, now: () => now, refreshMinutes: 15, force });

    await run(NOW);
    expect(await db.feedState.get(f.id)).toMatchObject({
      status: 'error',
      failCount: 1,
      lastError: 'HTTP 500',
      lastErrorAt: NOW,
      nextFetchAt: NOW + 30 * 60_000,
    });

    expect((await run(NOW + 15 * 60_000)).skipped).toBe(1);
    expect(fetchImpl.calls).toHaveLength(1);

    await run(NOW + 31 * 60_000);
    expect((await db.feedState.get(f.id))!.failCount).toBe(2);
    expect((await db.feedState.get(f.id))!.nextFetchAt).toBe(NOW + 31 * 60_000 + 60 * 60_000);

    await run(NOW + 32 * 60_000, true); // manual refresh ignores backoff
    expect(fetchImpl.calls).toHaveLength(3);
  });

  it('marks feeds without host permission and does not fetch them', async () => {
    const db = freshDB();
    const f = feed('locked');
    const fetchImpl = mockFetch({});
    await refreshFeeds({
      db,
      feeds: [f],
      fetch: fetchImpl,
      now: () => NOW,
      refreshMinutes: 15,
      hasAccess: async () => false,
    });
    expect(fetchImpl.calls).toHaveLength(0);
    expect((await db.feedState.get(f.id))!.status).toBe('no-permission');
  });

  it('clears the failure count after a success', async () => {
    const db = freshDB();
    const f = feed('flaky');
    await db.feedState.put({ feedId: f.id, status: 'error', failCount: 3, lastError: 'x' });
    await refreshFeeds({
      db,
      feeds: [f],
      fetch: mockFetch({ [f.url]: fixture('atom.xml') }),
      now: () => NOW,
      refreshMinutes: 15,
      force: true,
    });
    expect(await db.feedState.get(f.id)).toMatchObject({ status: 'ok', failCount: 0 });
  });

  it('refreshes 50 feeds within budget with 6 in parallel', async () => {
    const db = freshDB();
    const feeds = Array.from({ length: 50 }, (_, i) => feed(`f${i}`));
    let active = 0;
    let peak = 0;
    const routes = Object.fromEntries(
      feeds.map((f) => [
        f.url,
        async () => {
          active++;
          peak = Math.max(peak, active);
          await new Promise((r) => setTimeout(r, 5));
          active--;
          return new Response(fixture('rss2.xml'));
        },
      ]),
    );
    const report = await refreshFeeds({
      db,
      feeds,
      fetch: mockFetch(routes),
      now: () => Date.now(),
      refreshMinutes: 15,
    });
    expect(peak).toBe(6);
    expect(report.fetched).toBe(50);
    expect(report.durationMs).toBeLessThan(30_000);
  });
});

describe('storeItems', () => {
  it('keeps readAt, storyId and first-seen time when an item is refetched', async () => {
    const db = freshDB();
    const a = item({ feedId: 'a', id: 'x', fetchedAt: NOW - HOUR });
    await storeItems(db, [a]);
    await db.items.update('x', { readAt: NOW - 1, storyId: 's1' });
    const added = await storeItems(db, [{ ...a, title: 'Updated', fetchedAt: NOW }]);
    expect(added).toBe(0);
    expect(await db.items.get('x')).toMatchObject({
      title: 'Updated',
      readAt: NOW - 1,
      storyId: 's1',
      fetchedAt: NOW - HOUR,
    });
  });
});

describe('prune', () => {
  it('keeps 200 newest per feed, drops > 30 days and removed feeds', async () => {
    const db = freshDB();
    const many = Array.from({ length: MAX_ITEMS_PER_FEED + 25 }, (_, i) =>
      item({ feedId: 'a', id: `a${i}`, publishedAt: NOW - i * 60_000 }),
    );
    const old = item({ feedId: 'b', id: 'old', publishedAt: NOW - 31 * DAY });
    const fresh = item({ feedId: 'b', id: 'fresh', publishedAt: NOW });
    const orphan = item({ feedId: 'gone', id: 'orphan', publishedAt: NOW });
    await db.items.bulkPut([...many, old, fresh, orphan]);
    await db.feedState.put({ feedId: 'gone', status: 'ok', failCount: 0 });

    await prune(db, ['a', 'b'], NOW);

    expect(await db.items.where('feedId').equals('a').count()).toBe(MAX_ITEMS_PER_FEED);
    expect(await db.items.get('a0')).toBeDefined();
    expect(await db.items.get(`a${MAX_ITEMS_PER_FEED}`)).toBeUndefined();
    expect(await db.items.get('old')).toBeUndefined();
    expect(await db.items.get('fresh')).toBeDefined();
    expect(await db.items.get('orphan')).toBeUndefined();
    expect(await db.feedState.get('gone')).toBeUndefined();
  });
});
