#!/usr/bin/env node
/**
 * Capacitor WKWebView: ensure /_next asset URLs are relative to each HTML file's depth.
 * Absolute "/_next/..." can blank the screen on capacitor:// schemes; with https://localhost
 * absolute paths usually work, but depth-relative paths are safer for nested routes.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { resolve, dirname, relative, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/web/out')

if (!existsSync(join(root, 'index.html'))) {
  console.error('fix-capacitor-html: out/index.html missing — run next build first')
  process.exit(1)
}

/** @param {string} dir @param {string[]} acc */
function walkHtml(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walkHtml(p, acc)
    else if (name.endsWith('.html')) acc.push(p)
  }
  return acc
}

let fixed = 0
for (const file of walkHtml(root)) {
  const rel = relative(root, file)
  const depth = rel.split('/').length - 1
  const prefix = depth === 0 ? './' : '../'.repeat(depth)
  let html = readFileSync(file, 'utf8')
  const before = html
  html = html
    .replaceAll('href="/_next/', `href="${prefix}_next/`)
    .replaceAll('src="/_next/', `src="${prefix}_next/`)
    .replaceAll('"/_next/', `"${prefix}_next/`)
    .replaceAll("'/_next/", `'${prefix}_next/`)
  if (html !== before) {
    writeFileSync(file, html)
    fixed++
  }
}

console.log(
  `fix-capacitor-html: processed ${walkHtml(root).length} HTML file(s), rewrote ${fixed}`
)
