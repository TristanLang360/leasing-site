import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION } from '@/lib/leaflet-icon'
import { ClusterLayer, popupEl, type ClusterPoint } from './cluster-layer'
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
  const located = useMemo(() => buildings.filter((b) => b.lat != null && b.lng != null), [buildings])
  const points = useMemo(() => located.map((b) => [b.lat as number, b.lng as number] as [number, number]), [located])
  const pins = useMemo<ClusterPoint[]>(() => located.map((b) => {
    const n = b.unit_count ?? 0
    return {
      key: b.id, lat: b.lat as number, lng: b.lng as number, label: String(n), weight: n,
      popup: () => popupEl(b.name, [b.address ?? '', `${n} ${n === 1 ? t('unit') : t('units')}`], t('View units →'), () => onSelect(b)),
    }
  }), [located, onSelect, t])

  return (
    <div className="adm-map overflow-hidden rounded-lg border">
      <MapContainer center={points[0] ?? MONTREAL} zoom={12} scrollWheelZoom={false} className="h-80 w-full lg:h-[36rem]">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds points={points} />
        <ClusterLayer points={pins} />
      </MapContainer>
      {located.length === 0 && (
        <p className="bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
          {t('No buildings are located on the map yet.')}
        </p>
      )}
    </div>
  )
}
