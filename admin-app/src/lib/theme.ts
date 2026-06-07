// Admin-only theme. Stored under a dedicated key and applied by toggling the
// `.dark` class on <html>; the inline script in index.html applies it pre-paint.
export type Theme = 'light' | 'dark'
const KEY = 'rentalium_theme'

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY)
    if (saved === 'dark' || saved === 'light') return saved
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch { /* ignore */ }
  return 'light'
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark')
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
}
