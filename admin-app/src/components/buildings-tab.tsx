import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Building, type Me, type Unit } from '@/lib/api'
import { fmtBeds, fmtPrice } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { BuildingsMap } from '@/components/buildings-map'
import { BuildingDialog } from '@/components/building-dialog'
import { UnitDialog } from '@/components/unit-dialog'
import { UnitDetails } from '@/components/unit-details'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

const STATUS_META: Record<string, { label: string; cls: string }> = {
  available: { label: 'Available', cls: '' },
  on_hold: { label: 'On hold', cls: 'bg-amber-100 text-amber-800' },
  unavailable: { label: 'Not available', cls: 'bg-rose-100 text-rose-800' },
  hidden: { label: 'Hidden', cls: '' },
}

export function BuildingsTab({ me }: { me: Me }) {
  const { t } = useT()
  const canEdit = cap.editUnits(me.role)
  const [buildings, setBuildings] = useState<Building[]>([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [showMap, setShowMap] = useState(true)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingBuilding, setEditingBuilding] = useState<Building | null | undefined>(undefined)

  async function loadBuildings() {
    setLoading(true)
    try { setBuildings(await api.get<Building[]>('/api/buildings')) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load buildings')) }
    finally { setLoading(false) }
  }
  useEffect(() => { loadBuildings() }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return buildings
    return buildings.filter((b) => `${b.name} ${b.address} ${b.neighborhood ?? ''}`.toLowerCase().includes(q))
  }, [buildings, query])

  if (selectedId != null) {
    return (
      <BuildingDetail
        me={me} buildingId={selectedId} buildings={buildings}
        onBack={() => { setSelectedId(null); loadBuildings() }}
        onBuildingChanged={loadBuildings}
      />
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? t('Loading…') : `${filtered.length} ${filtered.length === 1 ? t('building') : t('buildings')}`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowMap((v) => !v)}>{showMap ? t('Hide map') : t('Show map')}</Button>
          {canEdit && <Button size="sm" onClick={() => setEditingBuilding(null)}>{t('+ New building')}</Button>}
        </div>
      </div>

      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('Search buildings by name, address, neighborhood…')} />

      <div className={showMap ? 'grid items-start gap-4 lg:grid-cols-2' : undefined}>
        {showMap && (
          <div className="lg:sticky lg:top-24">
            <BuildingsMap buildings={filtered} onSelect={(b) => setSelectedId(b.id)} />
          </div>
        )}
        <div className="min-w-0">
          {filtered.length === 0 && !loading ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {buildings.length === 0 ? t('No buildings yet.') : t('No buildings match your search.')}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filtered.map((b) => (
                <button key={b.id} type="button" onClick={() => setSelectedId(b.id)}
                  className="flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-muted/40">
                  <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-muted text-lg">
                    {b.cover_url ? <img src={b.cover_url} alt="" className="h-full w-full object-cover" /> : '🏢'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      {b.lat == null && <Badge variant="outline" className="text-amber-700">{t('no pin')}</Badge>}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{b.address}{b.neighborhood ? ` · ${b.neighborhood}` : ''}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant="secondary">{b.unit_count ?? 0} {t('units')}</Badge>
                    <span className="text-muted-foreground">→</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <BuildingDialog
        me={me} building={editingBuilding ?? null}
        open={editingBuilding !== undefined}
        onOpenChange={(o) => { if (!o) setEditingBuilding(undefined) }}
        onSaved={() => loadBuildings()}
      />
    </div>
  )
}

function BuildingDetail({
  me, buildingId, buildings, onBack, onBuildingChanged,
}: {
  me: Me
  buildingId: number
  buildings: Building[]
  onBack: () => void
  onBuildingChanged: () => void
}) {
  const { t } = useT()
  const canEdit = cap.editUnits(me.role)
  const canDelete = cap.deleteUnits(me.role)
  const [building, setBuilding] = useState<Building | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [loading, setLoading] = useState(true)
  const [editingBuilding, setEditingBuilding] = useState(false)
  const [editingUnit, setEditingUnit] = useState<Unit | null | undefined>(undefined)
  const [viewingUnit, setViewingUnit] = useState<Unit | undefined>(undefined)

  async function load() {
    setLoading(true)
    try {
      const r = await api.get<{ building: Building; units: Unit[] }>(`/api/buildings/${buildingId}`)
      setBuilding(r.building); setUnits(r.units)
    } catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load building')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [buildingId])

  async function removeUnit(u: Unit) {
    if (!confirm(`${t('Delete')} "${u.title}" ? ${t('This also removes its photos.')}`)) return
    try { await api.del(`/api/units/${u.id}`); toast.success(t('Unit deleted')); load() }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Delete failed')) }
  }

  async function removeBuilding() {
    if (!building) return
    if (!confirm(t('Delete this building? Its units stay but become unassigned.'))) return
    try { await api.del(`/api/buildings/${building.id}`); toast.success(t('Building deleted')); onBack() }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Delete failed')) }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>{t('← All buildings')}</Button>
          {building?.cover_url && (
            <div className="hidden size-11 shrink-0 overflow-hidden rounded-md border sm:block">
              <img src={building.cover_url} alt="" className="h-full w-full object-cover" />
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">{building?.name ?? '…'}</div>
            <div className="truncate text-sm text-muted-foreground">{building?.address}{building?.neighborhood ? ` · ${building.neighborhood}` : ''}</div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          {canEdit && <Button variant="outline" size="sm" onClick={() => setEditingBuilding(true)}>{t('Edit building')}</Button>}
          {canEdit && <Button size="sm" onClick={() => setEditingUnit(null)}>{t('+ New unit')}</Button>}
          {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeBuilding}>{t('Delete')}</Button>}
        </div>
      </div>

      <span className="text-sm text-muted-foreground">{loading ? t('Loading…') : `${units.length} ${units.length === 1 ? t('unit') : t('units')}`}</span>

      {units.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">{t('No units in this building yet.')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {units.map((u) => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <button type="button" onClick={() => setViewingUnit(u)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                <div className="size-16 shrink-0 overflow-hidden rounded-md bg-muted">
                  {u.photos[0]
                    ? (u.photos[0].kind === 'video'
                        ? <video src={u.photos[0].url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        : <img src={u.photos[0].url} alt="" className="h-full w-full object-cover" />)
                    : <div className="grid h-full w-full place-items-center text-lg text-muted-foreground">{(u.title || '?').slice(0, 1)}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{u.title}</span>
                    <Badge variant={u.status === 'available' ? 'default' : 'secondary'} className={STATUS_META[u.status]?.cls}>{t(STATUS_META[u.status]?.label ?? u.status)}</Badge>
                    {u.unit_code && <span className="text-xs text-muted-foreground">{u.unit_code}</span>}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {fmtBeds(u.beds)} · {u.baths} {t('bath')} · {fmtPrice(u.price)}
                    {` · ${u.photos.length} ${u.photos.length === 1 ? t('photo') : t('photos')}`}
                  </div>
                </div>
              </button>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => setViewingUnit(u)}>{t('Details')}</Button>
                {canEdit && <Button variant="outline" size="sm" onClick={() => setEditingUnit(u)}>{t('Edit')}</Button>}
                {canDelete && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => removeUnit(u)}>{t('Delete')}</Button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {building && (
        <BuildingDialog
          me={me} building={building} open={editingBuilding}
          onOpenChange={(o) => { if (!o) setEditingBuilding(false) }}
          onSaved={() => { load(); onBuildingChanged() }}
        />
      )}
      <UnitDialog
        me={me} unit={editingUnit ?? null} open={editingUnit !== undefined}
        buildings={buildings} presetBuildingId={buildingId}
        onOpenChange={(o) => { if (!o) setEditingUnit(undefined) }}
        onSaved={(saved) => { setEditingUnit(saved); load() }}
        onChanged={load}
      />
      <UnitDetails
        me={me} unit={viewingUnit ?? null} open={viewingUnit !== undefined}
        onOpenChange={(o) => { if (!o) setViewingUnit(undefined) }}
        onEdit={(u) => setEditingUnit(u)}
        onOpenUnit={(u) => setViewingUnit(u)}
      />
    </div>
  )
}
