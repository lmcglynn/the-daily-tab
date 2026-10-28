// Dev-only: serves the front page on fixture data in a normal browser (no extension APIs).
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: r('.'),
  plugins: [svelte({ configFile: r('../svelte.config.js') })],
  // Same aliases as WXT's generated tsconfig: @ → src, @@ → project root.
  resolve: { alias: { '@@': r('..'), '@': r('../src') } },
  server: { port: 5199, strictPort: true },
  preview: { port: 5199, strictPort: true },
  build: { outDir: r('../.preview-dist'), emptyOutDir: true },
});
