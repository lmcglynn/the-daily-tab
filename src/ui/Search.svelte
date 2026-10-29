<script lang="ts">
  import type { StoryView } from './model';
  import Story from './Story.svelte';

  let {
    query = $bindable(''),
    results,
    total,
    loading = false,
    onclose,
    onopen,
    onsave,
  }: {
    query?: string;
    results: StoryView[];
    /** Matches in all (the list shows the newest few). */
    total: number;
    loading?: boolean;
    onclose: () => void;
    onopen?: (id: string, e: MouseEvent) => void;
    onsave?: (id: string) => void;
  } = $props();

  let dialog: HTMLDialogElement;
  let input: HTMLInputElement;

  // Modal: focus stays inside, the page behind is inert, and Esc closes it.
  $effect(() => {
    dialog.showModal();
    input.focus();
  });
</script>

<dialog
  bind:this={dialog}
  class="search"
  aria-label="Search stories"
  {onclose}
  onclick={(e) => e.target === dialog && dialog.close()}
  onkeydown={(e) => {
    // A search box's own Escape only clears its text; here Escape always closes.
    if (e.key === 'Escape') {
      e.preventDefault();
      dialog.close();
    }
  }}
>
  <div class="panel">
    <form method="dialog" class="bar" onsubmit={(e) => e.preventDefault()}>
      <label class="visually-hidden" for="search-input">Search stories</label>
      <input
        id="search-input"
        bind:this={input}
        bind:value={query}
        type="search"
        placeholder="Search the last month’s stories"
        autocomplete="off"
        spellcheck="false"
      />
      <button type="button" class="close" onclick={() => dialog.close()}>Close</button>
    </form>
    <p class="count" role="status">
      {#if loading}
        Gathering stories…
      {:else if query.trim()}
        {total === 0
          ? 'No stories match.'
          : total > results.length
            ? `${total} stories; the ${results.length} best shown.`
            : `${total} ${total === 1 ? 'story' : 'stories'}.`}
      {:else}
        Every word must appear, in the headline or the summary.
      {/if}
    </p>
    {#if results.length}
      <ol class="results">
        {#each results as s (s.id)}
          <li><Story story={s} variant="brief" {onopen} {onsave} /></li>
        {/each}
      </ol>
    {/if}
  </div>
</dialog>

<style>
  .search {
    width: min(720px, calc(100vw - 32px));
    max-height: calc(100vh - 96px);
    margin: 48px auto auto;
    padding: 0;
    border: 1px solid var(--rule-ink);
    border-top: 3px solid var(--rule-ink);
    background: var(--paper);
    color: var(--ink);
    box-shadow: 0 8px 30px rgb(0 0 0 / 0.25);
  }
  .search::backdrop {
    background: rgb(0 0 0 / 0.35);
  }
  .panel {
    padding: 16px 20px 8px;
  }
  .bar {
    display: flex;
    gap: 12px;
    align-items: center;
    border-bottom: 1px solid var(--rule-ink);
    padding-bottom: 8px;
  }
  input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: none;
    color: var(--ink);
    font: 400 24px/1.3 var(--font-text);
    padding: 4px 0;
  }
  input:focus {
    outline: none;
  }
  /* The browser's own clear button: Close and Esc already cover it. */
  input::-webkit-search-cancel-button {
    appearance: none;
  }
  input::placeholder {
    color: var(--ink-muted);
    font-style: italic;
  }
  .close {
    font: 700 11px/1 var(--font-label);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--ink-2);
    padding: 6px 8px;
    border: 1px solid var(--rule);
  }
  .count {
    margin: 10px 0 6px;
    font: italic 400 14.5px/1.4 var(--font-text);
    color: var(--ink-2);
  }
  .results {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .results li {
    padding: 10px 0;
    border-top: 1px solid var(--rule);
  }
</style>
