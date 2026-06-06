import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type Unit } from '@/lib/api'
import { fmtBeds, fmtPrice } from '@/lib/format'
import { UnitDialog } from '@/components/unit-dialog'
import { CsvImportDialog } from '@/components/csv-import-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

export function UnitsTab({ me }: { me: Me }) {
  const [units, setUnits] = useState<Unit[]>([])
  const [showHidden, setShowHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Unit | null | undefined>(undefined) // undefined=closed, null=new
  const [csvOpen, setCsvOpen] = useState(false)
  const canEdit = cap.editUnits(me.role)
  const canDelete = cap.deleteUnits(me.role)

  async function load() {
    setLoading(true)
    try {
      setUnits(await api.get<Unit[]>(`/api/units${showHidden ? '?all=1' : ''}`))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load units')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [showHidden])

  async function remove(u: Unit) {
    if (!confirm(`Delete "${u.title}"? This also removes its photos.`)) return
    try { await api.del(`/api/units/${u.id}`); toast.success('Unit deleted'); load() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${units.length} unit${units.length === 1 ? '' : 's'}`}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={showHidden} onCheckedChange={(v) => setShowHidden(!!v)} /> Show hidden
          </label>
          {canEdit && <Button variant="outline" size="sm" onClick={() => setCsvOpen(true)}>Import CSV</Button>}
          {canEdit && <Button size="sm" onClick={() => setEditing(null)}>+ New unit</Button>}
        </div>
      </div>

      {units.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No units yet.{canEdit && ' Click “+ New unit” to add your first listing.'}
        </div>
      ) : (
        <div className="grid gap-2">
          {units.map((u) => (
            <div key={u.id} className="flex items-center gap-4 rounded-lg border bg-card p-3">
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
                  {fmtBeds(u.beds)} · {u.baths} bath · {u.sqft ? `${u.sqft.toLocaleString()} sqft · ` : ''}{fmtPrice(u.price)} · {u.photos.length} photo{u.photos.length === 1 ? '' : 's'}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(u)}>{canEdit ? 'Edit' : 'View'}</Button>
                {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(u)}>Delete</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      <UnitDialog
        me={me}
        unit={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        onSaved={(saved) => { setEditing(saved); load() }}
        onChanged={load}
      />
      <CsvImportDialog open={csvOpen} onOpenChange={setCsvOpen} onImported={load} />
    </div>
  )
}
