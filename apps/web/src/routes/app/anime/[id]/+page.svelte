<script lang="ts">
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import {
    fetchAnime,
    displayTitle,
    stripHtml,
    type AnimeMedia
  } from '$lib/anilist'
  import { listProviders, searchAllProviders, type ProviderResult } from '$lib/providers'
  import getNative from '$lib/native'

  let media: AnimeMedia | null = null
  let loading = true
  let error = ''
  let episode = 1
  let searching = false
  let results: ProviderResult[] = []
  let searchErrors: Array<{ providerId: string; message: string }> = []
  let playing = false
  let status = ''

  $: id = Number($page.params.id || 0)

  onMount(async () => {
    if (!id) {
      error = 'Invalid anime id'
      loading = false
      return
    }
    try {
      media = await fetchAnime(id)
      if (!media) error = 'Anime not found'
      else episode = 1
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  })

  async function searchSources() {
    if (!media) return
    searching = true
    status = ''
    results = []
    searchErrors = []
    try {
      const titles = [
        media.title.romaji,
        media.title.english,
        media.title.native,
        media.title.userPreferred
      ].filter(Boolean) as string[]

      const out = await searchAllProviders({
        anilistId: media.id,
        title: displayTitle(media),
        titles,
        episode,
        episodeCount: media.episodes
      })
      // HTTP test streams first, then .torrent URLs, then magnets
      results = [...out.results].sort((a, b) => {
        const http = Number(!!b.httpUrl) - Number(!!a.httpUrl)
        if (http !== 0) return http
        const torrent = Number(!!b.torrentUrl) - Number(!!a.torrentUrl)
        if (torrent !== 0) return torrent
        const magnet = Number(!!b.magnet) - Number(!!a.magnet)
        if (magnet !== 0) return magnet
        return 0
      })
      searchErrors = out.errors
      const magnets = results.filter((r) => r.magnet).length
      const torrents = results.filter((r) => r.torrentUrl).length
      const http = results.filter((r) => r.httpUrl).length
      if (!results.length) {
        status =
          'No sources found. Check provider errors below — SubsPlease needs network access to subsplease.org.'
      } else {
        status = `Found ${results.length} source(s) (${http} HTTP test, ${torrents} .torrent, ${magnets} magnet). Prefer Erai “torrent” entries.`
      }
    } catch (e) {
      status = e instanceof Error ? e.message : String(e)
    } finally {
      searching = false
    }
  }

  async function playResult(result: ProviderResult) {
    playing = true
    status = `Starting: ${result.title}`
    try {
      const native = getNative()
      const source = result.httpUrl || result.torrentUrl || result.magnet
      if (!source) throw new Error('Result has no torrentUrl, magnet, or httpUrl')

      const files = await native.playTorrent(source, media!.id, episode)
      const file = files[0]
      if (!file?.url) throw new Error('playTorrent returned no stream URL')

      status = `Stream ready (${file.playerHint}): ${file.url}`
      await native.spawnPlayer({
        url: file.url,
        playerHint: file.playerHint,
        title: displayTitle(media!),
        episode
      })

      // Web fallback: navigate to in-page player
      if (!native.isApp) {
        sessionStorage.setItem(
          'saizen:lastStream',
          JSON.stringify({
            url: file.url,
            title: displayTitle(media!),
            episode,
            playerHint: file.playerHint
          })
        )
        location.hash = '#/app/player'
      }
    } catch (e) {
      status = e instanceof Error ? e.message : String(e)
    } finally {
      playing = false
    }
  }

  const providers = listProviders()
</script>

<svelte:head>
  <title>{media ? displayTitle(media) : 'Anime'} — Saizen</title>
</svelte:head>

{#if loading}
  <p class="muted">Loading…</p>
{:else if error}
  <p style="color: var(--danger)">{error}</p>
  <a href="#/">← Home</a>
{:else if media}
  <a class="muted" href="#/">← Home</a>
  <div class="detail">
    {#if media.coverImage?.large}
      <img class="cover" src={media.coverImage.large} alt="" />
    {/if}
    <div>
      <h1>{displayTitle(media)}</h1>
      <p class="muted">
        {media.format ?? 'ANIME'}
        {#if media.episodes}· {media.episodes} eps{/if}
        {#if media.averageScore}· {media.averageScore}%{/if}
      </p>
      <p class="desc">{stripHtml(media.description)}</p>

      <div class="row">
        <label>
          Episode
          <input type="number" min="1" max={media.episodes || 999} bind:value={episode} />
        </label>
        <button class="btn btn-primary" on:click={searchSources} disabled={searching}>
          {searching ? 'Searching…' : 'Find sources'}
        </button>
      </div>

      <h3>Providers</h3>
      <ul class="providers">
        {#each providers as p}
          <li>
            <strong>{p.name}</strong>
            <span class="muted"> — {p.description}</span>
          </li>
        {/each}
      </ul>

      {#if searchErrors.length}
        <p class="muted">
          Provider errors:
          {searchErrors.map((e) => `${e.providerId}: ${e.message}`).join('; ')}
        </p>
      {/if}

      {#if status}
        <p class="status">{status}</p>
      {/if}

      {#if results.length}
        <h3>Sources</h3>
        <ul class="sources">
          {#each results as r, i (i)}
            <li class="card source">
              <div>
                <div class="src-title">{r.title}</div>
                <div class="muted tiny">
                  {r.providerName}
                  {#if r.resolution}· {r.resolution}{/if}
                  {#if r.seeders != null}· {r.seeders} seeders{/if}
                  {#if r.httpUrl}· HTTP test stream{/if}
                  {#if r.torrentUrl}· torrent{/if}
                  {#if r.magnet}· magnet{/if}
                </div>
              </div>
              <button class="btn btn-primary" disabled={playing} on:click={() => playResult(r)}>
                Play
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
{/if}

<style>
  .detail {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1.25rem;
    margin-top: 1rem;
  }
  @media (max-width: 640px) {
    .detail {
      grid-template-columns: 1fr;
    }
    .cover {
      max-width: 180px;
    }
  }
  .cover {
    width: 100%;
    border-radius: 10px;
    border: 1px solid var(--border);
  }
  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.45rem;
  }
  .desc {
    font-size: 0.92rem;
    line-height: 1.45;
    color: var(--muted);
    max-width: 60ch;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: flex-end;
    margin: 1.25rem 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: var(--muted);
  }
  input {
    width: 5rem;
    padding: 0.5rem 0.6rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }
  .providers {
    padding-left: 1.1rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
  .sources {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.55rem;
  }
  .source {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 0.9rem;
  }
  .src-title {
    font-size: 0.9rem;
    margin-bottom: 0.2rem;
  }
  .tiny {
    font-size: 0.75rem;
  }
  .status {
    font-size: 0.85rem;
    color: var(--ok);
    word-break: break-all;
  }
</style>
