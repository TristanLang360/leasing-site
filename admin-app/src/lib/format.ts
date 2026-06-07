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
