<script lang="ts">
  import { feedIdFor } from '@/lib/hash';
  import { parseOpml, toOpml, type OpmlFeed } from '@/lib/opml';
  import type { Feed } from '@/lib/types';

  let {
    feeds,
    sections,
    paperName,
    onimport,
  }: {
    feeds: Feed[];
    sections: string[];
    paperName: string;
    /** Must be called inside the click: it requests host permissions for the new feeds. */
    onimport: (list: OpmlFeed[]) => Promise<string | null>;
  } = $props();

  let pending = $state<{ fresh: OpmlFeed[]; existing: number; file: string } | null>(null);
  let message = $state('');
  let error = $state('');

  async function choose(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    error = '';
    message = '';
    pending = null;
    if (!file) return;
    if (file.size > 2_000_000) {
      error = 'That file is too large to be an OPML subscription list.';
      return;
    }
    try {
      const all = parseOpml(await file.text());
      const have = new Set(feeds.map((f) => f.id));
      const fresh = all.filter((f) => !have.has(feedIdFor(f.url)));
      if (all.length === 0) error = 'No feeds found in that file.';
      else pending = { fresh, existing: all.length - fresh.length, file: file.name };
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function confirmImport() {
    if (!pending) return;
    const count = pending.fresh.length;
    void onimport(pending.fresh).then((problem) => {
      if (problem) error = problem;
      else {
        message = `Added ${count} ${count === 1 ? 'feed' : 'feeds'}.`;
        pending = null;
      }
    });
  }

  function exportOpml() {
    const xml = toOpml(feeds, sections, paperName);
    const url = URL.createObjectURL(new Blob([xml], { type: 'text/x-opml' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'daily-tab-feeds.opml';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const sectionsOf = (list: OpmlFeed[]) => [...new Set(list.map((f) => f.category))].join(', ');
</script>

<div class="row">
  <label class="file">
    <span class="button-like">Import OPML…</span>
    <input type="file" accept=".opml,.xml,text/xml,text/x-opml" onchange={choose} />
  </label>
  <button type="button" onclick={exportOpml} disabled={feeds.length === 0}>Export OPML</button>
</div>

{#if pending}
  <div class="preview" role="region" aria-label="Import preview">
    {#if pending.fresh.length}
      <p>
        <strong>{pending.file}</strong> has {pending.fresh.length} new
        {pending.fresh.length === 1 ? 'feed' : 'feeds'} in {sectionsOf(
          pending.fresh,
        )}{pending.existing ? `, and ${pending.existing} you already follow` : ''}.
      </p>
      <p class="hint">Your browser will ask to let The Daily Tab read those sites.</p>
      <button type="button" class="primary" onclick={confirmImport}>
        Add {pending.fresh.length}
        {pending.fresh.length === 1 ? 'feed' : 'feeds'}
      </button>
    {:else}
      <p>You already follow every feed in <strong>{pending.file}</strong>.</p>
    {/if}
    <button type="button" class="link" onclick={() => (pending = null)}>Cancel</button>
  </div>
{/if}
{#if message}<p class="ok" role="status">{message}</p>{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .row {
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .file input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .file:focus-within .button-like {
    outline: 2px solid var(--spot);
    outline-offset: 2px;
  }
  .preview {
    margin-top: 12px;
    padding: 12px 14px;
    border: 1px solid var(--rule);
  }
  .preview p {
    margin: 0 0 8px;
  }
  .ok {
    font-weight: 600;
  }
</style>
