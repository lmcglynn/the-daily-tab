import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'The Daily Tab',
    description: 'Your news, set like the front page of a printed paper.',
    permissions: ['storage', 'alarms'],
    // Requested per feed origin when a feed is added; never granted up front.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
  },
});
