<script lang="ts">
  import { browser } from 'wxt/browser';
  import { MAX_TICKERS, TICKER_SYMBOL } from '@/lib/defaults';
  import { MARKET_ORIGINS, TICKER_PRESETS } from '@/lib/extras/market';
  import { WEATHER_ORIGINS } from '@/lib/extras/weather';
  import { moveItem } from '@/lib/feeds-edit';
  import type { Settings, Ticker, Units, WeatherPlace } from '@/lib/types';

  let {
    settings,
    onpatch,
  }: {
    settings: Settings;
    onpatch: (patch: Partial<Settings>) => Promise<void>;
  } = $props();

  let query = $state('');
  let busy = $state(false);
  let places = $state<WeatherPlace[] | null>(null);
  let error = $state('');
  let marketError = $state('');

  // Inside the submit gesture: ask for Open-Meteo, then look the place up in the background.
  function find(e: SubmitEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    error = '';
    places = null;
    busy = true;
    browser.permissions
      .request({ origins: WEATHER_ORIGINS })
      .then(async (granted) => {
        if (!granted) {
          error = 'The weather needs permission to reach Open-Meteo (open-meteo.com).';
          return;
        }
        const res = (await browser.runtime.sendMessage({ type: 'geocode', query: q })) as
          { places: WeatherPlace[] } | { error: string };
        if ('error' in res) error = res.error;
        else if (res.places.length === 0) error = `No place called “${q}” was found.`;
        else places = res.places;
      })
      .catch((err: unknown) => (error = err instanceof Error ? err.message : String(err)))
      .finally(() => (busy = false));
  }

  function choose(p: WeatherPlace) {
    places = null;
    query = '';
    // A plain object: chrome.storage must not receive a reactive proxy.
    void onpatch({ weatherPlace: { name: p.name, region: p.region, lat: p.lat, lon: p.lon } });
  }

  let symbolInput = $state('');
  let adding = $state(false);

  // Plain copies: chrome.storage must not receive a reactive proxy.
  const plainTickers = (): Ticker[] => settings.tickers.map((t) => ({ ...t }));

  function addTyped(e: SubmitEvent) {
    e.preventDefault();
    addTicker(symbolInput);
  }

  /**
   * Called inside the click: asks for Yahoo Finance access (once), then checks the symbol
   * exists and fetches its name before adding it.
   */
  function addTicker(raw: string, preset?: Ticker) {
    const symbol = raw.trim().toUpperCase();
    marketError = '';
    if (!TICKER_SYMBOL.test(symbol)) {
      marketError = `“${raw.trim()}” doesn’t look like a ticker symbol.`;
      return;
    }
    if (settings.tickers.some((t) => t.symbol === symbol)) {
      marketError = `${symbol} is already in your list.`;
      return;
    }
    adding = true;
    browser.permissions
      .request({ origins: MARKET_ORIGINS })
      .then(async (granted) => {
        if (!granted) {
          marketError = 'Quotes need permission to reach Yahoo Finance.';
          return;
        }
        const res = (await browser.runtime.sendMessage({ type: 'quote', symbol })) as
          { ticker: Ticker | null } | { error: string };
        if ('error' in res) {
          marketError = `Couldn’t check ${symbol}: ${res.error}`;
          return;
        }
        if (!res.ticker) {
          marketError = `Yahoo Finance doesn’t know “${symbol}”. Check the symbol (indexes start with ^, e.g. ^DJI).`;
          return;
        }
        const ticker = { symbol: res.ticker.symbol, name: preset?.name ?? res.ticker.name };
        if (settings.tickers.some((t) => t.symbol === ticker.symbol)) return;
        await onpatch({ tickers: [...plainTickers(), ticker] });
        symbolInput = '';
      })
      .catch((err: unknown) => (marketError = err instanceof Error ? err.message : String(err)))
      .finally(() => (adding = false));
  }

  const unitChoices: { value: Units; label: string }[] = [
    { value: 'f', label: 'Fahrenheit (°F)' },
    { value: 'c', label: 'Celsius (°C)' },
  ];
</script>

