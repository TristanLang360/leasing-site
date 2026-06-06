import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api, type Me, type Role, type User } from '@/lib/api'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function AgentsTab({ me }: { me: Me }) {
  const [users, setUsers] = useState<User[]>([])
  const [editing, setEditing] = useState<User | null | undefined>(undefined)

  async function load() {
    try { setUsers(await api.get<User[]>('/api/users')) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load team') }
  }
  useEffect(() => { load() }, [])

  async function remove(u: User) {
    if (!confirm(`Remove ${u.name || u.email}?`)) return
    try { await api.del(`/api/users/${u.id}`); toast.success('Removed'); load() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{users.length} team member{users.length === 1 ? '' : 's'}</span>
        <Button size="sm" onClick={() => setEditing(null)}>+ Add agent</Button>
      </div>

      <div className="grid gap-2 rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground sm:grid-cols-3">
        <span><strong>Master</strong> — full control + team</span>
        <span><strong>Agent</strong> — units, photos, calendar</span>
        <span><strong>Viewer</strong> — read-only + downloads</span>
      </div>

      <div className="grid gap-2">
        {users.map((u) => (
          <div key={u.id} className="flex items-center gap-4 rounded-lg border bg-card p-3">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
              {(u.name || u.email).slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{u.name || u.email}</span>
                <Badge variant="secondary" className="capitalize">{u.role}</Badge>
                {!u.active && <Badge variant="outline">disabled</Badge>}
                {u.id === me.id && <span className="text-xs text-muted-foreground">you</span>}
              </div>
              <div className="truncate text-sm text-muted-foreground">{u.email}</div>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditing(u)}>Edit</Button>
              {u.id !== me.id && <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(u)}>Delete</Button>}
            </div>
          </div>
        ))}
      </div>

      <UserDialog
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        user={editing ?? null}
        onSaved={load}
      />
    </div>
  )
}

function UserDialog({
  open, onOpenChange, user, onSaved,
}: { open: boolean; onOpenChange: (o: boolean) => void; user: User | null; onSaved: () => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('agent')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setEmail(user?.email ?? ''); setName(user?.name ?? '')
    setRole(user?.role ?? 'agent'); setActive(user ? !!user.active : true); setPassword('')
  }, [open, user])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (user) await api.put(`/api/users/${user.id}`, { name, role, active, password: password || undefined })
      else await api.post('/api/users', { email, name, role, password })
      toast.success('Saved')
      onOpenChange(false); onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>{user ? 'Edit team member' : 'Add agent'}</DialogTitle></DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Email *</Label>
            <Input type="email" required disabled={!!user} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="agent@rentalium.com" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Role</Label>
            <Select value={role} onValueChange={(v) => v && setRole(v as Role)}>
              <SelectTrigger><SelectValue>{(v: any) => (({ master: 'Master', agent: 'Agent', viewer: 'Viewer' } as Record<string, string>)[String(v)] ?? String(v))}</SelectValue></SelectTrigger>
              <SelectContent>
                <SelectItem value="agent">Agent</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="master">Master</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">{user ? 'New password (leave blank to keep)' : 'Password *'}</Label>
            <Input type="password" autoComplete="new-password" required={!user} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters" />
          </div>
          {user && (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={active} onCheckedChange={(v) => setActive(!!v)} /> Account active
            </label>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
