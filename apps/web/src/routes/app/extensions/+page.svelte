<script lang="ts">
  import { listProviders } from '$lib/providers'
  const providers = listProviders()
</script>

<h1>Extensions / Providers</h1>
<p class="muted">Built-in torrent providers for the MVP test path.</p>
<ul>
  {#each providers as p}
    <li>
      <strong>{p.name}</strong> <span class="muted">({p.id})</span>
      <div class="muted">{p.description}</div>
    </li>
  {/each}
</ul>
