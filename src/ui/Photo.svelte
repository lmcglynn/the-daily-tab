<script lang="ts">
  let {
    src,
    href,
    ratio = '3 / 2',
    eager = false,
    fill = false,
  }: {
    src: string;
    href: string;
    ratio?: string;
    eager?: boolean;
    /** Fill the parent's height, bounded between 4:3 and 4:5 (needs a size container). */
    fill?: boolean;
  } = $props();

  // A broken or blocked image removes the figure; the grid never shows a hole.
  let failed = $state(false);
</script>

{#if !failed}
  <figure class="photo" class:fill style:aspect-ratio={fill ? null : ratio}>
    <a {href} tabindex="-1" aria-hidden="true">
      <img
        {src}
        alt=""
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerpolicy="no-referrer"
        onerror={() => (failed = true)}
      />
    </a>
  </figure>
{/if}

<style>
  .photo {
    position: relative;
    overflow: hidden;
    width: 100%;
    background: var(--placeholder);
  }
  .fill {
    height: 100%;
    min-height: 75cqw;
    max-height: 125cqw;
  }
  /* The figure's height may come only from min-height; pin the image to its box. */
  .fill a {
    position: absolute;
    inset: 0;
  }
  a,
  img {
    display: block;
    width: 100%;
    height: 100%;
  }
  img {
    object-fit: cover;
    filter: var(--photo-filter);
  }
  .photo:hover img {
    filter: none;
  }
</style>
