import { useEffect, useState } from 'react'
import { api, cap, type Me, type NearbyUnit, type Unit } from '@/lib/api'
import { fmtBeds, fmtPrice } from '@/lib/format'
import { LocationMap } from '@/components/location-map'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Separator } from '@/components/ui/separator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

function directionsUrl(provider: 'google' | 'apple', unit: Unit) {
  const dest = unit.lat != null && unit.lng != null ? `${unit.lat},${unit.lng}` : encodeURIComponent(unit.address)
  return provider === 'apple'
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`
}

function dogsLabel(p: Unit['dogs_policy']) {
  return p === 'yes' ? 'Dogs welcome' : p === 'contact' ? 'Contact us about your dog' : 'No dogs'
}
function fmtDate(iso: string | null) {
  if (!iso) return 'Available now'
  const d = new Date(iso + 'T00:00:00')
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Rank nearby units by similarity to the base unit (close beds + price),
// then by distance. Falls back to plain nearest if nothing is "similar".
function pickSimilar(base: Unit, nearby: NearbyUnit[]): NearbyUnit[] {
  const candidates = nearby.filter((u) => u.status === 'available')
  const isSimilar = (u: NearbyUnit) => {
    const bedDiff = Math.abs((u.beds || 0) - (base.beds || 0))
    const priceRatio = base.price ? Math.abs(u.price - base.price) / base.price : 1
    return bedDiff <= 1 && priceRatio <= 0.35
  }
  const similar = candidates.filter(isSimilar).sort((a, b) => a.distance_km - b.distance_km)
  if (similar.length >= 3) return similar.slice(0, 5)
  // top up with the next-nearest available units so the section isn't bare
  const extra = candidates.filter((u) => !similar.includes(u)).sort((a, b) => a.distance_km - b.distance_km)
  return [...similar, ...extra].slice(0, 5)
}

export function UnitDetails({
  me, unit, open, onOpenChange, onEdit, onOpenUnit,
}: {
  me: Me
  unit: Unit | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onEdit?: (u: Unit) => void
  onOpenUnit: (u: Unit) => void
}) {
  const [similar, setSimilar] = useState<NearbyUnit[]>([])
  const [loadingSimilar, setLoadingSimilar] = useState(false)

  const located = unit != null && unit.lat != null && unit.lng != null

  useEffect(() => {
    if (!open || !unit?.id) return
    if (!located) { setSimilar([]); return }
    setLoadingSimilar(true)
    api.get<{ nearby: NearbyUnit[] }>(`/api/units/${unit.id}/nearby?limit=24`)
      .then((r) => setSimilar(pickSimilar(unit, r.nearby)))
      .catch(() => setSimilar([]))
      .finally(() => setLoadingSimilar(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, unit?.id])

  if (!unit) return null
  const canEdit = cap.editUnits(me.role)
  const hasPhotos = unit.photos.length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            {unit.title}
            <Badge variant={unit.status === 'hidden' ? 'secondary' : 'default'}>
              {unit.status === 'hidden' ? 'Hidden' : 'Available'}
            </Badge>
            {unit.unit_code && <span className="text-sm font-normal text-muted-foreground">{unit.unit_code}</span>}
          </DialogTitle>
        </DialogHeader>

        {/* Action bar */}
        <div className="flex flex-wrap gap-2">
          {hasPhotos && (
            <Button size="sm" variant="outline"
              onClick={() => { window.location.href = `/api/units/${unit.id}/photos.zip` }}>
              ⬇ Download all photos (.zip)
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className={cn(buttonVariants({ size: 'sm' }))}>
              🧭 Get directions
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => window.open(directionsUrl('google', unit), '_blank', 'noopener')}>
                Open in Google Maps
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => window.open(directionsUrl('apple', unit), '_blank', 'noopener')}>
                Open in Apple Maps
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {canEdit && onEdit && (
            <Button size="sm" variant="ghost" onClick={() => { onEdit(unit); onOpenChange(false) }}>Edit</Button>
          )}
        </div>

        {/* Photos & videos */}
        {hasPhotos ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {unit.photos.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border bg-black/5">
                {p.kind === 'video'
                  ? <video src={p.url} className="h-full w-full object-cover" controls preload="metadata" playsInline />
                  : <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                {p.kind === 'video' && (
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] font-medium text-white">▶ video</span>
                )}
                <a href={`/api/photos/${p.id}/download`} download
                  className="absolute inset-x-0 bottom-0 bg-black/55 py-0.5 text-center text-xs text-white opacity-0 transition group-hover:opacity-100">
                  ⬇ Download
                </a>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No photos for this unit yet.</p>
        )}

        <Separator />

        {/* Location / map */}
        <div className="grid grid-cols-1 gap-2">
          <h3 className="text-sm font-medium">Location</h3>
          <p className="text-sm text-muted-foreground">{unit.address}{unit.neighborhood ? ` · ${unit.neighborhood}` : ''}</p>
          {located ? (
            <LocationMap lat={unit.lat} lng={unit.lng} editable={false} />
          ) : (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              This unit isn't located on the map yet. Directions will use the street address.
            </p>
          )}
        </div>

        <Separator />

        {/* Similar units nearby */}
        <div className="grid grid-cols-1 gap-2">
          <h3 className="text-sm font-medium">Similar units nearby</h3>
          {!located ? (
            <p className="text-sm text-muted-foreground">Locate this unit on the map to find nearby ones.</p>
          ) : loadingSimilar ? (
            <p className="text-sm text-muted-foreground">Finding similar units nearby…</p>
          ) : similar.length === 0 ? (
            <p className="text-sm text-muted-foreground">No similar units nearby.</p>
          ) : (
            similar.map((n) => (
              <button key={n.id} type="button" onClick={() => onOpenUnit(n)}
                className="flex items-center gap-3 rounded-md border px-3 py-2 text-left hover:bg-muted/40">
                <div className="size-12 shrink-0 overflow-hidden rounded bg-muted">
                  {n.photos[0]
                    ? (n.photos[0].kind === 'video'
                        ? <video src={n.photos[0].url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                        : <img src={n.photos[0].url} alt="" className="h-full w-full object-cover" />)
                    : <div className="grid h-full w-full place-items-center text-sm text-muted-foreground">{(n.title || '?').slice(0, 1)}</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {fmtBeds(n.beds)} · {n.baths} bath · {fmtPrice(n.price)}{n.neighborhood ? ` · ${n.neighborhood}` : ''}
                  </div>
                </div>
                <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-xs font-medium text-primary">
                  {n.distance_km} km away
                </span>
              </button>
            ))
          )}
        </div>

        <Separator />

        {/* All details */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
          <Detail label="Price" value={fmtPrice(unit.price)} />
          <Detail label="Bedrooms" value={fmtBeds(unit.beds)} />
          <Detail label="Bathrooms" value={`${unit.baths}`} />
          <Detail label="Size" value={unit.sqft ? `${unit.sqft.toLocaleString()} sqft` : '—'} />
          <Detail label="Available" value={fmtDate(unit.available_date)} />
          <Detail label="Neighborhood" value={unit.neighborhood || '—'} />
          <Detail label="Parking" value={unit.parking_available === 'yes'
            ? `Yes${unit.parking_cost ? ` · $${unit.parking_cost}/mo` : ''}` : 'No'} />
          <Detail label="Locker" value={unit.locker_available === 'yes'
            ? `Yes${unit.locker_cost ? ` · $${unit.locker_cost}/mo` : ''}` : 'No'} />
          <Detail label="Dogs" value={dogsLabel(unit.dogs_policy)} />
        </div>

        {unit.appliances && (
          <div className="text-sm"><span className="text-muted-foreground">Appliances: </span>{unit.appliances}</div>
        )}
        {unit.description && (
          <div className="text-sm"><span className="text-muted-foreground">Description: </span>{unit.description}</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
