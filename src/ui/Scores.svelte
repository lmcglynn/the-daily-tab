<script lang="ts">
  import type { SportsView } from './model';

  let {
    scores,
    joined = false,
  }: {
    scores: SportsView[];
    /** Directly under the markets box, sharing its bottom rule as the line between them. */
    joined?: boolean;
  } = $props();

  // Which team the reader last looked at (a per-browser convenience; safe to lose).
  const KEY = 'daily-tab:scores';

  const remembered = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };

  let key = $state<string | null>(remembered());

  // A game in progress is where the box opens, and a game that starts while the page is open
  // brings the box to it; otherwise it stays on the team last viewed.
  let seenLive = new Set<string>();
  $effect.pre(() => {
    const live = scores.filter((s) => s.live).map((s) => s.key);
    const started = live.find((k) => !seenLive.has(k));
    seenLive = new Set(live);
    if (started) key = started;
  });
  const index = $derived(
    Math.max(
      0,
      scores.findIndex((s) => s.key === key),
    ),
  );
  const game = $derived(scores[index]!);
  const many = $derived(scores.length > 1);

  function go(step: number) {
    const next = scores[(index + step + scores.length) % scores.length]!;
    key = next.key;
    try {
      localStorage.setItem(KEY, next.key);
    } catch {
      /* storage blocked: still cycles, just isn't remembered */
    }
  }

  function onkeydown(e: KeyboardEvent) {
    if (!many || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'ArrowLeft') go(-1);
    else if (e.key === 'ArrowRight') go(1);
    else return;
    e.preventDefault();
  }

  // Formula 1's podium takes three lines: with it in the carousel, every entry gets its height,
  // so cycling never changes the box's size.
  const tall = $derived(scores.some((s) => s.kind === 'race'));

  const neighbour = (step: number) => scores[(index + step + scores.length) % scores.length]!.team;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  class="scores"
  class:joined
  aria-roledescription={many ? 'carousel' : undefined}
  aria-label="Scores"
  {onkeydown}
>
  <div class="head">
    <h2 class="label">Scores</h2>
    {#if many}
      <div class="controls">
        <button type="button" aria-label="Previous: {neighbour(-1)}" onclick={() => go(-1)}
          >‹</button
        >
        <span class="pos" aria-hidden="true">{index + 1} of {scores.length}</span>
        <button type="button" aria-label="Next: {neighbour(1)}" onclick={() => go(1)}>›</button>
      </div>
    {/if}
  </div>

  <div class="game" class:tall aria-live={many ? 'polite' : undefined}>
    <span class="visually-hidden">{game.label}</span>
    {#if game.kind === 'race'}
      <div class="row" aria-hidden="true">
        <span class="team">{game.race}</span>
        <span class="status">{game.status}</span>
      </div>
      <ol class="podium" aria-hidden="true">
        {#each game.podium as p (p.position)}
          <li>
            <span class="place">{p.position}</span><span class="driver">{p.driver}</span><span
              class="constructor">{p.constructor}</span
            >
          </li>
        {/each}
      </ol>
    {:else}
      <div class="row" aria-hidden="true">
        <span class="team">{game.team}</span>
        {#if game.score}<span class="score">{game.score}</span>{/if}
      </div>
      <div class="row line" aria-hidden="true">
        <span class="result-line">
          {#if game.live}<span class="result live"><span class="live-dot"></span>Live</span
            >{:else if game.result}<span class="result">{game.result}</span>{/if}{game.opponent}
        </span>
        <span class="status">{game.status}</span>
      </div>
    {/if}
    <!-- Always present, so every team is the same height and cycling never reflows. -->
    <p class="next" aria-hidden="true">{game.next || ' '}</p>
  </div>
</section>

<style>
  /* Matches the markets box (Ticker.svelte) so the two read as a pair. */
  .scores {
    padding: 7px 0 8px;
    border-top: 2px solid var(--rule-ink);
    border-bottom: 1px solid var(--rule-ink);
    font-family: var(--font-label);
    color: var(--ink);
  }
  .scores.joined {
    border-top: 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    /* As tall as the arrows, with or without them: markets and scores always match. */
    min-height: 22px;
    margin-bottom: 6px;
  }
  .label {
    font: 700 10.5px/1.4 var(--font-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .controls {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .controls button {
    width: 22px;
    height: 22px;
    display: grid;
    place-items: center;
    font: 700 16px/1 var(--font-head);
    color: var(--ink);
    border: 1px solid var(--rule);
    border-radius: 2px;
  }
  .controls button:hover {
    border-color: var(--rule-ink);
  }
  .pos {
    min-width: 3.6em;
    text-align: center;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    font-variant-numeric: tabular-nums;
    color: var(--ink-2);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    /* The markets box's price line: 19px type at 1.2. */
    min-height: calc(19px * 1.2);
  }
  /* The markets box's sparkline row is 34px; this one matches it. */
  .line {
    min-height: 34px;
  }
  .team {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .score {
    flex: none;
    font: 700 19px/1.2 var(--font-head);
    font-variant-numeric: lining-nums tabular-nums;
  }
  .result-line {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12.5px;
    font-weight: 500;
  }
  .result {
    display: inline-block;
    min-width: 1.6em;
    margin-right: 6px;
    padding: 1px 4px;
    border: 1px solid var(--rule-ink);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-align: center;
    text-transform: uppercase;
  }
  .live-dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    margin-right: 5px;
    border-radius: 50%;
    background: var(--spot);
    vertical-align: 0.06em;
  }
  .status {
    flex: none;
    font-size: 11.5px;
    letter-spacing: 0.04em;
    color: var(--ink-2);
    white-space: nowrap;
  }
  .game.tall {
    display: flex;
    flex-direction: column;
    /* A race's rows: title 22.8 + podium 3 × 17 + 2 + next 4 + 15.2. */
    min-height: 95px;
  }
  .game.tall .next {
    margin-top: auto;
    padding-top: 4px;
  }
  .podium {
    list-style: none;
    margin: 2px 0 0;
    padding: 0;
  }
  .podium li {
    display: flex;
    align-items: baseline;
    gap: 8px;
    /* Exactly 17px a line, whatever the mix of faces: the box's height is fixed above. */
    height: 17px;
    font-size: 12.5px;
    line-height: 17px;
    white-space: nowrap;
  }
  .place {
    flex: none;
    width: 1.1em;
    font: 700 14px/17px var(--font-head);
    font-variant-numeric: lining-nums tabular-nums;
  }
  .driver {
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .constructor {
    margin-left: auto;
    flex: none;
    color: var(--ink-2);
  }
  .next {
    margin-top: 4px;
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