<h3>Weather</h3>
<p class="hint">Shown in the right ear of the masthead. Forecasts from Open-Meteo.</p>
{#if settings.weatherPlace}
  <p class="place">
    <strong>{settings.weatherPlace.name}</strong>{settings.weatherPlace.region
      ? `, ${settings.weatherPlace.region}`
      : ''}
    <button type="button" class="link" onclick={() => void onpatch({ weatherPlace: null })}
      >Remove</button
    >
  </p>
{/if}
<form class="find" onsubmit={find}>
  <label class="field grow">
    <span>{settings.weatherPlace ? 'Change city' : 'City'}</span>
    <input type="text" maxlength="80" placeholder="e.g. Seattle" bind:value={query} />
  </label>
  <button type="submit" disabled={busy || !query.trim()}>{busy ? 'Looking…' : 'Find'}</button>
</form>
{#if error}<p class="error" role="alert">{error}</p>{/if}
{#if places}
  <ul class="places" aria-label="Places found">
    {#each places as p (`${p.lat},${p.lon}`)}
      <li>
        <span><strong>{p.name}</strong>{p.region ? `, ${p.region}` : ''}</span>
        <button type="button" onclick={() => choose(p)}>Use</button>
      </li>
    {/each}
  </ul>
{/if}

<fieldset>
  <legend>Units</legend>
  {#each unitChoices as u (u.value)}
    <label class="choice">
      <input
        type="radio"
        name="units"
        value={u.value}
        checked={settings.units === u.value}
        onchange={() => void onpatch({ units: u.value })}
      />
      {u.label}
    </label>
  {/each}
</fieldset>

<h3>Markets</h3>
<p class="hint">
  Shown under the lead story; with more than one, use the arrows on the box to cycle through them.
  Any Yahoo Finance symbol works: indexes (^GSPC), stocks (AAPL), funds (VOO), crypto (BTC-USD),
  currencies (EURUSD=X). Quotes are delayed and unofficial, and a ticker that stops answering is
  simply left out.
</p>
{#if settings.tickers.length}
  <ul class="tickers" aria-label="Your tickers">
    {#each settings.tickers as t, i (t.symbol)}
      <li>
        <span><strong>{t.name}</strong> <span class="sym">{t.symbol}</span></span>
        <span class="tools">
          <button
            type="button"
            class="icon"
            disabled={i === 0}
            aria-label="Move {t.name} up"
            onclick={() => void onpatch({ tickers: moveItem(plainTickers(), i, i - 1) })}>↑</button
          >
          <button
            type="button"
            class="icon"
            disabled={i === settings.tickers.length - 1}
            aria-label="Move {t.name} down"
            onclick={() => void onpatch({ tickers: moveItem(plainTickers(), i, i + 1) })}>↓</button
          >
          <button
            type="button"
            class="link"
            aria-label="Remove {t.name}"
            onclick={() =>
              void onpatch({ tickers: plainTickers().filter((x) => x.symbol !== t.symbol) })}
            >Remove</button
          >
        </span>
      </li>
    {/each}
  </ul>
{/if}
{#if settings.tickers.length < MAX_TICKERS}
  <form class="find" onsubmit={addTyped}>
    <label class="field grow">
      <span>Add a ticker</span>
      <input
        type="text"
        maxlength="20"
        spellcheck="false"
        autocapitalize="characters"
        placeholder="e.g. AAPL, ^DJI, BTC-USD"
        bind:value={symbolInput}
      />
    </label>
    <button type="submit" disabled={adding || !symbolInput.trim()}>
      {adding ? 'Checking…' : 'Add'}
    </button>
  </form>
  {@const presets = TICKER_PRESETS.filter(
    (p) => !settings.tickers.some((t) => t.symbol === p.symbol),
  )}
  {#if presets.length}
    <p class="presets">
      <span>Quick add:</span>
      {#each presets as p (p.symbol)}
        <button type="button" class="chip" disabled={adding} onclick={() => addTicker(p.symbol, p)}
          >{p.name}</button
        >
      {/each}
    </p>
  {/if}
{:else}
  <p class="hint">That’s the most the box holds ({MAX_TICKERS}); remove one to add another.</p>
{/if}
{#if marketError}<p class="error" role="alert">{marketError}</p>{/if}

<style>
  .find {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-wrap: wrap;
  }
  .grow {
    flex: 1 1 240px;
  }
  .place {
    display: flex;
    gap: 10px;
    align-items: baseline;
    margin: 4px 0 10px;
  }
  .tickers {
    list-style: none;
    margin: 8px 0 12px;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .tickers li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--rule);
  }
  .sym {
    font-size: 12.5px;
    color: var(--ink-2);
    margin-left: 4px;
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .presets {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 10px 0 0;
    font-size: 13px;
    color: var(--ink-2);
  }
  .chip {
    min-height: 26px;
    padding: 2px 10px;
    font-size: 13px;
    border-radius: 13px;
  }
  .places {
    list-style: none;
    margin: 10px 0 0;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .places li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid var(--rule);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 14px 0 0;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .choice {
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 3px 0;
  }
  h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 18px 0 6px;
    color: var(--ink-2);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }
</style>
