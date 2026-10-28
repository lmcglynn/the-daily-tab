<script lang="ts">
  import FirstRun from './FirstRun.svelte';
  import Masthead from './Masthead.svelte';
  import type { FrontPageView, SectionChoice } from './model';
  import Story from './Story.svelte';

  let {
    view,
    firstRun = null,
    newEdition = null,
    fresh = false,
    refreshing = false,
    onopen,
    onmore,
    onshownew,
    onstart,
    onrefresh,
    settingsUrl = null,
  }: {
    view: FrontPageView;
    /** Link to the settings page (absent in the dev preview). */
    settingsUrl?: string | null;
    /** Present until the first edition exists. */
    firstRun?: { sections: SectionChoice[]; busy: boolean; error?: string } | null;
    /** A newer edition is waiting; shown as a button, never reflowed in. */
    newEdition?: { count: number } | null;
    /** Fade the page in (opening a new edition). */
    fresh?: boolean;
    refreshing?: boolean;
    onopen?: (id: string, e: MouseEvent) => void;
    onmore?: (category: string) => void;
    onshownew?: () => void;
    onstart?: (sections: string[]) => void;
    onrefresh?: () => void;
  } = $props();

  const widths = [96, 88, 92, 70, 84, 40];
</script>

<a class="skip" href="#front">Skip to the stories</a>

