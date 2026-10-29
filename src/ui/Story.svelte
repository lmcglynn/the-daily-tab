<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { StoryView } from './model';
  import Photo from './Photo.svelte';

  type Variant = 'lead' | 'secondary' | 'band' | 'brief';
  let {
    story,
    variant,
    photo = true,
    onopen,
    onsave,
    extras,
  }: {
    story: StoryView;
    variant: Variant;
    /** Secondary and band stories show a photo only where the layout wants one. */
    photo?: boolean;
    /** Called for left, middle and modified clicks on the headline. */
    onopen?: (id: string, e: MouseEvent) => void;
    /** Save to (or remove from) clippings; no button without it. */
    onsave?: (id: string) => void;
    /** Lead only: what fills its text column under the body (headlines, ticker). */
    extras?: Snippet;
  } = $props();

  const headingId = $derived(`h-${story.id}`);
  const showPhoto = $derived(photo && !!story.imageUrl);
  // Band stories sit under their section name, so the kicker names the source instead.
  const kicker = $derived(variant === 'band' ? story.source : story.kicker);
  const open = (e: MouseEvent) => onopen?.(story.id, e);
</script>

{#snippet coverage()}
  {#if story.coverage?.length}
    <p class="coverage">
      <span class="coverage-label">Also covered by</span>
      {#each story.coverage as c, i (c.id)}{#if i}<span class="sep" aria-hidden="true"
            >&#32;·&#32;</span
          >{/if}<a
          href={c.link}
          onclick={(e) => onopen?.(c.id, e)}
          onauxclick={(e) => onopen?.(c.id, e)}>{c.source}</a
        >{/each}
    </p>
  {/if}
{/snippet}

{#snippet byline()}
  <p class="byline">
    <!-- Explicit separators: a block's leading whitespace is trimmed. -->
    {story.source}{#if story.ago}&#32;·&#32;<time datetime={story.datetime}>{story.ago}</time
      >{/if}{#if onsave}<button
        type="button"
        class="clip"
        aria-pressed={story.saved}
        title={story.saved ? 'Remove from your clippings (s)' : 'Save to your clippings (s)'}
        onclick={() => onsave(story.id)}
        ><span aria-hidden="true">·</span> {story.saved ? 'Saved' : 'Save'}</button
      >{/if}
  </p>
{/snippet}

<article
  class="story {variant}"
  class:read={story.read}
  class:has-photo={showPhoto}
  class:no-body={variant === 'lead' && !story.body}
  aria-labelledby={headingId}
  data-story={story.id}
>
  {#if variant === 'brief'}
    <h3 id={headingId} class="headline">
      {#if story.isNew}<span class="dot" title="New since your last visit" aria-hidden="true"
        ></span><span class="visually-hidden">New: </span>{/if}
      <a href={story.link} onclick={open} onauxclick={open}>{story.title}</a>
    </h3>
    {@render byline()}
  {:else}
    {#if kicker}
      <p class="kicker">
        {#if story.isNew}<span class="dot" title="New since your last visit" aria-hidden="true"
          ></span><span class="visually-hidden"
            >New since your last visit:
          </span>{/if}{kicker}{#if story.developing}<span
            class="developing"
            title="Outlets are still adding to this story">&#32;· Developing</span
          >{/if}
      </p>
    {/if}
    {#if variant === 'lead'}
      <h2 id={headingId} class="headline">
        <a href={story.link} onclick={open} onauxclick={open}>{story.title}</a>
      </h2>
    {:else}
      <h3 id={headingId} class="headline">
        <a href={story.link} onclick={open} onauxclick={open}>{story.title}</a>
      </h3>
    {/if}
    {#if story.deck}<p class="deck">{story.deck}</p>{/if}

    {#if variant === 'lead'}
      <div class="lead-body">
        {#if showPhoto}
          <div class="lead-photo">
            <Photo src={story.imageUrl!} href={story.link} eager fill />
            <!-- Under the photo, where the taller text column leaves room. -->
            {@render coverage()}
          </div>
        {/if}
        <div class="lead-text">
          {@render byline()}
          {#if story.body}<p class="body">{story.body}</p>{/if}
          {#if !showPhoto}{@render coverage()}{/if}
          {#if extras}<div class="lead-extras">{@render extras()}</div>{/if}
        </div>
      </div>
    {:else}
      {#if showPhoto}
        <Photo
          src={story.imageUrl!}
          href={story.link}
          ratio={variant === 'secondary' ? '16 / 9' : '3 / 2'}
          eager={variant === 'secondary'}
        />
      {/if}
      {@render byline()}
    {/if}
  {/if}
</article>

<style>
  .story {
    min-width: 0;
  }

  .kicker {
    font: 700 11.5px/1.2 var(--font-label);
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--spot);
    margin-bottom: 8px;
  }

  .dot {
    display: inline-block;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--spot);
    margin-right: 7px;
    vertical-align: 0.08em;
  }

  .headline {
    font-family: var(--font-head);
    font-weight: 700;
    color: var(--ink);
    text-wrap: balance;
    overflow-wrap: break-word;
    hyphens: manual;
  }
  .headline a:hover {
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.12em;
  }
  /* Child combinators: lead-column headlines are Story instances nested in the lead, and
     scoped styles are per component, so `.read .headline` would mute them too. */
  .read > .headline {
    color: var(--ink-muted);
  }

  .deck {
    font-family: var(--font-text);
    font-style: italic;
    color: var(--ink-2);
    text-wrap: pretty;
  }

  .byline {
    font: 500 11.5px/1.4 var(--font-label);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  /* Shown on the story's own hover or focus (child combinators: stories nest in the lead),
     and always once saved. */
  .clip {
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: var(--ink-muted);
    background: none;
    border: 0;
    padding: 0 0 0 0.3em;
    margin: 0;
    cursor: pointer;
    opacity: 0;
  }
  .clip:hover {
    color: var(--ink);
  }
  .clip[aria-pressed='true'] {
    color: var(--ink);
    opacity: 1;
  }
  .story:hover > .byline > .clip,
  .story:focus-within > .byline > .clip,
  .lead:hover > .lead-body > .lead-text > .byline > .clip,
  .lead:focus-within > .lead-body > .lead-text > .byline > .clip,
  .clip:focus-visible {
    opacity: 1;
  }
  .byline a {
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 0.2em;
  }

  /* Lead ---------------------------------------------------------------- */
  .lead > .headline {
    font-size: clamp(30px, 2.4vw + 13px, 48px);
    line-height: 1.06;
    letter-spacing: -0.01em;
    margin-bottom: 12px;
  }
  .lead > .deck {
    font-size: clamp(18px, 0.6vw + 12px, 22px);
    line-height: 1.32;
    margin-bottom: 18px;
    max-width: 52em;
  }
  /* The lead fills its grid row; the photo stretches to meet the secondary column. */
  .lead {
    height: 100%;
    display: flex;
    flex-direction: column;
  }
  .lead-body {
    flex: 1;
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    column-gap: var(--gutter);
  }
  .lead-photo {
    grid-column: 1 / span 2;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
  }
  /* The photo takes the column's height (within its 4:3 to 4:5 bounds) less the coverage line. */
  .lead-photo > :global(.photo.fill) {
    flex: 1 1 0;
    height: auto;
  }
  .coverage {
    margin-top: 10px;
    padding-top: 8px;
    border-top: 1px solid var(--rule);
    font: 500 11.5px/1.6 var(--font-label);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .lead-text > .coverage {
    margin: 0 0 12px;
  }
  .coverage-label {
    font-weight: 700;
    color: var(--ink);
    margin-right: 6px;
  }
  .coverage a {
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 0.2em;
  }
  .coverage a:hover {
    color: var(--ink);
    text-decoration-color: currentColor;
  }
  .developing {
    font-weight: 700;
  }
  .lead-text {
    grid-column: 3 / span 2;
    position: relative;
  }
  .lead-text::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--gutter) / -2);
    border-left: 1px solid var(--rule);
  }
  .lead:not(.has-photo) .lead-text {
    grid-column: 1 / -1;
  }
  .lead:not(.has-photo) .lead-text::before {
    display: none;
  }
  /* A one-line summary leaves nothing for the text columns: give the photo the room. */
  @media (min-width: 1280px) {
    .lead.has-photo.no-body .lead-photo {
      grid-column: 1 / span 3;
    }
    .lead.has-photo.no-body .lead-text {
      grid-column: 4;
    }
  }
  .lead-text > .byline {
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }
  /* One justified column: the summary is short, and two narrow columns read choppily. */
  .body {
    font-size: 16.5px;
    line-height: 1.5;
    text-align: justify;
    hyphens: auto;
    /* The drop cap is three lines tall: a one- or two-line summary still takes that height, so
       the letter never runs into what follows (the markets box's rule). */
    min-height: 3lh;
  }
  .lead-extras {
    margin-top: 16px;
  }
  /* Without a photo the text spans the lead; set body and headlines side by side instead
     of one over-long line. */
  .lead:not(.has-photo) .lead-text {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    column-gap: var(--gutter);
    align-content: start;
  }
  .lead:not(.has-photo) .lead-text > .byline {
    grid-column: 1 / -1;
  }
  .lead:not(.has-photo) .lead-extras {
    grid-column: 2;
    grid-row: 2;
    margin-top: 0;
  }
  .body::first-letter {
    initial-letter: 3;
    font-family: var(--font-head);
    font-weight: 700;
    margin-right: 0.12em;
    color: var(--ink);
  }

  /* Secondary ------------------------------------------------------------ */
  .secondary .headline {
    font-size: clamp(22px, 0.55vw + 17px, 26px);
    line-height: 1.12;
    margin-bottom: 8px;
  }
  .secondary .deck {
    font-size: 17px;
    line-height: 1.38;
    margin-bottom: 10px;
  }
  .secondary.has-photo :global(.photo) {
    margin: 4px 0 10px;
  }

  /* Band ----------------------------------------------------------------- */
  .band .headline {
    font-size: 19.5px;
    line-height: 1.18;
    margin-bottom: 8px;
  }
  .band .deck {
    font-size: 15.5px;
    line-height: 1.4;
    margin-bottom: 10px;
  }
  .band.has-photo :global(.photo) {
    margin-bottom: 10px;
  }
  .band .kicker {
    color: var(--ink-2);
    font-weight: 500;
  }
  .band .kicker .dot {
    margin-right: 6px;
  }

  /* Brief ---------------------------------------------------------------- */
  .brief .headline {
    font-size: 15.5px;
    line-height: 1.28;
    margin-bottom: 4px;
  }
  .brief .byline {
    font-size: 10.5px;
  }

  /* Phone: a tabloid column */
  @media (max-width: 859px) {
    .lead-body {
      display: block;
    }
    .lead-photo {
      margin-bottom: 14px;
    }
    .lead-text::before {
      display: none;
    }
    .lead:not(.has-photo) .lead-text {
      display: block;
    }
    .lead:not(.has-photo) .lead-extras {
      margin-top: 16px;
    }
  }
  @media (min-width: 860px) and (max-width: 1279px) {
    .lead-body {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .lead-text {
      grid-column: 3;
    }
  }
</style>
