import { defineWebExtConfig } from 'wxt';

// `npm run dev:edge` opens Microsoft Edge from its default Windows install location.
// Override per machine in web-ext.config.local.ts (git-ignored) if Edge lives elsewhere.
export default defineWebExtConfig({
  binaries: {
    edge: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  },
});