<div class="page" class:fresh>
  <Masthead {view} {refreshing} onrefresh={firstRun ? undefined : onrefresh} />

  <!-- Always present so screen readers announce the button when it appears. -->
  <div class="new-edition-slot" role="status" aria-live="polite">
    {#if newEdition}
      <button class="new-edition" type="button" onclick={() => onshownew?.()}>
        New edition · {newEdition.count}
        {newEdition.count === 1 ? 'story' : 'stories'}
      </button>
    {/if}
  </div>

  {#if firstRun}
    <main class="grid" id="front" tabindex="-1">
      <div class="slot-lead">
        <FirstRun
          sections={firstRun.sections}
          busy={firstRun.busy}
          error={firstRun.error}
          {settingsUrl}
          {onstart}
        />
      </div>
      <div class="secondary ruled" aria-hidden="true">
        {#each [0, 1, 2] as n (n)}
          <div class="placeholder">
            <div class="bar head" style:width="{widths[n]}%"></div>
            <div class="bar head" style:width="{widths[n + 2]}%"></div>
            {#each widths as w, i (i)}<div class="bar" style:width="{w}%"></div>{/each}
          </div>
        {/each}
      </div>
      <div class="fold"></div>
      <div class="bands" aria-hidden="true">
        <div class="band-stories" style:--n="4">
          {#each [0, 1, 2, 3] as n (n)}
            <div class="placeholder" class:ruled={n > 0}>
              <div class="bar head" style:width="{widths[n]}%"></div>
              {#each widths as w, i (i)}<div class="bar" style:width="{w}%"></div>{/each}
            </div>
          {/each}
        </div>
      </div>
      <div class="brief ruled" aria-hidden="true">
        {#each widths as w, i (i)}<div class="bar head" style:width="{w}%"></div>
          <div class="bar" style:width="40%"></div>{/each}
      </div>
    </main>
  {:else}
    <main class="grid" id="front" tabindex="-1">
      {#if view.lead}
        <div class="slot-lead">
          <Story story={view.lead} variant="lead" {onopen} />
        </div>
      {/if}

      {#if view.secondary.length}
        <div class="secondary ruled">
          {#each view.secondary as s, i (s.id)}
            <Story story={s} variant="secondary" photo={i === 0} {onopen} />
          {/each}
        </div>
      {/if}

      <div class="fold"></div>

      <div class="bands">
        {#each view.bands as band (band.anchor)}
          {@const photoAt = band.stories.findIndex((s) => s.imageUrl)}
          <section class="band" id={band.anchor} aria-labelledby="{band.anchor}-name">
            <h2 class="band-name" id="{band.anchor}-name">{band.category}</h2>
            <div class="band-stories" style:--n={Math.max(band.stories.length, 3)}>
              {#each band.stories as s, i (s.id)}
                <div class="band-cell" class:ruled={i > 0}>
                  <Story story={s} variant="band" photo={i === photoAt} {onopen} />
                </div>
              {/each}
            </div>
            {#if band.more}
              <ol class="more" aria-label="More in {band.category}">
                {#each band.more as s (s.id)}
                  <li><Story story={s} variant="brief" {onopen} /></li>
                {:else}
                  <li class="more-empty">Nothing more in {band.category} for now.</li>
                {/each}
              </ol>
            {/if}
            <p class="jump">
              <button
                type="button"
                aria-expanded={!!band.more}
                onclick={() => onmore?.(band.category)}
              >
                {#if band.more}
                  Fewer in {band.category} <span aria-hidden="true">↑</span>
                {:else}
                  More in {band.category} <span aria-hidden="true">→</span>
                {/if}
              </button>
            </p>
          </section>
        {/each}
      </div>

      {#if view.brief.length}
        <aside class="brief ruled" id="in-brief" aria-labelledby="in-brief-name">
          <h2 class="band-name" id="in-brief-name">In Brief</h2>
          <ol>
            {#each view.brief as s (s.id)}
              <li><Story story={s} variant="brief" {onopen} /></li>
            {/each}
          </ol>
        </aside>
      {/if}
    </main>

    {#if view.corrections.length}
      <section class="corrections" aria-labelledby="corrections-name">
        <h2 id="corrections-name">Corrections</h2>
        <ul>
          {#each view.corrections as c (c)}<li>{c}</li>{/each}
        </ul>
      </section>
    {/if}
  {/if}

  <footer class="colophon">
    <p>
      <span class="paper-name">{view.paperName}</span>
      {#if settingsUrl}<span class="sep" aria-hidden="true">·</span><a href={settingsUrl}
          >Settings</a
        >{/if}
    </p>
    <p class="keys" aria-label="Keyboard shortcuts">
      <kbd>j</kbd> <kbd>k</kbd> next / previous story · <kbd>o</kbd> open · <kbd>r</kbd> refresh ·
      <kbd>n</kbd> new edition
    </p>
  </footer>
</div>

<style>
  .page {
    max-width: var(--page-max);
    margin: 0 auto;
    padding: 0 var(--page-pad) 32px;
  }
  .skip {
    position: absolute;
    left: 16px;
    top: -60px;
    z-index: 20;
    padding: 8px 12px;
    background: var(--ink);
    color: var(--paper);
    font: 700 13px/1 var(--font-label);
  }
  .skip:focus {
    top: 12px;
  }
  #front:focus {
    outline: none;
  }
  .colophon {
    margin-top: 48px;
    padding-top: 12px;
    border-top: 1px solid var(--rule-ink);
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 6px 24px;
    font: 500 11.5px/1.6 var(--font-label);
    letter-spacing: 0.06em;
    color: var(--ink-2);
  }
  .colophon p {
    margin: 0;
  }
  .paper-name {
    font-family: var(--font-masthead);
    font-size: 17px;
    letter-spacing: 0;
    color: var(--ink);
  }
  .colophon .sep {
    margin: 0 8px;
  }
  .colophon a {
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }
  .colophon a:hover {
    color: var(--ink);
  }
  kbd {
    font: 700 11px/1 var(--font-label);
    padding: 2px 5px;
    border: 1px solid var(--rule);
    border-radius: 2px;
    color: var(--ink);
  }
  @media (max-width: 859px) {
    .keys {
      display: none;
    }
  }
  .fresh {
    animation: fade-in var(--fade) ease-out;
  }
  @keyframes fade-in {
    from {
      opacity: 0;
    }
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    column-gap: var(--gutter);
    padding-top: 22px;
  }

  /* Column rules sit centered in the gutter, 1px at 25% ink. */
  .ruled {
    position: relative;
  }
  .ruled::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--gutter) / -2);
    border-left: 1px solid var(--rule);
  }

  .slot-lead {
    grid-column: 1 / span 4;
    min-width: 0;
  }
  .secondary {
    grid-column: 5 / span 2;
    min-width: 0;
  }
  /* Hairlines between stacked stories */
  .secondary > :global(.story + .story),
  .secondary > .placeholder + .placeholder {
    border-top: 1px solid var(--rule);
    margin-top: 16px;
    padding-top: 16px;
  }

  .fold {
    grid-column: 1 / -1;
    border-top: 2px solid var(--rule-ink);
    margin: 30px 0 0;
  }

  .bands {
    grid-column: 1 / span 5;
    min-width: 0;
  }
  .band {
    padding-top: 24px;
    scroll-margin-top: 16px;
  }
  .band + .band {
    padding-top: var(--band-gap);
  }
  .band-name,
  .corrections h2 {
    font: 700 12px/1 var(--font-label);
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--ink);
    border-top: 1px solid var(--rule-ink);
    border-bottom: 1px solid var(--rule-ink);
    padding: 8px 0 7px;
    margin-bottom: 16px;
  }
  .band-stories {
    display: grid;
    grid-template-columns: repeat(var(--n, 4), minmax(0, 1fr));
    column-gap: var(--gutter);
  }
  .band-cell {
    min-width: 0;
  }
  .more {
    list-style: none;
    margin: 14px 0 0;
    padding: 12px 0 0;
    border-top: 1px solid var(--rule);
    columns: 3;
    column-gap: var(--gutter);
    column-rule: 1px solid var(--rule);
  }
  .more li {
    break-inside: avoid;
    padding-bottom: 12px;
  }
  .more-empty {
    font: italic 400 15px/1.4 var(--font-text);
    color: var(--ink-2);
  }
  @media (max-width: 859px) {
    .more {
      columns: 1;
    }
  }
  .jump {
    margin-top: 14px;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
    text-align: right;
  }
  .jump button {
    font: italic 400 15px/1.3 var(--font-text);
    color: var(--ink-2);
  }
  .jump button:hover {
    color: var(--ink);
    text-decoration: underline;
    text-underline-offset: 0.2em;
  }

  .brief {
    grid-column: 6;
    padding-top: 24px;
    min-width: 0;
  }
  .brief ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .brief li + li {
    border-top: 1px solid var(--rule);
    margin-top: 10px;
    padding-top: 10px;
  }

  .corrections {
    max-width: 560px;
    margin: 48px auto 0;
    padding: 14px 18px 12px;
    border: 1px solid var(--rule-ink);
  }
  .corrections h2 {
    border: 0;
    padding: 0;
    margin-bottom: 8px;
    text-align: center;
  }
  .corrections ul {
    margin: 0;
    padding: 0;
    list-style: none;
    font: italic 400 15px/1.45 var(--font-text);
    color: var(--ink-2);
    text-align: center;
  }

  .new-edition {
    position: fixed;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10;
    padding: 10px 18px;
    background: var(--ink);
    color: var(--paper);
    font: 700 12px/1 var(--font-label);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    box-shadow: 0 1px 0 var(--rule);
  }

  .placeholder {
    min-width: 0;
  }
  .bar {
    height: 0.62em;
    margin: 0.62em 0;
    background: var(--placeholder);
  }
  .bar.head {
    height: 1.1em;
  }

  /* 860–1279: four columns; In Brief drops below the bands. */
  @media (max-width: 1279px) {
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .slot-lead {
      grid-column: 1 / span 3;
    }
    .secondary {
      grid-column: 4;
    }
    .bands {
      grid-column: 1 / -1;
    }
    .brief {
      grid-column: 1 / -1;
      padding-top: var(--band-gap);
    }
    .brief::before {
      display: none;
    }
    .brief ol {
      columns: 2;
      column-gap: var(--gutter);
      column-rule: 1px solid var(--rule);
    }
    .brief li {
      break-inside: avoid;
    }
    .brief li + li {
      border-top: 0;
      margin-top: 0;
      padding-top: 0;
    }
    .brief li {
      padding-bottom: 12px;
    }
  }

  /* Under 860: one column, like a tabloid on a phone. */
  @media (max-width: 859px) {
    .grid {
      grid-template-columns: minmax(0, 1fr);
      padding-top: 16px;
    }
    .slot-lead,
    .secondary,
    .bands,
    .brief {
      grid-column: 1;
    }
    .ruled::before {
      display: none;
    }
    .secondary {
      margin-top: 18px;
      padding-top: 16px;
      border-top: 1px solid var(--rule);
    }
    .fold {
      margin-top: 24px;
    }
    .band-stories {
      grid-template-columns: minmax(0, 1fr);
    }
    .band-cell + .band-cell {
      border-top: 1px solid var(--rule);
      margin-top: 14px;
      padding-top: 14px;
    }
    .brief ol {
      columns: 1;
    }
    .brief li + li {
      border-top: 1px solid var(--rule);
      padding-top: 10px;
    }
    .corrections {
      margin-top: 36px;
    }
  }
</style>
