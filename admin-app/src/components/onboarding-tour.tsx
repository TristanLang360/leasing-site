import { useEffect, useState } from 'react'
import { useT, type Lang } from '@/lib/i18n'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

type Step = { icon: string; title: string; body: React.ReactNode }

function steps(lang: Lang): Step[] {
  if (lang === 'fr') return [
    { icon: '👋', title: 'Bienvenue sur Rentalium', body: (
      <>Ce court tour vous montre comment trouver des unités, récupérer des photos, obtenir un itinéraire et
      gérer vos tâches de publication quotidiennes. Cela prend environ une minute — vous pouvez le rouvrir à
      tout moment avec le bouton <strong>Guide</strong> en haut.</>) },
    { icon: '🏠', title: 'Parcourir et rechercher des unités', body: (
      <>L’onglet <strong>Unités</strong> liste chaque unité avec une carte à gauche et la liste à droite.
      Utilisez les filtres pour affiner par prix, chambres, stationnement, animaux, quartier et plus. Cliquez
      sur une épingle ou une fiche pour ouvrir l’unité.</>) },
    { icon: '🖼️', title: 'Photos et détails', body: (
      <>Ouvrez une unité pour voir tous ses détails et photos. Survolez une photo pour la
      <strong> télécharger</strong>, ou utilisez <strong>Tout télécharger (.zip)</strong> pour récupérer
      l’ensemble d’un coup — prêt à publier.</>) },
    { icon: '🧭', title: 'Itinéraire', body: (
      <>Chaque unité a un bouton <strong>Itinéraire</strong>. Choisissez <strong>Google Maps</strong> ou
      <strong> Apple Maps</strong> et l’itinéraire vers l’adresse s’ouvre, étape par étape.</>) },
    { icon: '📍', title: 'Unités similaires à proximité', body: (
      <>Dans une unité, descendez jusqu’à <strong>Unités similaires à proximité</strong> pour voir des annonces
      comparables et leur distance exacte en km. Cliquez sur l’une d’elles pour y accéder directement.</>) },
    { icon: '🧲', title: 'Prospects et votre pipeline', body: (
      <>L’onglet <strong>Prospects</strong> est votre CRM. Chaque demande de visite du site Web arrive ici comme
      un nouveau prospect. Faites avancer chaque prospect dans le pipeline avec <strong>avancer →</strong> :
      Nouveau → Visité → Dossier de crédit envoyé → Demande envoyée → Loué. Cliquez sur un prospect pour
      modifier ses coordonnées, son budget et ses notes.</>) },
    { icon: '📋', title: 'Vos tâches de publication', body: (
      <>L’onglet <strong>Mes tâches</strong> contient les unités à publier, un lot par jour (lun.–ven.). Ouvrez
      une tâche, cliquez sur une unité pour voir son adresse, télécharger ses photos et obtenir l’itinéraire —
      puis publiez-la. Deux agents n’ont jamais les mêmes unités.</>) },
    { icon: '✅', title: 'Marquer comme terminé', body: (
      <>Quand vous terminez une tâche, cochez-la (ou indiquez votre progression à l’intérieur). Votre
      gestionnaire est averti automatiquement — et vous aurez droit à des confettis. 🎉 L’onglet
      <strong> Calendrier</strong> affiche vos visites et les échéances de tâches.</>) },
  ]
  return [
    { icon: '👋', title: 'Welcome to Rentalium', body: (
      <>This quick tour shows how to find units, grab photos, get directions, and work your daily
      posting tasks. It takes about a minute — you can reopen it anytime from the <strong>Guide</strong> button
      at the top.</>) },
    { icon: '🏠', title: 'Browse & search units', body: (
      <>The <strong>Units</strong> tab lists every unit with a live map on the left and the list on the
      right. Use the filters to narrow by price, bedrooms, parking, pets, neighborhood and more. Click a
      pin or a card to open the unit.</>) },
    { icon: '🖼️', title: 'Photos & details', body: (
      <>Open a unit to see all its details and photos. Hover any photo to <strong>download</strong> it, or
      use <strong>Download all photos (.zip)</strong> to grab the whole set at once — ready to post.</>) },
    { icon: '🧭', title: 'Directions', body: (
      <>Every unit has a <strong>Get directions</strong> button. Pick <strong>Google Maps</strong> or
      <strong> Apple Maps</strong> and it opens turn-by-turn directions to the address on your phone or
      computer.</>) },
    { icon: '📍', title: 'Similar units nearby', body: (
      <>Inside a unit, scroll to <strong>Similar units nearby</strong> to see comparable listings and
      exactly how far away they are in km. Click one to jump straight to it — handy when a client wants
      options in the same area.</>) },
    { icon: '🧲', title: 'Leads & your pipeline', body: (
      <>The <strong>Leads</strong> tab is your CRM. Every showing request from the website lands here as a
      new lead. Drag each lead through the pipeline with <strong>advance →</strong>: New → Visited →
      Credit report sent → Application sent → Rented. Click a lead to edit contact info, budget and notes.</>) },
    { icon: '📋', title: 'Your daily posting tasks', body: (
      <>The <strong>My tasks</strong> tab holds the units you’ve been assigned to post, one batch per day
      (Mon–Fri). Open a task, click any unit to see its address, download its photos, and get
      directions — then post it. Two agents are never given the same units.</>) },
    { icon: '✅', title: 'Mark it done', body: (
      <>When you finish a task, check it off (or set your progress inside it). Your manager gets notified
      automatically — and you’ll get a little confetti. 🎉 The <strong>Calendar</strong> tab shows your
      showings and task due dates.</>) },
  ]
}

export function OnboardingTour({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t, lang } = useT()
  const STEPS = steps(lang)
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
          <Button variant="ghost" size="sm" onClick={onDone}>{t('Skip')}</Button>
          <div className="flex gap-2">
            {i > 0 && <Button variant="outline" size="sm" onClick={() => setI(i - 1)}>{t('Back')}</Button>}
            {last
              ? <Button size="sm" onClick={onDone}>{t('Get started')}</Button>
              : <Button size="sm" onClick={() => setI(i + 1)}>{t('Next')}</Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
