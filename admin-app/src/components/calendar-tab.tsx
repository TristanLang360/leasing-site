import { useEffect, useState } from 'react'
import { api, cap, type Appointment, type Me, type Task, type Unit, type User } from '@/lib/api'
import { AppointmentDialog } from '@/components/appointment-dialog'
import { TaskDialog } from '@/components/task-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const TASK_LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }

export function CalendarTab({ me }: { me: Me }) {
  // Tasks only appear on the assigned agent's calendar — never the master's.
  const showTasks = !cap.manageTasks(me.role)
  const [cursor, setCursor] = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d })
  const [appts, setAppts] = useState<Appointment[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [editing, setEditing] = useState<Appointment | null | undefined>(undefined)
  const [presetStart, setPresetStart] = useState<string | undefined>()
  const [taskEditing, setTaskEditing] = useState<Task | null | undefined>(undefined)
  const canEditAppts = cap.calendar(me.role)

  async function load() {
    const y = cursor.getFullYear(), m = cursor.getMonth()
    const from = new Date(y, m, 1).toISOString()
    const to = new Date(y, m + 1, 0, 23, 59, 59).toISOString()
    const range = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`
    try { setAppts(await api.get<Appointment[]>(`/api/appointments?${range}`)) } catch { setAppts([]) }
    if (showTasks) { try { setTasks(await api.get<Task[]>(`/api/tasks?${range}`)) } catch { setTasks([]) } }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [cursor])

  useEffect(() => {
    api.get<Unit[]>('/api/units?all=1').then(setUnits).catch(() => setUnits([]))
    if (cap.manageUsers(me.role)) api.get<User[]>('/api/users').then(setAgents).catch(() => setAgents([]))
    else setAgents([{ id: me.id, email: me.email, name: me.name, role: me.role, active: 1, created_at: '' }])
  }, [me])

  const y = cursor.getFullYear(), m = cursor.getMonth()
  const startDay = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)

  const apptByDay: Record<number, Appointment[]> = {}
  for (const a of appts) { const d = new Date(a.start_at).getDate(); (apptByDay[d] ||= []).push(a) }
  const taskByDay: Record<number, Task[]> = {}
  for (const t of tasks) if (t.due_at) { const d = new Date(t.due_at).getDate(); (taskByDay[d] ||= []).push(t) }

  const upcoming = [...appts].sort((a, b) => a.start_at.localeCompare(b.start_at))
  const taskList = [...tasks].sort((a, b) => (a.due_at || '~').localeCompare(b.due_at || '~'))

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m - 1, 1))}>←</Button>
          <strong className="w-44 text-center">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong>
          <Button variant="outline" size="sm" onClick={() => setCursor(new Date(y, m + 1, 1))}>→</Button>
          <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); setCursor(d) }}>Today</Button>
        </div>
        {canEditAppts && <Button size="sm" onClick={() => { setPresetStart(undefined); setEditing(null) }}>+ New showing</Button>}
      </div>

      <div className="overflow-hidden rounded-lg border">
        <div className="grid grid-cols-7 border-b bg-muted/50">
          {DOW.map((d) => <div key={d} className="px-2 py-1.5 text-center text-xs font-medium uppercase text-muted-foreground">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {Array.from({ length: startDay }).map((_, i) => <div key={`e${i}`} className="min-h-24 border-b border-r bg-muted/20" />)}
          {Array.from({ length: days }).map((_, i) => {
            const day = i + 1
            const isToday = new Date(y, m, day).getTime() === today.getTime()
            const dayAppts = (apptByDay[day] || []).sort((a, b) => a.start_at.localeCompare(b.start_at))
            const dayTasks = taskByDay[day] || []
            const shownAppts = dayAppts.slice(0, 2)
            const shownTasks = dayTasks.slice(0, Math.max(0, 3 - shownAppts.length))
            const more = (dayAppts.length + dayTasks.length) - shownAppts.length - shownTasks.length
            return (
              <div key={day}
                className={`min-h-24 border-b border-r p-1 ${canEditAppts ? 'cursor-pointer hover:bg-muted/40' : ''} ${isToday ? 'bg-amber-50' : ''}`}
                onClick={() => canEditAppts && (setPresetStart(localValue(new Date(y, m, day, 10, 0))), setEditing(null))}>
                <div className={`px-1 text-xs ${isToday ? 'font-bold text-amber-700' : 'text-muted-foreground'}`}>{day}</div>
                <div className="mt-0.5 grid gap-0.5">
                  {shownAppts.map((a) => (
                    <button key={'a' + a.id} onClick={(e) => { e.stopPropagation(); setEditing(a) }}
                      className={`truncate rounded px-1 py-0.5 text-left text-[11px] ${apptChip(a.status)}`}>
                      {new Date(a.start_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} {a.client_name || a.title}
                    </button>
                  ))}
                  {shownTasks.map((t) => (
                    <button key={'t' + t.id} onClick={(e) => { e.stopPropagation(); setTaskEditing(t) }}
                      className={`truncate rounded px-1 py-0.5 text-left text-[11px] ${taskChip(t.status)}`}>
                      📋 {t.title}
                    </button>
                  ))}
                  {more > 0 && <span className="px-1 text-[10px] text-muted-foreground">+{more} more</span>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* My tasks (agents only) */}
      {showTasks && (
        <>
          <h3 className="mt-2 text-lg font-semibold">My tasks</h3>
          {taskList.length === 0 ? (
            <p className="text-sm text-muted-foreground">No tasks assigned to you this month.</p>
          ) : (
            <div className="grid gap-2">
              {taskList.map((t) => (
                <button key={t.id} onClick={() => setTaskEditing(t)} className="flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-muted/40">
                  <span className="w-36 shrink-0 text-sm font-medium">
                    {t.due_at ? new Date(t.due_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : <span className="text-muted-foreground">No due date</span>}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">📋 {t.title}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.unit ? t.unit.title : 'No unit'}</span>
                  </span>
                  <Badge variant="outline" className={t.status === 'done' ? 'text-emerald-700' : t.status === 'in_progress' ? 'text-violet-700' : 'text-slate-600'}>{TASK_LABEL[t.status] ?? t.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* Showings */}
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
      <TaskDialog
        me={me}
        open={taskEditing !== undefined}
        onOpenChange={(o) => { if (!o) setTaskEditing(undefined) }}
        task={taskEditing ?? null}
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
function apptChip(status: string) {
  if (status === 'requested') return 'bg-amber-100 text-amber-800'
  if (status === 'done') return 'bg-emerald-100 text-emerald-800'
  if (status === 'canceled') return 'bg-rose-100 text-rose-800 line-through'
  return 'bg-sky-100 text-sky-800'
}
function taskChip(status: string) {
  if (status === 'done') return 'bg-emerald-100 text-emerald-800 line-through'
  if (status === 'in_progress') return 'bg-violet-100 text-violet-800'
  return 'bg-slate-100 text-slate-700'
}
function chipText(status: string) {
  if (status === 'requested') return 'text-amber-700'
  if (status === 'done') return 'text-emerald-700'
  if (status === 'canceled') return 'text-rose-700'
  return 'text-sky-700'
}
