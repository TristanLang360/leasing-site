import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from 'react'
import {
  Building2, CalendarDays, ClipboardCheck, ExternalLink, FileText, House, ListChecks,
  LogOut, Menu, Moon, Newspaper, Sun, UserCog, UserRound, Users, X,
} from 'lucide-react'
import { api, cap, type Me } from '@/lib/api'
import { applyTheme, getTheme, type Theme } from '@/lib/theme'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Login } from '@/components/login'
import { BuildingsTab } from '@/components/buildings-tab'
import { CalendarTab } from '@/components/calendar-tab'
import { TasksTab } from '@/components/tasks-tab'
import { CrmTab } from '@/components/crm-tab'
import { BlogTab } from '@/components/blog-tab'
import { NotificationBell } from '@/components/notification-bell'
import { AgentsTab } from '@/components/agents-tab'
import { ApplicationsTab } from '@/components/applications-tab'
import { ScreeningsTab } from '@/components/screenings-tab'
import { LandlordsTab } from '@/components/landlords-tab'
import { AccountTab } from '@/components/account-tab'
import { OnboardingTour } from '@/components/onboarding-tour'
import { Button, buttonVariants } from '@/components/ui/button'
import { Toaster } from '@/components/ui/sonner'

const roleLabel = (r: string) => (r === 'master' ? 'master' : r === 'agent' ? 'agent' : 'viewer')

type Section = {
  id: string
  label: string
  description: string
  icon: ComponentType<{ className?: string }>
  group: 'leasing' | 'content' | 'team' | 'account'
  render: () => ReactNode
}

const GROUP_LABELS: Record<Section['group'], string> = {
  leasing: 'Leasing',
  content: 'Content',
  team: 'Team & intake',
  account: 'Account',
}

