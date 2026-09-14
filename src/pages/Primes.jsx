import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import {
  ClipboardCheck,
  FileSpreadsheet,
  Check,
  X,
  Users,
  UserX,
  UserCheck,
  UserCog,
  Trash2,
  Mail,
} from 'lucide-react'

const CATEGORIES = {
  V034: 'Toilette T1 (V034)',
  V035: 'Toilette T2 (V035)',
}

const FILTERS = [
  { value: 'soumise', label: 'À valider' },
  { value: 'validee', label: 'Validées' },
  { value: 'refusee', label: 'Refusées' },
  { value: '', label: 'Toutes' },
]

// Notifications email : conservées dans le code mais désactivées pour
// le moment (aucun service d'envoi accepté). Passer à true pour
// réafficher la carte « Notifications email ».
const EMAIL_NOTIFICATIONS_ENABLED = true

const catLabel = (code) => CATEGORIES[code] || code || '—'

const primeDay = (d) =>
  d.date_intervention || (d.created_at ? String(d.created_at).slice(0, 10) : '')

const formatDay = (iso) => {
  if (!iso) return '—'
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const formatMonth = (ym) => {
  if (!ym) return '—'
  const [y, m] = ym.split('-')
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  })
  return label.charAt(0).toUpperCase() + label.slice(1)
}

const statutBadge = (s) =>
  s === 'validee'
    ? 'bg-green-100 text-green-800'
    : s === 'refusee'
    ? 'bg-red-100 text-red-800'
    : 'bg-amber-100 text-amber-800'

