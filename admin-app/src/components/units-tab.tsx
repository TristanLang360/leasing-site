import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type Unit } from '@/lib/api'
import { fmtBeds, fmtPrice } from '@/lib/format'
import { UnitDialog } from '@/components/unit-dialog'
import { UnitDetails } from '@/components/unit-details'
import { CsvImportDialog } from '@/components/csv-import-dialog'
import { UnitFilters, applyFilters, defaultFilter, type UnitFilter } from '@/components/unit-filters'
import { UnitsMap } from '@/components/units-map'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

export function UnitsTab({ me }: { me: Me }) {
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<UnitFilter>(defaultFilter)
  const [showMap, setShowMap] = useState(true)
  const [editing, setEditing] = useState<Unit | null | undefined>(undefined) // undefined=closed, null=new
  const [viewing, setViewing] = useState<Unit | undefined>(undefined)        // details view
  const [csvOpen, setCsvOpen] = useState(false)
  const canEdit = cap.editUnits(me.role)
  const canDelete = cap.deleteUnits(me.role)

  async function load() {
    setLoading(true)
    try {
      // Load every unit (incl. hidden) so the filters can work over the full set.
      setUnits(await api.get<Unit[]>('/api/units?all=1'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load units')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() }, [])

  const filtered = useMemo(() => applyFilters(units, filter), [units, filter])

  async function remove(u: Unit) {
    if (!confirm(`Delete "${u.title}"? This also removes its photos.`)) return
    try { await api.del(`/api/units/${u.id}`); toast.success('Unit deleted'); load() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `Showing ${filtered.length} of ${units.length} unit${units.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>{showMap ? 'Hide map' : 'Show map'}</Button>
          {canEdit && <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>Import CSV</Button>}
          {canEdit && <Button size="sm" onClick={() => setEditing(null)}>+ New unit</Button>}
        </div>
      </div>

      <UnitFilters filter={filter} setFilter={setFilter} units={units} />

      <div className={showMap ? 'grid items-start gap-4 lg:grid-cols-2' : undefined}>
        {showMap && (
          <div className="lg:sticky lg:top-24">
            <UnitsMap units={filtered} onSelect={(u) => setViewing(u)} />
          </div>
        )}
        <div className="min-w-0">
      {filtered.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {units.length === 0
            ? <>No units yet.{canEdit && ' Click “+ New unit” to add your first listing.'}</>
            : 'No units match these filters.'}
        </div>
      ) : (
        <div className="grid gap-2">
          {filtered.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <button type="button" onClick={() => setViewing(u)}
                className="flex min-w-0 flex-1 items-center gap-4 text-left">
              <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                {u.photos[0]
                  ? <img src={u.photos[0].url} alt="" className="h-full w-full object-cover" />
                  : <div className="grid h-full w-full place-items-center text-lg text-muted-foreground">{(u.title || '?').slice(0, 1)}</div>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{u.title}</span>
                  <Badge variant={u.status === 'hidden' ? 'secondary' : 'default'}>{u.status === 'hidden' ? 'Hidden' : 'Available'}</Badge>
                  {u.lat != null
                    ? <Badge variant="outline" className="text-teal-700">📍 located</Badge>
                    : <Badge variant="outline" className="text-amber-700">no pin</Badge>}
                  {u.unit_code && <span className="text-xs text-muted-foreground">{u.unit_code}</span>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{u.address}{u.neighborhood ? ` · ${u.neighborhood}` : ''}</div>
                <div className="text-sm text-muted-foreground">
                  {fmtBeds(u.beds)} · {u.baths} bath · {u.sqft ? `${u.sqft.toLocaleString()} sqft · ` : ''}{fmtPrice(u.price)}
                  {u.dogs_policy === 'yes' ? ' · 🐾 dogs' : u.dogs_policy === 'contact' ? ' · 🐾 ask' : ''}
                  {u.parking_available === 'yes' ? ' · 🅿︎' : ''}{u.locker_available === 'yes' ? ' · 🔒' : ''}
                  {` · ${u.photos.length} photo${u.photos.length === 1 ? '' : 's'}`}
                </div>
              </div>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewing(u)}>Details</Button>
                {canEdit && <Button variant="outline" size="sm" onClick={() => setEditing(u)}>Edit</Button>}
                {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(u)}>Delete</Button>}
              </div>
            </div>
          ))}
        </div>
      )}
        </div>
      </div>

      <UnitDialog
        me={me}
        unit={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        onSaved={(saved) => { setEditing(saved); load() }}
        onChanged={load}
      />
      <UnitDetails
        me={me}
        unit={viewing ?? null}
        open={viewing !== undefined}
        onOpenChange={(o) => { if (!o) setViewing(undefined) }}
        onEdit={(u) => setEditing(u)}
      />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={load} />
    </div>
  )
}
