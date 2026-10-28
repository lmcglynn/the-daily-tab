<script lang="ts">
  // Query params: theme=day|night|system, photos=ink|color,
  // state=normal|offline|firstrun|newedition, toolbar=0 (hide for screenshots).
  import FrontPage from '@/ui/FrontPage.svelte';
  import { buildFrontPage } from '@/ui/model';
  import * as fx from '@@/fixtures/frontpage';

  const params = new URLSearchParams(location.search);
  const theme = params.get('theme') ?? 'system';
  const photos = params.get('photos') ?? 'ink';
  const state = params.get('state') ?? 'normal';
  const toolbar = params.get('toolbar') !== '0';

  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  root.dataset.photos = photos;

  const view = buildFrontPage({
    edition: state === 'firstrun' ? null : fx.edition,
    items: new Map(fx.items.map((i) => [i.id, i])),
    feeds: fx.feeds,
    states: fx.states,
    // A real first run happens on install day: No. 1.
    settings: state === 'firstrun' ? { ...fx.settings, installedAt: fx.NOW } : fx.settings,
    lastVisitAt: state === 'firstrun' ? undefined : fx.lastVisitAt,
    now: fx.NOW,
    online: state !== 'offline',
    weather: fx.weather,
    market: fx.market,
  });

  const firstRun =
    state === 'firstrun'
      ? {
          busy: false,
          sections: fx.settings.sections.map((name) => ({
            name,
            feeds: fx.feeds.filter((f) => f.category === name).map((f) => f.title),
          })),
        }
      : null;

  const link = (patch: Record<string, string>) => {
    // A throwaway copy to build an href; not component state.
    // eslint-disable-next-line svelte/prefer-svelte-reactivity
    const p = new URLSearchParams(location.search);
    for (const [k, v] of Object.entries(patch)) p.set(k, v);
    return `?${p}`;
  };
</script>

<FrontPage
  {view}
  {firstRun}
  newEdition={state === 'newedition' ? { count: 6 } : null}
  onmore={(c) => console.info('more in', c)}
  onopen={(id) => console.info('open', id)}
/>

{#if toolbar}
  <nav class="toolbar" aria-label="Preview controls">
    <span>Preview</span>
    {#each ['system', 'day', 'night'] as t (t)}
      <a href={link({ theme: t })} aria-current={theme === t}>{t}</a>
    {/each}
    <span>|</span>
    {#each ['ink', 'color'] as p (p)}
      <a href={link({ photos: p })} aria-current={photos === p}>{p}</a>
    {/each}
    <span>|</span>
    {#each ['normal', 'offline', 'firstrun', 'newedition'] as s (s)}
      <a href={link({ state: s })} aria-current={state === s}>{s}</a>
    {/each}
  </nav>
{/if}

<style>
  .toolbar {
    position: fixed;
    right: 12px;
    bottom: 12px;
    display: flex;
    gap: 8px;
    padding: 6px 10px;
    font:
      12px/1.4 system-ui,
      sans-serif;
    background: #222;
    color: #ddd;
    border-radius: 4px;
    opacity: 0.85;
  }
  .toolbar a {
    color: #9cf;
  }
  .toolbar a[aria-current='true'] {
    color: #fff;
    font-weight: 700;
    text-decoration: underline;
  }
</style>
