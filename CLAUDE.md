# The Daily Tab

A Microsoft Edge (Manifest V3) extension that replaces the new-tab page with a news front page laid
out like a printed broadsheet, fed by RSS/Atom feeds. Edge is the primary target; Chrome works from
the same build. Firefox is out of scope.

## Stack

- WXT + TypeScript, `srcDir: src`. Build target `wxt -b edge` → `.output/edge-mv3`.
- Svelte 5 (runes) for UI. Plain CSS with design tokens (custom properties) and CSS Grid. No CSS framework.
- fast-xml-parser for feeds (the service worker has no DOMParser).
- Dexie (IndexedDB): items, editions, feed fetch state.
- `chrome.storage.sync`: settings (`settings` key) and the feed list (one key per feed, `feed:<id>`).
- `chrome.storage.local`: `lastVisitAt` (changes on every new tab).
- `chrome.alarms` for scheduled refresh (default 15 min).
- Vitest + fake-indexeddb for tests. ESLint (flat config) + Prettier.
- Fonts from Fontsource, Latin-subset woff2 only, declared by hand in `src/styles/fonts.css`.

## Commands

| Command                | What it does                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------- |
| `npm run dev:edge`     | WXT dev mode, opens Microsoft Edge (binary set in `web-ext.config.ts`)                            |
| `npm run build:edge`   | Production build → `.output/edge-mv3`                                                             |
| `npm run build:chrome` | Same for Chrome → `.output/chrome-mv3`                                                            |
| `npm run preview`      | Dev-only front page on fixture data at http://localhost:5199 (no extension APIs)                  |
| `npm run screenshots`  | Builds the preview and captures day/night at 1440/1024/390 with headless Edge into `screenshots/` |
| `npm run lint`         | ESLint + Prettier check                                                                           |
| `npm run format`       | Prettier write                                                                                    |
| `npm run typecheck`    | `svelte-check` (covers .ts and .svelte)                                                           |
| `npm test`             | Vitest, run once                                                                                  |
| `npm run check`        | lint + typecheck + test (run before every commit)                                                 |
| `npm run size`         | Reports gzipped new-tab JS and font sizes against budgets                                         |

Node is installed machine-wide (`C:\Program Files\nodejs`). In the Bash tool, prefix
`export PATH="/c/Program Files/nodejs:$PATH"` if `node` is not found.

## Layout

- `src/entrypoints/background.ts`: service worker; alarms, refresh, message handling.
- `src/entrypoints/newtab/`: the front page. `src/entrypoints/options/`: settings.
- `src/lib/`: framework-free logic (feeds, db, storage, edition composer). Must not import Svelte.
- `src/ui/`: Svelte components for the front page, shared by the new tab and the preview.
- `src/styles/`: `tokens.css` (colors, type, spacing), `fonts.css`, `paper.css`.
- `preview/`: dev-only Vite app that renders the front page from `fixtures/`.
- `tests/`: Vitest specs. `fixtures/`: feed XML and edition data.

## Conventions

- The background service worker owns all network work. The new tab never fetches feeds; it reads
  the latest Edition from IndexedDB and listens for `edition-updated` messages.
- Never render feed HTML. Summaries are reduced to plain text (≤ ~300 chars) by `lib/feed/text.ts`.
  Only `http:`/`https:` links and image URLs survive normalization (`safeUrl`).
- Host access is requested per feed origin through `optional_host_permissions` when a feed is added.
  Do not add `<all_urls>` to `host_permissions`.
- Pure functions take `now` as a parameter instead of calling `Date.now()` so tests are deterministic.
- Colors come only from tokens in `tokens.css`; the spot color is used only for kickers, "new" dots
  and focus rings.
- Headings: masthead `h1`, lead `h2`, all other headlines `h3`; every story is an `<article>`.
- Ask before adding any dependency.
- After each milestone: `npm run check`, commit, summarize.
