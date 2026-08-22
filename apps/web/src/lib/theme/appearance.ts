const KEY = 'saizen:appearance'

export type AccentSwatchId =
  | 'gold'
  | 'sky'
  | 'azure'
  | 'indigo'
  | 'teal'
  | 'mint'
  | 'violet'
  | 'rose'

export type AppearanceState = {
  hue: number
  saturation: number
  brightness: number
  contrast: number
  /** 0 = solid chrome, 100 = max see-through (tab bar + top chrome). */
  glass: number
  /** When on, blur scales with transparency (iOS frosted glass). Off = clear tint only. */
  frosted: boolean
}

export const ACCENT_SWATCHES: { id: AccentSwatchId; label: string; hex: string }[] = [
  { id: 'gold', label: 'Gold', hex: '#e8c478' },
  { id: 'sky', label: 'Sky', hex: '#7eb8ff' },
  { id: 'azure', label: 'Azure', hex: '#3b82f6' },
  { id: 'indigo', label: 'Indigo', hex: '#818cf8' },
  { id: 'teal', label: 'Teal', hex: '#2dd4bf' },
  { id: 'mint', label: 'Mint', hex: '#4ade80' },
  { id: 'violet', label: 'Violet', hex: '#c084fc' },
  { id: 'rose', label: 'Rose', hex: '#fb7185' }
]

export const DEFAULT_APPEARANCE: AppearanceState = {
  hue: 41,
  saturation: 71,
  brightness: 69,
  contrast: 50,
  glass: 55,
  frosted: false
}

const DEEP_BLACK_TOKENS: Record<string, string> = {
  '--background': 'oklch(0.05 0 0)',
  '--foreground': 'oklch(0.97 0 0)',
  '--card': 'oklch(0.12 0 0)',
  '--card-foreground': 'oklch(0.97 0 0)',
  '--popover': 'oklch(0.12 0 0)',
  '--popover-foreground': 'oklch(0.97 0 0)',
  '--secondary': 'oklch(0.16 0 0)',
  '--secondary-foreground': 'oklch(0.97 0 0)',
  '--muted': 'oklch(0.16 0 0)',
  '--muted-foreground': 'oklch(0.62 0 0)',
  '--accent': 'oklch(0.16 0 0)',
  '--accent-foreground': 'oklch(0.97 0 0)',
  '--border': 'oklch(0.22 0 0)',
  '--input': 'oklch(0.22 0 0)',
  '--sidebar': 'oklch(0.08 0 0)',
  '--sidebar-foreground': 'oklch(0.97 0 0)',
  '--sidebar-accent': 'oklch(0.16 0 0)',
  '--sidebar-accent-foreground': 'oklch(0.97 0 0)',
  '--sidebar-border': 'oklch(0.22 0 0)'
}

export const THEME_COLOR = '#050505'

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n))
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)))
}

function clampHue(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_APPEARANCE.hue
  return Math.round((((n % 360) + 360) % 360) * 10) / 10
}

function clampPercent(n: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback
  return Math.round(clamp(n, 0, 100))
}

export function normalizeHex(raw: string): string | null {
  const value = raw.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  if (/^[0-9a-fA-F]{6}$/.test(value)) {
    return `#${value.toLowerCase()}`
  }
  return null
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const n = normalized.slice(1)
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16)
  ]
}

export function rgbToHsl(r: number, g: number, b: number): { h: number; s: number; l: number } {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = 0
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0)
      break
    case gn:
      h = (bn - rn) / d + 2
      break
    default:
      h = (rn - gn) / d + 4
  }
  return { h: h * 60, s, l }
}

function hueToRgb(p: number, q: number, t: number): number {
  let tt = t
  if (tt < 0) tt += 1
  if (tt > 1) tt -= 1
  if (tt < 1 / 6) return p + (q - p) * 6 * tt
  if (tt < 1 / 2) return q
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6
  return p
}

