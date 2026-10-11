import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, CircleMarker, Popup, useMap, useMapEvents } from 'react-leaflet'
import { defaultIcon } from '@/lib/leaflet-icon'
import { useT } from '@/lib/i18n'
import type { NearbyUnit } from '@/lib/api'

const MONTREAL: [number, number] = [45.5019, -73.5674]

function ClickToSet({ editable, onChange }: { editable: boolean; onChange?: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { if (editable && onChange) onChange(e.latlng.lat, e.latlng.lng) },
  })
  return null
}

// Keeps the view centered on the unit and fixes sizing inside dialogs.
function Recenter({ lat, lng }: { lat: number | null; lng: number | null }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => map.invalidateSize(), 80)
    return () => clearTimeout(t)
  }, [map])
  useEffect(() => {
    if (lat != null && lng != null) map.setView([lat, lng], Math.max(map.getZoom(), 14))
  }, [lat, lng, map])
  return null
}

export function LocationMap({
  lat, lng, editable, onChange, nearby = [],
}: {
  lat: number | null
  lng: number | null
  editable: boolean
  onChange?: (lat: number, lng: number) => void
  nearby?: NearbyUnit[]
}) {
  const { t } = useT()
  const center = lat != null && lng != null ? ([lat, lng] as [number, number]) : MONTREAL
  return (
    <MapContainer center={center} zoom={lat != null ? 14 : 12} className="adm-map h-56 w-full rounded-md border">
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap"
      />
      <Recenter lat={lat} lng={lng} />
      <ClickToSet editable={editable} onChange={onChange} />
      {lat != null && lng != null && (
        <Marker
          position={[lat, lng]}
          icon={defaultIcon}
          draggable={editable}
          eventHandlers={{
            dragend(e) { const p = e.target.getLatLng(); onChange?.(p.lat, p.lng) },
          }}
        />
      )}
      {nearby.map((n) =>
        n.lat != null && n.lng != null ? (
          <CircleMarker key={n.id} center={[n.lat, n.lng]} radius={7}
            pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 0.8 }}>
            <Popup><strong>{n.title}</strong><br />{n.distance_km} {t('km away')}</Popup>
          </CircleMarker>
        ) : null,
      )}
    </MapContainer>
  )
}