export default function Primes() {
  const { activeProfile } = useApp()

  const [declarations, setDeclarations] = useState(null)
  const [filter, setFilter] = useState('soumise')
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [pickingId, setPickingId] = useState(null)

  const [agents, setAgents] = useState(null)
  const [agentsError, setAgentsError] = useState('')
  const [agentBusy, setAgentBusy] = useState(null)
  const [managersList, setManagersList] = useState(null)
  const [assignId, setAssignId] = useState(null)
  const [assignValue, setAssignValue] = useState('')

  const [notifyEmail, setNotifyEmail] = useState('')
  const [notifyServiceId, setNotifyServiceId] = useState('')
  const [notifyTemplateId, setNotifyTemplateId] = useState('')
  const [notifyPublicKey, setNotifyPublicKey] = useState('')
  const [notifyPrivateKey, setNotifyPrivateKey] = useState('')
  const [notifyConfigured, setNotifyConfigured] = useState(false)
  const [notifyMsg, setNotifyMsg] = useState('')
  const [notifyError, setNotifyError] = useState('')
  const [notifyBusy, setNotifyBusy] = useState(false)

  const loadPrimes = async () => {
    if (!activeProfile?.code) return
    try {
      const res = await profileStore.adminListDeclarations(activeProfile.code, filter)
      if (res?.error) setError('Impossible de charger les demandes.')
      else setDeclarations(res.declarations || [])
    } catch {
      setError('Impossible de charger les demandes.')
    }
  }

  const loadAgents = async () => {
    if (!activeProfile?.code) return
    try {
      const res = await profileStore.adminListAgents(activeProfile.code)
      if (res?.error) setAgentsError('Impossible de charger les comptes agents.')
      else setAgents(res.agents || [])
    } catch {
      setAgentsError('Impossible de charger les comptes agents.')
    }
  }

  useEffect(() => {
    if (!activeProfile?.code) return
    profileStore
      .adminListDeclarations(activeProfile.code, filter)
      .then((res) => {
        if (res?.error) setError('Impossible de charger les demandes.')
        else setDeclarations(res.declarations || [])
      })
      .catch(() => setError('Impossible de charger les demandes.'))
  }, [activeProfile, filter])

  useEffect(() => {
    if (!activeProfile?.code) return
    profileStore
      .adminListAgents(activeProfile.code)
      .then((res) => {
        if (res?.error) setAgentsError('Impossible de charger les comptes agents.')
        else setAgents(res.agents || [])
      })
      .catch(() => setAgentsError('Impossible de charger les comptes agents.'))
  }, [activeProfile])

  useEffect(() => {
    profileStore
      .listManagers()
      .then((res) => setManagersList(res?.ok ? res.managers || [] : []))
      .catch(() => setManagersList([]))
  }, [])

  useEffect(() => {
    if (!EMAIL_NOTIFICATIONS_ENABLED || !activeProfile?.code) return
    profileStore
      .adminGetNotifyInfo(activeProfile.code)
      .then((res) => {
        if (res?.ok) {
          setNotifyEmail(res.email || '')
          setNotifyServiceId(res.service_id || '')
          setNotifyTemplateId(res.template_id || '')
          setNotifyPublicKey(res.public_key || '')
          setNotifyConfigured(res.configured === true)
        }
      })
      .catch(() => {})
  }, [activeProfile])

  const refreshNotifyInfo = async () => {
    try {
      const res = await profileStore.adminGetNotifyInfo(activeProfile?.code)
      if (res?.ok) {
        setNotifyServiceId(res.service_id || '')
        setNotifyTemplateId(res.template_id || '')
        setNotifyPublicKey(res.public_key || '')
        setNotifyConfigured(res.configured === true)
      }
    } catch {
      /* silencieux */
    }
  }

  const saveNotifyEmail = async () => {
    setNotifyBusy(true)
    setNotifyMsg('')
    setNotifyError('')
    try {
      const res = await profileStore.adminSetMyEmail(activeProfile?.code, notifyEmail)
      if (res?.error === 'email_invalide') setNotifyError('Adresse email invalide.')
      else if (res?.error) setNotifyError("Échec de l'enregistrement.")
      else {
        setNotifyMsg('Adresse enregistrée.')
        setNotifyEmail(res.email || notifyEmail)
      }
    } catch (err) {
      setNotifyError(`Échec de l'enregistrement : ${err?.message || 'hors ligne ?'}`)
    }
    setNotifyBusy(false)
  }

  const saveNotifyConfig = async () => {
    setNotifyBusy(true)
    setNotifyMsg('')
    setNotifyError('')
    try {
      const res = await profileStore.adminSetNotifyConfig(
        activeProfile?.code,
        notifyServiceId,
        notifyTemplateId,
        notifyPublicKey,
        notifyPrivateKey
      )
      if (res?.error) setNotifyError("Échec de l'enregistrement.")
      else {
        setNotifyMsg('Configuration enregistrée.')
        setNotifyPrivateKey('')
        await refreshNotifyInfo()
      }
    } catch (err) {
      setNotifyError(`Échec de l'enregistrement : ${err?.message || 'hors ligne ?'}`)
    }
    setNotifyBusy(false)
  }

  const sendTestEmail = async () => {
    setNotifyBusy(true)
    setNotifyMsg('')
    setNotifyError('')
    try {
      const res = await profileStore.adminTestEmail(activeProfile?.code)
      if (res?.error === 'email_requis')
        setNotifyError("Renseignez d'abord votre adresse email ci-dessus.")
      else if (res?.error === 'config_manquante')
        setNotifyError("Configuration d'envoi incomplète (clé Brevo + adresse expéditrice).")
      else if (res?.error) setNotifyError("Échec de l'envoi du test.")
      else
        setNotifyMsg('Email de test envoyé — vérifiez votre boîte (et les indésirables).')
    } catch (err) {
      setNotifyError(`Échec de l'envoi du test : ${err?.message || 'hors ligne ?'}`)
    }
    setNotifyBusy(false)
  }

  const afterDecision = () => {
    loadPrimes()
    loadAgents()
    window.dispatchEvent(new Event('primes-updated'))
  }

  const handleValidate = async (id, categorie) => {
    setBusyId(id)
    setError('')
    try {
      const res = await profileStore.adminValidateDeclaration(
        activeProfile?.code,
        id,
        categorie
      )
      if (res?.error === 'categorie_invalide') setError('Catégorie invalide.')
      else if (res?.error) setError('Échec de la validation.')
      else afterDecision()
    } catch {
      setError('Échec de la validation.')
    }
    setBusyId(null)
    setPickingId(null)
  }

  const handleRefuse = async (id) => {
    const motif = window.prompt('Motif du refus (obligatoire) :')
    if (!motif || !motif.trim()) return
    setBusyId(id)
    setError('')
    try {
      const res = await profileStore.adminRefuseDeclaration(
        activeProfile?.code,
        id,
        motif.trim()
      )
      if (res?.error === 'motif_requis') setError('Le motif est obligatoire.')
      else if (res?.error) setError('Échec du refus.')
      else afterDecision()
    } catch {
      setError('Échec du refus.')
    }
    setBusyId(null)
  }

  const handleToggleAgent = async (agent) => {
    setAgentBusy(agent.identifiant)
    setAgentsError('')
    try {
      const res = await profileStore.adminSetAgentActif(
        activeProfile?.code,
        agent.identifiant,
        !agent.actif
      )
      if (res?.error) setAgentsError('Échec de la modification du compte.')
      else await loadAgents()
    } catch {
      setAgentsError('Échec de la modification du compte.')
    }
    setAgentBusy(null)
  }

  const handleDeleteAgent = async (agent) => {
    if (
      !window.confirm(
        `Supprimer définitivement le compte « ${agent.identifiant} » ?\n\nL'agent ne pourra plus se connecter. Ses déclarations restent dans l'historique.`
      )
    )
      return
    setAgentBusy(agent.identifiant)
    setAgentsError('')
    try {
      const res = await profileStore.adminDeleteAgent(
        activeProfile?.code,
        agent.identifiant
      )
      if (res?.error) setAgentsError('Échec de la suppression.')
      else await loadAgents()
    } catch {
      setAgentsError('Échec de la suppression.')
    }
    setAgentBusy(null)
  }

  const handleSetManager = async (agent) => {
    setAgentBusy(agent.identifiant)
    setAgentsError('')
    try {
      const res = await profileStore.adminSetAgentManager(
        activeProfile?.code,
        agent.identifiant,
        assignValue || null
      )
      if (res?.error === 'manager_inconnu') setAgentsError('Manager inconnu.')
      else if (res?.error) setAgentsError("Échec de l'affectation.")
      else {
        setAssignId(null)
        setAssignValue('')
        loadPrimes()
        loadAgents()
        window.dispatchEvent(new Event('primes-updated'))
      }
    } catch {
      setAgentsError("Échec de l'affectation.")
    }
    setAgentBusy(null)
  }

  const sorted = useMemo(() => {
    const list = [...(declarations || [])]
    return list.sort((a, b) => primeDay(b).localeCompare(primeDay(a)))
  }, [declarations])

  const groups = useMemo(() => {
    const out = []
    let month = null
    let day = null
    for (const d of sorted) {
      const pd = primeDay(d)
      const mKey = pd.slice(0, 7)
      if (mKey !== month) {
        month = mKey
        out.push({ type: 'month', key: `m-${mKey}`, label: formatMonth(mKey) })
        day = null
      }
      if (pd !== day) {
        day = pd
        out.push({ type: 'day', key: `d-${pd}`, label: formatDay(pd) })
      }
      out.push({ type: 'row', key: d.id, data: d })
    }
    return out
  }, [sorted])

  const exportExcel = () => {
    const rows = sorted.map((d) => [
      d.created_at ? new Date(d.created_at).toLocaleDateString('fr-FR') : '',
      d.agent_nom || '',
      d.agent_identifiant || '',
      d.date_intervention || '',
      d.avion || '',
      d.element || '',
      d.description || '',
      catLabel(d.categorie),
      d.statut || '',
      d.motif_refus || '',
      d.decided_at ? new Date(d.decided_at).toLocaleDateString('fr-FR') : '',
    ])
    const perAgent = {}
    sorted.forEach((d) => {
      if (d.statut !== 'validee') return
      const key = d.agent_nom || d.agent_identifiant || '—'
      if (!perAgent[key]) perAgent[key] = { V034: 0, V035: 0 }
      if (perAgent[key][d.categorie] !== undefined) perAgent[key][d.categorie] += 1
    })
    const counts = Object.entries(perAgent).map(([agent, c]) => [agent, c.V034, c.V035])
    const wsData = [
      [
        'Date envoi',
        'Agent',
        'Identifiant',
        'Date intervention',
        'Avion',
        'Élément',
        'Description',
        'Catégorie',
        'Statut',
        'Motif refus',
        'Décidé le',
      ],
      ...rows,
      [],
      ['Compteurs validés par agent', 'Toilette T1 (V034)', 'Toilette T2 (V035)'],
      ...counts,
    ]
    const ws = XLSX.utils.aoa_to_sheet(wsData)
    ws['!cols'] = [12, 22, 14, 14, 12, 18, 45, 20, 10, 26, 12].map((wch) => ({ wch }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Primes')
    XLSX.writeFile(
      wb,
      `primes-${filter || 'toutes'}-${new Date().toISOString().slice(0, 10)}.xlsx`
    )
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h1 className="flex items-center gap-2 font-semibold text-slate-800 text-lg">
            <ClipboardCheck className="h-5 w-5 text-emerald-500" /> Demandes de primes
            {declarations && (
              <span className="text-sm font-normal text-slate-400">
                ({declarations.length})
              </span>
            )}
          </h1>
          <button
            onClick={exportExcel}
            disabled={sorted.length === 0}
            className="flex items-center gap-1.5 bg-emerald-600 text-white px-3 py-1.5 rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
            title="Exporter les demandes affichées en Excel"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exporter Excel
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setFilter(f.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                filter === f.value
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        {declarations === null && <p className="text-sm text-slate-400">Chargement…</p>}
        {declarations && declarations.length === 0 && (
          <p className="text-sm text-slate-400 italic">Aucune demande pour le moment.</p>
        )}
        {declarations && declarations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Agent</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Élément</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Description</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Intervention</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Catégorie</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Statut</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Décision</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => {
                  if (g.type === 'month')
                    return (
                      <tr key={g.key} className="bg-slate-100">
                        <td
                          colSpan={8}
                          className="px-3 py-1.5 font-bold text-slate-700 text-[13px] uppercase tracking-wide"
                        >
                          {g.label}
                        </td>
                      </tr>
                    )
                  if (g.type === 'day')
                    return (
                      <tr key={g.key} className="bg-slate-50">
                        <td colSpan={8} className="px-3 py-1 font-semibold text-slate-500 text-xs">
                          {g.label}
                        </td>
                      </tr>
                    )
                  const d = g.data
                  return (
                    <tr key={g.key} className="border-b hover:bg-slate-50 align-top">
                      <td className="px-3 py-2">
                        <span className="font-medium">{d.agent_nom || '—'}</span>
                        <span className="block text-[11px] text-slate-400">
                          {d.agent_identifiant}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono font-bold text-sky-700">
                        {d.avion || '—'}
                      </td>
                      <td className="px-3 py-2">{d.element || '—'}</td>
                      <td className="px-3 py-2 max-w-[240px]">
                        <span className="truncate block" title={d.description}>
                          {d.description}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {d.date_intervention
                          ? new Date(`${d.date_intervention}T12:00:00`).toLocaleDateString('fr-FR')
                          : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {d.statut === 'validee' && d.categorie ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                            {catLabel(d.categorie)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${statutBadge(
                            d.statut
                          )}`}
                        >
                          {d.statut === 'validee'
                            ? 'Validée'
                            : d.statut === 'refusee'
                            ? 'Refusée'
                            : 'Soumise'}
                        </span>
                        {d.statut === 'refusee' && d.motif_refus && (
                          <span
                            className="block text-[11px] text-red-600 mt-0.5"
                            title={d.motif_refus}
                          >
                            {d.motif_refus}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {d.statut === 'soumise' &&
                          (pickingId === d.id ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {Object.entries(CATEGORIES).map(([code, label]) => (
                                <button
                                  key={code}
                                  onClick={() => handleValidate(d.id, code)}
                                  disabled={busyId === d.id}
                                  className="rounded-full px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  {label}
                                </button>
                              ))}
                              <button
                                onClick={() => setPickingId(null)}
                                className="rounded-full p-1 text-slate-400 hover:text-slate-700"
                                title="Annuler"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5">
                              <button
                                onClick={() => setPickingId(d.id)}
                                disabled={busyId === d.id}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              >
                                <Check className="h-3.5 w-3.5" /> Valider
                              </button>
                              <button
                                onClick={() => handleRefuse(d.id)}
                                disabled={busyId === d.id}
                                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" /> Refuser
                              </button>
                            </div>
                          ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
          <Users className="h-5 w-5 text-sky-500" /> Comptes agents
          {agents && (
            <span className="text-sm font-normal text-slate-400">({agents.length})</span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Désactivez un compte pour bloquer sa connexion, ou supprimez-le — ses déclarations
          restent dans l'historique. « Assigner » rattache l'agent à un manager (les primes en
          attente suivent le nouveau manager).
        </p>
        {agentsError && <p className="text-sm text-red-600 mb-3">{agentsError}</p>}
        {agents === null && <p className="text-sm text-slate-400">Chargement…</p>}
        {agents && agents.length === 0 && (
          <p className="text-sm text-slate-400 italic">Aucun compte agent pour le moment.</p>
        )}
        {agents && agents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Identifiant</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Nom</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Manager</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Inscrit le</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">En attente</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Validées</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Total</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Statut</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((a) => (
                  <tr key={a.identifiant} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-mono font-semibold text-sky-700">
                      {a.identifiant}
                    </td>
                    <td className="px-3 py-2">{a.nom || '—'}</td>
                    <td className="px-3 py-2">
                      {a.manager_nom ? (
                        <span className="text-slate-700">{a.manager_nom}</span>
                      ) : (
                        <span className="text-xs italic text-slate-400">Non assigné</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span className="font-semibold text-amber-700">{a.en_attente}</span>
                    </td>
                    <td className="px-3 py-2 font-semibold text-green-700">{a.validees}</td>
                    <td className="px-3 py-2">{a.total}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          a.actif
                            ? 'bg-green-100 text-green-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {a.actif ? 'Actif' : 'Inactif'}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {assignId === a.identifiant ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={assignValue}
                            onChange={(e) => setAssignValue(e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                          >
                            <option value="">— Non assigné —</option>
                            {(managersList || []).map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => handleSetManager(a)}
                            disabled={agentBusy === a.identifiant}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" /> OK
                          </button>
                          <button
                            onClick={() => {
                              setAssignId(null)
                              setAssignValue('')
                            }}
                            className="rounded-full p-1 text-slate-400 hover:text-slate-700"
                            title="Annuler"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            onClick={() => {
                              setAssignId(a.identifiant)
                              setAssignValue(a.manager_id || '')
                            }}
                            disabled={agentBusy === a.identifiant}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-sky-300 text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                            title="Rattacher ou changer de manager — les primes en attente suivent"
                          >
                            <UserCog className="h-3.5 w-3.5" /> Assigner
                          </button>
                          <button
                            onClick={() => handleToggleAgent(a)}
                            disabled={agentBusy === a.identifiant}
                            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border disabled:opacity-50 ${
                              a.actif
                                ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                : 'border-green-300 text-green-700 hover:bg-green-50'
                            }`}
                          >
                            {a.actif ? (
                              <>
                                <UserX className="h-3.5 w-3.5" /> Désactiver
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" /> Réactiver
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteAgent(a)}
                            disabled={agentBusy === a.identifiant}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Supprimer
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {EMAIL_NOTIFICATIONS_ENABLED && (
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
          <Mail className="h-5 w-5 text-sky-500" /> Notifications email
          {notifyConfigured && (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
              ENVOI ACTIF
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Recevez un email dès qu'une déclaration est soumise par un de vos agents. Chaque
          manager enregistre sa propre adresse ici.
        </p>
        <div className="grid gap-2 sm:grid-cols-[1fr_auto] max-w-2xl">
          <input
            type="email"
            value={notifyEmail}
            onChange={(e) => setNotifyEmail(e.target.value)}
            placeholder="votre.adresse@exemple.com"
            className="border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={saveNotifyEmail}
            disabled={notifyBusy}
            className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
          >
            Enregistrer
          </button>
        </div>
        <button
          onClick={sendTestEmail}
          disabled={notifyBusy}
          className="mt-2 text-sky-600 hover:underline text-xs disabled:opacity-50"
        >
          Envoyer un email de test
        </button>
        {(notifyMsg || notifyError) && (
          <p className={`text-sm mt-2 ${notifyError ? 'text-red-600' : 'text-emerald-700'}`}>
            {notifyError || notifyMsg}
          </p>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            Configuration de l'envoi (EmailJS, gratuit) — à remplir une seule fois
          </summary>
          <div className="grid gap-2 mt-3 max-w-2xl">
            <input
              value={notifyServiceId}
              onChange={(e) => setNotifyServiceId(e.target.value)}
              placeholder="Service ID (ex : service_xxxxxxx)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              value={notifyTemplateId}
              onChange={(e) => setNotifyTemplateId(e.target.value)}
              placeholder="Template ID (ex : template_xxxxxxx)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              value={notifyPublicKey}
              onChange={(e) => setNotifyPublicKey(e.target.value)}
              placeholder="Clé publique (user_id)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              type="password"
              value={notifyPrivateKey}
              onChange={(e) => setNotifyPrivateKey(e.target.value)}
              placeholder="Clé privée (secret)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={saveNotifyConfig}
              disabled={notifyBusy}
              className="bg-slate-800 text-white px-4 py-2 rounded-md hover:bg-slate-900 disabled:opacity-50 text-sm font-semibold w-fit"
            >
              Enregistrer la configuration
            </button>
            <p className="text-[11px] text-slate-400">
              Un champ vide ne remplace pas la valeur enregistrée. La clé privée n'est jamais
              réaffichée. Expéditeur = votre adresse Gmail dédiée (service EmailJS).
            </p>
          </div>
        </details>
      </div>
      )}
    </div>
  )
}
