import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface AgentScreening {
  id: number
  name: string
  email: string | null
  phone: string | null
  availability: string | null
  start_date: string | null
  commission_exp: string | null
  duties_ok: string | null
  motivation: string | null
  languages: string | null
  response_time: string | null
  tech_comfort: string | null
  smartphone: string | null
  scenario: string | null
  transport: string | null
  extra: string | null
  created_at: string
}

const FIELDS: [keyof AgentScreening, string][] = [
  ['availability', 'Availability (evenings/weekends)'],
  ['start_date', 'Can start'],
  ['commission_exp', 'Comfortable with commission-only'],
  ['duties_ok', 'Comfortable with photos/posting/visits'],
  ['motivation', 'Motivation'],
  ['languages', 'Languages spoken'],
  ['response_time', 'Typical message response time'],
  ['tech_comfort', 'Tech comfort level'],
  ['smartphone', 'Has smartphone for work'],
  ['scenario', 'Scenario answer'],
  ['transport', 'Transportation'],
  ['extra', 'Additional info'],
]

export function ScreeningsTab() {
  const { t } = useT()
  const [items, setItems] = useState<AgentScreening[]>([])
  const [detail, setDetail] = useState<AgentScreening | null>(null)

  async function load() {
    try { setItems(await api.get<AgentScreening[]>('/api/agent-screenings')) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load screenings')) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <span className="text-sm text-muted-foreground">{items.length} {t('submission(s)')}</span>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('No screening submissions yet.')}
        </div>
      )}

      <div className="grid gap-2">
        {items.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
              {s.name.slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1 grid gap-1">
              <span className="font-medium">{s.name}</span>
              <div className="text-sm text-muted-foreground">
                {s.email}{s.phone ? ` · ${s.phone}` : ''}
              </div>
              {s.scenario && <p className="mt-1 text-sm text-foreground/80 line-clamp-2">{s.scenario}</p>}
              <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleDateString()}</div>
            </div>

            <div className="flex shrink-0 sm:items-end">
              <Button variant="outline" size="sm" onClick={() => setDetail(s)}>{t('View')}</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid gap-3 text-sm">
              <div><span className="text-muted-foreground">{t('Email')}: </span>{detail.email || '—'}</div>
              <div><span className="text-muted-foreground">{t('Phone')}: </span>{detail.phone || '—'}</div>
              {FIELDS.map(([key, label]) => (
                <div key={key}>
                  <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</div>
                  <div className="whitespace-pre-wrap">{(detail[key] as string) || '—'}</div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
