# Plan

Budgets: new tab → first headlines from cache < 100 ms · new-tab JS < 100 KB gzipped (excl. fonts) ·
fonts < 300 KB total · 50-feed refresh < 30 s.

## 0. Scaffold

- [x] WXT + Svelte 5 + TS project, `srcDir: src`
- [x] New-tab and options entrypoints (placeholders)
- [x] Background entrypoint (placeholder)
- [x] `web-ext.config.ts` runner points at Microsoft Edge
- [x] Scripts: dev:edge, build:edge, build:chrome, lint, format, typecheck, test, check
- [x] ESLint + Prettier config
- [x] Builds; loads unpacked in Edge; new tab shows a placeholder (`node scripts/smoke-edge.mjs`)

## 1. Feed engine and editor

- [x] Types: Feed, FeedState, Item, Edition, Settings
- [x] Storage: settings + one sync key per feed; lastVisitAt in local
- [x] Dexie schema: items, editions, feedState
- [x] Parser: RSS 2.0, Atom 1.0, RSS 1.0 → normalized Item
- [x] Text: HTML → plain text, ~300 chars, entity decoding; `safeUrl` (http/https only)
- [x] Item id = hash(feedId + guid|link); de-duplicate
- [x] Fetch: conditional GET (ETag / Last-Modified), 6 parallel, 15 s timeout
- [x] Backoff: double interval per failure, cap 6 h; status, last success, last error
- [x] Prune: 200 items per feed, 30 days
- [x] Discovery: `<link rel="alternate">` then /feed, /rss, /rss.xml, /atom.xml
- [x] Story grouping: different feeds, 12 h window, token Jaccard ≥ 0.5
- [x] Edition composer: lead, secondary, section bands, In Brief
- [x] Alarm schedule (default 15 min) + `refresh` message
- [x] Seed starter feeds (verified 2026-10-27: all nine valid, none replaced)
- [x] Fixture-based tests pass (64) + opt-in live test (`LIVE=1`)
- [x] Starter feeds refresh and compose editions in the background with no tab open
      (`npm run verify:background`)

## 2. Static front page on fixtures

- [ ] Design tokens: paper, ink, spot, rules, type scale; day + night; grain
- [ ] Fonts (Fontsource, Latin woff2, used weights only)
- [ ] Masthead with ears, folio line between rules, section index, pinned link chips
- [ ] 6/4/1-column grid with column rules and hairlines
- [ ] Lead story (4 cols): kicker, banner headline, deck, byline, photo, 2-col justified summary, drop cap
- [ ] Secondary stories (2 cols)
- [ ] Section bands with jump lines; In Brief column
- [ ] Corrections box
- [ ] Photos: ink (grayscale) / color; fixed aspect ratios
- [ ] States: first run, offline, read, new-since-last-visit
- [ ] Dev preview page with fixtures (long headlines, missing photos, odd dates, 3-feed repeat)
- [ ] **STOP: screenshots of day + night at 1440, 1024, 390**

## 3. Live data

- [ ] Render latest edition from IndexedDB, no network on the critical path
- [ ] "New edition · N stories" button on `edition-updated`
- [ ] Read state (mark on open), muted headline
- [ ] "New since last visit" dots + ear count; update lastVisitAt
- [ ] Refresh action; corrections box from FeedState; offline folio
- [ ] Measure: first headlines < 100 ms

## 4. Settings page

- [ ] Paper name
- [ ] Add feed (site or feed URL → discovery → permission request)
- [ ] Rename, set category, remove
- [ ] Drag to reorder sections and feeds
- [ ] Refresh interval, theme, photo style, spot color, pinned links
- [ ] OPML import and export

## 5. Polish

- [ ] Keyboard: j/k, o/Enter, r, n (no autofocus reliance)
- [ ] Accessibility pass: contrast ≥ 4.5:1 both editions, landmarks, labels
- [ ] First-run flow ("Choose your sections")
- [ ] Font loading (preload, `font-display`)
- [ ] Performance budget check (`npm run size`, timing)
