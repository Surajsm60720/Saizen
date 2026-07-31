#!/usr/bin/env node
/**
 * Capacitor WKWebView cannot reliably load SvelteKit SPA fallback assets
 * that use absolute "/_app/..." URLs (blank screen).
 * With hash routing, rewriting to "./_app/..." is safe and required.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web/build')
const indexPath = resolve(root, 'index.html')

if (!existsSync(indexPath)) {
  console.error('fix-capacitor-html: build/index.html missing — run vite build first')
  process.exit(1)
}

let html = readFileSync(indexPath, 'utf8')

html = html
  .replaceAll('href="/_app/', 'href="./_app/')
  .replaceAll('src="/_app/', 'src="./_app/')
  .replaceAll('import("/_app/', 'import("./_app/')
  // Force empty base so capacitor://localhost/index.html does not become base "/index"
  .replace(
    /base:\s*new URL\(['"]\.['"],\s*location\)\.pathname\.slice\(0,\s*-1\)/g,
    "base: ''"
  )
  // Surface boot errors instead of a silent blank screen
  .replace(
    /\.then\(\(\[kit, app\]\) => \{\s*kit\.start\(app, element\);\s*\}\);/g,
    `.then(([kit, app]) => {
						kit.start(app, element);
					}).catch((err) => {
						console.error(err);
						element.innerHTML = '<pre style="color:#e85d5d;padding:1rem;white-space:pre-wrap">' +
							String(err && err.stack ? err.stack : err) + '</pre>';
					});`
  )

writeFileSync(indexPath, html)
console.log('fix-capacitor-html: rewrote absolute /_app paths → ./_app and fixed base')
