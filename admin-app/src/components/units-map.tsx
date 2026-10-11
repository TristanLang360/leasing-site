import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import { TILE_URL, TILE_ATTRIBUTION } from '@/lib/leaflet-icon'
import { ClusterLayer, popupEl, type ClusterPoint } from './cluster-layer'
import { fmtBeds, fmtPrice, locale } from '@/lib/format'
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
  const located = useMemo(() => units.filter((u) => u.lat != null && u.lng != null), [units])
  const points = useMemo(() => located.map((u) => [u.lat as number, u.lng as number] as [number, number]), [located])
  const pins = useMemo<ClusterPoint[]>(() => located.map((u) => ({
    key: u.id, lat: u.lat as number, lng: u.lng as number,
    label: (u.price || 0).toLocaleString(locale()) + ' $',
    popup: () => popupEl(u.title, [u.address ?? '', `${fmtBeds(u.beds)} · ${fmtPrice(u.price)}`], t('View / edit →'), () => onSelect(u)),
  })), [located, onSelect, t])

  return (
    <div className="adm-map overflow-hidden rounded-lg border">
      <MapContainer center={points[0] ?? MONTREAL} zoom={12} scrollWheelZoom={false} className="h-80 w-full lg:h-[36rem]">
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} />
        <FitBounds points={points} />
        <ClusterLayer points={pins} />
      </MapContainer>
      {located.length === 0 && (
        <p className="bg-muted/40 px-3 py-2 text-center text-sm text-muted-foreground">
          {t('None of the matching units have map coordinates yet.')}
        </p>
      )}
    </div>
  )
}
