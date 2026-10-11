import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, cap, LEAD_STAGES, type Lead, type LeadStage, type Me, type Unit, type User } from '@/lib/api'
import { fmtPrice } from '@/lib/format'
import { useT } from '@/lib/i18n'
import { Home } from 'lucide-react'
import { LeadDialog } from '@/components/lead-dialog'
import { Button } from '@/components/ui/button'

const STAGE_INDEX: Record<string, number> = Object.fromEntries(LEAD_STAGES.map((s, i) => [s.value, i]))

export function CrmTab({ me }: { me: Me }) {
  const { t } = useT()
  const [leads, setLeads] = useState<Lead[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [agents, setAgents] = useState<User[]>([])
  const [editing, setEditing] = useState<Lead | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try { setLeads(await api.get<Lead[]>('/api/leads')) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load leads')) }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])
  useEffect(() => {
    api.get<Unit[]>('/api/units?all=1').then(setUnits).catch(() => setUnits([]))
    if (cap.manageUsers(me.role)) api.get<User[]>('/api/users').then(setAgents).catch(() => setAgents([]))
    else setAgents([{ id: me.id, email: me.email, name: me.name, role: me.role, active: 1, created_at: '' }])
  }, [me])

  async function move(lead: Lead, dir: -1 | 1) {
    const next = LEAD_STAGES[STAGE_INDEX[lead.stage] + dir]
    if (!next) return
    setLeads((ls) => ls.map((l) => (l.id === lead.id ? { ...l, stage: next.value } : l))) // optimistic
    try { await api.put(`/api/leads/${lead.id}`, { stage: next.value }) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Move failed')); load() }
  }

  const byStage = (s: LeadStage) => leads.filter((l) => l.stage === s)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? t('Loading…') : `${leads.length} ${leads.length === 1 ? t('lead in the pipeline') : t('leads in the pipeline')}`}
        </span>
        <Button size="sm" onClick={() => setEditing(null)}>{t('+ Add lead')}</Button>
      </div>

      {/* Kanban board — scrolls horizontally on small screens */}
      <div className="-mx-1 grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-3 overflow-x-auto px-1 pb-2">
        {LEAD_STAGES.map((stage) => {
          const items = byStage(stage.value)
          return (
            <div key={stage.value} className="flex min-w-0 flex-col gap-2">
              <div className="flex items-center gap-2 px-1">
                <span className={`size-2.5 rounded-full ${stage.accent}`} />
                <span className="text-sm font-medium">{t(stage.label)}</span>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="flex min-h-16 flex-col gap-2 rounded-lg bg-muted/40 p-2">
                {items.length === 0 ? (
                  <div className="px-2 py-6 text-center text-xs text-muted-foreground/70">{t('No leads')}</div>
                ) : (
                  items.map((l) => (
                    <LeadCard key={l.id} lead={l} onOpen={() => setEditing(l)} onMove={move} />
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <LeadDialog
        me={me}
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        lead={editing ?? null}
        units={units}
        agents={agents}
        onSaved={load}
      />
    </div>
  )
}

function LeadCard({ lead, onOpen, onMove }: { lead: Lead; onOpen: () => void; onMove: (l: Lead, dir: -1 | 1) => void }) {
  const { t } = useT()
  const idx = STAGE_INDEX[lead.stage]
  const contact = [lead.email, lead.phone].filter(Boolean).join(' · ')
  return (
    <div className="rounded-md border bg-card p-2.5 shadow-sm">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="truncate text-sm font-medium">{lead.name}</div>
        {contact && <div className="truncate text-xs text-muted-foreground">{contact}</div>}
        {lead.unit && <div className="mt-1 flex items-center gap-1 truncate text-xs text-foreground/70"><Home className="size-3 shrink-0" />{lead.unit.title}</div>}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {lead.budget != null && <span>{fmtPrice(lead.budget)}</span>}
          {lead.agent && <span>· {lead.agent.name || lead.agent.email}</span>}
          {lead.source === 'website' && <span className="rounded bg-sky-100 px-1.5 text-[10px] font-medium text-sky-700">{t('web')}</span>}
        </div>
      </button>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => onMove(lead, -1)} disabled={idx === 0}
          className="rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-muted disabled:opacity-30" title={t('Move back')}>{t('← back')}</button>
        <button type="button" onClick={() => onMove(lead, 1)} disabled={idx === LEAD_STAGES.length - 1}
          className="rounded px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-muted disabled:opacity-30" title={t('Move forward')}>{t('advance →')}</button>
      </div>
    </div>
  )
}
