import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { api, type Appointment, type Unit, type User } from '@/lib/api'
import { cn } from '@/lib/utils'
import { useT, locale } from '@/lib/i18n'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NONE = 'none'
const pad = (n: number) => String(n).padStart(2, '0')

// 15-minute time slots from 07:00 to 21:00.
const TIME_SLOTS: string[] = []
for (let h = 7; h <= 21; h++) for (let m = 0; m < 60; m += 15) TIME_SLOTS.push(`${pad(h)}:${pad(m)}`)

const timeLabel = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' })
}
const DURATIONS: [string, string][] = [
  ['30', '30 min'], ['45', '45 min'], ['60', '1 hour'], ['90', '1.5 hours'], ['120', '2 hours'], ['none', 'No end time'],
]
const dateLabel = (d: Date) => d.toLocaleDateString(locale(), { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })

type Other = {
  title: string; unit_id: string; client_name: string; client_phone: string
  client_email: string; agent_id: string; status: string; notes: string
}

function deriveWhen(a: Appointment | null, presetStart?: string) {
  let base: Date | null = null
  if (a?.start_at) base = new Date(a.start_at)
  else if (presetStart) base = new Date(presetStart)
  if (!base || isNaN(base.getTime())) return { date: undefined as Date | undefined, time: '10:00', duration: '60' }
  const time = `${pad(base.getHours())}:${pad(base.getMinutes())}`
  let duration = '60'
  if (a?.end_at) {
    const mins = Math.round((new Date(a.end_at).getTime() - base.getTime()) / 60000)
    duration = mins > 0 ? String(mins) : 'none'
  }
  return { date: base, time, duration }
}

