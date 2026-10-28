import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DailyTabDB } from '@/lib/db';
import type { Feed, Item } from '@/lib/types';

export const fixture = (name: string) =>
  readFileSync(join(__dirname, '..', 'fixtures', 'feeds', name), 'utf8');

export const NOW = Date.parse('2026-10-27T10:00:00Z');
export const HOUR = 60 * 60 * 1000;

let dbCount = 0;
export const freshDB = () => new DailyTabDB(`test-${Date.now()}-${dbCount++}`);

type Route = (req: { url: string; headers: Headers }) => Response | Promise<Response>;

/** A fetch stub routed by URL. Records every call. */
export function mockFetch(routes: Record<string, Route | string>) {
  const calls: { url: string; headers: Headers }[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers);
    calls.push({ url, headers });
    const route = routes[url];
    if (route === undefined) return new Response('not found', { status: 404 });
    if (typeof route === 'string') {
      return new Response(route, { status: 200, headers: { 'content-type': 'application/xml' } });
    }
    return route({ url, headers });
  }) as typeof fetch;
  return Object.assign(impl, { calls });
}

export function feed(id: string, category = 'World', order = 0): Feed {
  return {
    id,
    url: `https://${id}.example.com/feed.xml`,
    siteUrl: `https://${id}.example.com/`,
    title: id.toUpperCase(),
    category,
    order,
  };
}

let itemCount = 0;
export function item(partial: Partial<Item> & Pick<Item, 'feedId'>): Item {
  const n = itemCount++;
  return {
    id: `i${n}`,
    title: `Unrelated headline number ${n} about topic ${n}`,
    link: `https://example.com/${n}`,
    summary: '',
    publishedAt: NOW - HOUR,
    fetchedAt: NOW - HOUR,
    ...partial,
  };
}
