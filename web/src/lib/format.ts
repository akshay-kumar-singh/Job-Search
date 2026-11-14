const DAY = 86_400_000

export function isoDay(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parse(value: string): number {
  return Date.parse(value.length === 10 ? `${value}T00:00:00` : value)
}

export function daysSince(value: string): number | null {
  if (!value) return null
  const t = parse(value)
  return Number.isNaN(t) ? null : Math.max(0, Math.floor((Date.now() - t) / DAY))
}

export function ago(value: string): string {
  const d = daysSince(value)
  if (d === null) return ''
  if (d === 0) return 'today'
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  const months = Math.floor(d / 30)
  return months === 1 ? '1 month ago' : `${months} months ago`
}

export function timeAgo(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const hours = Math.floor((Date.now() - t) / 3_600_000)
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export function isNew(found: string): boolean {
  const t = Date.parse(found)
  return !Number.isNaN(t) && Date.now() - t < DAY
}

export function shortDate(day: string): string {
  const t = parse(day)
  return Number.isNaN(t) ? day : new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
}
