<script lang="ts">
  import type { MarketView } from './model';

  let { markets }: { markets: MarketView[] } = $props();

  const W = 132;
  const H = 34;
  const PAD = 2;
  // Which ticker the reader last looked at (a per-browser convenience; safe to lose).
  const KEY = 'daily-tab:ticker';

  const remembered = () => {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  };

  let symbol = $state<string | null>(remembered());
  const index = $derived(
    Math.max(
      0,
      markets.findIndex((m) => m.symbol === symbol),
    ),
  );
  const market = $derived(markets[index]!);
  const many = $derived(markets.length > 1);

  function go(step: number) {
    const next = markets[(index + step + markets.length) % markets.length]!;
    symbol = next.symbol;
    try {
      localStorage.setItem(KEY, next.symbol);
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

  // Sparkline in ink, with the previous close as a dotted reference line.
  const geometry = $derived.by(() => {
    const pts = market.points;
    if (pts.length < 2) return null;
    const lo = Math.min(...pts, market.previousClose);
    const hi = Math.max(...pts, market.previousClose);
    const span = hi - lo || 1;
    const x = (i: number) => PAD + (i / (pts.length - 1)) * (W - PAD * 2);
    const y = (v: number) => PAD + (1 - (v - lo) / span) * (H - PAD * 2);
    return {
      line: pts.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' '),
      base: y(market.previousClose).toFixed(1),
    };
  });

  const arrow = $derived(market.direction === 'up' ? '▲' : market.direction === 'down' ? '▼' : '■');
  const neighbour = (step: number) =>
    markets[(index + step + markets.length) % markets.length]!.name;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<section
  class="ticker"
  aria-roledescription={many ? 'carousel' : undefined}
  aria-label="Markets"
  {onkeydown}
>
  <div class="head">
    <h2 class="label">Markets</h2>
    {#if many}
      <div class="controls">
        <button type="button" aria-label="Previous: {neighbour(-1)}" onclick={() => go(-1)}
          >‹</button
        >
        <span class="pos" aria-hidden="true">{index + 1} of {markets.length}</span>
        <button type="button" aria-label="Next: {neighbour(1)}" onclick={() => go(1)}>›</button>
      </div>
    {/if}
  </div>

  <div class="quote" aria-live={many ? 'polite' : undefined}>
    <span class="visually-hidden">{market.label}</span>
    <div class="row" aria-hidden="true">
      <span class="name"
        >{market.name}{#if market.showSymbol}&nbsp;<span class="symbol">{market.symbol}</span
          >{/if}</span
      >
      <span class="price">{market.price}</span>
    </div>
    <div class="row" aria-hidden="true">
      <span class="change">
        <span class="arrow">{arrow}</span>
        {market.change} ({market.percent})
      </span>
      {#if geometry}
        <svg class="spark" viewBox="0 0 {W} {H}" width={W} height={H}>
          <line x1={PAD} x2={W - PAD} y1={geometry.base} y2={geometry.base} class="base" />
          <polyline points={geometry.line} class="line" />
        </svg>
      {:else}
        <span class="spark-space"></span>
      {/if}
    </div>
    <p class="asof" aria-hidden="true">{market.asOf} · delayed</p>
  </div>
</section>

<style>
  .ticker {
    /* Spacing comes from the lead column around it (see FrontPage). */
    padding: 7px 0 8px;
    border-top: 2px solid var(--rule-ink);
    border-bottom: 1px solid var(--rule-ink);
    font-family: var(--font-label);
    color: var(--ink);
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: center;
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
  }
  /* Single lines throughout: every ticker is the same height, so cycling never reflows. */
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .symbol {
    margin-left: 2px;
    font-weight: 500;
    letter-spacing: 0.06em;
    color: var(--ink-2);
  }
  .price {
    flex: none;
    font: 700 19px/1.2 var(--font-head);
    font-variant-numeric: lining-nums tabular-nums;
  }
  .change {
    font-size: 12.5px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .arrow {
    font-size: 10px;
    margin-right: 2px;
  }
  .spark,
  .spark-space {
    flex: 0 1 auto;
    max-width: 55%;
    height: 34px;
    overflow: visible;
  }
  .line {
    fill: none;
    stroke: var(--ink);
    stroke-width: 1.25;
    stroke-linejoin: round;
    stroke-linecap: round;
  }
  .base {
    stroke: var(--rule);
    stroke-width: 1;
    stroke-dasharray: 2 3;
  }
  .asof {
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
