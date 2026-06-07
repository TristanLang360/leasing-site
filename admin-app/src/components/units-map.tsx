import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { defaultIcon } from '@/lib/leaflet-icon'
import { fmtBeds, fmtPrice } from '@/lib/format'
import { useT } from '@/lib/i18n'
import type { Unit } from '@/lib/api'

const MONTREAL: [number, number] = [45.5019, -73.5674]

// Fit the map to whatever pins are currently shown.
function FitBounds({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 60)
    return () => clearTimeout(t)
  }, [map])
  useEffect(() => {
    if (points.length === 1) map.setView(points[0], 14)
    else if (points.length > 1) map.fitBounds(points, { padding: [40, 40], maxZoom: 15 })
  }, [points, map])
  return null
}

export function UnitsMap({ units, onSelect }: { units: Unit[]; onSelect: (u: Unit) => void }) {
  const { t } = useT()
  const located = units.filter((u) => u.lat != null && u.lng != null)
  const points = located.map((u) => [u.lat as number, u.lng as number] as [number, number])

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer center={points[0] ?? MONTREAL} zoom={12} scrollWheelZoom={false} className="h-80 w-full lg:h-[36rem]">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <FitBounds points={points} />
        {located.map((u) => (
          <Marker key={u.id} position={[u.lat as number, u.lng as number]} icon={defaultIcon}>
            <Popup>
              <div className="space-y-1">
                <strong>{u.title}</strong>
                <div>{u.address}</div>
                <div>{fmtBeds(u.beds)} · {fmtPrice(u.price)}</div>
                <button className="font-medium text-primary underline" onClick={() => onSelect(u)}>
                  {t('View / edit →')}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {located.length === 0 && (
        <p className="bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
          {t('None of the matching units have map coordinates yet.')}
        </p>
      )}
    </div>
  )
}
