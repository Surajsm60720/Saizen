import adapter from '@sveltejs/adapter-static'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    // Required for Capacitor WKWebView — absolute "/_app/..." fails → blank screen
    paths: {
      relative: true
    },
    adapter: adapter({
      fallback: 'index.html',
      pages: 'build',
      assets: 'build',
      precompress: false,
      strict: false
    }),
    router: {
      type: 'hash'
    },
    alias: {
      '@saizen/shared': '../../packages/shared/src/index.ts'
    }
  }
}

export default config
