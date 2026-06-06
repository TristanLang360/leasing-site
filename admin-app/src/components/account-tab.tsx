import { useState } from 'react'
import { toast } from 'sonner'
import { api, type Me } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export function AccountTab({ me, onChanged }: { me: Me; onChanged: () => void }) {
  // email change
  const [email, setEmail] = useState(me.email)
  const [emailPw, setEmailPw] = useState('')
  const [emailBusy, setEmailBusy] = useState(false)
  // password change
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [pwBusy, setPwBusy] = useState(false)

  async function saveEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailBusy(true)
    try {
      await api.put('/api/me/email', { email, password: emailPw })
      toast.success('Email updated')
      setEmailPw('')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally { setEmailBusy(false) }
  }

  async function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwBusy(true)
    try {
      await api.put('/api/me/password', { current, password })
      toast.success('Password updated')
      setCurrent(''); setPassword('')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed')
    } finally { setPwBusy(false) }
  }

  return (
    <div className="grid max-w-md gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Change my email</CardTitle>
          <CardDescription>This is your login email. You'll confirm with your current password.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={saveEmail} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="emailpw">Confirm with your password</Label>
              <Input id="emailpw" type="password" autoComplete="current-password" required value={emailPw} onChange={(e) => setEmailPw(e.target.value)} />
            </div>
            <Button type="submit" disabled={emailBusy || email.trim() === me.email} className="w-fit">{emailBusy ? 'Updating…' : 'Update email'}</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change my password</CardTitle>
          <CardDescription>Use at least 6 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={savePassword} className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="cur">Current password</Label>
              <Input id="cur" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="new">New password</Label>
              <Input id="new" type="password" autoComplete="new-password" minLength={6} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" disabled={pwBusy} className="w-fit">{pwBusy ? 'Updating…' : 'Update password'}</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
