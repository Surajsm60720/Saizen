<script lang="ts">
  import { onMount } from 'svelte'
  import { searchAnime, displayTitle, type AnimeMedia } from '$lib/anilist'

  let term = ''
  let results: AnimeMedia[] = []
  let loading = false
  let error = ''

  async function run() {
    if (!term.trim()) return
    loading = true
    error = ''
    try {
      results = await searchAnime(term.trim())
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  onMount(() => {
    const input = document.getElementById('q') as HTMLInputElement | null
    input?.focus()
  })
</script>

<svelte:head>
  <title>Search — Saizen</title>
</svelte:head>

<h1>Search</h1>
<form
  class="row"
  on:submit|preventDefault={run}
>
  <input id="q" placeholder="Romaji / English / Japanese title" bind:value={term} />
  <button class="btn btn-primary" type="submit" disabled={loading}>
    {loading ? '…' : 'Search'}
  </button>
</form>

{#if error}
  <p style="color: var(--danger)">{error}</p>
{/if}

<div class="grid" style="margin-top: 1.25rem">
  {#each results as media (media.id)}
    <a class="card poster" href={`#/app/anime/${media.id}`}>
      {#if media.coverImage?.large}
        <img src={media.coverImage.large} alt={displayTitle(media)} loading="lazy" />
      {/if}
      <div class="meta">
        <strong>{displayTitle(media)}</strong>
      </div>
    </a>
  {/each}
</div>

<style>
  h1 {
    margin: 0 0 1rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  input {
    flex: 1;
    padding: 0.6rem 0.75rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
  }
  .poster img {
    aspect-ratio: 2 / 3;
    object-fit: cover;
    width: 100%;
  }
  .meta {
    padding: 0.55rem 0.65rem;
  }
  .meta strong {
    font-size: 0.85rem;
  }
</style>
