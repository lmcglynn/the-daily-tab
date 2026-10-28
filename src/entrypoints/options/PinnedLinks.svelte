<script lang="ts">
  import { safeUrl } from '@/lib/feed/text';
  import { moveItem } from '@/lib/feeds-edit';
  import type { PinnedLink } from '@/lib/types';

  const MAX = 8;

  let { links, onchange }: { links: PinnedLink[]; onchange: (links: PinnedLink[]) => void } =
    $props();

  // Rows being edited, including incomplete ones that aren't saved yet.
  let rows = $state<{ title: string; url: string }[]>([]);
  let synced = '';
  $effect.pre(() => {
    const incoming = JSON.stringify(links);
    if (incoming !== synced) {
      synced = incoming;
      rows = links.map((l) => ({ ...l }));
    }
  });

  const valid = (r: { title: string; url: string }) =>
    !!r.title.trim() && !!safeUrl(/^[a-z]+:\/\//i.test(r.url) ? r.url : `https://${r.url}`);

  function save() {
    const clean = rows.filter(valid).map((r) => ({
      title: r.title.trim().slice(0, 24),
      url: safeUrl(/^[a-z]+:\/\//i.test(r.url) ? r.url : `https://${r.url}`)!,
    }));
    synced = JSON.stringify(clean);
    onchange(clean);
  }

  function move(i: number, to: number) {
    rows = moveItem(rows, i, to);
    save();
  }

  function remove(i: number) {
    rows = rows.filter((_, j) => j !== i);
    save();
  }
</script>

<ul class="links">
  {#each rows as row, i (i)}
    <li>
      <label class="field">
        <span>Name</span>
        <input type="text" maxlength="24" bind:value={row.title} onchange={save} />
      </label>
      <label class="field grow">
        <span>Address</span>
        <input
          type="text"
          inputmode="url"
          spellcheck="false"
          bind:value={row.url}
          onchange={save}
          aria-invalid={!!row.url && !valid(row)}
        />
      </label>
      <span class="tools">
        <button
          type="button"
          class="icon"
          disabled={i === 0}
          aria-label="Move {row.title || 'link'} up"
          onclick={() => move(i, i - 1)}>↑</button
        >
        <button
          type="button"
          class="icon"
          disabled={i === rows.length - 1}
          aria-label="Move {row.title || 'link'} down"
          onclick={() => move(i, i + 1)}>↓</button
        >
        <button type="button" class="link" onclick={() => remove(i)}>Remove</button>
      </span>
    </li>
  {/each}
</ul>
{#if rows.length < MAX}
  <button type="button" onclick={() => (rows = [...rows, { title: '', url: '' }])}>Add link</button>
{/if}
<p class="hint">Shown as small chips under the masthead. Up to {MAX}.</p>

<style>
  .links {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
  }
  .links li {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
    padding: 8px 0;
    border-bottom: 1px solid var(--rule);
  }
  .grow {
    flex: 1 1 240px;
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  [aria-invalid='true'] {
    border-color: var(--ink);
    border-style: dashed;
  }
</style>
