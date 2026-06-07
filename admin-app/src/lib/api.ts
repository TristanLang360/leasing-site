// Typed client for the Rentalium Express API. Same-origin in production
// (served under /admin); proxied to :3030 during `npm run dev`.

export type Role = 'master' | 'agent' | 'viewer'

export interface Me { id: number; email: string; name: string | null; role: Role; onboarded?: number }

export interface Photo { id: number; url: string; filename: string; kind?: 'image' | 'video'; sortOrder?: number }

export interface Building {
  id: number
  name: string
  address: string
  neighborhood: string | null
  cover_image?: string | null
  cover_url?: string | null
  lat: number | null
  lng: number | null
  geocode_attempted: number
  created_at: string
  unit_count?: number
  available_count?: number
}

export interface Unit {
  id: number
  building_id: number | null
  unit_code: string | null
  title: string
  address: string
  neighborhood: string | null
  beds: number
  baths: number
  sqft: number | null
  price: number
  available_date: string | null
  description: string | null
  appliances: string | null
  parking_available: 'yes' | 'no'
  parking_cost: number | null
  locker_available: 'yes' | 'no'
  locker_cost: number | null
  dogs_policy: 'yes' | 'no' | 'contact'
  status: 'available' | 'hidden'
  lat: number | null
  lng: number | null
  geocode_attempted: number
  created_at: string
  photos: Photo[]
}

export interface NearbyUnit extends Unit { distance_km: number }
export interface NearbyResponse { origin: { id: number; lat: number | null; lng: number | null }; nearby: NearbyUnit[]; reason?: string }

export interface User { id: number; email: string; name: string | null; role: Role; active: number; created_at: string }

export interface Appointment {
  id: number
  unit_id: number | null
  title: string
  start_at: string
  end_at: string | null
  client_name: string | null
  client_phone: string | null
  client_email: string | null
  notes: string | null
  agent_id: number | null
  status: 'scheduled' | 'done' | 'canceled'
  created_by: number | null
  created_at: string
  unit: { id: number; title: string; unit_code: string | null; address: string } | null
  agent: { id: number; name: string | null; email: string } | null
}

export interface CsvResult { imported: number; skipped: number; total: number; errors: { row: number; error: string }[] }

export interface AppNotification {
  id: number
  user_id: number
  message: string
  link: string | null
  read: number
  created_at: string
}

export interface Task {
  id: number
  title: string
  description: string | null
  unit_id: number | null
  agent_id: number | null
  due_at: string | null
  status: 'todo' | 'in_progress' | 'done'
  created_by: number | null
  created_at: string
  updated_at: string
  unit: { id: number; title: string; unit_code: string | null; address: string } | null
  agent: { id: number; name: string | null; email: string } | null
  units?: Unit[] // posting batch (units auto-assigned to this task)
}

export interface PostingStatus { cycle: number; total: number; assigned: number; remaining: number }

export type LeadStage = 'new' | 'visited' | 'credit_sent' | 'application_sent' | 'rented' | 'lost'

export interface Lead {
  id: number
  name: string
  email: string | null
  phone: string | null
  unit_id: number | null
  agent_id: number | null
  appointment_id: number | null
  stage: LeadStage
  source: string
  budget: number | null
  move_in: string | null
  notes: string | null
  created_at: string
  updated_at: string
  unit: { id: number; title: string; unit_code: string | null; address: string } | null
  agent: { id: number; name: string | null; email: string } | null
}

// Pipeline order + display. `accent` drives the column header + card dot.
export const LEAD_STAGES: { value: LeadStage; label: string; accent: string }[] = [
  { value: 'new',              label: 'New',                accent: 'bg-sky-500' },
  { value: 'visited',          label: 'Visited',            accent: 'bg-violet-500' },
  { value: 'credit_sent',      label: 'Credit report sent', accent: 'bg-amber-500' },
  { value: 'application_sent', label: 'Application sent',    accent: 'bg-blue-600' },
  { value: 'rented',           label: 'Rented',             accent: 'bg-emerald-600' },
  { value: 'lost',             label: 'Lost',               accent: 'bg-slate-400' },
]
export const leadStageLabel = (s: string) => LEAD_STAGES.find((x) => x.value === s)?.label ?? s

export interface Post {
  id: number
  slug: string
  title: string
  excerpt: string | null
  body: string | null
  cover_image: string | null
  cover_url: string | null
  status: 'draft' | 'published'
  author_id: number | null
  created_at: string
  updated_at: string
  published_at: string | null
  author?: { id: number; name: string | null; email: string } | null
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) { super(message); this.status = status }
}

async function request<T>(method: string, url: string, body?: unknown, isForm = false): Promise<T> {
  const opts: RequestInit = { method, credentials: 'same-origin' }
  if (body && !isForm) {
    opts.headers = { 'Content-Type': 'application/json' }
    opts.body = JSON.stringify(body)
  } else if (body && isForm) {
    opts.body = body as FormData
  }
  const r = await fetch(url, opts)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try { const j = await r.json(); if (j.error) msg = j.error } catch { /* non-JSON */ }
    throw new ApiError(msg, r.status)
  }
  if (r.status === 204) return null as T
  const ct = r.headers.get('content-type') || ''
  return (ct.includes('application/json') ? await r.json() : (null as T)) as T
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  put: <T>(url: string, body?: unknown) => request<T>('PUT', url, body),
  del: <T>(url: string) => request<T>('DELETE', url),
  form: <T>(url: string, fd: FormData, method = 'POST') => request<T>(method, url, fd, true),
}

// ── Capabilities (mirror server.js) ────────────────────────────
export const cap = {
  editUnits: (r?: Role) => r === 'master' || r === 'agent',
  deleteUnits: (r?: Role) => r === 'master',
  manageUsers: (r?: Role) => r === 'master',
  calendar: (r?: Role) => r === 'master' || r === 'agent',
  blog: (r?: Role) => r === 'master' || r === 'agent',
  manageTasks: (r?: Role) => r === 'master',
}
