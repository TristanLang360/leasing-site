import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type Task, type Unit, type User } from '@/lib/api'
import { celebrate } from '@/lib/confetti'
import { TaskDialog } from '@/components/task-dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const STATUS_LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }
const dueLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No due date'

export function TasksTab({ me }: { me: Me }) {
  const isMaster = cap.manageTasks(me.role)
  const [tasks, setTasks] = useState<Task[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [agentFilter, setAgentFilter] = useState('all')
  const [editing, setEditing] = useState<Task | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const q = isMaster && agentFilter !== 'all' ? `?agent_id=${agentFilter}` : ''
      setTasks(await api.get<Task[]>(`/api/tasks${q}`))
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load tasks') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [agentFilter])
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

  const open = tasks.filter((t) => t.status !== 'done')
  const done = tasks.filter((t) => t.status === 'done')

  const Row = (t: Task) => (
    <div key={t.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
      <Checkbox checked={t.status === 'done'} onCheckedChange={() => toggleDone(t)} className="size-5" />
      <button onClick={() => setEditing(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <div className="min-w-0 flex-1">
          <div className={`truncate font-medium ${t.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>📋 {t.title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {dueLabel(t.due_at)}{t.unit ? ` · ${t.unit.title}` : ''}{isMaster && t.agent ? ` · ${t.agent.name || t.agent.email}` : ''}
          </div>
        </div>
        <Badge variant="outline" className={t.status === 'done' ? 'text-emerald-700' : t.status === 'in_progress' ? 'text-violet-700' : 'text-slate-600'}>
          {STATUS_LABEL[t.status] ?? t.status}
        </Badge>
      </button>
    </div>
  )

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${open.length} open · ${done.length} done`}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {isMaster && (
            <Select value={agentFilter} onValueChange={(v) => v && setAgentFilter(v)}>
              <SelectTrigger className="h-8"><SelectValue>{(v: any) => (v === 'all' ? 'All agents' : (agents.find((a) => String(a.id) === String(v))?.name || agents.find((a) => String(a.id) === String(v))?.email || 'Agent'))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All agents</SelectItem>
                {agents.filter((a) => a.role !== 'master').map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {isMaster && <Button size="sm" onClick={() => setEditing(null)}>+ New task</Button>}
        </div>
      </div>

      {tasks.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {isMaster ? 'No tasks yet. Click “+ New task” to assign work to an agent.' : 'No tasks assigned to you. 🎉'}
        </div>
      ) : (
        <>
          <div className="grid gap-2">{open.map(Row)}</div>
          {done.length > 0 && (
            <div className="grid gap-2">
              <h3 className="mt-2 text-sm font-medium text-muted-foreground">Completed</h3>
              {done.map(Row)}
            </div>
          )}
        </>
      )}

      <TaskDialog
        me={me}
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        task={editing ?? null}
        units={units}
        agents={agents}
        onSaved={load}
      />
    </div>
  )
}
