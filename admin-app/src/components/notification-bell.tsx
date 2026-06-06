import { useEffect, useState } from 'react'
import { api, type AppNotification } from '@/lib/api'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

function relTime(iso: string) {
  const d = new Date(iso.includes('T') || iso.includes('Z') ? iso : iso.replace(' ', 'T') + 'Z')
  const s = Math.max(0, (Date.now() - d.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([])
  const [unread, setUnread] = useState(0)

  async function refresh() {
    try {
      const r = await api.get<{ items: AppNotification[]; unread: number }>('/api/notifications')
      setItems(r.items); setUnread(r.unread)
    } catch { /* ignore */ }
  }
  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 30000)
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [])

  async function onOpenChange(open: boolean) {
    if (open && unread > 0) {
      setUnread(0)
      await api.post('/api/notifications/read-all').catch(() => {})
      setItems((prev) => prev.map((n) => ({ ...n, read: 1 })))
    }
  }

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'relative')} aria-label="Notifications">
        <span className="text-base leading-none">🔔</span>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b px-3 py-2 text-sm font-medium">Notifications</div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications yet.</div>
          ) : (
            items.map((n) => (
              <div key={n.id} className={cn('border-b px-3 py-2.5 text-sm last:border-b-0', !n.read && 'bg-muted/40')}>
                <div className="leading-snug">{n.message}</div>
                <div className="mt-0.5 text-xs text-muted-foreground">{relTime(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