export function hslToHex(h: number, s: number, l: number): string {
  const hh = (((h % 360) + 360) % 360) / 360
  const ss = clamp(s, 0, 1)
  const ll = clamp(l, 0, 1)
  if (ss === 0) {
    const v = clampByte(ll * 255)
    const hex = v.toString(16).padStart(2, '0')
    return `#${hex}${hex}${hex}`
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss
  const p = 2 * ll - q
  const r = hueToRgb(p, q, hh + 1 / 3)
  const g = hueToRgb(p, q, hh)
  const b = hueToRgb(p, q, hh - 1 / 3)
  return `#${[r, g, b].map((c) => clampByte(c * 255).toString(16).padStart(2, '0')).join('')}`
}

function channelToLinear(c: number): number {
  const srgb = c / 255
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4
}

export function accentForeground(hex: string): string {
  const rgb = hexToRgb(hex)
  if (!rgb) return '#141416'
  const [r, g, b] = rgb
  const luminance =
    0.2126 * channelToLinear(r) + 0.7152 * channelToLinear(g) + 0.0722 * channelToLinear(b)
  return luminance > 0.45 ? '#141416' : '#f4f0e8'
}

export function appearanceFromHex(
  hex: string,
  contrast = 50,
  glass = DEFAULT_APPEARANCE.glass,
  frosted = DEFAULT_APPEARANCE.frosted
): AppearanceState | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const hsl = rgbToHsl(...rgb)
  const c = clampPercent(contrast, 50)
  // Invert resolveAccentHex contrast bias so the typed hex matches after apply.
  const t = (c - 50) / 50
  const sat = clamp(hsl.s - t * 0.12, 0, 1)
  const bri = clamp(hsl.l - t * 0.1, 0, 1)
  return {
    hue: clampHue(hsl.h),
    saturation: clampPercent(sat * 100, 71),
    brightness: clampPercent(bri * 100, 69),
    contrast: c,
    glass: clampPercent(glass, DEFAULT_APPEARANCE.glass),
    frosted: Boolean(frosted)
  }
}

/** Map transparency + frosted toggle → CSS material tokens. */
export function resolveGlassTokens(
  glass: number,
  frosted = DEFAULT_APPEARANCE.frosted
): {
  tabFill: string
  tabFillSupported: string
  topFill: string
  topFillSupported: string
  tabBlur: string
  topBlur: string
  saturate: string
} {
  const g = clampPercent(glass, DEFAULT_APPEARANCE.glass) / 100
  // Opacity: solid → nearly clear (always)
  const tabFillA = 0.94 - g * 0.88
  const tabFillSupportedA = 0.9 - g * 0.86
  const topFillA = 0.92 - g * 0.84
  const topFillSupportedA = 0.88 - g * 0.82

  let tabBlurPx = 0
  let topBlurPx = 0
  let saturatePct = 100
  if (frosted) {
    // More transparent → stronger frost (iOS liquid-glass feel)
    tabBlurPx = Math.round(g * 48)
    topBlurPx = Math.round(g * 36)
    saturatePct = Math.round(100 + g * 80)
  }

  return {
    tabFill: `rgba(18, 18, 22, ${tabFillA.toFixed(3)})`,
    tabFillSupported: `rgba(12, 12, 16, ${tabFillSupportedA.toFixed(3)})`,
    topFill: `rgba(12, 12, 16, ${topFillA.toFixed(3)})`,
    topFillSupported: `rgba(8, 8, 12, ${topFillSupportedA.toFixed(3)})`,
    tabBlur: `${tabBlurPx}px`,
    topBlur: `${topBlurPx}px`,
    saturate: `${saturatePct}%`
  }
}

export function resolveAccentHex(state: AppearanceState): string {
  const t = (clampPercent(state.contrast, 50) - 50) / 50
  const s = clamp(state.saturation / 100 + t * 0.12, 0, 1)
  const l = clamp(state.brightness / 100 + t * 0.1, 0.12, 0.92)
  return hslToHex(state.hue, s, l)
}

function isSwatchId(v: unknown): v is AccentSwatchId {
  return ACCENT_SWATCHES.some((swatch) => swatch.id === v)
}

