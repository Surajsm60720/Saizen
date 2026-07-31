<script lang="ts">
  import { onMount } from 'svelte'

  let url = ''
  let title = ''
  let episode = 0
  let error = ''

  onMount(() => {
    try {
      const raw = sessionStorage.getItem('saizen:lastStream')
      if (!raw) {
        error = 'No stream queued. Play something from an anime page first.'
        return
      }
      const data = JSON.parse(raw) as { url: string; title: string; episode: number }
      url = data.url
      title = data.title
      episode = data.episode
    } catch (e) {
      error = e instanceof Error ? e.message : String(e)
    }
  })
</script>

<svelte:head>
  <title>Player — Saizen</title>
</svelte:head>

<a class="muted" href="#/">← Home</a>
<h1>{title || 'Player'}</h1>
{#if episode}<p class="muted">Episode {episode}</p>{/if}

{#if error}
  <p style="color: var(--danger)">{error}</p>
{:else if url}
  <p class="muted tiny">{url}</p>
  <!-- Web-only HTML5 player for progressive HTTP test streams -->
  <video class="vid" src={url} controls autoplay playsinline>
    <track kind="captions" />
  </video>
{/if}

<style>
  h1 {
    margin: 0.5rem 0 0.25rem;
  }
  .vid {
    width: 100%;
    max-height: 70vh;
    background: #000;
    border-radius: 10px;
    margin-top: 1rem;
  }
  .tiny {
    font-size: 0.75rem;
    word-break: break-all;
  }
</style>
