import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, type Me, type Task, type Unit, type User } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT, locale } from '@/lib/i18n'
import { celebrate } from '@/lib/confetti'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UnitDetails } from '@/components/unit-details'

const NONE = 'none'
const pad = (n: number) => String(n).padStart(2, '0')
const TIME_SLOTS: string[] = []
for (let h = 7; h <= 21; h++) for (let m = 0; m < 60; m += 15) TIME_SLOTS.push(`${pad(h)}:${pad(m)}`)
const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' })
}
const dateLabel = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
const STATUS_LABEL: Record<string, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done' }

export function TaskDialog({
  me, task, open, onOpenChange, units, agents, onSaved, presetAgentId,
}: {
  me: Me
  task: Task | null
  open: boolean
  onOpenChange: (o: boolean) => void
  units: Unit[]
  agents: User[]
  onSaved: () => void
  presetAgentId?: number
}) {
  const { t } = useT()
  const isMaster = cap.manageTasks(me.role)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [unitId, setUnitId] = useState(NONE)
  const [agentId, setAgentId] = useState(NONE)
  const [status, setStatus] = useState('todo')
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState('10:00')
  const [dpOpen, setDpOpen] = useState(false)
  const [autoAssign, setAutoAssign] = useState(true)
  const [autoCount, setAutoCount] = useState('10')
  const [busy, setBusy] = useState(false)
  const [detailUnit, setDetailUnit] = useState<Unit | null>(null)

  function applyPostPreset() {
    setTitle('Post on Facebook Marketplace')
    setDescription('Post that day’s unit on Facebook Marketplace.')
    setAutoAssign(true)
    setAutoCount('1')
  }

  useEffect(() => {
    if (!open) return
    setTitle(task?.title ?? '')
    setDescription(task?.description ?? '')
    setUnitId(task?.unit_id ? String(task.unit_id) : NONE)
    setAgentId(task?.agent_id ? String(task.agent_id) : (presetAgentId ? String(presetAgentId) : NONE))
    setStatus(task?.status ?? 'todo')
    setAutoAssign(!task) // new tasks default to the posting rotation
    setAutoCount('5')
    if (task?.due_at) { const d = new Date(task.due_at); setDate(d); setTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`) }
    else { setDate(undefined); setTime('10:00') }
  }, [open, task])

  const timeOptions = useMemo(() => (TIME_SLOTS.includes(time) ? TIME_SLOTS : [time, ...TIME_SLOTS]), [time])
  const unit = task?.unit
  const batch = task?.units ?? []
  const showCount = isMaster && !task && autoAssign
  const showBatch = batch.length > 0
  const showUnitPicker = isMaster && !showCount && !showBatch

  async function save(e: React.FormEvent) {
    e.preventDefault()
    const becameDone = status === 'done' && task?.status !== 'done'
    setBusy(true)
    try {
      if (isMaster) {
        if (!title.trim()) { toast.error(t('Give the task a title')); setBusy(false); return }
        if (agentId === NONE) { toast.error(t('Assign the task to an agent')); setBusy(false); return }
        let due_at = ''
        if (date) { const d = new Date(date); const [hh, mm] = time.split(':').map(Number); d.setHours(hh, mm, 0, 0); due_at = d.toISOString() }
        if (showCount) {
          const n = Math.max(1, Math.min(parseInt(autoCount, 10) || 10, 200))
          await api.post('/api/tasks', { title, description, agent_id: agentId, due_at, status, auto_units: n })
        } else {
          const body = { title, description, unit_id: unitId === NONE ? '' : unitId, agent_id: agentId, due_at, status }
          if (task) await api.put(`/api/tasks/${task.id}`, body)
          else await api.post('/api/tasks', body)
        }
      } else {
        // agent: only the status changes
        if (task) await api.put(`/api/tasks/${task.id}`, { status })
      }
      if (becameDone) { celebrate(); toast.success(t('🎉 Task complete!')) } else { toast.success(t('Task saved')) }
      onOpenChange(false); onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Save failed'))
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!task || !confirm(t('Delete this task?'))) return
    try { await api.del(`/api/tasks/${task.id}`); toast.success(t('Task deleted')); onOpenChange(false); onSaved() }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Delete failed')) }
  }

  return (
    <>
    <UnitDetails me={me} unit={detailUnit} open={!!detailUnit} onOpenUnit={setDetailUnit}
      onOpenChange={(o) => { if (!o) setDetailUnit(null) }} />
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? (isMaster ? t('Edit task') : t('Task')) : t('New task')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          {isMaster ? (
            <>
              {!task && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Quick start')}</Label>
                  <Button type="button" variant="outline" className="justify-start font-normal" onClick={applyPostPreset}>
                    {t('📢 Post — Facebook Marketplace (1 unit/day, Mon–Fri)')}
                  </Button>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('Title *')}</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('Post on Facebook Marketplace')} />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('Instructions')}</Label>
                <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('What to do, where to post, any notes…')} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Assign to *')}</Label>
                  <Select value={agentId} onValueChange={(v) => v && setAgentId(v)}>
                    <SelectTrigger><SelectValue>{(v: any) => (v === NONE || !v ? t('— Pick an agent —') : (agents.find((a) => String(a.id) === String(v))?.name || agents.find((a) => String(a.id) === String(v))?.email || String(v)))}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('— Pick an agent —')}</SelectItem>
                      {agents.filter((a) => a.role !== 'master').map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Status')}</Label>
                  <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                    <SelectTrigger><SelectValue>{(v: any) => t(STATUS_LABEL[String(v)] ?? String(v))}</SelectValue></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todo">{t('To do')}</SelectItem>
                      <SelectItem value="in_progress">{t('In progress')}</SelectItem>
                      <SelectItem value="done">{t('Done')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {!task && (
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox checked={autoAssign} onCheckedChange={(v) => setAutoAssign(!!v)} />
                  {t('Assign next week’s posting (Mon–Fri rotation)')}
                </label>
              )}
              {showCount && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Units per day')}</Label>
                  <Input type="number" min="1" max="200" value={autoCount} onChange={(e) => setAutoCount(e.target.value)} />
                  <span className="text-xs text-muted-foreground">{t('Creates 5 daily tasks (Mon–Fri next week),')} {autoCount || '…'} {t('units each — pulled from the rotation, never the same units another agent has.')}</span>
                </div>
              )}
              {showBatch && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Units to post')} ({batch.length})</Label>
                  <UnitBatch units={batch} onPick={setDetailUnit} />
                </div>
              )}
              {showUnitPicker && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Unit (optional)')}</Label>
                  <Select value={unitId} onValueChange={(v) => v && setUnitId(v)}>
                    <SelectTrigger><SelectValue>{(v: any) => (v === NONE || !v ? t('— No unit —') : (units.find((u) => String(u.id) === String(v))?.title ?? String(v)))}</SelectValue></SelectTrigger>
                    <SelectContent className="max-h-72">
                      <SelectItem value={NONE}>{t('— No unit —')}</SelectItem>
                      {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.title}{u.unit_code ? ` (${u.unit_code})` : ''}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('Due date (optional)')}</Label>
                <div className="flex gap-2">
                  <Popover open={dpOpen} onOpenChange={setDpOpen}>
                    <PopoverTrigger className={cn(buttonVariants({ variant: 'outline' }), 'flex-1 justify-start font-normal', !date && 'text-muted-foreground')}>
                      📅 {date ? dateLabel(date) : t('No due date')}
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={date} defaultMonth={date} onSelect={(d) => { setDate(d); setDpOpen(false) }} />
                    </PopoverContent>
                  </Popover>
                  {date && (
                    <>
                      <Select value={time} onValueChange={(v) => v && setTime(v)}>
                        <SelectTrigger className="w-28"><SelectValue>{(v: any) => (v ? timeLabel(String(v)) : '')}</SelectValue></SelectTrigger>
                        <SelectContent className="max-h-64">{timeOptions.map((t) => <SelectItem key={t} value={t}>{timeLabel(t)}</SelectItem>)}</SelectContent>
                      </Select>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setDate(undefined)}>{t('Clear')}</Button>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-lg font-medium">{task?.title}</div>
                {task?.due_at && <div className="text-sm text-muted-foreground">{t('Due')} {new Date(task.due_at).toLocaleString(locale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
              </div>
              {task?.description && <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-sm">{task.description}</p>}
              {batch.length > 0 ? (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">{t('Units to post')} ({batch.length})</Label>
                  <UnitBatch units={batch} onPick={setDetailUnit} />
                </div>
              ) : unit ? (
                <div className="rounded-md border p-3">
                  <div className="text-sm font-medium">{unit.title}</div>
                  <div className="text-xs text-muted-foreground">{unit.address}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => { window.location.href = `/api/units/${unit.id}/photos.zip` }}>{t('⬇ Download photos (.zip)')}</Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => window.open(`/units/${unit.id}`, '_blank')}>{t('Open listing')}</Button>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{t('My progress')}</Label>
                <Select value={status} onValueChange={(v) => v && setStatus(v)}>
                  <SelectTrigger><SelectValue>{(v: any) => t(STATUS_LABEL[String(v)] ?? String(v))}</SelectValue></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todo">{t('To do')}</SelectItem>
                    <SelectItem value="in_progress">{t('In progress')}</SelectItem>
                    <SelectItem value="done">{t('Done')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <DialogFooter className="sm:justify-between">
            {isMaster && task ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>{t('Delete')}</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
              <Button type="submit" disabled={busy}>{busy ? t('Saving…') : isMaster ? (showCount ? t('Assign week') : task ? t('Save task') : t('Create task')) : t('Update')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  )
}

function UnitBatch({ units, onPick }: { units: Unit[]; onPick: (u: Unit) => void }) {
  const { t } = useT()
  return (
    <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto rounded-md border p-2">
      {units.map((u) => (
        <div key={u.id} className="flex items-center gap-2 rounded-md border bg-card p-2">
          <button type="button" onClick={() => onPick(u)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
            <div className="size-9 shrink-0 overflow-hidden rounded bg-muted">
              {u.photos?.[0]
                ? (u.photos[0].kind === 'video'
                    ? <video src={u.photos[0].url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                    : <img src={u.photos[0].url} alt="" className="h-full w-full object-cover" />)
                : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">{(u.title || '?').slice(0, 1)}</div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{u.title}</div>
              <div className="truncate text-xs text-muted-foreground">{u.address}</div>
            </div>
          </button>
          {u.photos?.length ? (
            <a className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} href={`/api/units/${u.id}/photos.zip`} title={t('Download all photos')}>⬇</a>
          ) : null}
          <button type="button" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }))} onClick={() => onPick(u)}>{t('Details')}</button>
        </div>
      ))}
    </div>
  )
}
