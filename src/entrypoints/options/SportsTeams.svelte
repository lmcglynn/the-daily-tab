<script lang="ts">
  import { browser } from 'wxt/browser';
  import { MAX_TEAMS } from '@/lib/defaults';
  import { LEAGUES, SPORTS_ORIGINS, teamKey } from '@/lib/extras/scores';
  import { moveItem } from '@/lib/feeds-edit';
  import type { Settings, SportsTeam } from '@/lib/types';

  let {
    settings,
    onpatch,
  }: {
    settings: Settings;
    onpatch: (patch: Partial<Settings>) => Promise<void>;
  } = $props();

  let league = $state(LEAGUES[0]!.id);
  let teams = $state.raw<SportsTeam[] | null>(null);
  let teamsFor = $state('');
  let chosen = $state('');
  let loading = $state(false);
  let error = $state('');

  // Plain copies: chrome.storage must not receive a reactive proxy.
  const plainTeams = (): SportsTeam[] => settings.teams.map((t) => ({ ...t }));
  const leagueName = (id: string) => LEAGUES.find((l) => l.id === id)?.name ?? '';

  /** Inside the click: ask for ESPN access (once), then list the league's teams. */
  function showTeams(e: SubmitEvent) {
    e.preventDefault();
    error = '';
    loading = true;
    const wanted = league;
    browser.permissions
      .request({ origins: SPORTS_ORIGINS })
      .then(async (granted) => {
        if (!granted) {
          error = 'Scores need permission to reach ESPN (site.api.espn.com).';
          return;
        }
        const res = (await browser.runtime.sendMessage({ type: 'teams', league: wanted })) as
          { teams: SportsTeam[] } | { error: string };
        if ('error' in res) {
          error = `Couldn’t load the ${leagueName(wanted)} teams: ${res.error}`;
          return;
        }
        teams = res.teams;
        teamsFor = wanted;
        chosen =
          res.teams.find((t) => !settings.teams.some((f) => teamKey(f) === teamKey(t)))?.id ?? '';
      })
      .catch((err: unknown) => (error = err instanceof Error ? err.message : String(err)))
      .finally(() => (loading = false));
  }

  function follow() {
    const team = teams?.find((t) => t.id === chosen);
    if (!team || settings.teams.some((t) => teamKey(t) === teamKey(team))) return;
    void onpatch({ teams: [...plainTeams(), { ...team }] });
  }
</script>

<p class="hint">
  Shown under the markets box: each team’s last result and next game, live while they play. With
  more than one, use the arrows on the box to cycle through them. Scores come from ESPN
  (unofficial), checked every few minutes during a game.
</p>

{#if settings.teams.length}
  <ul class="teams" aria-label="Your teams">
    {#each settings.teams as t, i (teamKey(t))}
      <li>
        <span><strong>{t.name}</strong> <span class="league">{leagueName(t.league)}</span></span>
        <span class="tools">
          <button
            type="button"
            class="icon"
            disabled={i === 0}
            aria-label="Move {t.name} up"
            onclick={() => void onpatch({ teams: moveItem(plainTeams(), i, i - 1) })}>↑</button
          >
          <button
            type="button"
            class="icon"
            disabled={i === settings.teams.length - 1}
            aria-label="Move {t.name} down"
            onclick={() => void onpatch({ teams: moveItem(plainTeams(), i, i + 1) })}>↓</button
          >
          <button
            type="button"
            class="link"
            aria-label="Remove {t.name}"
            onclick={() =>
              void onpatch({ teams: plainTeams().filter((x) => teamKey(x) !== teamKey(t)) })}
            >Remove</button
          >
        </span>
      </li>
    {/each}
  </ul>
{/if}

{#if settings.teams.length < MAX_TEAMS}
  <form class="pick" onsubmit={showTeams}>
    <label class="field">
      <span>League</span>
      <select bind:value={league}>
        {#each LEAGUES as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
      </select>
    </label>
    <button type="submit" disabled={loading}>{loading ? 'Loading…' : 'Show teams'}</button>
  </form>
  {#if teams && teamsFor === league}
    <div class="pick">
      <label class="field grow">
        <span>{leagueName(teamsFor)} team</span>
        <select bind:value={chosen}>
          {#each teams as t (t.id)}
            <option value={t.id} disabled={settings.teams.some((f) => teamKey(f) === teamKey(t))}
              >{t.name}</option
            >
          {/each}
        </select>
      </label>
      <button type="button" disabled={!chosen} onclick={follow}>Follow</button>
    </div>
  {/if}
{:else}
  <p class="hint">That’s the most the box holds ({MAX_TEAMS}); remove one to add another.</p>
{/if}
{#if error}<p class="error" role="alert">{error}</p>{/if}

<style>
  .pick {
    display: flex;
    gap: 10px;
    align-items: flex-end;
    flex-wrap: wrap;
    margin-top: 10px;
  }
  .grow {
    flex: 1 1 240px;
  }
  .teams {
    list-style: none;
    margin: 8px 0 12px;
    padding: 0;
    border-top: 1px solid var(--rule);
  }
  .teams li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-bottom: 1px solid var(--rule);
  }
  .league {
    font-size: 12.5px;
    color: var(--ink-2);
    margin-left: 4px;
  }
  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
  }
</style>
