import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type NearbyUnit, type Photo, type Unit } from '@/lib/api'
import { fmtPrice } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { LocationMap } from '@/components/location-map'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Form = Record<string, string>

function unitToForm(u: Unit | null): Form {
  const s = (v: unknown) => (v == null ? '' : String(v))
  return {
    unit_code: s(u?.unit_code), status: u?.status ?? 'available',
    title: s(u?.title), address: s(u?.address), neighborhood: s(u?.neighborhood),
    beds: s(u?.beds ?? 1), baths: s(u?.baths ?? 1), sqft: s(u?.sqft),
    price: s(u?.price ?? 1800), available_date: s(u?.available_date),
    appliances: s(u?.appliances),
    parking_available: u?.parking_available ?? 'no', parking_cost: s(u?.parking_cost),
    locker_available: u?.locker_available ?? 'no', locker_cost: s(u?.locker_cost),
    dogs_policy: u?.dogs_policy ?? 'no', description: s(u?.description),
    lat: s(u?.lat), lng: s(u?.lng),
  }
}

export function UnitDialog({
  me, unit, open, onOpenChange, onSaved, onChanged,
}: {
  me: Me
  unit: Unit | null               // null = new
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: (saved: Unit) => void   // parent swaps to edit mode so photos appear
  onChanged: () => void            // refresh the list (thumbnails/coords)
}) {
  const { t } = useT()
  const editable = cap.editUnits(me.role)
  const [form, setForm] = useState<Form>(unitToForm(unit))
  const [photos, setPhotos] = useState<Photo[]>(unit?.photos ?? [])
  const [nearby, setNearby] = useState<NearbyUnit[]>([])
  const [nearbyReason, setNearbyReason] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Move media[from] to position `to`, persist the new order (first = thumbnail).
  function reorder(from: number, to: number) {
    if (from === to || from < 0 || to < 0) return
    setPhotos((prev) => {
      if (from >= prev.length || to >= prev.length) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      if (unit?.id) {
        api.put(`/api/units/${unit.id}/photos/order`, { order: next.map((p) => p.id) })
          .then(onChanged)
          .catch((e) => toast.error(e instanceof Error ? e.message : t('Reorder failed')))
      }
      return next
    })
  }

  useEffect(() => {
    if (!open) return
    setForm(unitToForm(unit))
    setPhotos(unit?.photos ?? [])
    setNearby([])
    setNearbyReason(undefined)
    if (unit?.id) loadNearby(unit.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit?.id])

  const set = (k: string, v: string | null) => setForm((f) => ({ ...f, [k]: v ?? '' }))
  const lbl = (map: Record<string, string>) => (v: any) => t(map[String(v)] ?? String(v))
  const yesNo = { no: 'No', yes: 'Yes' }

  async function loadNearby(id: number) {
    try {
      const r = await api.get<{ nearby: NearbyUnit[]; reason?: string }>(`/api/units/${id}/nearby?limit=5`)
      setNearby(r.nearby); setNearbyReason(r.reason)
    } catch { /* ignore */ }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!editable) return
    setBusy(true)
    try {
      const saved = unit?.id
        ? await api.put<Unit>(`/api/units/${unit.id}`, form)
        : await api.post<Unit>('/api/units', form)
      toast.success(unit?.id ? t('Unit saved') : t('Unit created'))
      onChanged()
      onSaved(saved)  // becomes edit mode → photos/location/nearby appear
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Save failed'))
    } finally {
      setBusy(false)
    }
  }

  async function uploadFiles(files: FileList | null) {
    if (!unit?.id || !files?.length) return
    const fd = new FormData()
    const hasVideo = Array.from(files).some((f) => f.type.startsWith('video/'))
    Array.from(files).forEach((f) => fd.append('photos', f))
    const tid = toast.loading(hasVideo ? t('Uploading… videos can take a moment.') : t('Uploading…'))
    try {
      const { photos: added } = await api.form<{ photos: Photo[] }>(`/api/units/${unit.id}/photos`, fd)
      setPhotos((p) => [...p, ...added])
      onChanged()
      toast.success(`${t('Added')} ${added.length} ${added.length === 1 ? t('file') : t('files')}`, { id: tid })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Upload failed'), { id: tid })
    }
  }

  async function deletePhoto(id: number) {
    if (!confirm(t('Delete this photo?'))) return
    try {
      await api.del(`/api/photos/${id}`)
      setPhotos((p) => p.filter((x) => x.id !== id))
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Delete failed'))
    }
  }

  async function regeocode() {
    if (!unit?.id) return
    toast.info(t('Re-locating from address…'))
    try {
      await api.post(`/api/units/${unit.id}/geocode`)
      setTimeout(async () => {
        const fresh = await api.get<Unit>(`/api/units/${unit.id}`)
        set('lat', fresh.lat == null ? '' : String(fresh.lat))
        set('lng', fresh.lng == null ? '' : String(fresh.lng))
        onChanged()
        if (fresh.lat != null) toast.success(t('Located on the map'))
        else toast.warning(t('Could not auto-locate — set the pin manually'))
      }, 2500)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Re-locate failed'))
    }
  }

  function directions() {
    const dest = form.lat && form.lng ? `${form.lat},${form.lng}` : encodeURIComponent(form.address)
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${dest}`, '_blank', 'noopener')
  }

  const lat = form.lat ? Number(form.lat) : null
  const lng = form.lng ? Number(form.lng) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{unit ? (editable ? t('Edit unit') : t('View unit')) : t('New unit')}</DialogTitle>
          <DialogDescription>
            {editable ? t('Changes go live immediately when you save.') : t('You have read-only access.')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="grid gap-4">
          <fieldset disabled={!editable} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Unit code"><Input value={form.unit_code} onChange={(e) => set('unit_code', e.target.value)} placeholder="A-304" /></Field>
              <Field label="Status">
                <Select value={form.status} onValueChange={(v) => set('status', v)}>
                  <SelectTrigger><SelectValue>{lbl({ available: 'Available', on_hold: 'On hold', unavailable: 'Not available', hidden: 'Hidden' })}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">{t('Available')}</SelectItem>
                    <SelectItem value="on_hold">{t('On hold')}</SelectItem>
                    <SelectItem value="unavailable">{t('Not available')}</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field label="Title *"><Input required value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Suite 304 — Loft" /></Field>
            <Field label="Address *"><Input required value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="1420 Saint-Laurent, Montréal" /></Field>
            <Field label="Neighborhood"><Input value={form.neighborhood} onChange={(e) => set('neighborhood', e.target.value)} placeholder="Plateau" /></Field>

            <div className="grid grid-cols-3 gap-3">
              <Field label="Bedrooms"><Input type="number" min="0" value={form.beds} onChange={(e) => set('beds', e.target.value)} /></Field>
              <Field label="Bathrooms"><Input type="number" min="0" value={form.baths} onChange={(e) => set('baths', e.target.value)} /></Field>
              <Field label="Sq ft"><Input type="number" min="0" step="10" value={form.sqft} onChange={(e) => set('sqft', e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price ($ / month)"><Input type="number" min="0" step="50" value={form.price} onChange={(e) => set('price', e.target.value)} /></Field>
              <Field label="Available date"><Input type="date" value={form.available_date} onChange={(e) => set('available_date', e.target.value)} /></Field>
            </div>
            <Field label="⚡ Appliances"><Input value={form.appliances} onChange={(e) => set('appliances', e.target.value)} placeholder={t('Fridge, stove, dishwasher, in-unit laundry')} /></Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Parking">
                <Select value={form.parking_available} onValueChange={(v) => set('parking_available', v)}>
                  <SelectTrigger><SelectValue>{lbl(yesNo)}</SelectValue></SelectTrigger>
                  <SelectContent><SelectItem value="no">{t('No')}</SelectItem><SelectItem value="yes">{t('Yes')}</SelectItem></SelectContent>
                </Select>
              </Field>
              {form.parking_available === 'yes' && (
                <Field label="Parking cost ($ / mo)"><Input type="number" min="0" step="5" value={form.parking_cost} onChange={(e) => set('parking_cost', e.target.value)} /></Field>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Locker">
                <Select value={form.locker_available} onValueChange={(v) => set('locker_available', v)}>
                  <SelectTrigger><SelectValue>{lbl(yesNo)}</SelectValue></SelectTrigger>
                  <SelectContent><SelectItem value="no">{t('No')}</SelectItem><SelectItem value="yes">{t('Yes')}</SelectItem></SelectContent>
                </Select>
              </Field>
              {form.locker_available === 'yes' && (
                <Field label="Locker cost ($ / mo)"><Input type="number" min="0" step="5" value={form.locker_cost} onChange={(e) => set('locker_cost', e.target.value)} /></Field>
              )}
            </div>
            <Field label="Dogs">
              <Select value={form.dogs_policy} onValueChange={(v) => set('dogs_policy', v)}>
                <SelectTrigger><SelectValue>{lbl({ no: 'No dogs', yes: 'Dogs welcome', contact: 'Contact us to see if your dog is accepted' })}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value="no">{t('No dogs')}</SelectItem>
                  <SelectItem value="yes">{t('Dogs welcome')}</SelectItem>
                  <SelectItem value="contact">{t('Contact us to see if your dog is accepted')}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Description"><Textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          </fieldset>

          {/* Location (existing units only) */}
          {unit?.id && (
            <>
              <Separator />
              <div className="grid grid-cols-1 gap-2">
                <Label>{t('Location')}</Label>
                <LocationMap
                  lat={lat} lng={lng} editable={editable} nearby={nearby}
                  onChange={(la, ln) => { set('lat', la.toFixed(6)); set('lng', ln.toFixed(6)) }}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Latitude"><Input type="number" step="any" disabled={!editable} value={form.lat} onChange={(e) => set('lat', e.target.value)} placeholder={t('auto')} /></Field>
                  <Field label="Longitude"><Input type="number" step="any" disabled={!editable} value={form.lng} onChange={(e) => set('lng', e.target.value)} placeholder={t('auto')} /></Field>
                </div>
                <div className="flex flex-wrap gap-2">
                  {editable && <Button type="button" variant="outline" size="sm" onClick={regeocode}>{t('↻ Re-locate from address')}</Button>}
                  <Button type="button" variant="outline" size="sm" onClick={directions}>{t('🧭 Directions')}</Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {lat != null ? `📍 ${t('Pinned at')} ${lat.toFixed(5)}, ${lng!.toFixed(5)}. ${t('Click or drag the pin to adjust.')}`
                    : t('⏳ Not located yet — re-locate from the address, or click the map to drop a pin.')}
                </p>
              </div>

              {/* Photos */}
              <Separator />
              <div className="grid grid-cols-1 gap-2">
                <div className="flex items-center justify-between">
                  <Label>{t('Photos & videos')}</Label>
                  {photos.length > 0 && (
                    <a className="text-sm text-primary hover:underline" href={`/api/units/${unit.id}/photos.zip`}>{t('⬇ Download all (.zip)')}</a>
                  )}
                </div>
                {photos.length === 0 && <p className="text-sm text-muted-foreground">{t('No photos or videos yet.')}</p>}
                {photos.length > 1 && editable && (
                  <p className="text-xs text-muted-foreground">{t('Drag to reorder. The first one is the thumbnail shown everywhere.')}</p>
                )}
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p, i) => (
                    <div key={p.id}
                      draggable={editable}
                      onDragStart={() => setDragIndex(i)}
                      onDragOver={(e) => { if (dragIndex !== null) e.preventDefault() }}
                      onDrop={(e) => { e.preventDefault(); if (dragIndex !== null) reorder(dragIndex, i); setDragIndex(null) }}
                      onDragEnd={() => setDragIndex(null)}
                      className={`group relative aspect-square overflow-hidden rounded-md border bg-black/5 ${editable ? 'cursor-grab active:cursor-grabbing' : ''} ${dragIndex === i ? 'opacity-40' : ''} ${i === 0 ? 'ring-2 ring-primary' : ''}`}>
                      {p.kind === 'video'
                        ? <video src={p.url} className="pointer-events-none h-full w-full object-cover" muted playsInline preload="metadata" />
                        : <img src={p.url} alt="" className="pointer-events-none h-full w-full object-cover" loading="lazy" draggable={false} />}
                      {i === 0 && (
                        <span className="pointer-events-none absolute inset-x-0 top-0 bg-primary/90 py-0.5 text-center text-[10px] font-semibold text-primary-foreground">
                          {p.kind === 'video' ? `${t('Thumbnail')} · ▶ ${t('video')}` : t('Thumbnail')}
                        </span>
                      )}
                      {i !== 0 && p.kind === 'video' && (
                        <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">▶ {t('video')}</span>
                      )}
                      <a href={`/api/photos/${p.id}/download`} download
                        className="absolute bottom-1 left-1 grid size-6 place-items-center rounded bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100">⬇</a>
                      {editable && (
                        <>
                          {i > 0 && (
                            <button type="button" title={t('Move left / make thumbnail')} onClick={() => reorder(i, i - 1)}
                              className="absolute bottom-1 right-7 grid size-6 place-items-center rounded bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100">‹</button>
                          )}
                          {i < photos.length - 1 && (
                            <button type="button" title={t('Move right')} onClick={() => reorder(i, i + 1)}
                              className="absolute bottom-1 right-1 grid size-6 place-items-center rounded bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100">›</button>
                          )}
                          <button type="button" onClick={() => deletePhoto(p.id)}
                            className="absolute right-1 top-1 grid size-6 place-items-center rounded bg-black/55 text-xs text-white opacity-0 transition group-hover:opacity-100">×</button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                {editable && (
                  <>
                    <input ref={fileRef} type="file" accept="image/*,video/mp4,video/webm,video/quicktime" multiple hidden onChange={(e) => uploadFiles(e.target.files)} />
                    <Button type="button" variant="outline" size="sm" className="w-fit" onClick={() => fileRef.current?.click()}>{t('+ Upload photos or videos')}</Button>
                    <p className="text-xs text-muted-foreground">{t('Images (JPG, PNG, WebP) or videos (MP4, WebM, MOV), up to 200 MB each.')}</p>
                  </>
                )}
              </div>

              {/* Nearby */}
              <Separator />
              <div className="grid grid-cols-1 gap-2">
                <Label>{t('Nearby units')}</Label>
                {nearbyReason === 'no-coords' && <p className="text-sm text-muted-foreground">{t('This unit isn’t located yet, so we can’t measure distances.')}</p>}
                {!nearbyReason && nearby.length === 0 && <p className="text-sm text-muted-foreground">{t('No other located units to compare against.')}</p>}
                <div className="grid grid-cols-1 gap-2">
                  {nearby.map((n) => (
                    <div key={n.id} className="flex items-center gap-3 rounded-md border px-3 py-2">
                      <span className="rounded-full border px-2 py-0.5 text-xs font-medium text-primary">{n.distance_km} km</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{n.title}</div>
                        <div className="truncate text-xs text-muted-foreground">{n.address} · {fmtPrice(n.price)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('Close')}</Button>
            {editable && <Button type="submit" disabled={busy}>{busy ? t('Saving…') : unit ? t('Save changes') : t('Create unit')}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  const { t } = useT()
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs text-muted-foreground">{t(label)}</Label>
      {children}
    </div>
  )
}
