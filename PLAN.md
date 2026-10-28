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

- [x] Design tokens: paper, ink, spot, rules, type scale; day + night; grain
- [x] Fonts (Fontsource, Latin woff2, used weights only: 6 files, 128 KB)
- [x] Masthead with ears, folio line between rules, section index, pinned link chips
- [x] 6/4/1-column grid with column rules and hairlines
- [x] Lead story (4 cols): kicker, banner headline, deck, byline, photo, 2-col justified summary, drop cap
- [x] Secondary stories (2 cols)
- [x] Section bands with jump lines; In Brief column
- [x] Corrections box
- [x] Photos: ink (grayscale) / color; fixed aspect ratios
- [x] States: first run, offline, read, new-since-last-visit
- [x] Dev preview page with fixtures (long headlines, missing photos, odd dates, 3-feed repeat)
- [x] Contrast test (≥ 4.5:1, both editions, worst-case grain)
- [x] **STOP: screenshots of day + night at 1440, 1024, 390** (`npm run screenshots`), reviewed

## 3. Live data

- [x] Render latest edition from IndexedDB, no network on the critical path
- [x] "New edition · N stories" button on `edition-updated`
- [x] Read state (mark on open), muted headline
- [x] "New since last visit" dots + ear count; update lastVisitAt (recorded when the page is left)
- [x] Refresh action (folio "Updated 9:42" is the button); corrections box from FeedState; offline folio
- [x] "More in …" expands a band with the next stories from that section
- [x] First run: chooser requests host permissions inside the click, then prints the first edition
- [x] Measure: first headlines < 100 ms (`npm run verify:newtab`: ~60 ms warm; first tab after
      browser start ~120 ms; see Milestone 5)
- [x] Real-feed fixes: one story per feed first in bands; standfirst paragraphs become decks;
      photo-only leads get a wider photo; WordPress originals resized to 1200 px; journal DOI
      boilerplate stripped

## 4. Settings page

- [x] Paper name
- [x] Add feed (site or feed URL → site-origin permission → discovery → feed-origin permission);
      origins no feed uses are released
- [x] Rename feeds and sections, set category, remove (two-step confirm)
- [x] Drag to reorder sections and feeds (grip handle; ↑/↓ buttons as the keyboard path)
- [x] Refresh interval (alarm rescheduled), theme, photo style, spot color (contrast warning),
      pinned links
- [x] OPML import (preview, then one permission request) and export
- [x] Per-feed status (updated / failed with retry time / needs permission + Allow)
- [x] `npm run verify:settings` drives every control in headless Edge

## 5. Polish

- [x] Keyboard: j/k, o/Enter, r, n (document-level listener; no autofocus reliance; ignored
      while typing or with modifiers); key hints in the colophon
- [x] Accessibility: contrast test (both editions, worst-case grain), skip link, single main,
      h1/h2/h3 per spec, every story an article, screen-reader text for "new" dots, polite
      live region for the new-edition button, focus ring in the spot color
- [x] First-run flow: sections chooser (fixed: unticking every box no longer re-ticks them),
      "no feeds yet" state with a Settings link; Settings link in the colophon
- [x] Font loading: critical faces preloaded by a Vite plugin in wxt.config.ts and set to
      `font-display: block`; headline face ready at first paint in 7/7 tabs
- [x] Performance: `public/prefetch.js` (async classic script) starts the cache reads during
      HTML parsing; Dexie lazy-loaded in the new tab (critical-path JS 55.7 → 29.3 KB gz).
      Warm: headlines in the page ~73 ms median, painted in final fonts ~103 ms. Cold first
      tab after browser start: ~126 / ~174 ms. Fixed per-tab cost of the first layout (~25 ms,
      independent of page content; see verify:newtab phase marks) is the remaining floor.
