'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ACCENT_SWATCHES,
  appearanceFromHex,
  normalizeHex,
  resolveAccentHex,
  type AppearanceState
} from '@/lib/theme/appearance'
import { cn } from '@/lib/utils'
import { hapticPress } from '@/lib/haptics'

function wheelPoint(hue: number, saturation: number, size: number) {
  const radius = (size / 2) * (saturation / 100)
  const angle = ((hue - 90) * Math.PI) / 180
  return {
    x: size / 2 + Math.cos(angle) * radius,
    y: size / 2 + Math.sin(angle) * radius
  }
}

export function AccentPicker({
  value,
  onChange
}: {
  value: AppearanceState
  onChange: (patch: Partial<AppearanceState>) => void
}) {
  const hex = resolveAccentHex(value)
  const wheelRef = useRef<HTMLDivElement>(null)
  const [hexDraft, setHexDraft] = useState(hex)
  const [hexInvalid, setHexInvalid] = useState(false)

  useEffect(() => {
    setHexDraft(hex)
    setHexInvalid(false)
  }, [hex])

  const applyWheelPoint = useCallback(
    (clientX: number, clientY: number) => {
      const el = wheelRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const cx = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const dx = clientX - cx
      const dy = clientY - cy
      const maxR = rect.width / 2
      const dist = Math.min(Math.hypot(dx, dy), maxR)
      const hue = (Math.atan2(dy, dx) * 180) / Math.PI + 90
      onChange({
        hue: (hue + 360) % 360,
        saturation: (dist / maxR) * 100
      })
    },
    [onChange]
  )

  function onWheelPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId)
    applyWheelPoint(e.clientX, e.clientY)
  }

  function onWheelPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    applyWheelPoint(e.clientX, e.clientY)
  }

  function commitHex() {
    const normalized = normalizeHex(hexDraft)
    if (!normalized) {
      setHexInvalid(true)
      return
    }
    const next = appearanceFromHex(normalized, value.contrast)
    if (!next) {
      setHexInvalid(true)
      return
    }
    setHexInvalid(false)
    setHexDraft(normalized)
    onChange(next)
  }

  const knob = wheelPoint(value.hue, value.saturation, 168)

  return (
    <div className="space-y-3.5 px-3.5 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium">Accent</div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Preset, wheel, hex, then tune on deep black.
          </p>
        </div>
        <span
          className="size-8 shrink-0 rounded-md ring-1 ring-border"
          style={{ background: hex }}
          title={hex}
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-between gap-1.5">
        {ACCENT_SWATCHES.map((swatch) => {
          const base = appearanceFromHex(swatch.hex, 50)
          const active =
            !!base &&
            Math.abs(base.hue - value.hue) < 10 &&
            Math.abs(base.saturation - value.saturation) < 14 &&
            Math.abs(base.brightness - value.brightness) < 14
          return (
            <button
              key={swatch.id}
              type="button"
              onClick={() => {
                const next = appearanceFromHex(swatch.hex, value.contrast)
                if (next) {
                  hapticPress('selection')
                  onChange(next)
                }
              }}
              className="flex size-8 items-center justify-center rounded-full transition-transform active:scale-90 motion-reduce:active:scale-100"
              aria-pressed={active}
              aria-label={swatch.label}
            >
              <span
                className={cn(
                  'size-6 rounded-full ring-2 ring-offset-2 ring-offset-card',
                  active ? 'ring-primary' : 'ring-transparent'
                )}
                style={{ background: swatch.hex }}
              />
            </button>
          )
        })}
      </div>

      <div className="flex justify-center pt-0.5">
        <div
          ref={wheelRef}
          role="slider"
          aria-label="Accent color wheel"
          aria-valuemin={0}
          aria-valuemax={360}
          aria-valuenow={Math.round(value.hue)}
          tabIndex={0}
          onPointerDown={onWheelPointerDown}
          onPointerMove={onWheelPointerMove}
          className="relative size-[168px] touch-none rounded-full shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08)]"
          style={{
            background: `
              radial-gradient(circle closest-side, #ffffff 0%, transparent 72%),
              conic-gradient(from -90deg,
                hsl(0 100% 50%),
                hsl(60 100% 50%),
                hsl(120 100% 50%),
                hsl(180 100% 50%),
                hsl(240 100% 50%),
                hsl(300 100% 50%),
                hsl(360 100% 50%)
              )
            `
          }}
        >
          <span
            className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.45)]"
            style={{ left: knob.x, top: knob.y, background: hex }}
          />
        </div>
      </div>

      <div>
        <label htmlFor="accent-hex" className="text-sm font-medium">
          Hex
        </label>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            id="accent-hex"
            type="text"
            inputMode="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={hexDraft}
            onChange={(e) => {
              setHexDraft(e.target.value)
              setHexInvalid(false)
            }}
            onBlur={commitHex}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                ;(e.target as HTMLInputElement).blur()
              }
            }}
            className={cn(
              'h-11 w-full rounded-lg border bg-background px-3 font-mono text-base tracking-wide outline-none',
              'focus-visible:ring-2 focus-visible:ring-ring',
              hexInvalid ? 'border-destructive/70 text-destructive' : 'border-border'
            )}
            placeholder="#e8c478"
            aria-invalid={hexInvalid}
          />
          <span
            className="size-9 shrink-0 rounded-lg ring-1 ring-border"
            style={{ background: normalizeHex(hexDraft) ?? hex }}
            aria-hidden
          />
        </div>
        {hexInvalid ? (
          <p className="mt-1 text-xs text-destructive">Enter a valid hex like #e8c478</p>
        ) : null}
      </div>

      <SliderRow
        label="Saturation"
        value={value.saturation}
        hex={hex}
        onChange={(saturation) => onChange({ saturation })}
      />
      <SliderRow
        label="Brightness"
        value={value.brightness}
        hex={hex}
        onChange={(brightness) => onChange({ brightness })}
      />
      <SliderRow
        label="Contrast"
        value={value.contrast}
        hex={hex}
        onChange={(contrast) => onChange({ contrast })}
      />
    </div>
  )
}

function SliderRow({
  label,
  value,
  hex,
  onChange
}: {
  label: string
  value: number
  hex: string
  onChange: (next: number) => void
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{Math.round(value)}</span>
      </div>
      <div className="relative mt-2 h-6">
        <div className="pointer-events-none absolute top-1/2 inset-x-0 h-1 -translate-y-1/2 rounded-full bg-white/12" />
        <div
          className="pointer-events-none absolute top-1/2 left-0 h-1 -translate-y-1/2 rounded-full"
          style={{ width: `${value}%`, background: hex }}
        />
        <div
          className="pointer-events-none absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/85 shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${value}%`, background: hex }}
        />
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="absolute inset-0 z-10 w-full cursor-pointer opacity-0"
          style={{ accentColor: hex }}
          aria-label={label}
        />
      </div>
    </div>
  )
}
