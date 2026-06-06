export const fmtPrice = (n: number | null | undefined) =>
  '$' + (n || 0).toLocaleString('en-US') + ' / mo'

export const fmtBeds = (n: number) => (n === 0 ? 'Studio' : `${n} bed${n > 1 ? 's' : ''}`)

export const fmtBaths = (n: number) => `${n} bath${n > 1 ? 's' : ''}`

// ISO -> value for <input type="datetime-local">
export function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '')
