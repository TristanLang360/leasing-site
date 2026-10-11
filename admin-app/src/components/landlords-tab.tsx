import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useT } from '@/lib/i18n'
import { fmtDate, fmtMoney } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface LandlordIntake {
  id: number
  full_name: string
  email: string | null
  phone: string | null
  mailing_address: string | null
  role: string | null
  based_in: string | null
  address: string | null
  city: string | null
  postal_code: string | null
  neighborhood: string | null
  property_type: string | null
  size: string | null
  bedrooms: string | null
  bathrooms: string | null
  sqft: string | null
  floor: string | null
  furnished: string | null
  desired_rent: string | null
  open_to_valuation: string | null
  lease_type: string | null
  lease_term: string | null
  lease_start_date: string | null
  rent_due_day: string | null
  occupancy: string | null
  lowest_rent_12mo: string | null
  parking_available: string | null
  parking_count: string | null
  parking_type: string | null
  parking_included: string | null
  parking_fee: string | null
  storage_available: string | null
  storage_included: string | null
  storage_fee: string | null
  appliances_included: string | null
  appliances_deposit: string | null
  appliances_notes: string | null
  heating_included: string | null
  heating_type: string | null
  electricity_included: string | null
  hot_water_included: string | null
  gas_service: string | null
  internet_included: string | null
  other_included: string | null
  smoking_allowed: string | null
  pets_allowed: string | null
  other_restrictions: string | null
  highlights: string | null
  services_interested: string | null
  wants_management: string | null
  notes: string | null
  lang: string | null
  created_at: string
}

// Grouped [key, label] pairs for the detail dialog.
const SECTIONS: { title: string; fields: [keyof LandlordIntake, string][] }[] = [
  {
    title: 'Owner & contact',
    fields: [
      ['phone', 'Phone'],
      ['mailing_address', 'Mailing address'],
      ['role', 'Role'],
      ['based_in', 'Currently based in'],
    ],
  },
  {
    title: 'Property',
    fields: [
      ['address', 'Address'],
      ['city', 'City'],
      ['postal_code', 'Postal code'],
      ['neighborhood', 'Neighbourhood'],
      ['property_type', 'Property type'],
      ['size', 'Size (rooms)'],
      ['bedrooms', 'Bedrooms'],
      ['bathrooms', 'Bathrooms'],
      ['sqft', 'Area (sq ft)'],
      ['floor', 'Floor'],
      ['furnished', 'Furnished'],
    ],
  },
  {
    title: 'Rent & lease term',
    fields: [
      ['desired_rent', 'Desired monthly rent (CAD)'],
      ['open_to_valuation', 'Wants our valuation'],
      ['lease_type', 'Lease type'],
      ['lease_term', 'Desired term'],
      ['lease_start_date', 'Available from'],
      ['rent_due_day', 'Rent due day'],
      ['occupancy', 'Current occupancy'],
      ['lowest_rent_12mo', 'Lowest rent last 12 mo'],
    ],
  },
  {
    title: 'Parking & storage',
    fields: [
      ['parking_available', 'Parking available'],
      ['parking_count', 'Parking spots'],
      ['parking_type', 'Parking type'],
      ['parking_included', 'Parking included/fee'],
      ['parking_fee', 'Parking fee (CAD)'],
      ['storage_available', 'Storage locker'],
      ['storage_included', 'Locker included/fee'],
      ['storage_fee', 'Locker fee (CAD)'],
    ],
  },
  {
    title: 'Appliances',
    fields: [
      ['appliances_included', 'Appliances included'],
      ['appliances_deposit', 'Wants appliance deposit'],
      ['appliances_notes', 'Appliance notes'],
    ],
  },
  {
    title: 'Utilities & heating',
    fields: [
      ['heating_included', 'Heating included'],
      ['heating_type', 'Heating type'],
      ['electricity_included', 'Electricity'],
      ['hot_water_included', 'Hot water included'],
      ['gas_service', 'Gas service'],
      ['internet_included', 'Internet included'],
      ['other_included', 'Other included'],
    ],
  },
  {
    title: 'Rules, marketing & services',
    fields: [
      ['smoking_allowed', 'Smoking allowed'],
      ['pets_allowed', 'Pets allowed'],
      ['other_restrictions', 'Other rules / by-laws'],
      ['highlights', 'Marketing highlights'],
      ['services_interested', 'Services wanted'],
      ['wants_management', 'Wants management'],
      ['notes', 'Additional notes'],
    ],
  },
]

export function LandlordsTab() {
  const { t } = useT()
  const [items, setItems] = useState<LandlordIntake[]>([])
  const [detail, setDetail] = useState<LandlordIntake | null>(null)

  async function load() {
    try { setItems(await api.get<LandlordIntake[]>('/api/landlord-intakes')) }
    catch (err) { toast.error(err instanceof Error ? err.message : t('Failed to load landlord submissions')) }
  }

  useEffect(() => { load() }, [])

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <span className="text-sm text-muted-foreground">{items.length} {items.length === 1 ? t('submission') : t('submissions')}</span>
      </div>

      {items.length === 0 && (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {t('No landlord submissions yet.')}
        </div>
      )}

      <div className="grid gap-2">
        {items.map((s) => (
          <div key={s.id} className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-start">
            <div className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold">
              {s.full_name.slice(0, 1).toUpperCase()}
            </div>

            <div className="min-w-0 flex-1 grid gap-1">
              <span className="font-medium">{s.full_name}</span>
              <div className="text-sm text-muted-foreground">
                {s.email}{s.phone ? ` · ${s.phone}` : ''}
              </div>
              {s.address && <p className="mt-1 text-sm text-foreground/80 line-clamp-1">{s.address}{s.city ? `, ${s.city}` : ''}</p>}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {s.desired_rent && <span className="rounded bg-muted px-1.5 py-0.5">{t('Rent')}: {fmtMoney(s.desired_rent)}</span>}
                {s.property_type && <span className="rounded bg-muted px-1.5 py-0.5">{s.property_type}</span>}
                {s.size && <span className="rounded bg-muted px-1.5 py-0.5">{s.size}</span>}
              </div>
              <div className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</div>
            </div>

            <div className="flex shrink-0 sm:items-end">
              <Button variant="outline" size="sm" onClick={() => setDetail(s)}>{t('View')}</Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{detail?.full_name}</DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="grid gap-4 text-sm">
              <div className="grid gap-1">
                <div><span className="text-muted-foreground">{t('Email')}: </span>{detail.email || '—'}</div>
                {detail.address && <div><span className="text-muted-foreground">{t('Property')}: </span>{detail.address}{detail.city ? `, ${detail.city}` : ''}</div>}
              </div>
              {SECTIONS.map((section) => {
                const rows = section.fields.filter(([key]) => detail[key])
                if (rows.length === 0) return null
                return (
                  <div key={section.title} className="grid gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground border-b pb-1">{t(section.title)}</div>
                    {rows.map(([key, label]) => (
                      <div key={key}>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{t(label)}</div>
                        <div className="whitespace-pre-wrap">{(detail[key] as string) || '—'}</div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
