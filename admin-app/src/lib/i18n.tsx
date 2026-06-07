import { createContext, useContext, useState, type ReactNode } from 'react'

// Lightweight i18n for the admin SPA. English source strings are the keys;
// the French dictionary below provides translations. Any key missing from FR
// falls back to the English source, so the UI never breaks on a gap.
export type Lang = 'en' | 'fr'
const KEY = 'rentalium_lang'

export function getLang(): Lang {
  try {
    const s = localStorage.getItem(KEY)
    if (s === 'en' || s === 'fr') return s
    if (navigator.language?.toLowerCase().startsWith('fr')) return 'fr'
  } catch { /* ignore */ }
  return 'fr' // Montréal leasing agency — French by default
}
function persist(l: Lang) { try { localStorage.setItem(KEY, l) } catch { /* ignore */ } }

// Locale for Intl date/number formatting, derived from the current language.
export const locale = () => (getLang() === 'fr' ? 'fr-CA' : 'en-US')

const FR: Record<string, string> = {
  // ── Shell / nav ──────────────────────────────────────────────
  'Public site': 'Site public',
  'Toggle dark mode': 'Basculer le mode sombre',
  'Guide': 'Guide',
  'Log out': 'Déconnexion',
  'Admin': 'Admin',
  'Leasing dashboard': 'Tableau de bord',
  'Manage units, photos, showings, and your team. Changes are live immediately.':
    'Gérez les unités, photos, visites et votre équipe. Les changements sont appliqués immédiatement.',
  'Units': 'Unités',
  'Calendar': 'Calendrier',
  'Leads': 'Prospects',
  'Tasks': 'Tâches',
  'My tasks': 'Mes tâches',
  'Blog': 'Blogue',
  'Agents': 'Agents',
  'My account': 'Mon compte',
  'Loading…': 'Chargement…',

  // ── Common actions ───────────────────────────────────────────
  'Save': 'Enregistrer',
  'Cancel': 'Annuler',
  'Delete': 'Supprimer',
  'Edit': 'Modifier',
  'Close': 'Fermer',
  'Update': 'Mettre à jour',
  'Saving…': 'Enregistrement…',
  'Create': 'Créer',
  'Add': 'Ajouter',
  'Open': 'Ouvrir',
  'Done': 'Terminé',
  'Back': 'Retour',
  'Next': 'Suivant',
  'Skip': 'Passer',
  'Search': 'Rechercher',
  'Saved': 'Enregistré',
  'Save failed': 'Échec de l’enregistrement',
  'Delete failed': 'Échec de la suppression',
  'Update failed': 'Échec de la mise à jour',

  // ── Login ────────────────────────────────────────────────────
  'Sign in': 'Connexion',
  'Email': 'Courriel',
  'Password': 'Mot de passe',
  'Signing in…': 'Connexion…',
  'Welcome back': 'Bon retour',
  'Sign in to the Rentalium admin.': 'Connectez-vous à l’admin Rentalium.',
  'Invalid email or password.': 'Courriel ou mot de passe invalide.',
  'Staff sign in': 'Connexion du personnel',
  'Lease agents & managers only.': 'Réservé aux agents et gestionnaires.',
  '← Back to public site': '← Retour au site public',
  'Login failed': 'Échec de la connexion',
  'master': 'gestionnaire',
  'agent': 'agent',
  'viewer': 'observateur',

  // ── Lead stages (CRM) ────────────────────────────────────────
  'New': 'Nouveau',
  'Visited': 'Visité',
  'Credit report sent': 'Dossier de crédit envoyé',
  'Application sent': 'Demande envoyée',
  'Rented': 'Loué',
  'Lost': 'Perdu',

  // ── Onboarding tour ──────────────────────────────────────────
  'Get started': 'Commencer',

  // ── CRM tab + lead dialog ────────────────────────────────────
  'Failed to load leads': 'Échec du chargement des prospects',
  'Move failed': 'Échec du déplacement',
  'lead in the pipeline': 'prospect dans le pipeline',
  'leads in the pipeline': 'prospects dans le pipeline',
  '+ Add lead': '+ Ajouter un prospect',
  'web': 'web',
  '← back': '← reculer',
  'advance →': 'avancer →',
  'Move back': 'Reculer',
  'Move forward': 'Avancer',
  'Edit lead': 'Modifier le prospect',
  'New lead': 'Nouveau prospect',
  'Name *': 'Nom *',
  'Lead’s full name': 'Nom complet du prospect',
  'Phone': 'Téléphone',
  'Stage': 'Étape',
  'Assigned agent': 'Agent assigné',
  '— Unassigned —': '— Non assigné —',
  '(me)': '(moi)',
  'Interested unit': 'Unité d’intérêt',
  '— No unit —': '— Aucune unité —',
  'Monthly budget': 'Budget mensuel',
  '$ / month': '$ / mois',
  'Desired move-in': 'Emménagement souhaité',
  'Notes': 'Notes',
  'Anything useful about this lead…': 'Toute information utile sur ce prospect…',
  'Give the lead a name': 'Donnez un nom au prospect',
  'Lead saved': 'Prospect enregistré',
  'Lead deleted': 'Prospect supprimé',
  'Delete this lead?': 'Supprimer ce prospect ?',
  'Save lead': 'Enregistrer le prospect',
  'Create lead': 'Créer le prospect',

  // ── Tasks ────────────────────────────────────────────────────
  'No due date': 'Aucune échéance',
  'units to post': 'unités à publier',
  'To do': 'À faire',
  'In progress': 'En cours',
  'Failed to load tasks': 'Échec du chargement des tâches',
  '🎉 Task complete!': '🎉 Tâche terminée !',
  'open': 'ouvertes',
  'done': 'terminées',
  'No tasks assigned to you. 🎉': 'Aucune tâche ne vous est assignée. 🎉',
  'Completed': 'Terminées',
  '← All agents': '← Tous les agents',
  'active': 'actives',
  '+ Assign task': '+ Assigner une tâche',
  'No tasks for this agent yet. Click “+ Assign task”.': 'Aucune tâche pour cet agent. Cliquez sur « + Assigner une tâche ».',
  'agents': 'agents',
  '+ New task': '+ Nouvelle tâche',
  'Posting rotation': 'Rotation de publication',
  'cycle': 'cycle',
  'units assigned this round': 'unités assignées ce tour',
  'left': 'restantes',
  'The next task restarts the rotation.': 'La prochaine tâche relance la rotation.',
  'No agents yet. Add agents in the Agents tab, then assign them tasks here.':
    'Aucun agent pour l’instant. Ajoutez des agents dans l’onglet Agents, puis assignez-leur des tâches ici.',
  'disabled': 'désactivé',
  'no active tasks': 'aucune tâche active',

  // ── Task dialog ──────────────────────────────────────────────
  'Task': 'Tâche',
  'New task': 'Nouvelle tâche',
  'Edit task': 'Modifier la tâche',
  'Quick start': 'Démarrage rapide',
  '📢 Post — Facebook Marketplace (1 unit/day, Mon–Fri)': '📢 Publication — Facebook Marketplace (1 unité/jour, lun.–ven.)',
  'Title *': 'Titre *',
  'Post on Facebook Marketplace': 'Publier sur Facebook Marketplace',
  'Instructions': 'Instructions',
  'What to do, where to post, any notes…': 'Quoi faire, où publier, notes…',
  'Assign to *': 'Assigner à *',
  '— Pick an agent —': '— Choisir un agent —',
  'Status': 'Statut',
  'Assign next week’s posting (Mon–Fri rotation)': 'Assigner les publications de la semaine prochaine (rotation lun.–ven.)',
  'Units per day': 'Unités par jour',
  'Creates 5 daily tasks (Mon–Fri next week),': 'Crée 5 tâches quotidiennes (lun.–ven. la semaine prochaine),',
  'units each — pulled from the rotation, never the same units another agent has.':
    'unités chacune — tirées de la rotation, jamais les mêmes unités qu’un autre agent.',
  'Units to post': 'Unités à publier',
  'Unit (optional)': 'Unité (facultatif)',
  'Due date (optional)': 'Date d’échéance (facultatif)',
  'Clear': 'Effacer',
  'Due': 'Échéance',
  '⬇ Download photos (.zip)': '⬇ Télécharger les photos (.zip)',
  'Open listing': 'Ouvrir l’annonce',
  'My progress': 'Ma progression',
  'Assign week': 'Assigner la semaine',
  'Save task': 'Enregistrer la tâche',
  'Create task': 'Créer la tâche',
  'Give the task a title': 'Donnez un titre à la tâche',
  'Assign the task to an agent': 'Assignez la tâche à un agent',
  'Task saved': 'Tâche enregistrée',
  'Task deleted': 'Tâche supprimée',
  'Delete this task?': 'Supprimer cette tâche ?',
  'Download all photos': 'Télécharger toutes les photos',
  'Details': 'Détails',
  // END_FR
}

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string }
const LangContext = createContext<Ctx>({ lang: 'en', setLang: () => {}, t: (s) => s })

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => getLang())
  const setLang = (l: Lang) => { persist(l); setLangState(l) }
  const t = (s: string) => (lang === 'fr' ? (FR[s] ?? s) : s)
  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useT() { return useContext(LangContext) }
