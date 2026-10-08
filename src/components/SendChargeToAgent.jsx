import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { isAssignedTo, makeId, namesMatch, logicalToday } from '../utils/helpers'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

// Envoi de la charge d'une équipe à un profil agent (date + avion + consignes).
// Utilisé dans les pages Équipes et Affectation.
export default function SendChargeToAgent({ team, onClose }) {
  const { tasks, assignments, notes, activeProfile } = useApp()
  const [agents, setAgents] = useState(null)
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    profileStore
      .leaderListAgents(activeProfile?.code)
      .then((res) => {
        if (alive) setAgents(res?.ok ? res.agents || [] : [])
      })
      .catch(() => {
        if (alive) setAgents([])
      })
    return () => {
      alive = false
    }
  }, [activeProfile?.code])

  const teamTasks = useMemo(
    () => (tasks || []).filter((t) => isAssignedTo(assignments, t.id, team.id)),
    [tasks, assignments, team.id]
  )

  const aircraft = useMemo(() => {
    const regs = [
      ...new Set(teamTasks.map((t) => t.registration || t.aircraftType).filter(Boolean)),
    ]
    const any = [
      ...new Set((tasks || []).map((t) => t.registration || t.aircraftType).filter(Boolean)),
    ][0]
    return regs[0] || any || activeProfile?.aircraft || ''
  }, [teamTasks, tasks, activeProfile])

  const send = async () => {
    const agent = (agents || []).find((a) => a.id === pick)
    if (!agent) return
    setBusy(true)
    setError('')
    setMsg('')
    try {
      const d = logicalToday()
      const dayName = DAY_NAMES[d.getDay()]
      const dateIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
      const chargeTasks = teamTasks.map((t) => ({
        id: makeId('charge'),
        seq: t.seq,
        description: t.description,
        taskDescription: t.taskDescription,
        taskSteps: t.taskSteps,
        taskType: t.taskType,
        workArea: t.workArea,
        skills: t.skills,
        taskBarcode: t.taskBarcode,
        registration: t.registration,
        scheduledHours: t.scheduledHours,
        mtxStatus: 'ACTV',
      }))
      const consignes = (notes || [])
        .filter(
          (n) =>
            String(n.title || '').startsWith('[C] ') &&
            String(n.title || '').toUpperCase().includes(dayName)
        )
        .map((n) => ({ title: n.title, content: n.content }))
      const res = await profileStore.leaderSendCharge(activeProfile?.code, agent.id, {
        date: dateIso,
        aircraft,
        teamName: team.name,
        consignes,
        tasks: chargeTasks,
      })
      if (res?.error === 'pas_un_agent')
        setError(
          "Ce profil n'a pas le rôle Agent — changez son rôle dans Administration → Profils existants."
        )
      else if (res?.error === 'agent_introuvable')
        setError('Profil agent introuvable (migration SQL exécutée ?).')
      else if (res?.error) setError("Échec de l'envoi.")
      else {
        setMsg(
          `Charge envoyée à ${agent.name} : ${chargeTasks.length} ligne(s) + ${consignes.length} consigne(s).`
        )
        setPick('')
      }
    } catch {
      setError("Échec de l'envoi (migration SQL exécutée ? hors ligne ?).")
    }
    setBusy(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
          <div className="min-w-0">
            <h2 className="font-bold truncate">Envoyer la charge · {team.name}</h2>
            <p className="text-xs text-slate-300">
              {teamTasks.length} tâche(s) ·{' '}
              {logicalToday().toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              · ✈ {aircraft || 'aucun avion'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-300 hover:text-white shrink-0"
            title="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4 overflow-y-auto space-y-2">
          {!aircraft && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Aucune immatriculation trouvée (ni dans la colonne Appareil des tâches, ni sur votre
              profil) : la charge partira sans avion.
            </p>
          )}
          {agents === null && (
            <p className="text-sm text-slate-400">Chargement des agents…</p>
          )}
          {agents && agents.length === 0 && (
            <p className="text-sm text-slate-500">
              Aucun profil agent. L'administrateur doit créer ou valider des profils avec le rôle
              « Agent ».
            </p>
          )}
          {agents && agents.length > 0 && team.members.length === 0 && (
            <p className="text-sm text-slate-500">
              Cette équipe n'a pas de membres : ajoutez des membres puis réessayez.
            </p>
          )}
          {agents &&
            agents.length > 0 &&
            team.members.map((member) => {
              const agent = agents.find((a) => namesMatch(a.name, member))
              const selected = agent && pick === agent.id
              return (
                <button
                  key={member}
                  onClick={() => agent && setPick(agent.id)}
                  disabled={!agent}
                  className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-sm text-left ${
                    selected
                      ? 'border-sky-500 bg-sky-50'
                      : agent
                      ? 'border-slate-200 hover:bg-slate-50'
                      : 'border-slate-100 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <span className="font-medium">{member}</span>
                  <span className="text-xs text-slate-500">
                    {agent ? `agent : ${agent.name}` : 'aucun profil agent correspondant'}
                  </span>
                </button>
              )
            })}
        </div>
        <div className="px-4 pb-4 flex items-center gap-2 flex-wrap">
          <button
            onClick={send}
            disabled={!pick || busy}
            className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Envoi…' : 'Envoyer la charge'}
          </button>
          <button
            onClick={onClose}
            className="text-slate-500 hover:text-slate-800 px-3 py-2 text-sm"
          >
            Fermer
          </button>
          {msg && <span className="text-xs text-emerald-700">{msg}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      </div>
    </div>
  )
}
