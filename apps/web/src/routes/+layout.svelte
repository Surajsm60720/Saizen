<script lang="ts">
  import '../app.css'
  import { onMount } from 'svelte'
  import { page } from '$app/stores'
  import { installSaizenBridge } from '$lib/native/bridge'
  import { refreshNative } from '$lib/native'

  onMount(async () => {
    await installSaizenBridge()
    refreshNative()
  })
</script>

<header class="top">
  <a class="brand" href="#/">Saizen</a>
  <nav>
    <a href="#/" class:active={$page.url.hash === '#/' || $page.url.hash === ''}>Home</a>
    <a href="#/app/search" class:active={$page.url.hash.startsWith('#/app/search')}>Search</a>
  </nav>
</header>

<main class="container">
  <slot />
</main>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: rgba(15, 20, 25, 0.92);
    position: sticky;
    top: 0;
    z-index: 10;
    backdrop-filter: blur(8px);
  }
  .brand {
    font-weight: 700;
    letter-spacing: 0.02em;
    color: var(--text);
    font-size: 1.15rem;
  }
  nav {
    display: flex;
    gap: 1rem;
  }
  nav a {
    color: var(--muted);
    font-size: 0.95rem;
  }
  nav a.active,
  nav a:hover {
    color: var(--text);
  }
</style>
