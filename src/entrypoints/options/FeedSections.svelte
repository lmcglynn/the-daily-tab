<script lang="ts">
  import { feedsIn } from '@/lib/feeds-edit';
  import type { Feed, FeedState } from '@/lib/types';
  import { ago, clock } from '@/ui/format';

  let {
    sections,
    feeds,
    states,
    granted,
    now,
    onmovefeed,
    onmovesection,
    onrename,
    onremove,
    onrenamesection,
    onremovesection,
    onaddsection,
    onallow,
  }: {
    sections: string[];
    feeds: Feed[];
    states: Map<string, FeedState>;
    /** Granted host-permission patterns. */
    granted: Set<string>;
    now: number;
    onmovefeed: (id: string, section: string, index: number) => void;
    onmovesection: (name: string, index: number) => void;
    onrename: (id: string, title: string) => void;
    onremove: (id: string) => void;
    onrenamesection: (from: string, to: string) => void;
    onremovesection: (name: string) => void;
    onaddsection: (name: string) => void;
    onallow: (feed: Feed) => void;
  } = $props();

  type Drag = { kind: 'feed'; id: string } | { kind: 'section'; name: string };
  let drag = $state<Drag | null>(null);
  let feedDrop = $state<{ section: string; index: number } | null>(null);
  let sectionDrop = $state<number | null>(null);
  let confirming = $state<string | null>(null);
  let newSection = $state('');

  const pattern = (f: Feed) => `${new URL(f.url).origin}/*`;

  function status(f: Feed): string {
    if (!granted.has(pattern(f))) return 'Needs permission to be read';
    const s = states.get(f.id);
    if (!s || s.status === 'pending') return 'Not fetched yet';
    if (s.status === 'error') {
      const retry = s.nextFetchAt ? ` · retrying at ${clock(s.nextFetchAt)}` : '';
      return `Failed${s.lastErrorAt ? ` at ${clock(s.lastErrorAt)}` : ''}: ${s.lastError}${retry}`;
    }
    if (s.status === 'no-permission') return 'Needs permission to be read';
    if (!s.lastSuccessAt) return 'Updated';
    if (now - s.lastSuccessAt < 60_000) return 'Updated just now';
    const age = ago(s.lastSuccessAt, now);
    // Same day: a clock time reads better than "3h"; older: "Yesterday", "Mon", "Oct 21".
    return /^\d+[mh]$/.test(age) ? `Updated at ${clock(s.lastSuccessAt)}` : `Updated ${age}`;
  }

  // Index among the rows of a list, by pointer position, ignoring the row being dragged.
  function indexAt(list: HTMLElement, y: number, selector: string, skip: string): number {
    const rows = [...list.querySelectorAll<HTMLElement>(selector)].filter(
      (r) => r.dataset.key !== skip,
    );
    const i = rows.findIndex((r) => {
      const box = r.getBoundingClientRect();
      return y < box.top + box.height / 2;
    });
    return i === -1 ? rows.length : i;
  }

  function feedDragOver(e: DragEvent, section: string) {
    if (drag?.kind !== 'feed') return;
    e.preventDefault();
    e.stopPropagation();
    const list = e.currentTarget as HTMLElement;
    feedDrop = { section, index: indexAt(list, e.clientY, ':scope > li[data-key]', drag.id) };
  }

  function feedDropped(e: DragEvent) {
    if (drag?.kind !== 'feed' || !feedDrop) return;
    e.preventDefault();
    onmovefeed(drag.id, feedDrop.section, feedDrop.index);
    end();
  }

  function sectionDragOver(e: DragEvent) {
    if (drag?.kind !== 'section') return;
    e.preventDefault();
    const list = e.currentTarget as HTMLElement;
    sectionDrop = indexAt(list, e.clientY, ':scope > section[data-key]', drag.name);
  }

  function sectionDropped(e: DragEvent) {
    if (drag?.kind !== 'section' || sectionDrop === null) return;
    e.preventDefault();
    onmovesection(drag.name, sectionDrop);
    end();
  }

  // Drags start from the grip (inputs inside a draggable row can't be text-selected), but
  // the whole row or section is shown as the drag image.
  function start(e: DragEvent, d: Drag) {
    drag = d;
    const dt = e.dataTransfer;
    if (!dt) return;
    dt.setData('text/plain', d.kind === 'feed' ? d.id : d.name);
    dt.effectAllowed = 'move';
    const box = (e.currentTarget as HTMLElement).closest<HTMLElement>('[data-key]');
    if (box) dt.setDragImage(box, 16, 16);
  }

  function end() {
    drag = null;
    feedDrop = null;
    sectionDrop = null;
  }

  function commitTitle(f: Feed, e: Event) {
    const value = (e.currentTarget as HTMLInputElement).value.trim();
    if (value && value !== f.title) onrename(f.id, value);
    else (e.currentTarget as HTMLInputElement).value = f.title;
  }

  function commitSectionName(from: string, e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const value = input.value.trim();
    if (value && value !== from) onrenamesection(from, value);
    else input.value = from;
  }

  function addSection(e: SubmitEvent) {
    e.preventDefault();
    const name = newSection.trim();
    if (name) onaddsection(name);
    newSection = '';
  }
