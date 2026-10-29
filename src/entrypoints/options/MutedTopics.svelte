<script lang="ts">
  import { cleanMutedWords, MAX_MUTED, MAX_MUTED_LENGTH } from '@/lib/mute';

  let {
    words,
    counts,
    onchange,
  }: {
    words: string[];
    /** Stored stories each word matches; absent while counting. */
    counts: Map<string, number>;
    onchange: (words: string[]) => void;
  } = $props();

  let draft = $state('');

  function add(e: SubmitEvent) {
    e.preventDefault();
    // Commas add several at once: "crypto, Taylor Swift".
    const next = cleanMutedWords([...words, ...draft.split(',')]);
    if (next.length !== words.length) onchange(next);
    draft = '';
  }

  const plural = (n: number) => `${n} recent ${n === 1 ? 'story' : 'stories'}`;
</script>

<form class="mute-form" onsubmit={add}>
  <label class="field grow">
    <span>Word or phrase</span>
    <input
      type="text"
      maxlength={MAX_MUTED_LENGTH * 4}
      placeholder="e.g. crypto, Taylor Swift"
      bind:value={draft}
    />
  </label>
  <button type="submit" disabled={!draft.trim() || words.length >= MAX_MUTED}>Mute</button>
</form>

{#if words.length}
  <ul class="muted" aria-label="Muted topics">
    {#each words as word (word)}
      <li>
        <span class="word">{word}</span>
        <span class="count">
          {#if counts.has(word)}{counts.get(word)
              ? `hides ${plural(counts.get(word)!)}`
              : 'nothing to hide right now'}{/if}
        </span>
        <button
          type="button"
          class="link"
          aria-label="Unmute {word}"
          onclick={() => onchange(words.filter((w) => w !== word))}>Unmute</button
        >
      </li>
    {/each}
  </ul>
{/if}
<p class="hint">
  Stories whose headline or summary mentions these are left off the front page. Whole words,
  ignoring capitals and accents; plurals count too ("drone" also mutes "drones").
</p>

<style>
  .mute-form {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: flex-end;
    margin-bottom: 10px;
  }
  .grow {
    flex: 1 1 260px;
  }
  .muted {
    list-style: none;
    margin: 0 0 10px;
    padding: 0;
  }
  .muted li {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 12px;
    align-items: baseline;
    padding: 8px 0;
    border-bottom: 1px solid var(--rule);
  }
  .word {
    font-weight: 600;
  }
  .count {
    flex: 1;
    font-size: 12.5px;
    color: var(--ink-2);
  }
</style>
