import { cap, type Me, type Unit } from '@/lib/api'
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

export function UnitDetails({
  me, unit, open, onOpenChange, onEdit,
}: {
  me: Me
  unit: Unit | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onEdit: (u: Unit) => void
}) {
  if (!unit) return null
  const canEdit = cap.editUnits(me.role)
  const hasPhotos = unit.photos.length > 0
  const located = unit.lat != null && unit.lng != null

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
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => { onEdit(unit); onOpenChange(false) }}>Edit</Button>
          )}
        </div>

        {/* Photos */}
        {hasPhotos ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {unit.photos.map((p) => (
              <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md border">
                <img src={p.url} alt="" className="h-full w-full object-cover" loading="lazy" />
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
        <div className="grid gap-2">
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
