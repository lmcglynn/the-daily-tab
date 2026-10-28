<script lang="ts">
  import type { MarketView } from './model';

  let { market }: { market: MarketView } = $props();

  const W = 132;
  const H = 34;
  const PAD = 2;

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
</script>

<section class="ticker" aria-label={market.label}>
  <div class="row" aria-hidden="true">
    <span class="name">{market.name}</span>
    <span class="price">{market.price}</span>
  </div>
  <div class="row" aria-hidden="true">
    <span class="change">
      <span class="arrow">{arrow}</span>
      {market.change} ({market.percent})
    </span>
    {#if geometry}
      <svg class="spark" viewBox="0 0 {W} {H}" width={W} height={H} aria-hidden="true">
        <line x1={PAD} x2={W - PAD} y1={geometry.base} y2={geometry.base} class="base" />
        <polyline points={geometry.line} class="line" />
      </svg>
    {/if}
  </div>
  <p class="asof" aria-hidden="true">{market.asOf} · delayed</p>
</section>

<style>
  .ticker {
    margin-top: 16px;
    padding: 9px 0 8px;
    border-top: 2px solid var(--rule-ink);
    border-bottom: 1px solid var(--rule-ink);
    font-family: var(--font-label);
    color: var(--ink);
  }
  .row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }
  .name {
    font-size: 11.5px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  .price {
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
  .spark {
    flex: 0 1 auto;
    max-width: 55%;
    height: auto;
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
  }
</style>
