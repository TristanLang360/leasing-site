import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import { toast } from 'sonner'
import { api, type Me, type Post } from '@/lib/api'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const fmtDate = (p: Post) => {
  const d = new Date(p.published_at || p.created_at)
  return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function BlogTab({ me }: { me: Me }) {
  void me
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Post | null | undefined>(undefined) // undefined=closed, null=new

  async function load() {
    setLoading(true)
    try { setPosts(await api.get<Post[]>('/api/posts?all=1')) }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Failed to load posts') }
    finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function remove(p: Post) {
    if (!confirm(`Delete "${p.title}"?`)) return
    try { await api.del(`/api/posts/${p.id}`); toast.success('Post deleted'); load() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Delete failed') }
  }

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">
          {loading ? 'Loading…' : `${posts.length} post${posts.length === 1 ? '' : 's'}`}
        </span>
        <Button size="sm" onClick={() => setEditing(null)}>+ New post</Button>
      </div>

      {posts.length === 0 && !loading ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          No posts yet. Click “+ New post” to write your first article.
        </div>
      ) : (
        <div className="grid gap-2">
          {posts.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3">
              <button type="button" onClick={() => setEditing(p)} className="flex min-w-0 flex-1 items-center gap-4 text-left">
                <div className="size-14 shrink-0 overflow-hidden rounded-md bg-muted">
                  {p.cover_url
                    ? <img src={p.cover_url} alt="" className="h-full w-full object-cover" />
                    : <div className="grid h-full w-full place-items-center text-muted-foreground">✎</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <Badge variant={p.status === 'published' ? 'default' : 'secondary'}>{p.status}</Badge>
                  </div>
                  <div className="truncate text-sm text-muted-foreground">/blog/{p.slug}</div>
                  <div className="text-xs text-muted-foreground">{fmtDate(p)}{p.author ? ` · ${p.author.name || p.author.email}` : ''}</div>
                </div>
              </button>
              <div className="flex shrink-0 gap-2">
                {p.status === 'published' && (
                  <Button variant="outline" size="sm" onClick={() => window.open(`/blog/${p.slug}`, '_blank')}>View</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>
                <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(p)}>Delete</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <BlogEditor
        post={editing ?? null}
        open={editing !== undefined}
        onOpenChange={(o) => { if (!o) setEditing(undefined) }}
        onSaved={(saved) => { setEditing(saved); load() }}
        onChanged={load}
      />
    </div>
  )
}

function BlogEditor({
  post, open, onOpenChange, onSaved, onChanged,
}: {
  post: Post | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: (saved: Post) => void
  onChanged: () => void
}) {
  const [title, setTitle] = useState('')
  const [slug, setSlug] = useState('')
  const [excerpt, setExcerpt] = useState('')
  const [body, setBody] = useState('')
  const [status, setStatus] = useState<'draft' | 'published'>('draft')
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(post?.title ?? '')
    setSlug(post?.slug ?? '')
    setExcerpt(post?.excerpt ?? '')
    setBody(post?.body ?? '')
    setStatus(post?.status ?? 'draft')
    setCoverUrl(post?.cover_url ?? null)
  }, [open, post])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { toast.error('Title is required'); return }
    setBusy(true)
    try {
      const payload = { title, slug, excerpt, body, status }
      const saved = post?.id
        ? await api.put<Post>(`/api/posts/${post.id}`, payload)
        : await api.post<Post>('/api/posts', payload)
      toast.success(post?.id ? 'Post saved' : 'Post created')
      onChanged()
      onSaved(saved) // swap to edit mode so a cover can be added
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed')
    } finally { setBusy(false) }
  }

  async function uploadCover(file: File | null) {
    if (!post?.id || !file) return
    const fd = new FormData(); fd.append('cover', file)
    try {
      const { cover_url } = await api.form<{ cover_url: string }>(`/api/posts/${post.id}/cover`, fd)
      setCoverUrl(cover_url); onChanged()
      toast.success('Cover updated')
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Upload failed') }
  }
  async function removeCover() {
    if (!post?.id) return
    try { await api.del(`/api/posts/${post.id}/cover`); setCoverUrl(null); onChanged() }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Remove failed') }
  }

  const previewHtml = marked.parse(body || '_Nothing to preview yet._', { async: false }) as string

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{post ? 'Edit post' : 'New post'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="How much does a leasing agency cost in Montréal?" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Slug (URL)</Label>
              <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="auto from title" />
              <span className="text-xs text-muted-foreground">/blog/{slug || '(auto)'}</span>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => v && setStatus(v as 'draft' | 'published')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (hidden)</SelectItem>
                  <SelectItem value="published">Published (live)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Excerpt (used on cards + meta description)</Label>
            <Textarea rows={2} value={excerpt} onChange={(e) => setExcerpt(e.target.value)} placeholder="One or two sentences summarizing the post." />
          </div>

          {/* Cover image — only after the post exists */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Cover image</Label>
            {post?.id ? (
              <div className="flex items-center gap-3">
                <div className="h-20 w-32 shrink-0 overflow-hidden rounded-md border bg-muted">
                  {coverUrl
                    ? <img src={coverUrl} alt="" className="h-full w-full object-cover" />
                    : <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">No cover</div>}
                </div>
                <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => uploadCover(e.target.files?.[0] ?? null)} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>{coverUrl ? 'Replace' : 'Upload'}</Button>
                {coverUrl && <Button type="button" variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={removeCover}>Remove</Button>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Save the post first, then add a cover image.</p>
            )}
          </div>

          {/* Markdown body + live preview */}
          <div className="grid gap-1.5">
            <Label className="text-xs text-muted-foreground">Body (Markdown)</Label>
            <div className="grid gap-3 lg:grid-cols-2">
              <Textarea rows={16} value={body} onChange={(e) => setBody(e.target.value)} className="font-mono text-sm"
                placeholder={'## A heading\n\nWrite your post in **Markdown**. Use - for lists, [text](url) for links.'} />
              <div className="overflow-auto rounded-md border bg-muted/30 p-4 text-sm [&_a]:text-primary [&_a]:underline [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-4 [&_li]:list-disc [&_p]:mb-2"
                dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button type="submit" disabled={busy}>{busy ? 'Saving…' : post ? 'Save changes' : 'Create post'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
