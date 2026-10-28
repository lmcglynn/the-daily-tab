<script lang="ts">
  import { browser } from 'wxt/browser';
  import type { DiscoveredFeed } from '@/lib/feed/discover';
  import { safeUrl } from '@/lib/feed/text';
  import { feedIdFor } from '@/lib/hash';
  import type { Feed } from '@/lib/types';

  let {
    sections,
    feeds,
    onadd,
    onrelease,
  }: {
    sections: string[];
    feeds: Feed[];
    /** Must be called inside the click: it requests the feed origin's permission. */
    onadd: (d: DiscoveredFeed, section: string) => Promise<string | null>;
    /** Drop host access granted only for looking around. */
    onrelease: () => void;
  } = $props();

  let address = $state('');
  let section = $state('');
  let newSection = $state('');
  let busy = $state(false);
  let error = $state('');
  let results = $state<DiscoveredFeed[] | null>(null);
  let added = $state<Record<string, string>>({});

  $effect.pre(() => {
    if (!section || (section !== '__new' && !sections.includes(section))) {
      section = sections[0] ?? '__new';
    }
  });

  const targetSection = () => (section === '__new' ? newSection.trim() : section);
  const subscribed = (url: string) => feeds.some((f) => f.id === feedIdFor(url));

  function find(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    results = null;
    added = {};
    const raw = address.trim();
    const url = safeUrl(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!url) {
      error = 'Enter a web address, like theatlantic.com or a feed’s own address.';
      return;
    }
    if (section === '__new' && !newSection.trim()) {
      error = 'Name the new section first.';
      return;
    }
    const host = new URL(url).hostname;
    busy = true;
    // Inside the submit gesture: ask for this site only, so discovery can read it.
    browser.permissions
      .request({ origins: [`${new URL(url).origin}/*`] })
      .then(async (granted) => {
        if (!granted) {
          error = `The Daily Tab needs permission to read ${host} to look for its feeds.`;
          return;
        }
        const res = (await browser.runtime.sendMessage({ type: 'discover', url })) as
          { feeds: DiscoveredFeed[] } | { error: string };
        if ('error' in res) error = res.error;
        else if (res.feeds.length === 0) {
          error = `No feed found at ${host}. Try the feed’s own address if you know it.`;
          onrelease();
        } else results = res.feeds;
      })
      .catch((e: unknown) => (error = e instanceof Error ? e.message : String(e)))
      .finally(() => (busy = false));
  }

  function add(d: DiscoveredFeed) {
    const target = targetSection();
    if (!target) {
      error = 'Choose a section.';
      return;
    }
    void onadd(d, target).then((problem) => {
      if (problem) error = problem;
      else added = { ...added, [d.url]: target };
    });
  }

  function done() {
    results = null;
    address = '';
    onrelease();
  }
</script>

<form class="add" onsubmit={find}>
  <label class="field grow">
    <span>Site or feed address</span>
    <input
      type="text"
      inputmode="url"
      autocomplete="off"
      spellcheck="false"
      placeholder="example.com or https://example.com/feed.xml"
      bind:value={address}
    />
  </label>
  <label class="field">
    <span>Section</span>
    <select bind:value={section}>
      {#each sections as s (s)}<option value={s}>{s}</option>{/each}
      <option value="__new">New section…</option>
    </select>
  </label>
  {#if section === '__new'}
    <label class="field">
      <span>New section name</span>
      <input type="text" maxlength="24" bind:value={newSection} />
    </label>
  {/if}
  <button class="primary" type="submit" disabled={busy || !address.trim()}>
    {busy ? 'Looking…' : 'Find feeds'}
  </button>
</form>

{#if error}<p class="error" role="alert">{error}</p>{/if}

{#if results}
  <div class="results" role="region" aria-label="Feeds found">
    <ul>
      {#each results as r (r.url)}
        <li>
          <div>
            <strong>{r.title}</strong>
            <span class="url">{r.url}</span>
          </div>
          {#if added[r.url]}
            <span class="ok">Added to {added[r.url]}</span>
          {:else if subscribed(r.url)}
            <span class="muted">Already subscribed</span>
          {:else}
            <button type="button" onclick={() => add(r)}>Add</button>
          {/if}
        </li>
      {/each}
    </ul>
    <button type="button" class="link" onclick={done}>Done</button>
  </div>
{/if}

<style>
  .add {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
  }
  .grow {
    flex: 1 1 280px;
  }
  .results {
    margin-top: 14px;
    border: 1px solid var(--rule);
    padding: 4px 14px 10px;
  }
  .results ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .results li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
    border-bottom: 1px solid var(--rule);
  }
  .results li div {
    min-width: 0;
  }
  .url {
    display: block;
    font-size: 12.5px;
    color: var(--ink-2);
    overflow-wrap: anywhere;
  }
  .ok {
    color: var(--ink);
    font-weight: 600;
  }
  .muted {
    color: var(--ink-2);
  }
</style>
