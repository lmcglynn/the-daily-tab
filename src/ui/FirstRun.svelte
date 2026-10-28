<script lang="ts">
  import type { SectionChoice } from './model';

  let {
    sections,
    busy = false,
    error = '',
    onstart,
  }: {
    sections: SectionChoice[];
    busy?: boolean;
    error?: string | undefined;
    onstart?: (chosen: string[]) => void;
  } = $props();

  let chosen = $state<string[]>([]);
  $effect.pre(() => {
    if (chosen.length === 0) chosen = sections.map((s) => s.name);
  });
</script>

<article class="first-run" aria-labelledby="first-run-title">
  <p class="kicker">Welcome</p>
  <h2 id="first-run-title" class="headline">Choose your sections</h2>
  <p class="deck">
    Pick what lands on your front page. Each section is fed by a few trusted newsrooms; you can add
    any site with a feed later in Settings.
  </p>
  <form
    onsubmit={(e) => {
      e.preventDefault();
      onstart?.(chosen);
    }}
  >
    <fieldset>
      <legend class="visually-hidden">Sections</legend>
      {#each sections as s (s.name)}
        <label class="choice">
          <input type="checkbox" value={s.name} bind:group={chosen} />
          <span class="name">{s.name}</span>
          <span class="feeds">{s.feeds.join(' · ')}</span>
        </label>
      {/each}
    </fieldset>
    <button class="start" type="submit" disabled={busy || chosen.length === 0}>
      {busy ? 'Going to press…' : 'Print the first edition'}
    </button>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <p class="note">
      Your browser will ask to let The Daily Tab read these sites' feeds. Nothing else is shared.
    </p>
  </form>
</article>

<style>
  .kicker {
    font: 700 11.5px/1.2 var(--font-label);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--spot);
    margin-bottom: 8px;
  }
  .headline {
    font: 700 clamp(30px, 2.4vw + 13px, 48px) / 1.06 var(--font-head);
    margin-bottom: 12px;
  }
  .deck {
    font: italic 400 clamp(18px, 0.6vw + 12px, 22px) / 1.32 var(--font-text);
    color: var(--ink-2);
    margin-bottom: 22px;
    max-width: 40em;
  }
  fieldset {
    border: 0;
    margin: 0 0 20px;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .choice {
    display: grid;
    grid-template-columns: auto 9em 1fr;
    align-items: baseline;
    gap: 14px;
    padding: 12px 0;
    border-bottom: 1px solid var(--rule);
    cursor: pointer;
  }
  input {
    accent-color: var(--ink);
    width: 16px;
    height: 16px;
    transform: translateY(2px);
  }
  .name {
    font: 700 14px/1.2 var(--font-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .feeds {
    font-size: 16px;
    color: var(--ink-2);
  }
  .start {
    font: 700 13px/1 var(--font-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    background: var(--ink);
    color: var(--paper);
    padding: 14px 22px;
  }
  .start:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .error {
    margin-top: 12px;
    font: italic 400 16px/1.4 var(--font-text);
    color: var(--ink);
    border-left: 2px solid var(--ink);
    padding-left: 10px;
  }
  .note {
    margin-top: 12px;
    font-size: 14px;
    color: var(--ink-2);
  }
  @media (max-width: 859px) {
    .choice {
      grid-template-columns: auto 1fr;
    }
    .feeds {
      grid-column: 2;
    }
  }
</style>
