import { getLang, locale } from '@/lib/i18n'

export const fmtPrice = (n: number | null | undefined) =>
  getLang() === 'fr'
    ? (n || 0).toLocaleString('fr-CA') + ' $ / mois'
    : '$' + (n || 0).toLocaleString('en-US') + ' / mo'

export const fmtBeds = (n: number) =>
  getLang() === 'fr'
    ? (n === 0 ? 'Studio' : `${n} chambre${n > 1 ? 's' : ''}`)
    : (n === 0 ? 'Studio' : `${n} bed${n > 1 ? 's' : ''}`)

export const fmtBaths = (n: number) =>
  getLang() === 'fr' ? `${n} salle${n > 1 ? 's' : ''} de bain` : `${n} bath${n > 1 ? 's' : ''}`

// Short date in the UI language (11 oct. 2026 / Oct 11, 2026).
export const fmtDate = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' }) : ''

// Plain amount in the UI language: "2 650 $" / "$2,650".
export const fmtMoney = (n: number | string | null | undefined) => {
  const v = Math.round(Number(n) || 0)
  return getLang() === 'fr' ? v.toLocaleString('fr-CA') + ' $' : '$' + v.toLocaleString('en-US')
}

// re-export so callers already importing from format can localize dates too
export { locale }

// ISO -> value for <input type="datetime-local">
export function toLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : '')
