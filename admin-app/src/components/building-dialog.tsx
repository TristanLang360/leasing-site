import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Building, type Me } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { LocationMap } from '@/components/location-map'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function BuildingDialog({
  me, building, open, onOpenChange, onSaved,
}: {
  me: Me
  building: Building | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: (b: Building) => void
}) {
  const { t } = useT()
  const editable = cap.editUnits(me.role)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [neighborhood, setNeighborhood] = useState('')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(building?.name ?? '')
    setAddress(building?.address ?? '')
    setNeighborhood(building?.neighborhood ?? '')
    setLat(building?.lat != null ? String(building.lat) : '')
    setLng(building?.lng != null ? String(building.lng) : '')
  }, [open, building])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim() || !address.trim()) { toast.error(t('Name and address are required.')); return }
    setBusy(true)
    const body = { name, address, neighborhood, lat, lng }
    try {
      const saved = building
        ? await api.put<Building>(`/api/buildings/${building.id}`, body)
        : await api.post<Building>('/api/buildings', body)
      toast.success(t('Building saved'))
      onOpenChange(false); onSaved(saved)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Save failed'))
    } finally { setBusy(false) }
  }

  async function relocate() {
    if (!building) return
    toast.info(t('Re-locating from address…'))
    try {
      const r = await api.post<{ ok: boolean; building: Building }>(`/api/buildings/${building.id}/geocode`)
      setLat(r.building.lat != null ? String(r.building.lat) : '')
      setLng(r.building.lng != null ? String(r.building.lng) : '')
      if (r.ok) toast.success(t('Located on the map'))
      else toast.warning(t('Could not auto-locate — set the pin manually'))
    } catch (err) { toast.error(err instanceof Error ? err.message : t('Re-locate failed')) }
  }

  const latN = lat ? Number(lat) : null
  const lngN = lng ? Number(lng) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{building ? (editable ? t('Edit building') : t('Building')) : t('New building')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('Building name *')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('e.g. 4995 Côte-Sainte-Catherine')} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('Street address *')}</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="4995 Côte-Sainte-Catherine, Montréal" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{t('Neighborhood')}</Label>
              <Input value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} placeholder="Côte-des-Neiges" />
            </div>
          </fieldset>

          {building && (
            <div className="grid grid-cols-1 gap-2">
              <Label>{t('Location')}</Label>
              <LocationMap lat={latN} lng={lngN} editable={editable}
                onChange={(la, ln) => { setLat(la.toFixed(6)); setLng(ln.toFixed(6)) }} />
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={relocate}>{t('↻ Re-locate from address')}</Button>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                {latN != null ? `📍 ${t('Pinned at')} ${latN.toFixed(5)}, ${lngN!.toFixed(5)}. ${t('Click or drag the pin to adjust.')}`
                  : t('⏳ Not located yet — re-locate from the address, or click the map to drop a pin.')}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('Close')}</Button>
            {editable && <Button type="submit" disabled={busy}>{busy ? t('Saving…') : building ? t('Save changes') : t('Create building')}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
