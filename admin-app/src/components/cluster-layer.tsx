import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMap } from 'react-leaflet'
import { clusterGroup, pinIcon } from '@/lib/leaflet-icon'

export type ClusterPoint = {
  key: string | number
  lat: number
  lng: number
  label: string
  weight?: number
  popup: () => HTMLElement
}

// Imperative markercluster layer (react-leaflet has no cluster component).
export function ClusterLayer({ points }: { points: ClusterPoint[] }) {
  const map = useMap()
  const group = useRef<L.MarkerClusterGroup | null>(null)

  useEffect(() => {
    const g = clusterGroup()
    group.current = g
    map.addLayer(g)
    return () => { map.removeLayer(g); group.current = null }
  }, [map])

  useEffect(() => {
    const g = group.current
    if (!g) return
    g.clearLayers()
    g.addLayers(points.map((p) => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.label), weight: p.weight ?? 1 } as L.MarkerOptions)
      m.bindPopup(() => p.popup())
      return m
    }))
  }, [points])

  return null
}

// Small DOM builder for popups (they live outside React's tree).
export function popupEl(title: string, lines: string[], action: string, onClick: () => void) {
  const root = document.createElement('div')
  root.className = 'adm-popup'
  const h = document.createElement('strong')
  h.textContent = title
  root.appendChild(h)
  for (const l of lines) {
    const d = document.createElement('div')
    d.textContent = l
    root.appendChild(d)
  }
  const b = document.createElement('button')
  b.type = 'button'
  b.textContent = action
  b.onclick = onClick
  root.appendChild(b)
  return root
}