// The active section lives in the URL hash (#calendar) so refresh and the
// browser back button keep you where you were.
function readHash() { return decodeURIComponent(window.location.hash.replace(/^#\/?/, '')) }

export default function App() {
  const { t, lang, setLang } = useT()
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const [tourOpen, setTourOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() => getTheme())
  const [active, setActive] = useState<string>(() => readHash() || 'units')
  const [navOpen, setNavOpen] = useState(false)

  useEffect(() => { applyTheme(theme) }, [theme])

  useEffect(() => {
    api.get<Me>('/api/me')
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onHash = () => { const h = readHash(); if (h) setActive(h) }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
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

  const sections = useMemo<Section[]>(() => {
    if (!me) return []
    const list: (Section | false)[] = [
      { id: 'units', label: 'Buildings', description: 'Buildings, units, photos and availability.', icon: Building2, group: 'leasing', render: () => <BuildingsTab me={me} /> },
      { id: 'calendar', label: 'Calendar', description: 'Showings and appointments.', icon: CalendarDays, group: 'leasing', render: () => <CalendarTab me={me} /> },
      cap.calendar(me.role) && { id: 'leads', label: 'Leads', description: 'Showing requests and prospects from the website.', icon: Users, group: 'leasing', render: () => <CrmTab me={me} /> },
      cap.calendar(me.role) && { id: 'tasks', label: cap.manageTasks(me.role) ? 'Tasks' : 'My tasks', description: 'Posting assignments and to-dos.', icon: ListChecks, group: 'leasing', render: () => <TasksTab me={me} /> },
      cap.blog(me.role) && { id: 'blog', label: 'Blog', description: 'Articles published on the public site.', icon: Newspaper, group: 'content', render: () => <BlogTab me={me} /> },
      cap.manageUsers(me.role) && { id: 'agents', label: 'Agents', description: 'Team members and their access.', icon: UserCog, group: 'team', render: () => <AgentsTab me={me} /> },
      cap.manageUsers(me.role) && { id: 'applications', label: 'Applications', description: 'People who applied to join as lease agents.', icon: FileText, group: 'team', render: () => <ApplicationsTab /> },
      cap.manageUsers(me.role) && { id: 'screenings', label: 'Screenings', description: 'Agent pre-screening questionnaires.', icon: ClipboardCheck, group: 'team', render: () => <ScreeningsTab /> },
      cap.manageUsers(me.role) && { id: 'landlords', label: 'Landlords', description: 'Units submitted through “List your unit”.', icon: House, group: 'team', render: () => <LandlordsTab /> },
      { id: 'account', label: 'My account', description: 'Your profile and password.', icon: UserRound, group: 'account', render: () => <AccountTab me={me} onChanged={() => api.get<Me>('/api/me').then(setMe).catch(() => {})} /> },
    ]
    return list.filter(Boolean) as Section[]
  }, [me])

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-muted-foreground">{t('Loading…')}</div>
  }
  if (!me) return <><Login onLogin={setMe} /><Toaster richColors /></>

  const current = sections.find((s) => s.id === active) ?? sections[0]
  const go = (id: string) => {
    setActive(id)
    setNavOpen(false)
    if (readHash() !== id) window.history.pushState(null, '', '#' + id)
    window.scrollTo({ top: 0 })
  }
  const groups = (Object.keys(GROUP_LABELS) as Section['group'][])
    .map((g) => ({ g, items: sections.filter((s) => s.group === g && s.group !== 'account') }))
    .filter((x) => x.items.length)
  const initials = (me.name || me.email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')

  const sidebar = (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex h-16 items-center justify-between border-b border-sidebar-border px-5">
        <a href="#units" onClick={(e) => { e.preventDefault(); go('units') }} className="flex items-baseline gap-2">
          <span className="font-['Marcellus',serif] text-lg uppercase tracking-[0.08em]">Rentalium</span>
          <span className="text-xs text-muted-foreground">{t('Admin')}</span>
        </a>
        <Button variant="ghost" size="icon" className="size-8 lg:hidden" aria-label="Close menu" onClick={() => setNavOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label={t('Admin')}>
        {groups.map(({ g, items }) => (
          <div key={g} className="mb-5">
            <p className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{t(GROUP_LABELS[g])}</p>
            <ul className="space-y-0.5">
              {items.map((s) => {
                const Icon = s.icon
                const on = s.id === current.id
                return (
                  <li key={s.id}>
                    <a
                      href={'#' + s.id}
                      onClick={(e) => { e.preventDefault(); go(s.id) }}
                      aria-current={on ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        on
                          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      <span className="truncate">{t(s.label)}</span>
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <a
          href="#account"
          onClick={(e) => { e.preventDefault(); go('account') }}
          className={cn(
            'flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent/60',
            current.id === 'account' && 'bg-sidebar-accent',
          )}
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{initials}</span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{me.name || me.email}</span>
            <span className="block truncate text-xs capitalize text-muted-foreground">{t(roleLabel(me.role))} · {t('My account')}</span>
          </span>
        </a>
        <Button variant="ghost" size="sm" className="mt-1 w-full justify-start gap-3 px-3 text-muted-foreground" onClick={logout}>
          <LogOut className="size-4" /> {t('Log out')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-sidebar-border lg:block">{sidebar}</aside>

      {/* Mobile sidebar (drawer) */}
      {navOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setNavOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-sidebar-border shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="size-9 lg:hidden" aria-label="Menu" onClick={() => setNavOpen(true)}>
            <Menu className="size-5" />
          </Button>
          <nav className="flex min-w-0 flex-1 items-center gap-2 text-sm" aria-label="Breadcrumb">
            <span className="hidden text-muted-foreground sm:inline">{t(GROUP_LABELS[current.group])}</span>
            <span className="hidden text-muted-foreground/50 sm:inline">/</span>
            <span className="truncate font-medium">{t(current.label)}</span>
          </nav>
          <div className="flex items-center gap-1 sm:gap-2">
            {me.role === 'agent' && (
              <Button variant="ghost" size="sm" onClick={() => setTourOpen(true)}>{t('Guide')}</Button>
            )}
            <NotificationBell />
            <Button variant="ghost" size="sm" className="h-8 px-2 font-semibold" aria-label="Language"
              onClick={() => setLang(lang === 'fr' ? 'en' : 'fr')}>
              {lang === 'fr' ? 'EN' : 'FR'}
            </Button>
            <Button variant="ghost" size="icon" className="size-8" aria-label={t('Toggle dark mode')} title={t('Toggle dark mode')}
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            <a href="/" target="_blank" rel="noreferrer" className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'hidden gap-1.5 sm:inline-flex')}>
              <ExternalLink className="size-3.5" /> {t('Public site')}
            </a>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight">{t(current.label)}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t(current.description)}</p>
          </div>
          <div key={current.id}>{current.render()}</div>
        </main>
      </div>

      <OnboardingTour open={tourOpen} onDone={closeTour} />
      <Toaster richColors />
    </div>
  )
}
