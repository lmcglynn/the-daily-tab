import type { Plugin } from 'vite';
import { defineConfig } from 'wxt';
import { MARKET_ORIGINS } from './src/lib/extras/market';
import { RACING_ORIGINS } from './src/lib/extras/racing';
import { SPORTS_ORIGINS } from './src/lib/extras/scores';
import { WEATHER_ORIGINS } from './src/lib/extras/weather';
import { originPatterns, starterFeeds } from './src/lib/seed';

// Faces visible above the fold. Preloading them from the new tab's <head> means the first
// paint already uses them: no fallback-to-webfont swap on a page meant to feel printed.
const CRITICAL_FONTS =
  /(unifrakturmaguntia-latin-400-normal|playfair-display-latin-700-normal|newsreader-latin-400-(normal|italic)|libre-franklin-latin-(500|700)-normal)-[\w-]+\.woff2$/;

function preloadFonts(): Plugin {
  return {
    name: 'daily-tab:preload-fonts',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !/newtab/.test(ctx.filename)) return html;
        const fonts = Object.keys(ctx.bundle).filter((f) => CRITICAL_FONTS.test(f));
        return {
          html,
          tags: fonts.map((f) => ({
            tag: 'link',
            attrs: {
              rel: 'preload',
              href: `/${f}`,
              as: 'font',
              type: 'font/woff2',
              crossorigin: '',
            },
            injectTo: 'head' as const,
          })),
        };
      },
    },
  };
}

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  vite: () => ({ plugins: [preloadFonts()] }),
  manifest: ({ mode }) => ({
    name: 'The Daily Tab',
    description: 'Your news, set like the front page of a printed paper.',
    // contextMenus: "Save to Clippings" on a story's right-click menu (no install warning).
    permissions: ['storage', 'alarms', 'contextMenus'],
    // Requested per feed origin when a feed is added; never granted up front.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    // Automated checks only (`wxt build --mode e2e` → .output/edge-mv3-e2e): headless Edge
    // cannot answer the permission prompt, so the starter origins are pre-granted there.
    ...(mode === 'e2e' && {
      host_permissions: [
        ...originPatterns(starterFeeds().map((f) => f.url)),
        ...WEATHER_ORIGINS,
        ...MARKET_ORIGINS,
        ...SPORTS_ORIGINS,
        ...RACING_ORIGINS,
      ],
    }),
  }),
});