</script>

<div
  class="sections"
  role="list"
  aria-label="Sections"
  ondragover={sectionDragOver}
  ondrop={sectionDropped}
>
  {#each sections as section, si (section)}
    {@const list = feedsIn(feeds, section)}
    {#if sectionDrop === si}<div class="marker" aria-hidden="true"></div>{/if}
    <section
      class="section"
      class:dragging={drag?.kind === 'section' && drag.name === section}
      data-key={section}
      role="listitem"
      aria-label="{section} section"
    >
      <header>
        <span
          class="grip"
          aria-hidden="true"
          title="Drag to reorder"
          draggable="true"
          ondragstart={(e) => start(e, { kind: 'section', name: section })}
          ondragend={end}>⠿</span
        >
        <input
          class="section-name"
          type="text"
          maxlength="24"
          value={section}
          aria-label="Section name"
          onchange={(e) => commitSectionName(section, e)}
          onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
        />
        <span class="count">{list.length} {list.length === 1 ? 'feed' : 'feeds'}</span>
        <span class="tools">
          <button
            type="button"
            class="icon"
            disabled={si === 0}
            aria-label="Move {section} up"
            onclick={() => onmovesection(section, si - 1)}>↑</button
          >
          <button
            type="button"
            class="icon"
            disabled={si === sections.length - 1}
            aria-label="Move {section} down"
            onclick={() => onmovesection(section, si + 1)}>↓</button
          >
          {#if list.length === 0}
            <button type="button" class="link" onclick={() => onremovesection(section)}
              >Remove section</button
            >
          {/if}
        </span>
      </header>

      <ul
        class="feeds"
        class:target={drag?.kind === 'feed'}
        aria-label="Feeds in {section}"
        ondragover={(e) => feedDragOver(e, section)}
        ondrop={feedDropped}
      >
        {#each list as f, fi (f.id)}
          {#if feedDrop?.section === section && feedDrop.index === fi}
            <li class="marker" aria-hidden="true"></li>
          {/if}
          <li
            class="feed"
            class:dragging={drag?.kind === 'feed' && drag.id === f.id}
            data-key={f.id}
          >
            <span
              class="grip"
              aria-hidden="true"
              title="Drag to reorder or move"
              draggable="true"
              ondragstart={(e) => start(e, { kind: 'feed', id: f.id })}
              ondragend={end}>⠿</span
            >
            <div class="info">
              <input
                class="title"
                type="text"
                maxlength="80"
                value={f.title}
                aria-label="Feed name"
                onchange={(e) => commitTitle(f, e)}
                onkeydown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
              />
              <span class="url">{f.url}</span>
              <span class="status" class:bad={states.get(f.id)?.status === 'error'}>
                {status(f)}
                {#if !granted.has(pattern(f))}
                  <button type="button" class="link" onclick={() => onallow(f)}>Allow</button>
                {/if}
              </span>
            </div>
            <div class="row-tools">
              <select
                aria-label="Section for {f.title}"
                value={f.category}
                onchange={(e) =>
                  onmovefeed(f.id, (e.currentTarget as HTMLSelectElement).value, Infinity)}
              >
                {#each sections as s (s)}<option value={s}>{s}</option>{/each}
              </select>
              <button
                type="button"
                class="icon"
                disabled={fi === 0}
                aria-label="Move {f.title} up"
                onclick={() => onmovefeed(f.id, section, fi - 1)}>↑</button
              >
              <button
                type="button"
                class="icon"
                disabled={fi === list.length - 1}
                aria-label="Move {f.title} down"
                onclick={() => onmovefeed(f.id, section, fi + 1)}>↓</button
              >
              {#if confirming === f.id}
                <button type="button" class="danger" onclick={() => onremove(f.id)}>Remove</button>
                <button type="button" class="link" onclick={() => (confirming = null)}>Keep</button>
              {:else}
                <button
                  type="button"
                  class="link"
                  aria-label="Remove {f.title}"
                  onclick={() => (confirming = f.id)}>Remove</button
                >
              {/if}
            </div>
          </li>
        {/each}
        {#if feedDrop?.section === section && feedDrop.index >= list.length}
          <li class="marker" aria-hidden="true"></li>
        {/if}
        {#if list.length === 0}
          <li class="empty">Drag a feed here, or add one above.</li>
        {/if}
      </ul>
    </section>
  {/each}
  {#if sectionDrop !== null && sectionDrop >= sections.length}
    <div class="marker" aria-hidden="true"></div>
  {/if}
</div>

<form class="new-section" onsubmit={addSection}>
  <label class="field">
    <span>New section</span>
    <input type="text" maxlength="24" placeholder="e.g. Business" bind:value={newSection} />
  </label>
  <button type="submit" disabled={!newSection.trim()}>Add section</button>
</form>

<style>
  .sections {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .section {
    border: 1px solid var(--rule);
    background: color-mix(in srgb, var(--paper) 85%, var(--ink) 3%);
  }
  .section header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-bottom: 1px solid var(--rule);
  }
  .section-name {
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border-color: transparent;
    background: transparent;
    width: 14em;
  }
  .section-name:hover,
  .section-name:focus {
    border-color: var(--rule);
  }
  .count {
    color: var(--ink-2);
    font-size: 13px;
  }
  .tools {
    margin-left: auto;
    display: flex;
    gap: 6px;
    align-items: center;
  }
  .feeds {
    list-style: none;
    margin: 0;
    padding: 0;
    min-height: 44px;
  }
  .feed {
    display: flex;
    gap: 10px;
    align-items: flex-start;
    padding: 10px 12px;
    border-bottom: 1px solid var(--rule);
    background: var(--paper);
  }
  .feed:last-child {
    border-bottom: 0;
  }
  .dragging {
    opacity: 0.45;
  }
  .grip {
    color: var(--ink-2);
    font-size: 16px;
    line-height: 30px;
    padding: 0 4px;
    user-select: none;
    cursor: grab;
  }
  .grip:active {
    cursor: grabbing;
  }
  .info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .title {
    font-weight: 600;
    border-color: transparent;
    background: transparent;
    padding-left: 4px;
    margin-left: -4px;
  }
  .title:hover,
  .title:focus {
    border-color: var(--rule);
  }
  .url {
    font-size: 12.5px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .status {
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .status.bad {
    color: var(--ink);
    font-weight: 600;
  }
  .row-tools {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
    justify-content: flex-end;
  }
  .marker {
    height: 0;
    border-top: 2px solid var(--ink);
    list-style: none;
  }
  .empty {
    padding: 12px;
    color: var(--ink-2);
    font-size: 13.5px;
  }
  .new-section {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    margin-top: 14px;
  }
  @media (max-width: 640px) {
    .feed {
      flex-wrap: wrap;
    }
    .row-tools {
      width: 100%;
      justify-content: flex-start;
    }
    .section-name {
      width: 9em;
    }
  }
</style>
