import { defineConfig } from 'wxt';
import { originPatterns, starterFeeds } from './src/lib/seed';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: ({ mode }) => ({
    name: 'The Daily Tab',
    description: 'Your news, set like the front page of a printed paper.',
    permissions: ['storage', 'alarms'],
    // Requested per feed origin when a feed is added; never granted up front.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    // Automated checks only (`wxt build --mode e2e` → .output/edge-mv3-e2e): headless Edge
    // cannot answer the permission prompt, so the starter origins are pre-granted there.
    ...(mode === 'e2e' && {
      host_permissions: originPatterns(starterFeeds().map((f) => f.url)),
    }),
  }),
});
