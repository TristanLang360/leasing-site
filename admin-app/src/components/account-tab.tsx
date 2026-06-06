import { useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AccountTab() {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      await api.put('/api/me/password', { current, password })
      toast.success('Password updated')
      setCurrent(''); setPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally { setBusy(false) }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Change my password</CardTitle>
        <CardDescription>Use at least 6 characters.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="cur">Current password</Label>
            <Input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="new">New password</Label>
            <Input id="new" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <Button type="submit" disabled={busy} className="w-fit">{busy ? 'Updating…' : 'Update password'}</Button>
        </form>
      </CardContent>
    </Card>
  )
}
