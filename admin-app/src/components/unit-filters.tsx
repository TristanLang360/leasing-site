import { useMemo } from 'react'
import type { Unit } from '@/lib/api'
import { fmtPrice } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type UnitFilter = {
  q: string
  status: 'all' | 'available' | 'on_hold' | 'unavailable'
  beds: 'any' | '0' | '1' | '2' | '3+'
  baths: 'any' | '1+' | '2+' | '3+'
  priceMin: number | null
  priceMax: number | null
  sqftMin: number | null
  sqftMax: number | null
  dogs: 'any' | 'yes' | 'no' | 'contact'
  parking: 'any' | 'yes' | 'no'
  locker: 'any' | 'yes' | 'no'
  neighborhood: string // 'any' or a name
  located: 'any' | 'yes' | 'no'
}

export const defaultFilter: UnitFilter = {
  q: '', status: 'all', beds: 'any', baths: 'any',
  priceMin: null, priceMax: null, sqftMin: null, sqftMax: null,
  dogs: 'any', parking: 'any', locker: 'any', neighborhood: 'any', located: 'any',
}

export function activeFilterCount(f: UnitFilter): number {
  let n = 0
  if (f.q.trim()) n++
  if (f.status !== 'all') n++
  if (f.beds !== 'any') n++
  if (f.baths !== 'any') n++
  if (f.priceMin != null || f.priceMax != null) n++
  if (f.sqftMin != null || f.sqftMax != null) n++
  if (f.dogs !== 'any') n++
  if (f.parking !== 'any') n++
  if (f.locker !== 'any') n++
  if (f.neighborhood !== 'any') n++
  if (f.located !== 'any') n++
  return n
}

