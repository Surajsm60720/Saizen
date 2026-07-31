<script lang="ts">
  import { onMount } from 'svelte'
  import { fetchTrending, fetchPopular, displayTitle, type AnimeMedia } from '$lib/anilist'

  let trending: AnimeMedia[] = []
  let popular: AnimeMedia[] = []
  let error = ''
  let loading = true

  onMount(async () => {
    try {
      ;[trending, popular] = await Promise.all([fetchTrending(), fetchPopular()])
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  })
</script>

<svelte:head>
  <title>Saizen — Home</title>
</svelte:head>

<h1>Home</h1>
<p class="muted">
  Minimal test UI — pick an anime, choose an episode, pick a torrent provider, stream via native
  loopback HTTP.
</p>

{#if loading}
  <p class="muted">Loading AniList…</p>
{:else if error}
  <p style="color: var(--danger)">{error}</p>
{:else}
  <section>
    <h2>Trending</h2>
    <div class="grid">
      {#each trending as media (media.id)}
        <a class="card poster" href={`#/app/anime/${media.id}`}>
          {#if media.coverImage?.large}
            <img src={media.coverImage.large} alt={displayTitle(media)} loading="lazy" />
          {/if}
          <div class="meta">
            <strong>{displayTitle(media)}</strong>
            <span class="muted">{media.averageScore ? `${media.averageScore}%` : '—'} · {media.format ?? ''}</span>
          </div>
        </a>
      {/each}
    </div>
  </section>

  <section>
    <h2>Popular</h2>
    <div class="grid">
      {#each popular as media (media.id)}
        <a class="card poster" href={`#/app/anime/${media.id}`}>
          {#if media.coverImage?.large}
            <img src={media.coverImage.large} alt={displayTitle(media)} loading="lazy" />
          {/if}
          <div class="meta">
            <strong>{displayTitle(media)}</strong>
            <span class="muted">{media.seasonYear ?? ''} · {media.format ?? ''}</span>
          </div>
        </a>
      {/each}
    </div>
  </section>
{/if}

<style>
  h1 {
    margin: 0 0 0.35rem;
    font-size: 1.6rem;
  }
  h2 {
    margin: 1.75rem 0 0.75rem;
    font-size: 1.15rem;
  }
  .poster img {
    aspect-ratio: 2 / 3;
    object-fit: cover;
    width: 100%;
    background: #111;
  }
  .meta {
    padding: 0.55rem 0.65rem 0.7rem;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .meta strong {
    font-size: 0.85rem;
    line-height: 1.25;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .meta span {
    font-size: 0.75rem;
  }
</style>
