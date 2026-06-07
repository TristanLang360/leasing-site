import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import { defaultIcon } from '@/lib/leaflet-icon'
import { useT } from '@/lib/i18n'
import type { Building } from '@/lib/api'

const MONTREAL: [number, number] = [45.5019, -73.5674]

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

export function BuildingsMap({ buildings, onSelect }: { buildings: Building[]; onSelect: (b: Building) => void }) {
  const { t } = useT()
  const located = buildings.filter((b) => b.lat != null && b.lng != null)
  const points = located.map((b) => [b.lat as number, b.lng as number] as [number, number])

  return (
    <div className="overflow-hidden rounded-lg border">
      <MapContainer center={points[0] ?? MONTREAL} zoom={12} scrollWheelZoom={false} className="h-80 w-full lg:h-[36rem]">
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <FitBounds points={points} />
        {located.map((b) => (
          <Marker key={b.id} position={[b.lat as number, b.lng as number]} icon={defaultIcon}>
            <Popup>
              <div className="space-y-1">
                <strong>{b.name}</strong>
                <div>{b.address}</div>
                <div>{b.unit_count ?? 0} {t('units')}</div>
                <button className="font-medium text-primary underline" onClick={() => onSelect(b)}>
                  {t('View units →')}
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      {located.length === 0 && (
        <p className="bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
          {t('No buildings are located on the map yet.')}
        </p>
      )}
    </div>
  )
}