export function applyFilters(units: Unit[], f: UnitFilter): Unit[] {
  const q = f.q.trim().toLowerCase()
  const sqftActive = f.sqftMin != null || f.sqftMax != null
  return units.filter((u) => {
    if (q) {
      const hay = `${u.title} ${u.address} ${u.neighborhood ?? ''} ${u.unit_code ?? ''} ${u.appliances ?? ''} ${u.description ?? ''}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    if (f.status !== 'all' && u.status !== f.status) return false
    if (f.beds !== 'any') {
      if (f.beds === '3+') { if (u.beds < 3) return false }
      else if (u.beds !== Number(f.beds)) return false
    }
    if (f.baths !== 'any' && u.baths < Number(f.baths.replace('+', ''))) return false
    if (f.priceMin != null && u.price < f.priceMin) return false
    if (f.priceMax != null && u.price > f.priceMax) return false
    if (sqftActive) {
      if (u.sqft == null) return false
      if (f.sqftMin != null && u.sqft < f.sqftMin) return false
      if (f.sqftMax != null && u.sqft > f.sqftMax) return false
    }
    if (f.dogs !== 'any' && u.dogs_policy !== f.dogs) return false
    if (f.parking !== 'any' && u.parking_available !== f.parking) return false
    if (f.locker !== 'any' && u.locker_available !== f.locker) return false
    if (f.neighborhood !== 'any' && (u.neighborhood ?? '') !== f.neighborhood) return false
    if (f.located === 'yes' && u.lat == null) return false
    if (f.located === 'no' && u.lat != null) return false
    return true
  })
}

export function UnitFilters({
  filter, setFilter, units,
}: { filter: UnitFilter; setFilter: (f: UnitFilter) => void; units: Unit[] }) {
  const { t } = useT()
  const set = <K extends keyof UnitFilter>(k: K, v: UnitFilter[K]) => setFilter({ ...filter, [k]: v })

  const { priceBound, sqftBound, neighborhoods } = useMemo(() => {
    const priceBound = Math.max(100, ...units.map((u) => u.price || 0))
    const sqftBound = Math.max(100, ...units.map((u) => u.sqft || 0))
    const neighborhoods = [...new Set(units.map((u) => u.neighborhood).filter(Boolean) as string[])].sort()
    return { priceBound, sqftBound, neighborhoods }
  }, [units])

  const priceVal: [number, number] = [filter.priceMin ?? 0, filter.priceMax ?? priceBound]
  const sqftVal: [number, number] = [filter.sqftMin ?? 0, filter.sqftMax ?? sqftBound]
  const active = activeFilterCount(filter)

  return (
    <Card>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2 lg:col-span-2">
          <Label className="text-xs text-muted-foreground">{t('Search')}</Label>
          <Input value={filter.q} onChange={(e) => set('q', e.target.value)}
            placeholder={t('Title, address, neighborhood, code, appliances…')} />
        </div>

        <FilterSelect label="Status" value={filter.status} onChange={(v) => set('status', v as UnitFilter['status'])}
          options={[['all', 'Any status'], ['available', 'Available'], ['on_hold', 'On hold'], ['unavailable', 'Not available']]} />

        <FilterSelect label="Map pin" value={filter.located} onChange={(v) => set('located', v as UnitFilter['located'])}
          options={[['any', 'Any'], ['yes', 'Located'], ['no', 'No pin']]} />

        <FilterSelect label="Bedrooms" value={filter.beds} onChange={(v) => set('beds', v as UnitFilter['beds'])}
          options={[['any', 'Any'], ['0', 'Studio'], ['1', '1 bed'], ['2', '2 beds'], ['3+', '3+ beds']]} />

        <FilterSelect label="Bathrooms (min)" value={filter.baths} onChange={(v) => set('baths', v as UnitFilter['baths'])}
          options={[['any', 'Any'], ['1+', '1+'], ['2+', '2+'], ['3+', '3+']]} />

        <FilterSelect label="Pets / dogs" value={filter.dogs} onChange={(v) => set('dogs', v as UnitFilter['dogs'])}
          options={[['any', 'Any'], ['yes', 'Dogs welcome'], ['contact', 'Contact us'], ['no', 'No dogs']]} />

        <FilterSelect label="Neighborhood" value={filter.neighborhood} onChange={(v) => set('neighborhood', v)}
          options={[['any', 'Any'], ...neighborhoods.map((n) => [n, n] as [string, string])]} />

        <FilterSelect label="Parking" value={filter.parking} onChange={(v) => set('parking', v as UnitFilter['parking'])}
          options={[['any', 'Any'], ['yes', 'Yes'], ['no', 'No']]} />

        <FilterSelect label="Locker" value={filter.locker} onChange={(v) => set('locker', v as UnitFilter['locker'])}
          options={[['any', 'Any'], ['yes', 'Yes'], ['no', 'No']]} />

        <div className="grid gap-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">
            {t('Price')} · {fmtPrice(priceVal[0]).replace(' / mo', '').replace(' / mois', '')} – {fmtPrice(priceVal[1]).replace(' / mo', '').replace(' / mois', '')}
          </Label>
          <Slider min={0} max={priceBound} step={50} value={priceVal} className="mt-2"
            onValueChange={(v) => { const a = v as number[]; setFilter({ ...filter, priceMin: a[0], priceMax: a[1] }) }} />
        </div>

        <div className="grid gap-1.5 sm:col-span-2">
          <Label className="text-xs text-muted-foreground">
            {t('Size')} · {sqftVal[0].toLocaleString()} – {sqftVal[1].toLocaleString()} {t('sqft')}
          </Label>
          <Slider min={0} max={sqftBound} step={10} value={sqftVal} className="mt-2"
            onValueChange={(v) => { const a = v as number[]; setFilter({ ...filter, sqftMin: a[0], sqftMax: a[1] }) }} />
        </div>

        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <Button variant="ghost" size="sm" disabled={active === 0} onClick={() => setFilter(defaultFilter)}>
            {t('Reset filters')} {active > 0 ? `(${active})` : ''}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function FilterSelect({
  label, value, onChange, options,
}: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  const { t } = useT()
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{t(label)}</Label>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger><SelectValue>{(v: any) => t(options.find(([ov]) => ov === String(v))?.[1] ?? String(v))}</SelectValue></SelectTrigger>
        <SelectContent>
          {options.map(([v, l]) => <SelectItem key={v} value={v}>{t(l)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}
