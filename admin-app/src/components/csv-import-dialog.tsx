import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { api, type CsvResult } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

const SAMPLE = [
  'unit_code,title,address,neighborhood,beds,baths,sqft,price,available_date,parking,locker,dogs,description',
  'C-101,Bright 1BR,5200 Rue Saint-Denis Montréal,Plateau,1,1,650,1750,2026-07-01,yes,no,contact,Sunny one-bedroom',
  'C-204,Spacious 2BR,1000 Rue de la Montagne Montréal,Downtown,2,1,900,2300,2026-08-01,no,yes,no,Close to metro',
].join('\n')

export function CsvImportDialog({
  open, onOpenChange, onImported,
}: { open: boolean; onOpenChange: (o: boolean) => void; onImported: () => void }) {
  const { t } = useT()
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<CsvResult | null>(null)
  const [busy, setBusy] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function downloadSample() {
    const url = URL.createObjectURL(new Blob([SAMPLE], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url; a.download = 'rentalium-units-sample.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  async function submit() {
    if (!file) return
    setBusy(true); setResult(null)
    const fd = new FormData(); fd.append('file', file)
    try {
      const res = await api.form<CsvResult>('/api/units/import', fd)
      setResult(res)
      onImported()
      toast.success(`${t('Imported')} ${res.imported} ${t('of')} ${res.total} ${t('rows')}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Import failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setFile(null); setResult(null) } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('Import units from CSV')}</DialogTitle>
          <DialogDescription>
            {t('Upload a .csv with a header row. Recognized columns (any order, case-insensitive): title, address, unit_code, neighborhood, beds, baths, sqft, price, available_date, description, parking, locker, dogs, lat, lng. title and address are required.')}
          </DialogDescription>
        </DialogHeader>

        <button onClick={downloadSample} className="w-fit text-sm text-primary hover:underline">{t('↓ Download a sample CSV')}</button>

        <label className="flex cursor-pointer flex-col items-center gap-1 rounded-md border border-dashed px-4 py-8 text-center hover:bg-muted/50">
          <input ref={inputRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          <span className="text-sm font-medium">{t('Click to choose a CSV file')}</span>
          <span className="text-xs text-muted-foreground">{file ? file.name : t('No file selected')}</span>
        </label>

        {result && (
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
            <strong>{t('Imported')} {result.imported} {t('of')} {result.total} {t('rows')}.</strong>
            {result.skipped > 0 && ` ${result.skipped} ${t('skipped.')}`}{' '}
            {t('Addresses are being located on the map in the background.')}
            {result.errors.length > 0 && (
              <ul className="mt-2 list-disc pl-5 text-amber-700">
                {result.errors.map((e, i) => <li key={i}>{t('Row')} {e.row}: {e.error}</li>)}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Close')}</Button>
          <Button onClick={submit} disabled={!file || busy}>{busy ? t('Importing…') : t('Import')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
