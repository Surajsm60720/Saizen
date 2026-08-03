/** Local-timezone helpers for AniList airing timestamps (unix seconds). */

export type LocalAiring = {
  /** Instant ms */
  ms: number
  /** Mon=0 … Sun=6 in device local timezone */
  weekdayIndex: number
  /** Local calendar date YYYY-MM-DD */
  dateKey: string
  /** Short weekday label (Mon, Tue, …) */
  labelDay: string
  /** Local clock time, e.g. 3:30 PM */
  labelTime: string
  /** Longer day label, e.g. Mon, Aug 3 */
  labelDate: string
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

/** JS getDay(): Sun=0…Sat=6 → Mon=0…Sun=6 */
export function jsDayToMondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7
}

export function mondayIndexToJsDay(weekdayIndex: number): number {
  return (weekdayIndex + 1) % 7
}

export function localWeekdayIndex(now = new Date()): number {
  return jsDayToMondayIndex(now.getDay())
}

export function toLocalAiring(airingAtSec: number, now = new Date()): LocalAiring | null {
  if (!Number.isFinite(airingAtSec) || airingAtSec <= 0) return null
  const ms = airingAtSec * 1000
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null

  const weekdayIndex = jsDayToMondayIndex(d.getDay())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')

  return {
    ms,
    weekdayIndex,
    dateKey: `${y}-${m}-${day}`,
    labelDay: DAY_LABELS[weekdayIndex],
    labelTime: d.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit'
    }),
    labelDate: d.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    })
  }
}

/** Start of local calendar day (00:00) as unix seconds. */
export function localDayStartUnix(date = new Date()): number {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  return Math.floor(d.getTime() / 1000)
}

/** Inclusive week window: start of this local Monday → start of next Monday. */
export function localWeekWindowUnix(now = new Date()): { greater: number; lesser: number } {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monOffset = jsDayToMondayIndex(startOfToday.getDay())
  const monday = new Date(startOfToday)
  monday.setDate(monday.getDate() - monOffset)
  const nextMonday = new Date(monday)
  nextMonday.setDate(nextMonday.getDate() + 7)
  return {
    greater: Math.floor(monday.getTime() / 1000) - 1,
    lesser: Math.floor(nextMonday.getTime() / 1000)
  }
}

export type LocalWeekDay = {
  weekdayIndex: number
  /** Mon / Tue / … */
  labelDay: string
  /** Single letter M T W … */
  labelLetter: string
  dateNum: number
  monthShort: string
  dateKey: string
  isToday: boolean
  date: Date
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'] as const

/** Seven local calendar days for the week containing `now` (Mon→Sun). */
export function getLocalWeekDays(now = new Date()): LocalWeekDay[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const monOffset = jsDayToMondayIndex(startOfToday.getDay())
  const monday = new Date(startOfToday)
  monday.setDate(monday.getDate() - monOffset)
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const dateKey = `${y}-${m}-${day}`
    return {
      weekdayIndex: i,
      labelDay: DAY_LABELS[i],
      labelLetter: DAY_LETTERS[i],
      dateNum: d.getDate(),
      monthShort: d.toLocaleDateString(undefined, { month: 'short' }),
      dateKey,
      isToday: dateKey === todayKey,
      date: d
    }
  })
}

export function formatWeekRangeLabel(days: LocalWeekDay[]): string {
  if (!days.length) return ''
  const first = days[0]
  const last = days[days.length - 1]
  const sameMonth = first.date.getMonth() === last.date.getMonth()
  if (sameMonth) {
    return `${first.monthShort} ${first.dateNum}–${last.dateNum}`
  }
  return `${first.monthShort} ${first.dateNum} – ${last.monthShort} ${last.dateNum}`
}

export function bucketByLocalWeekday<T extends { airingAt: number }>(
  items: T[]
): Map<number, Array<T & { local: LocalAiring }>> {
  const buckets = new Map<number, Array<T & { local: LocalAiring }>>()
  for (let i = 0; i < 7; i++) buckets.set(i, [])

  for (const item of items) {
    const local = toLocalAiring(item.airingAt)
    if (!local) continue
    const list = buckets.get(local.weekdayIndex) ?? []
    list.push({ ...item, local })
    buckets.set(local.weekdayIndex, list)
  }

  for (const [, list] of buckets) {
    list.sort((a, b) => a.airingAt - b.airingAt)
  }
  return buckets
}

export { DAY_LABELS }
