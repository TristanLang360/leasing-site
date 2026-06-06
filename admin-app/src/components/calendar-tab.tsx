import { useEffect, useState } from 'react'
import { api, cap, type Appointment, type Me, type Unit, type User } from '@/lib/api'
import { AppointmentDialog } from '@/components/appointment-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function CalendarTab({ me }: { me: Me }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [appts, setAppts] = useState<Appointment[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [editing, setEditing] = useState<Appointment | null | undefined>(undefined)
  const [presetStart, setPresetStart] = useState<string | undefined>()
  const canEdit = cap.calendar(me.role)

  async function load() {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const from = new Date(y, m, 1).toISOString()
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
    try {
      setAppts(await api.get<Appointment[]>(`/api/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`))
    } catch { setAppts([]) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [cursor])

  useEffect(() => {
    api.get<Unit[]>('/api/units?all=1').then(setUnits).catch(() => setUnits([]))
    if (cap.manageUsers(me.role)) api.get<User[]>('/api/users').then(setAgents).catch(() => setAgents([]))
    else setAgents([{ id: me.id, email: me.email, name: me.name, role: me.role, active: 1, created_at: '' }])
  }, [me])

  function openNew(date?: Date) {
    setPresetStart(date ? localValue(date) : undefined)
    setEditing(null)
  }

  const y = cursor.getFullYear(), m = cursor.getMonth()
  const startDay = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const byDay: Record<number, Appointment[]> = {}
  for (const a of appts) { const d = new Date(a.start_at).getDate(); (byDay[d] ||= []).push(a) }
  const upcoming = [...appts].sort((a, b) => a.start_at.localeCompare(b.start_at))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m - 1, 1))}>←</Button>
          <strong className="w-44 text-center">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m + 1, 1))}>→</Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d) }}>Today</Button>
        </div>
        {canEdit && <Button size="sm" onClick={() => openNew()}>+ New showing</Button>}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DOW.map((d) => <div key={d} className="px-2 py-1.5 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} className="min-h-24 border-b border-r bg-muted/20" />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1
            const date = new Date(y, m, day)
            const isToday = date.getTime() === today.getTime()
            const list = (byDay[day] || []).sort((a, b) => a.start_at.localeCompare(b.start_at))
            return (
              <div key={day}
                className={`min-h-24 border-b border-r p-1 ${canEdit ? 'cursor-pointer hover:bg-muted/40' : ''} ${isToday ? 'bg-amber-50' : ''}`}
                onClick={() => canEdit && openNew(new Date(y, m, day, 10, 0))}>
                <div className={`px-1 text-xs ${isToday ? 'font-bold text-amber-700' : 'text-muted-foreground'}`}>{day}</div>
                <div className="mt-0.5 grid gap-0.5">
                  {list.slice(0, 3).map((a) => (
                    <button key={a.id}
                      onClick={(e) => { e.stopPropagation(); setEditing(a) }}
                      className={`truncate rounded px-1 py-0.5 text-left text-[11px] ${chip(a.status)}`}>
                      {new Date(a.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} {a.client_name || a.title}
                    </button>
                  ))}
                  {list.length > 3 && <span className="px-1 text-[10px] text-muted-foreground">+{list.length - 3} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <h3 className="mt-2 text-lg font-semibold">Showings this month</h3>
      {upcoming.length === 0 ? (
        <p className="text-sm text-muted-foreground">No showings this month.</p>
      ) : (
        <div className="grid gap-2">
          {upcoming.map((a) => (
            <button key={a.id} onClick={() => setEditing(a)} className="flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-muted/40">
              <span className="w-40 shrink-0 text-sm font-medium">
                {new Date(a.start_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{a.title}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {a.unit?.title || 'No unit'}{a.client_name ? ` · ${a.client_name}` : ''}{a.agent ? ` · ${a.agent.name || a.agent.email}` : ''}
                </span>
              </span>
              <Badge variant="outline" className={chipText(a.status)}>{a.status}</Badge>
            </button>
          ))}
        </div>
      )}

      <AppointmentDialog
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        appt={editing ?? null}
        presetStart={presetStart}
        units={units}
        agents={agents}
        onSaved={load}
      />
    </div>
  )
}

function localValue(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
function chip(status: string) {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800'
  if (status === 'canceled') return 'bg-rose-100 text-rose-800 line-through'
  return 'bg-sky-100 text-sky-800'
}
function chipText(status: string) {
  if (status === 'done') return 'text-emerald-700'
  if (status === 'canceled') return 'text-rose-700'
  return 'text-sky-700'
}
