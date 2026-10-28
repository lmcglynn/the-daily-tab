<script lang="ts">
  import { browser } from 'wxt/browser';
  import { MARKET_ORIGINS } from '@/lib/extras/market';
  import { WEATHER_ORIGINS } from '@/lib/extras/weather';
  import type { Settings, Units, WeatherPlace } from '@/lib/types';

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

  function toggleMarket(e: Event) {
    const box = e.currentTarget as HTMLInputElement;
    marketError = '';
    if (!box.checked) {
      void onpatch({ showMarket: false });
      return;
    }
    // Inside the click: ask for Yahoo Finance's chart endpoint only.
    void browser.permissions.request({ origins: MARKET_ORIGINS }).then((granted) => {
      if (granted) void onpatch({ showMarket: true });
      else {
        box.checked = false;
        marketError = 'The S&P 500 box needs permission to reach Yahoo Finance.';
      }
    });
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
<label class="choice">
  <input type="checkbox" checked={settings.showMarket} onchange={toggleMarket} />
  Show the S&amp;P 500 under the lead story
</label>
<p class="hint">
  From Yahoo Finance’s public chart data: delayed, unofficial, and hidden automatically if it ever
  stops answering.
</p>
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
