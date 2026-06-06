import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type Task, type Unit, type User } from '@/lib/api'
import { celebrate } from '@/lib/confetti'
import { TaskDialog } from '@/components/task-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'

const STATUS_LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }
const dueLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due date'
const statusText = (s: string) => (s === 'done' ? 'text-emerald-700' : s === 'in_progress' ? 'text-violet-700' : 'text-slate-600')

export function TasksTab({ me }: { me: Me }) {
  const isMaster = cap.manageTasks(me.role)
  const [tasks, setTasks] = useState<Task[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)
  const [presetAgentId, setPresetAgentId] = useState<number | undefined>(undefined)
  const [selectedAgentId, setSelectedAgentId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setTasks(await api.get<Task[]>('/api/tasks')) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load tasks') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    api.get<Unit[]>('/api/units?all=1').then(setUnits).catch(() => setUnits([]))
    if (cap.manageUsers(me.role)) api.get<User[]>('/api/users').then(setAgents).catch(() => setAgents([]))
    else setAgents([{ id: me.id, email: me.email, name: me.name, role: me.role, active: 1, created_at: '' }])
  }, [me])

  async function toggleDone(t: Task) {
    const next = t.status === 'done' ? 'todo' : 'done'
    const body = isMaster
      ? { title: t.title, description: t.description, unit_id: t.unit_id, agent_id: t.agent_id, due_at: t.due_at, status: next }
      : { status: next }
    try {
      await api.put(`/api/tasks/${t.id}`, body)
      if (next === 'done') { celebrate(); toast.success('🎉 Task complete!') }
      load()
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Update failed') }
  }

  function openNew(agentId?: number) { setPresetAgentId(agentId); setEditing(null) }

  const TaskRow = (t: Task, showAgent: boolean) => (
    <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Checkbox checked={t.status === 'done'} onCheckedChange={() => toggleDone(t)} className="size-5" />
      <button onClick={() => { setPresetAgentId(undefined); setEditing(t) }} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${t.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>📋 {t.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {dueLabel(t.due_at)}{t.unit ? ` · ${t.unit.title}` : ''}{showAgent && t.agent ? ` · ${t.agent.name || t.agent.email}` : ''}
          </div>
        </div>
        <Badge variant="outline" className={statusText(t.status)}>{STATUS_LABEL[t.status] ?? t.status}</Badge>
      </button>
    </div>
  )

  const dialog = (
    <TaskDialog
      me={me}
      open={editing !== undefined}
      onOpenChange={(o) => { if (!o) { setEditing(undefined); setPresetAgentId(undefined) } }}
      task={editing ?? null}
      units={units}
      agents={agents}
      presetAgentId={presetAgentId}
      onSaved={load}
    />
  )

  // ── Agent's own checklist ──────────────────────────────────────
  if (!isMaster) {
    const open = tasks.filter((t) => t.status !== 'done')
    const done = tasks.filter((t) => t.status === 'done')
    return (
      <div className="grid gap-4">
        <span className="text-sm text-muted-foreground">{loading ? 'Loading…' : `${open.length} open · ${done.length} done`}</span>
        {tasks.length === 0 && !loading ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">No tasks assigned to you. 🎉</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2">{open.map((t) => TaskRow(t, false))}</div>
            {done.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                <h3 className="mt-2 text-sm font-medium text-muted-foreground">Completed</h3>
                {done.map((t) => TaskRow(t, false))}
              </div>
            )}
          </>
        )}
        {dialog}
      </div>
    )
  }

  // ── Master: agents -> drill into one agent's tasks ─────────────
  const realAgents = agents.filter((a) => a.role !== 'master')
  const byAgent = new Map<number, Task[]>()
  for (const t of tasks) if (t.agent_id != null) { if (!byAgent.has(t.agent_id)) byAgent.set(t.agent_id, []); byAgent.get(t.agent_id)!.push(t) }
  const selected = realAgents.find((a) => a.id === selectedAgentId) || null

  if (selected) {
    const theirs = byAgent.get(selected.id) || []
    const open = theirs.filter((t) => t.status !== 'done')
    const done = theirs.filter((t) => t.status === 'done')
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedAgentId(null)}>← All agents</Button>
            <span className="font-semibold">{selected.name || selected.email}</span>
            <Badge variant="secondary">{open.length} active</Badge>
          </div>
          <Button size="sm" onClick={() => openNew(selected.id)}>+ Assign task</Button>
        </div>
        {theirs.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            No tasks for {selected.name || selected.email} yet. Click “+ Assign task”.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2">{open.map((t) => TaskRow(t, false))}</div>
            {done.length > 0 && (
              <div className="grid grid-cols-1 gap-2">
                <h3 className="mt-2 text-sm font-medium text-muted-foreground">Completed</h3>
                {done.map((t) => TaskRow(t, false))}
              </div>
            )}
          </>
        )}
        {dialog}
      </div>
    )
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{loading ? 'Loading…' : `${realAgents.length} agent${realAgents.length === 1 ? '' : 's'}`}</span>
        <Button size="sm" onClick={() => openNew()}>+ New task</Button>
      </div>

      {realAgents.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No agents yet. Add agents in the <strong>Agents</strong> tab, then assign them tasks here.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {realAgents.map((a) => {
            const theirs = byAgent.get(a.id) || []
            const active = theirs.filter((t) => t.status !== 'done').length
            const done = theirs.length - active
            return (
              <button key={a.id} onClick={() => setSelectedAgentId(a.id)}
                className="flex items-center gap-4 rounded-lg border bg-card p-3 text-left hover:bg-muted/40">
                <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
                  {(a.name || a.email).slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.name || a.email}</span>
                    <Badge variant="secondary" className="capitalize">{a.role}</Badge>
                    {!a.active && <Badge variant="outline">disabled</Badge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">{a.email}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {active > 0 ? <Badge className="bg-violet-100 text-violet-800">{active} active</Badge> : <span className="text-xs text-muted-foreground">no active tasks</span>}
                  {done > 0 && <span className="text-xs text-muted-foreground">{done} done</span>}
                  <span className="text-muted-foreground">→</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {dialog}
    </div>
  )
}