export function AppointmentDialog({
  open, onOpenChange, appt, presetStart, units, agents, onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  appt: Appointment | null
  presetStart?: string
  units: Unit[]
  agents: User[]
  onSaved: () => void
}) {
  const { t: tr } = useT()
  const [other, setOther] = useState<Other>(toOther(appt))
  const [date, setDate] = useState<Date | undefined>(undefined)
  const [time, setTime] = useState('10:00')
  const [duration, setDuration] = useState('60')
  const [datePickerOpen, setDatePickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setOther(toOther(appt))
    const w = deriveWhen(appt, presetStart)
    setDate(w.date); setTime(w.time); setDuration(w.duration)
  }, [open, appt, presetStart])

  const set = (k: keyof Other, v: string | null) => setOther((o) => ({ ...o, [k]: v ?? '' }))

  // Make sure the saved time always appears as an option, even if off the 15-min grid.
  const timeOptions = useMemo(() => (TIME_SLOTS.includes(time) ? TIME_SLOTS : [time, ...TIME_SLOTS]), [time])
  const durationOptions = useMemo(
    () => (DURATIONS.some(([v]) => v === duration) ? DURATIONS : [[duration, `${duration} min`] as [string, string], ...DURATIONS]),
    [duration],
  )

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!date) { toast.error(tr('Pick a date for the showing')); return }
    setBusy(true)
    const [hh, mm] = time.split(':').map(Number)
    const start = new Date(date); start.setHours(hh, mm, 0, 0)
    const start_at = start.toISOString()
    const end_at = duration === 'none' ? '' : new Date(start.getTime() + Number(duration) * 60000).toISOString()
    const body = {
      title: other.title,
      unit_id: other.unit_id === NONE ? '' : other.unit_id,
      start_at, end_at,
      client_name: other.client_name, client_phone: other.client_phone, client_email: other.client_email,
      agent_id: other.agent_id === NONE ? '' : other.agent_id,
      status: other.status, notes: other.notes,
    }
    try {
      if (appt) await api.put(`/api/appointments/${appt.id}`, body)
      else await api.post('/api/appointments', body)
      toast.success(tr('Showing saved'))
      onOpenChange(false); onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr('Save failed'))
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!appt || !confirm(tr('Delete this showing?'))) return
    try { await api.del(`/api/appointments/${appt.id}`); toast.success(tr('Showing deleted')); onOpenChange(false); onSaved() }
    catch (err) { toast.error(err instanceof Error ? err.message : tr('Delete failed')) }
  }

  function quick(daysAhead: number) {
    const d = new Date(); d.setDate(d.getDate() + daysAhead); d.setHours(0, 0, 0, 0)
    setDate(d)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{appt ? tr('Edit showing') : tr('New showing')}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tr('Title')}</Label>
            <Input value={other.title} onChange={(e) => set('title', e.target.value)} placeholder={tr('Showing — Suite 304')} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tr('Unit')}</Label>
            <Select value={other.unit_id} onValueChange={(v) => set('unit_id', v)}>
              <SelectTrigger><SelectValue>{(v: any) => (!v || v === NONE ? tr('— No unit —') : (units.find((u) => String(u.id) === String(v))?.title ?? String(v)))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{tr('— No unit —')}</SelectItem>
                {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.title}{u.unit_code ? ` (${u.unit_code})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* When — easy date + time + duration */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tr('When *')}</Label>
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger className={cn(buttonVariants({ variant: 'outline' }), 'w-full justify-start font-normal', !date && 'text-muted-foreground')}>
                📅 {date ? dateLabel(date) : tr('Pick a date')}
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} defaultMonth={date}
                  onSelect={(d) => { setDate(d); setDatePickerOpen(false) }} />
              </PopoverContent>
            </Popover>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => quick(0)}>{tr('Today')}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => quick(1)}>{tr('Tomorrow')}</Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => quick(7)}>{tr('Next week')}</Button>
            </div>
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{tr('Time')}</Label>
                <Select value={time} onValueChange={(v) => v && setTime(v)}>
                  <SelectTrigger><SelectValue>{(v: any) => (v ? timeLabel(String(v)) : '')}</SelectValue></SelectTrigger>
                  <SelectContent className="max-h-64">
                    {timeOptions.map((s) => <SelectItem key={s} value={s}>{timeLabel(s)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">{tr('Duration')}</Label>
                <Select value={duration} onValueChange={(v) => v && setDuration(v)}>
                  <SelectTrigger><SelectValue>{(v: any) => tr(durationOptions.find(([dv]) => dv === String(v))?.[1] ?? String(v))}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {durationOptions.map(([v, l]) => <SelectItem key={v} value={v}>{tr(l)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr('Client name')}</Label>
              <Input value={other.client_name} onChange={(e) => set('client_name', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr('Client phone')}</Label>
              <Input value={other.client_phone} onChange={(e) => set('client_phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr('Client email')}</Label>
              <Input type="email" value={other.client_email} onChange={(e) => set('client_email', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">{tr('Assigned agent')}</Label>
              <Select value={other.agent_id} onValueChange={(v) => set('agent_id', v)}>
                <SelectTrigger><SelectValue>{(v: any) => (!v || v === NONE ? tr('— Unassigned —') : (agents.find((a) => String(a.id) === String(v))?.name || agents.find((a) => String(a.id) === String(v))?.email || String(v)))}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{tr('— Unassigned —')}</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tr('Status')}</Label>
            <Select value={other.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger><SelectValue>{(v: any) => tr(({ requested: 'Requested', scheduled: 'Scheduled', done: 'Done', canceled: 'Canceled' } as Record<string, string>)[String(v)] ?? String(v))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="requested">{tr('Requested')}</SelectItem>
                <SelectItem value="scheduled">{tr('Scheduled')}</SelectItem>
                <SelectItem value="done">{tr('Done')}</SelectItem>
                <SelectItem value="canceled">{tr('Canceled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{tr('Notes')}</Label>
            <Textarea rows={2} value={other.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <DialogFooter className="sm:justify-between">
            {appt ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>{tr('Delete')}</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel')}</Button>
              <Button type="submit" disabled={busy}>{busy ? tr('Saving…') : tr('Save showing')}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function toOther(a: Appointment | null): Other {
  return {
    title: a?.title ?? '',
    unit_id: a?.unit_id ? String(a.unit_id) : NONE,
    client_name: a?.client_name ?? '',
    client_phone: a?.client_phone ?? '',
    client_email: a?.client_email ?? '',
    agent_id: a?.agent_id ? String(a.agent_id) : NONE,
    status: a?.status ?? 'scheduled',
    notes: a?.notes ?? '',
  }
}
