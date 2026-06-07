import { useEffect, useState } from 'react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Step = { icon: string; title: string; body: React.ReactNode }

const STEPS: Step[] = [
  {
    icon: '👋',
    title: 'Welcome to Rentalium',
    body: (
      <>This quick tour shows how to find units, grab photos, get directions, and work your daily
      posting tasks. It takes about a minute — you can reopen it anytime from the <strong>Guide</strong> button
      at the top.</>
    ),
  },
  {
    icon: '🏠',
    title: 'Browse & search units',
    body: (
      <>The <strong>Units</strong> tab lists every unit with a live map on the left and the list on the
      right. Use the filters to narrow by price, bedrooms, parking, pets, neighborhood and more. Click a
      pin or a card to open the unit.</>
    ),
  },
  {
    icon: '🖼️',
    title: 'Photos & details',
    body: (
      <>Open a unit to see all its details and photos. Hover any photo to <strong>download</strong> it, or
      use <strong>Download all photos (.zip)</strong> to grab the whole set at once — ready to post.</>
    ),
  },
  {
    icon: '🧭',
    title: 'Directions',
    body: (
      <>Every unit has a <strong>Get directions</strong> button. Pick <strong>Google Maps</strong> or
      <strong> Apple Maps</strong> and it opens turn-by-turn directions to the address on your phone or
      computer.</>
    ),
  },
  {
    icon: '📍',
    title: 'Similar units nearby',
    body: (
      <>Inside a unit, scroll to <strong>Similar units nearby</strong> to see comparable listings and
      exactly how far away they are in km. Click one to jump straight to it — handy when a client wants
      options in the same area.</>
    ),
  },
  {
    icon: '🧲',
    title: 'Leads & your pipeline',
    body: (
      <>The <strong>Leads</strong> tab is your CRM. Every showing request from the website lands here as a
      new lead. Drag each lead through the pipeline with <strong>advance →</strong>: New → Visited →
      Credit report sent → Application sent → Rented. Click a lead to edit contact info, budget and notes.</>
    ),
  },
  {
    icon: '📋',
    title: 'Your daily posting tasks',
    body: (
      <>The <strong>My tasks</strong> tab holds the units you’ve been assigned to post, one batch per day
      (Mon–Fri). Open a task, click any unit to see its address, download its photos, and get
      directions — then post it. Two agents are never given the same units.</>
    ),
  },
  {
    icon: '✅',
    title: 'Mark it done',
    body: (
      <>When you finish a task, check it off (or set your progress inside it). Your manager gets notified
      automatically — and you’ll get a little confetti. 🎉 The <strong>Calendar</strong> tab shows your
      showings and task due dates.</>
    ),
  },
]

export function OnboardingTour({ open, onDone }: { open: boolean; onDone: () => void }) {
  const [i, setI] = useState(0)
  useEffect(() => { if (open) setI(0) }, [open])

  const step = STEPS[i]
  const last = i === STEPS.length - 1

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone() }}>
      <DialogContent className="sm:max-w-md">
        <div className="grid place-items-center gap-3 pt-2 text-center">
          <div className="grid size-16 place-items-center rounded-full bg-muted text-3xl">{step.icon}</div>
          <h2 className="text-xl font-semibold tracking-tight">{step.title}</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
        </div>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {STEPS.map((_, idx) => (
            <span key={idx} className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-5 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onDone}>Skip</Button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>Back</Button>}
            {last
              ? <Button size="sm" onClick={onDone}>Get started</Button>
              : <Button size="sm" onClick={() => setI(i + 1)}>Next</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
