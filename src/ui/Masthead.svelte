<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import type { FrontPageView } from './model';

  let {
    view,
    refreshing = false,
    onrefresh,
    onsearch,
    settingsUrl = null,
  }: {
    view: FrontPageView;
    refreshing?: boolean;
    onrefresh?: () => void;
    onsearch?: () => void;
    /** Link to the settings page (absent in the dev preview). */
    settingsUrl?: string | null;
  } = $props();

  const brokenIcons = new SvelteSet<string>();
  const host = (url: string) => {
    try {
      return new URL(url).origin;
    } catch {
      return '';
    }
  };
</script>

<header class="masthead">
  <div class="top">
    <div class="ear ear-left">
      <span class="ear-big"
        >{view.clock.time}<span class="meridiem">{view.clock.meridiem}</span></span
      >
      <span class="ear-small">{view.editionName.replace(' Edition', '')}</span>
    </div>

    <h1 class="nameplate" aria-label={view.paperName}>
      <span aria-hidden="true">{view.paperName}</span>
    </h1>

    <div class="ear ear-right" class:weather={!!view.weather}>
      {#if view.weather}
        <span class="visually-hidden">{view.weather.label}</span>
        <span class="ear-big" aria-hidden="true"
          >{view.weather.temp} <span class="condition">{view.weather.condition}</span></span
        >
        <span class="ear-small" aria-hidden="true" title={view.weather.place}
          >{view.weather.range}</span
        >
      {:else if view.newSince && view.newCount > 0}
        <span class="ear-big">{view.newCount} new</span>
        <span class="ear-small">since {view.newSince}</span>
      {:else if view.newSince}
        <span class="ear-big">Up to date</span>
        <span class="ear-small">since {view.newSince}</span>
      {:else}
        <span class="ear-big">First issue</span>
        <span class="ear-small">Welcome</span>
      {/if}
    </div>
  </div>

  <p class="folio">
    <span>{view.dateLine}</span><span class="sep" aria-hidden="true">·</span><span
      >{view.editionName}</span
    ><span class="sep" aria-hidden="true">·</span><span>No. {view.issue}</span><span
      class="sep"
      aria-hidden="true">·</span
    >{#if view.weather && view.newSince && view.newCount > 0}<span
        >{view.newCount} new since {view.newSince}</span
      ><span class="sep" aria-hidden="true">·</span>{/if}{#if onrefresh}<button
        type="button"
        class="refresh"
        onclick={onrefresh}
        disabled={refreshing}
        title="Fetch the latest stories now"
        aria-label={refreshing ? 'Updating' : `${view.updatedLabel}. Refresh now`}
        >{refreshing ? 'Updating…' : view.updatedLabel}</button
      >{:else}<span>{view.updatedLabel}</span>{/if}{#if settingsUrl || onsearch}<span
        class="sep"
        aria-hidden="true">·</span
      >{/if}{#if settingsUrl}<a
        class="folio-icon"
        href={settingsUrl}
        title="Settings"
        aria-label="Settings"
        ><svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
          ><circle cx="8" cy="8" r="4.1" stroke-width="1.7" /><circle
            cx="8"
            cy="8"
            r="1.5"
            stroke-width="1.4"
          /><path
            stroke-width="2.4"
            d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.47 3.47l1.42 1.42M11.11 11.11l1.42 1.42M3.47 12.53l1.42-1.42M11.11 4.89l1.42-1.42"
          /></svg
        ></a
      >{/if}{#if onsearch}<button
        type="button"
        class="folio-icon"
        onclick={onsearch}
        title="Search stories (/)"
        aria-label="Search stories"
        ><svg
          width="13"
          height="13"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="1.7"
          stroke-linecap="round"
          aria-hidden="true"><circle cx="6.6" cy="6.6" r="4.6" /><path d="M10.1 10.1 14 14" /></svg
        ></button
      >{/if}
  </p>

  {#if view.sections.length || view.pinned.length}
    <div class="under">
      {#if view.sections.length}
        <nav class="index" aria-label="Sections">
          <ul>
            {#each view.sections as s (s.anchor)}
              <li><a href="#{s.anchor}">{s.name}</a></li>
            {/each}
            <li><a href="#in-brief">In Brief</a></li>
            {#if view.clippings.length}<li><a href="#clippings">Clippings</a></li>{/if}
          </ul>
        </nav>
      {/if}
      {#if view.pinned.length}
        <nav class="pinned" aria-label="Pinned links">
          <ul>
            <!-- By position: the same URL can be pinned twice. -->
            {#each view.pinned as link, i (i)}
              <li>
                <a href={link.url} class="chip">
                  {#if !brokenIcons.has(link.url)}
                    <img
                      src="{host(link.url)}/favicon.ico"
                      alt=""
                      width="14"
                      height="14"
                      referrerpolicy="no-referrer"
                      onerror={() => brokenIcons.add(link.url)}
                    />
                  {:else}
                    <span class="letter" aria-hidden="true">{link.title.slice(0, 1)}</span>
                  {/if}
                  {link.title}
                </a>
              </li>
            {/each}
          </ul>
        </nav>
      {/if}
    </div>
  {/if}
</header>

<style>
  .masthead {
    padding-top: 20px;
  }
  .top {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    column-gap: 24px;
  }

  .nameplate {
    font-family: var(--font-masthead);
    font-weight: 400;
    font-size: clamp(46px, 7.2vw, 108px);
    line-height: 1;
    padding-top: 0.04em;
    text-align: center;
    white-space: nowrap;
    color: var(--ink);
  }

  .ear {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 128px;
    padding: 9px 14px 8px;
    border: 1px solid var(--rule-ink);
    font-family: var(--font-label);
    color: var(--ink);
  }
  .ear-left {
    justify-self: start;
  }
  .ear-right {
    justify-self: end;
  }
  .ear-big {
    font: 700 19px/1.1 var(--font-head);
  }
  .condition {
    font: 500 11px/1 var(--font-label);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-left: 2px;
  }
  .meridiem {
    font: 500 10px/1 var(--font-label);
    letter-spacing: 0.08em;
    margin-left: 3px;
  }
  .ear-small {
    font-size: 10.5px;
    font-weight: 500;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
  }

  .folio {
    margin-top: 14px;
    border-top: 4px solid var(--rule-ink);
    border-bottom: 1px solid var(--rule-ink);
    padding: 7px 0 6px;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    column-gap: 10px;
    font: 500 11.5px/1.5 var(--font-label);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .sep {
    color: var(--ink-2);
  }
  .refresh {
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
  }
  .refresh:hover:not(:disabled) {
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }
  .refresh:disabled {
    cursor: progress;
    color: var(--ink-2);
  }

  .under {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 24px;
    padding: 9px 0;
    border-bottom: 1px solid var(--rule);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
  }
  .index ul {
    gap: 4px 0;
  }
  .index li + li::before {
    content: '·';
    margin: 0 12px;
    color: var(--ink-2);
  }
  .index a {
    font: 700 11.5px/1.6 var(--font-label);
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  /* Settings and search sit with the page's other action (refresh) at the end of the folio. */
  .folio-icon {
    display: inline-grid;
    place-items: center;
    align-self: center;
    padding: 2px;
    /* The icons may be taller than the type; they overhang rather than heighten the folio. */
    margin-block: -3px;
    color: var(--ink);
  }
  .folio-icon + .folio-icon {
    margin-left: 4px;
  }
  .folio-icon:hover {
    color: var(--ink-2);
  }
  .index a:hover {
    text-decoration: underline;
    text-underline-offset: 0.25em;
  }

  .pinned ul {
    gap: 6px;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 9px 3px 6px;
    border: 1px solid var(--rule);
    font: 500 11.5px/1.4 var(--font-label);
    color: var(--ink-2);
  }
  .chip:hover {
    border-color: var(--rule-ink);
    color: var(--ink);
  }
  .chip img {
    filter: grayscale(1);
    /* Dark favicons vanish on night paper; a small light plate keeps them legible. */
    background: #f4f1ea;
    border-radius: 2px;
    padding: 1px;
  }
  .letter {
    display: inline-grid;
    place-items: center;
    width: 14px;
    height: 14px;
    font: 700 9px/1 var(--font-label);
    background: var(--ink);
    color: var(--paper);
  }

  @media (max-width: 859px) {
    .masthead {
      padding-top: 14px;
    }
    .top {
      grid-template-columns: 1fr 1fr;
      grid-template-areas: 'name name' 'left right';
      row-gap: 10px;
    }
    .nameplate {
      grid-area: name;
      font-size: clamp(34px, 11.5vw, 72px);
    }
    .ear-left {
      grid-area: left;
    }
    .ear-right {
      grid-area: right;
    }
    .ear {
      flex-direction: row;
      align-items: baseline;
      gap: 6px;
      min-width: 0;
      padding: 0;
      border: 0;
    }
    .ear-big {
      font-size: 15px;
    }
    .folio {
      margin-top: 10px;
      font-size: 10.5px;
      column-gap: 7px;
    }
    .under {
      justify-content: center;
    }
    .pinned {
      display: none;
    }
  }
</style>
