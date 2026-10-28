/// <reference types="vite/client" />

// svelte-check does not resolve .svelte imports from .ts files under TypeScript 6;
// component-to-component imports inside .svelte files are still fully typed.
declare module '*.svelte' {
  import type { Component } from 'svelte';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const component: Component<any>;
  export default component;
}
