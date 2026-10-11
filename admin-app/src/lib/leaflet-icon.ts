import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet.markercluster/dist/MarkerCluster.css'

// Map styling shared by the admin maps: same monochrome tiles, ink pins and
// count bubbles as the public site, so the two never look like different products.
export const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const TILE_ATTRIBUTION = '&copy; OpenStreetMap'

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)

// Small ink tag with a label (unit count, price…), pointing at the spot.
export const pinIcon = (label: string) => L.divIcon({
  className: 'adm-pin-wrap',
  html: `<span class="adm-pin">${esc(label)}</span>`,
  iconSize: [0, 0],
  popupAnchor: [0, -30],
})

// Back-compat: a plain dot for single-location maps.
export const defaultIcon = L.divIcon({
  className: 'adm-pin-wrap',
  html: '<span class="adm-dot"></span>',
  iconSize: [0, 0],
  popupAnchor: [0, -10],
})

// Clusters that show how many items (sum of `weight`) sit in an area and split as you zoom in.
export function clusterGroup() {
  return L.markerClusterGroup({
    showCoverageOnHover: false,
    spiderfyOnMaxZoom: true,
    disableClusteringAtZoom: 17,
    maxClusterRadius: (z: number) => (z <= 9 ? 120 : z <= 12 ? 70 : 45),
    iconCreateFunction: (cluster) => {
      const n = cluster.getAllChildMarkers().reduce((s, m) => s + ((m.options as { weight?: number }).weight ?? 1), 0)
      const size = n >= 100 ? 56 : n >= 25 ? 48 : n >= 10 ? 42 : 36
      return L.divIcon({
        className: 'adm-cluster-wrap',
        html: `<span class="adm-cluster" style="width:${size}px;height:${size}px">${n}</span>`,
        iconSize: [size, size],
      })
    },
  })
}