export function getAppearance(): AppearanceState {
  if (typeof window === 'undefined') return { ...DEFAULT_APPEARANCE }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULT_APPEARANCE }
    const parsed = JSON.parse(raw) as Partial<AppearanceState> & {
      accentHex?: string
      accentHue?: number
      swatchId?: string
    }
    if (
      typeof parsed.hue === 'number' &&
      typeof parsed.saturation === 'number' &&
      typeof parsed.brightness === 'number'
    ) {
      return {
        hue: clampHue(parsed.hue),
        saturation: clampPercent(parsed.saturation, DEFAULT_APPEARANCE.saturation),
        brightness: clampPercent(parsed.brightness, DEFAULT_APPEARANCE.brightness),
        contrast: clampPercent(parsed.contrast ?? 50, 50),
        glass: clampPercent(parsed.glass ?? DEFAULT_APPEARANCE.glass, DEFAULT_APPEARANCE.glass),
        frosted:
          typeof parsed.frosted === 'boolean' ? parsed.frosted : DEFAULT_APPEARANCE.frosted
      }
    }
    if (isSwatchId(parsed.swatchId)) {
      const fromSwatch = appearanceFromHex(
        ACCENT_SWATCHES.find((s) => s.id === parsed.swatchId)!.hex,
        typeof parsed.contrast === 'number' ? parsed.contrast : 50,
        typeof parsed.glass === 'number' ? parsed.glass : DEFAULT_APPEARANCE.glass,
        typeof parsed.frosted === 'boolean' ? parsed.frosted : DEFAULT_APPEARANCE.frosted
      )
      if (fromSwatch) return fromSwatch
    }
    const fromHex =
      typeof parsed.accentHex === 'string'
        ? appearanceFromHex(
            parsed.accentHex,
            50,
            typeof parsed.glass === 'number' ? parsed.glass : DEFAULT_APPEARANCE.glass,
            typeof parsed.frosted === 'boolean' ? parsed.frosted : DEFAULT_APPEARANCE.frosted
          )
        : null
    if (fromHex) return fromHex
    if (typeof parsed.accentHue === 'number' && Number.isFinite(parsed.accentHue)) {
      return {
        hue: clampHue(parsed.accentHue),
        saturation: 72,
        brightness: 62,
        contrast: 50,
        glass: clampPercent(parsed.glass ?? DEFAULT_APPEARANCE.glass, DEFAULT_APPEARANCE.glass),
        frosted:
          typeof parsed.frosted === 'boolean' ? parsed.frosted : DEFAULT_APPEARANCE.frosted
      }
    }
    return { ...DEFAULT_APPEARANCE }
  } catch {
    return { ...DEFAULT_APPEARANCE }
  }
}

const appearanceListeners = new Set<(state: AppearanceState) => void>()

export function subscribeAppearance(listener: (state: AppearanceState) => void): () => void {
  appearanceListeners.add(listener)
  return () => {
    appearanceListeners.delete(listener)
  }
}

function emitAppearance(state: AppearanceState): void {
  for (const listener of appearanceListeners) {
    try {
      listener(state)
    } catch {
      /* ignore */
    }
  }
}

export function setAppearance(patch: Partial<AppearanceState>): AppearanceState {
  const current = getAppearance()
  const next: AppearanceState = {
    hue: clampHue(patch.hue ?? current.hue),
    saturation: clampPercent(patch.saturation ?? current.saturation, current.saturation),
    brightness: clampPercent(patch.brightness ?? current.brightness, current.brightness),
    contrast: clampPercent(patch.contrast ?? current.contrast, current.contrast),
    glass: clampPercent(patch.glass ?? current.glass, current.glass),
    frosted: typeof patch.frosted === 'boolean' ? patch.frosted : current.frosted
  }
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(next))
  }
  applyAppearance(next)
  emitAppearance(next)
  return next
}

export function resetAppearance(): AppearanceState {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(KEY)
  }
  applyAppearance(DEFAULT_APPEARANCE)
  emitAppearance(DEFAULT_APPEARANCE)
  return { ...DEFAULT_APPEARANCE }
}

export function applyAppearance(state: AppearanceState = getAppearance()): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const hex = resolveAccentHex(state)
  const fg = accentForeground(hex)
  const glass = resolveGlassTokens(state.glass, state.frosted)

  for (const [key, value] of Object.entries(DEEP_BLACK_TOKENS)) {
    root.style.setProperty(key, value)
  }

  root.style.setProperty('--primary', hex)
  root.style.setProperty('--primary-foreground', fg)
  root.style.setProperty('--ring', hex)
  root.style.setProperty('--player-accent', hex)
  root.style.setProperty('--sidebar-primary', hex)
  root.style.setProperty('--sidebar-primary-foreground', fg)
  root.style.setProperty('--sidebar-ring', hex)
  root.style.setProperty('--chart-1', hex)
  root.style.setProperty('--saizen-tab-glass-fill', glass.tabFill)
  root.style.setProperty('--saizen-tab-glass-fill-supported', glass.tabFillSupported)
  root.style.setProperty('--saizen-top-glass-fill', glass.topFill)
  root.style.setProperty('--saizen-top-glass-fill-supported', glass.topFillSupported)
  root.style.setProperty('--saizen-tab-glass-blur', glass.tabBlur)
  root.style.setProperty('--saizen-top-glass-blur', glass.topBlur)
  root.style.setProperty('--saizen-glass-saturate', glass.saturate)
  root.dataset.theme = 'trueBlack'

  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR)
}
