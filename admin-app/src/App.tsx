import { useEffect, useState } from 'react'
import { api, cap, type Me } from '@/lib/api'
import { Login } from '@/components/login'
import { UnitsTab } from '@/components/units-tab'
import { CalendarTab } from '@/components/calendar-tab'
import { TasksTab } from '@/components/tasks-tab'
import { CrmTab } from '@/components/crm-tab'
import { BlogTab } from '@/components/blog-tab'
import { NotificationBell } from '@/components/notification-bell'
import { AgentsTab } from '@/components/agents-tab'
import { AccountTab } from '@/components/account-tab'
import { OnboardingTour } from '@/components/onboarding-tour'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Toaster } from '@/components/ui/sonner'

export default function App() {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [tourOpen, setTourOpen] = useState(false)

  useEffect(() => {
    api.get<Me>('/api/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])

  // New agents see the welcome tour exactly once, on first login. We mark it
  // seen the instant it opens (not when dismissed), so it never auto-shows
  // again even if they close the tab mid-tour.
  useEffect(() => {
    if (me && me.role === 'agent' && !me.onboarded) {
      setTourOpen(true)
      api.post('/api/me/onboarded').catch(() => {})
      setMe((m) => (m ? { ...m, onboarded: 1 } : m))
    }
  }, [me])

  // The Guide button reopens the tour manually; closing it just hides it.
  function closeTour() { setTourOpen(false) }

  async function logout() {
    await api.post('/api/logout').catch(() => {})
    setMe(null)
  }

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">Loading…</div>
  }
  if (!me) return <><Login onLogin={setMe} /><Toaster richColors /></>

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="inline-block size-5 rounded-sm bg-foreground" />
            <span className="font-semibold tracking-tight">Rentalium</span>
            <Badge variant="secondary" className="font-normal">admin</Badge>
          </div>
          <div className="flex items-center gap-3">
            <a href="/" className="text-sm text-muted-foreground hover:text-foreground">Public site</a>
            {me.role === 'agent' && (
              <Button variant="ghost" size="sm" onClick={() => setTourOpen(true)}>Guide</Button>
            )}
            <NotificationBell />
            <span className="hidden text-sm text-muted-foreground sm:inline">
              {me.name || me.email} · <span className="capitalize">{me.role}</span>
            </span>
            <Button variant="outline" size="sm" onClick={logout}>Log out</Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-6">
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Admin</p>
          <h1 className="text-3xl font-semibold tracking-tight">Leasing dashboard</h1>
          <p className="text-muted-foreground">Manage units, photos, showings, and your team. Changes are live immediately.</p>
        </div>

        <Tabs defaultValue="units">
          <TabsList>
            <TabsTrigger value="units">Units</TabsTrigger>
            <TabsTrigger value="calendar">Calendar</TabsTrigger>
            {cap.calendar(me.role) && <TabsTrigger value="leads">Leads</TabsTrigger>}
            {cap.calendar(me.role) && <TabsTrigger value="tasks">{cap.manageTasks(me.role) ? 'Tasks' : 'My tasks'}</TabsTrigger>}
            {cap.blog(me.role) && <TabsTrigger value="blog">Blog</TabsTrigger>}
            {cap.manageUsers(me.role) && <TabsTrigger value="agents">Agents</TabsTrigger>}
            <TabsTrigger value="account">My account</TabsTrigger>
          </TabsList>

          <TabsContent value="units" className="mt-6"><UnitsTab me={me} /></TabsContent>
          <TabsContent value="calendar" className="mt-6"><CalendarTab me={me} /></TabsContent>
          {cap.calendar(me.role) && (
            <TabsContent value="leads" className="mt-6"><CrmTab me={me} /></TabsContent>
          )}
          {cap.calendar(me.role) && (
            <TabsContent value="tasks" className="mt-6"><TasksTab me={me} /></TabsContent>
          )}
          {cap.blog(me.role) && (
            <TabsContent value="blog" className="mt-6"><BlogTab me={me} /></TabsContent>
          )}
          {cap.manageUsers(me.role) && (
            <TabsContent value="agents" className="mt-6"><AgentsTab me={me} /></TabsContent>
          )}
          <TabsContent value="account" className="mt-6">
            <AccountTab me={me} onChanged={() => api.get<Me>('/api/me').then(setMe).catch(() => {})} />
          </TabsContent>
        </Tabs>
      </main>

      <OnboardingTour open={tourOpen} onDone={closeTour} />
      <Toaster richColors />
    </div>
  )
}
