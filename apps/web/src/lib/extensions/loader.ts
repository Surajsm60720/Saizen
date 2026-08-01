import { saizenFetch } from './fetch'
import type { ExtensionInstance, ExtensionManifest } from './types'

const cache = new Map<string, ExtensionInstance>()

function cacheKey(manifest: ExtensionManifest): string {
  return `${manifest.id}@${manifest.version}`
}

/** Rewrite Hayase ESM `export default …` into an assignable classic-script form. */
export function transformExtensionSource(source: string): string {
  let code = source.trim()
  if (code.charCodeAt(0) === 0xfeff) code = code.slice(1)

  if (/\bexport\s+default\b/.test(code)) {
    code = code.replace(/export\s+default\s+/, '__saizen_default__ = ')
  } else if (!/\b__saizen_default__\s*=/.test(code)) {
    code = `${code}\n;__saizen_default__ = (typeof module !== 'undefined' && module.exports) ? module.exports : __saizen_default__;`
  }

  code = code.replace(/^\s*export\s+\{[^}]*\}\s*;?\s*$/gm, '')
  return code
}

function readExport(marker: string): ExtensionInstance | undefined {
  const w = window as unknown as Record<string, unknown>
  const instance = w[marker] as ExtensionInstance | undefined
  delete w[marker]
  return instance
}

/**
 * Wrap transformed source so top-level `const QUALITIES` / helpers from each
 * extension stay private. Injecting into the page global scope caused:
 *   SyntaxError: Can't create duplicate variable: 'QUALITIES'
 */
function wrapInIife(transformed: string, marker: string): string {
  return `(function(){\n"use strict";\nvar __saizen_default__;\n${transformed}\n;window[${JSON.stringify(marker)}]=__saizen_default__;\n})();`
}

/** Classic <script> with IIFE scope — avoids global const collisions across extensions. */
async function evaluateViaScriptTag(source: string, id: string): Promise<ExtensionInstance> {
  const transformed = transformExtensionSource(source)
  const marker = `__saizen_ext_${id.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now().toString(36)}`
  const body = wrapInIife(transformed, marker)

  // 1) blob: classic script (not type=module)
  try {
    const instance = await new Promise<ExtensionInstance>((resolve, reject) => {
      const blob = new Blob([body], { type: 'text/javascript' })
      const url = URL.createObjectURL(blob)
      const script = document.createElement('script')
      script.async = false
      script.src = url
      const cleanup = () => {
        URL.revokeObjectURL(url)
        script.remove()
      }
      script.onload = () => {
        cleanup()
        const inst = readExport(marker)
        if (inst && typeof inst === 'object') resolve(inst)
        else reject(new Error('script onload but no default export'))
      }
      script.onerror = () => {
        cleanup()
        reject(new Error('blob script onerror'))
      }
      document.documentElement.appendChild(script)
    })
    return instance
  } catch {
    // 2) inline script text (also IIFE-wrapped)
  }

  const script = document.createElement('script')
  script.textContent = body
  document.documentElement.appendChild(script)
  script.remove()
  const inst = readExport(marker)
  if (inst && typeof inst === 'object') return inst
  throw new Error('inline script produced no default export')
}

function evaluateViaNewFunction(source: string, id: string): ExtensionInstance {
  const transformed = transformExtensionSource(source)
  // Own function scope — no global QUALITIES leak
  // eslint-disable-next-line no-new-func -- scoped eval host for remote extensions
  const factory = new Function(
    `"use strict";\nvar __saizen_default__;\n${transformed}\n;return __saizen_default__;`
  )
  const instance = factory() as ExtensionInstance
  if (!instance || typeof instance !== 'object') {
    throw new Error(`Extension ${id} evaluated to non-object default export`)
  }
  return instance
}

export async function evaluateExtensionSource(
  source: string,
  id: string
): Promise<ExtensionInstance> {
  const errors: string[] = []

  // Prefer Function scope first (no DOM / no global leaks). Fall back to IIFE script.
  try {
    return evaluateViaNewFunction(source, id)
  } catch (e) {
    errors.push(`function: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (typeof document !== 'undefined') {
    try {
      return await evaluateViaScriptTag(source, id)
    } catch (e) {
      errors.push(`script: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  throw new Error(`Failed to evaluate extension ${id}: ${errors.join(' | ')}`)
}

/**
 * Fetch remote extension JS and evaluate it (Hayase-compatible host).
 */
export async function loadExtensionInstance(
  manifest: ExtensionManifest
): Promise<ExtensionInstance> {
  const key = cacheKey(manifest)
  const hit = cache.get(key)
  if (hit) return hit

  const res = await saizenFetch(manifest.code, {
    headers: {
      Accept: 'application/javascript, text/javascript, text/plain, */*',
      'Accept-Encoding': 'identity'
    }
  })
  if (!res.ok) {
    throw new Error(`Failed to fetch extension code (${res.status}): ${manifest.code}`)
  }
  const source = await res.text()
  if (!source || source.length < 20) {
    throw new Error(
      `Extension ${manifest.id} returned empty source (${source?.length ?? 0} bytes) from ${manifest.code}`
    )
  }
  if (/^\s*<(!DOCTYPE|html|HTML)/i.test(source)) {
    throw new Error(`Extension ${manifest.id} URL returned HTML, not JavaScript`)
  }

  const instance = await evaluateExtensionSource(source, manifest.id)
  cache.set(key, instance)
  return instance
}

export function unloadExtension(manifest: ExtensionManifest): void {
  cache.delete(cacheKey(manifest))
}

export function clearExtensionCache(): void {
  cache.clear()
}
