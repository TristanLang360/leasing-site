import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, LEAD_STAGES, type Lead, type Me, type Unit, type User } from '@/lib/api'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const NONE = 'none'

export function LeadDialog({
  me, lead, open, onOpenChange, units, agents, onSaved,
}: {
  me: Me
  lead: Lead | null
  open: boolean
  onOpenChange: (o: boolean) => void
  units: Unit[]
  agents: User[]
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [unitId, setUnitId] = useState(NONE)
  const [agentId, setAgentId] = useState(NONE)
  const [stage, setStage] = useState('new')
  const [budget, setBudget] = useState('')
  const [moveIn, setMoveIn] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(lead?.name ?? '')
    setEmail(lead?.email ?? '')
    setPhone(lead?.phone ?? '')
    setUnitId(lead?.unit_id ? String(lead.unit_id) : NONE)
    setAgentId(lead?.agent_id ? String(lead.agent_id) : NONE)
    setStage(lead?.stage ?? 'new')
    setBudget(lead?.budget != null ? String(lead.budget) : '')
    setMoveIn(lead?.move_in ?? '')
    setNotes(lead?.notes ?? '')
  }, [open, lead])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { toast.error('Give the lead a name'); return }
    setBusy(true)
    const body = {
      name, email, phone,
      unit_id: unitId === NONE ? '' : unitId,
      agent_id: agentId === NONE ? '' : agentId,
      stage, budget, move_in: moveIn, notes,
    }
    try {
      if (lead) await api.put(`/api/leads/${lead.id}`, body)
      else await api.post('/api/leads', body)
      toast.success('Lead saved')
      onOpenChange(false); onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!lead || !confirm('Delete this lead?')) return
    try { await api.del(`/api/leads/${lead.id}`); toast.success('Lead deleted'); onOpenChange(false); onSaved() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  const pickAgents = agents.filter((a) => a.role !== 'master')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lead ? 'Edit lead' : 'New lead'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lead’s full name" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Stage</Label>
              <Select value={stage} onValueChange={(v) => v && setStage(v)}>
                <SelectTrigger><SelectValue>{(v: any) => LEAD_STAGES.find((s) => s.value === String(v))?.label ?? String(v)}</SelectValue></SelectTrigger>
                <SelectContent>
                  {LEAD_STAGES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Assigned agent</Label>
              <Select value={agentId} onValueChange={(v) => v && setAgentId(v)}>
                <SelectTrigger><SelectValue>{(v: any) => (v === NONE || !v ? '— Unassigned —' : (agents.find((a) => String(a.id) === String(v))?.name || agents.find((a) => String(a.id) === String(v))?.email || String(v)))}</SelectValue></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>— Unassigned —</SelectItem>
                  {!cap.manageUsers(me.role) && <SelectItem value={String(me.id)}>{me.name || me.email} (me)</SelectItem>}
                  {pickAgents.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name || a.email}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Interested unit</Label>
            <Select value={unitId} onValueChange={(v) => v && setUnitId(v)}>
              <SelectTrigger><SelectValue>{(v: any) => (v === NONE || !v ? '— No unit —' : (units.find((u) => String(u.id) === String(v))?.title ?? String(v)))}</SelectValue></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value={NONE}>— No unit —</SelectItem>
                {units.map((u) => <SelectItem key={u.id} value={String(u.id)}>{u.title}{u.unit_code ? ` (${u.unit_code})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Monthly budget</Label>
              <Input type="number" min="0" step="50" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="$ / month" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Desired move-in</Label>
              <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything useful about this lead…" />
          </div>

          <DialogFooter className="sm:justify-between">
            {lead ? <Button type="button" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>Delete</Button> : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={busy}>{busy ? 'Saving…' : lead ? 'Save lead' : 'Create lead'}</Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
