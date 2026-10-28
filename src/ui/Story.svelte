<script lang="ts">
  import type { StoryView } from './model';
  import Photo from './Photo.svelte';

  type Variant = 'lead' | 'secondary' | 'band' | 'brief';
  let {
    story,
    variant,
    photo = true,
    onopen,
  }: {
    story: StoryView;
    variant: Variant;
    /** Secondary and band stories show a photo only where the layout wants one. */
    photo?: boolean;
    onopen?: (id: string) => void;
  } = $props();

  const headingId = $derived(`h-${story.id}`);
  const showPhoto = $derived(photo && !!story.imageUrl);
  // Band stories sit under their section name, so the kicker names the source instead.
  const kicker = $derived(variant === 'band' ? story.source : story.kicker);
  const open = () => onopen?.(story.id);
</script>

<article
  class="story {variant}"
  class:read={story.read}
  class:has-photo={showPhoto}
  aria-labelledby={headingId}
  data-story={story.id}
>
  {#if variant === 'brief'}
    <h3 id={headingId} class="headline">
      {#if story.isNew}<span class="dot" title="New since your last visit"></span>{/if}
      <a href={story.link} onclick={open}>{story.title}</a>
    </h3>
    <p class="byline">
      {story.source} · <time datetime={story.datetime}>{story.ago}</time>
    </p>
  {:else}
    {#if kicker}
      <p class="kicker">
        {#if story.isNew}<span class="dot" title="New since your last visit"></span>{/if}{kicker}
      </p>
    {/if}
    {#if variant === 'lead'}
      <h2 id={headingId} class="headline"><a href={story.link} onclick={open}>{story.title}</a></h2>
    {:else}
      <h3 id={headingId} class="headline"><a href={story.link} onclick={open}>{story.title}</a></h3>
    {/if}
    {#if story.deck}<p class="deck">{story.deck}</p>{/if}

    {#if variant === 'lead'}
      <div class="lead-body">
        {#if showPhoto}
          <div class="lead-photo">
            <Photo src={story.imageUrl!} href={story.link} eager fill />
          </div>
        {/if}
        <div class="lead-text">
          <p class="byline">
            {story.source} · <time datetime={story.datetime}>{story.ago}</time>
          </p>
          {#if story.body}<p class="body">{story.body}</p>{/if}
          {#if story.related.length}
            <section class="elsewhere" aria-label="The story elsewhere">
              <p class="elsewhere-label">The story elsewhere</p>
              <ul>
                {#each story.related as r (r.link)}
                  <li>
                    <span class="elsewhere-source">{r.source}</span>
                    <a href={r.link}>{r.title}</a>
                  </li>
                {/each}
              </ul>
            </section>
          {/if}
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
      <p class="byline">
        {story.source} · <time datetime={story.datetime}>{story.ago}</time>
      </p>
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
  .read .headline {
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
  .byline a {
    text-decoration: underline;
    text-decoration-color: var(--rule);
    text-underline-offset: 0.2em;
  }

  /* Lead ---------------------------------------------------------------- */
  .lead .headline {
    font-size: clamp(30px, 2.4vw + 13px, 48px);
    line-height: 1.06;
    letter-spacing: -0.01em;
    margin-bottom: 12px;
  }
  .lead .deck {
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
  .lead .byline {
    padding-bottom: 10px;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--rule);
  }
  .body {
    font-size: 16.5px;
    line-height: 1.5;
    text-align: justify;
    hyphens: auto;
    columns: 2;
    column-gap: var(--gutter);
    column-rule: 1px solid var(--rule);
  }
  .lead:not(.has-photo) .body {
    columns: 3;
  }
  .elsewhere {
    margin-top: 16px;
    padding-top: 10px;
    border-top: 1px solid var(--rule);
  }
  .elsewhere-label {
    font: 700 10.5px/1.4 var(--font-label);
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-2);
    margin-bottom: 6px;
  }
  .elsewhere ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .elsewhere li {
    font: 700 15px/1.3 var(--font-head);
    padding: 6px 0;
  }
  .elsewhere li + li {
    border-top: 1px solid var(--rule);
  }
  .elsewhere-source {
    display: block;
    font: 500 10.5px/1.5 var(--font-label);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--ink-2);
  }
  .elsewhere a:hover {
    text-decoration: underline;
    text-underline-offset: 0.12em;
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
    .body,
    .lead:not(.has-photo) .body {
      columns: 1;
    }
  }
  @media (min-width: 860px) and (max-width: 1279px) {
    .lead-body {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .lead-text {
      grid-column: 3;
    }
    .body {
      columns: 1;
    }
    .lead:not(.has-photo) .body {
      columns: 2;
    }
  }
</style>
