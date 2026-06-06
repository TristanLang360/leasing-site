import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, type Appointment, type Unit, type User } from '@/lib/api'
import { toLocalInput, fromLocalInput } from '@/lib/format'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NONE = 'none'

type Form = {
  title: string; unit_id: string; start_at: string; end_at: string
  client_name: string; client_phone: string; client_email: string
  agent_id: string; status: string; notes: string
}

function toForm(a: Appointment | null, presetStart?: string): Form {
  return {
    title: a?.title ?? '',
    unit_id: a?.unit_id ? String(a.unit_id) : NONE,
    start_at: toLocalInput(a?.start_at) || (presetStart ?? ''),
    end_at: toLocalInput(a?.end_at),
    client_name: a?.client_name ?? '',
    client_phone: a?.client_phone ?? '',
    client_email: a?.client_email ?? '',
    agent_id: a?.agent_id ? String(a.agent_id) : NONE,
    status: a?.status ?? 'scheduled',
    notes: a?.notes ?? '',
  }
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
  const [form, setForm] = useState<Form>(toForm(appt, presetStart))
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (open) setForm(toForm(appt, presetStart)) }, [open, appt, presetStart])
  const set = (k: keyof Form, v: string | null) => setForm((f) => ({ ...f, [k]: v ?? '' }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    const body = {
      title: form.title,
      unit_id: form.unit_id === NONE ? '' : form.unit_id,
      start_at: fromLocalInput(form.start_at),
      end_at: fromLocalInput(form.end_at),
      client_name: form.client_name, client_phone: form.client_phone, client_email: form.client_email,
      agent_id: form.agent_id === NONE ? '' : form.agent_id,
      status: form.status, notes: form.notes,
    }
    try {
      if (appt) await api.put(`/api/appointments/${appt.id}`, body)
      else await api.post('/api/appointments', body)
      toast.success('Showing saved')
      onOpenChange(false); onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!appt || !confirm('Delete this showing?')) return
    try { await api.del(`/api/appointments/${appt.id}`); toast.success('Showing deleted'); onOpenChange(false); onSaved() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader><DialogTitle>{appt ? 'Edit showing' : 'New showing'}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Title</Label>
            <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Showing — Suite 304" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Unit</Label>
            <Select value={form.unit_id} onValueChange={(v) => set('unit_id', v)}>
              <SelectTrigger><SelectValue placeholder="— No unit —" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>— No unit —</SelectItem>
                {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.title}{u.unit_code ? ` (${u.unit_code})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Start *</Label>
              <Input type="datetime-local" required value={form.start_at} onChange={(e) => set('start_at', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">End</Label>
              <Input type="datetime-local" value={form.end_at} onChange={(e) => set('end_at', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Client name</Label>
              <Input value={form.client_name} onChange={(e) => set('client_name', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Client phone</Label>
              <Input value={form.client_phone} onChange={(e) => set('client_phone', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Client email</Label>
              <Input type="email" value={form.client_email} onChange={(e) => set('client_email', e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Assigned agent</Label>
              <Select value={form.agent_id} onValueChange={(v) => set('agent_id', v)}>
                <SelectTrigger><SelectValue placeholder="— Unassigned —" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Unassigned —</SelectItem>
                  {agents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={form.status} onValueChange={(v) => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="requested">Requested</SelectItem>
                <SelectItem value="scheduled">Scheduled</SelectItem>
                <SelectItem value="done">Done</SelectItem>
                <SelectItem value="canceled">Canceled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>
          <DialogFooter className="sm:justify-between">
            {appt ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save showing'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
