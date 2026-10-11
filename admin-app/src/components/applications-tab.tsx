import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Download } from 'lucide-react'
import { fmtDate } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

// Download the CV via fetch so a missing file shows a notice instead of a raw
// JSON page (CVs uploaded before the Supabase move were not recovered).
async function downloadCv(url: string) {
  try {
    const r = await fetch(url, { credentials: 'same-origin' })
    if (!r.ok) {
      const j = await r.json().catch(() => ({}))
      toast.error(j.error || 'CV not available.')
      return
    }
    const blob = await r.blob()
    const name = /filename="([^"]+)"/.exec(r.headers.get('Content-Disposition') || '')?.[1] || 'cv'
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
  } catch {
    toast.error('Download failed. Please try again.')
  }
}

interface AgentApplication {
  id: number
  name: string
  email: string
  phone: string | null
  message: string | null
  cv_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'secondary',
  approved: 'default',
  rejected: 'destructive',
}

export function ApplicationsTab() {
  const { t } = useT()
  const [apps, setApps] = useState<AgentApplication[]>([])
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all')
  const [tempPassword, setTempPassword] = useState<{ name: string; email: string; password: string } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  async function load() {
    try { setApps(await api.get<AgentApplication[]>('/api/agent-applications')) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load applications')) }
  }

  useEffect(() => { load() }, [])

  async function approve(a: AgentApplication) {
    if (!confirm(`${t('Approve')} ${a.name}?`)) return
    setBusy(a.id)
    try {
      const res = await api.post<{ tempPassword: string }>(`/api/agent-applications/${a.id}/approve`)
      setTempPassword({ name: a.name, email: a.email, password: res.tempPassword })
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Approval failed'))
    } finally { setBusy(null) }
  }

  async function reject(a: AgentApplication) {
    if (!confirm(`${t('Reject')} ${a.name}?`)) return
    setBusy(a.id)
    try {
      await api.post(`/api/agent-applications/${a.id}/reject`)
      toast.success(t('Application rejected'))
      load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Rejection failed'))
    } finally { setBusy(null) }
  }

  const visible = filter === 'all' ? apps : apps.filter((a) => a.status === filter)
  const pendingCount = apps.filter((a) => a.status === 'pending').length

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((f) => (
          <Button
            key={f}
            variant={filter === f ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(f)}
          >
            {t(f.charAt(0).toUpperCase() + f.slice(1))}
            {f === 'pending' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0 text-xs text-white">{pendingCount}</span>
            )}
          </Button>
        ))}
        <span className="ml-auto text-sm text-muted-foreground">{visible.length} {visible.length === 1 ? t('application') : t('applications')}</span>
      </div>

      {visible.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('No applications yet.')}
        </div>
      )}

      <div className="grid gap-2">
        {visible.map((a) => (
          <div key={a.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
              {a.name.slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1 grid gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.name}</span>
                <Badge variant={STATUS_VARIANT[a.status] ?? 'secondary'} className="capitalize">{t(a.status)}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">{a.email}{a.phone ? ` · ${a.phone}` : ''}</div>
              {a.message && (
                <p className="mt-1 text-sm text-foreground/80 line-clamp-3">{a.message}</p>
              )}
              <div className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</div>
            </div>

            <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col sm:items-end">
              {a.cv_url && (
                <Button variant="outline" size="sm" onClick={() => downloadCv(a.cv_url!)}><Download className="size-3.5" /> CV</Button>
              )}
              {a.status === 'pending' && (
                <>
                  <Button size="sm" disabled={busy === a.id} onClick={() => approve(a)}>
                    {busy === a.id ? t('Working…') : t('Approve')}
                  </Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    disabled={busy === a.id} onClick={() => reject(a)}>
                    {t('Reject')}
                  </Button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!tempPassword} onOpenChange={(o) => { if (!o) setTempPassword(null) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('Agent account created')}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 text-sm">
            <p>{t('Share these credentials with the new agent. The password will not be shown again.')}</p>
            <div className="rounded-md border bg-muted/50 p-3 grid gap-1">
              <div><span className="text-muted-foreground">{t('Email')}: </span><strong>{tempPassword?.email}</strong></div>
              <div><span className="text-muted-foreground">{t('Temp password')}: </span>
                <strong className="font-mono tracking-wider">{tempPassword?.password}</strong>
              </div>
            </div>
            <p className="text-muted-foreground text-xs">{t('The agent can change their password in My account after logging in.')}</p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setTempPassword(null)}>{t('Done')}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
