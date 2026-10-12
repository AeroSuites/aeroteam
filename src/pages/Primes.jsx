import { Fragment, useEffect, useMemo, useState } from 'react'
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
  Link2,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

// Normalisation des noms (mêmes règles que côté SQL) : minuscules, sans accents,
// mots triés, civilités ignorées (MR, MME, M., DR...)
const PRIME_CIVILITIES = new Set([
  'mr',
  'mme',
  'mlle',
  'm',
  'monsieur',
  'madame',
  'mademoiselle',
  'dr',
  'docteur',
])

const normPrimeName = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t && !PRIME_CIVILITIES.has(t))
    .sort()
    .join(' ')
    .trim()

// Clé de regroupement d'une déclaration : par NOM (les déclarations leader
// arrivent avec un identifiant généré depuis le nom, qui peut différer du compte)
const declKey = (d) =>
  d?.agent_nom
    ? `nom:${normPrimeName(d.agent_nom)}`
    : `id:${String(d.agent_identifiant || '—').toLowerCase()}`

const CATEGORIES = {
  V034: 'Toilette T1 (V034)',
  V035: 'Toilette T2 (V035)',
}

// Notifications email : conservées dans le code mais désactivées pour
// le moment (aucun service d'envoi accepté). Passer à true pour
// réafficher la carte « Notifications email ».
const EMAIL_NOTIFICATIONS_ENABLED = true

const catLabel = (code) => CATEGORIES[code] || code || '—'

const primeDay = (d) =>
  d.date_intervention || (d.created_at ? String(d.created_at).slice(0, 10) : '')

const formatDay = (iso) => {
  if (!iso) return '—'
  const label = new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
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
  const label = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', {
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
  const [detailAgent, setDetailAgent] = useState(null)
  const [expandedAgents, setExpandedAgents] = useState([])
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busyId, setBusyId] = useState(null)

  const [agents, setAgents] = useState(null)
  const [agentsError, setAgentsError] = useState('')

  // Rattachement manuel : liste de TOUS les noms (les orphelins sont signalés)
  const [linkNom, setLinkNom] = useState('')
  const [linkIdentifiant, setLinkIdentifiant] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkMsg, setLinkMsg] = useState('')

  const nameOptions = useMemo(() => {
    const accountIds = new Set(
      (agents || []).map((a) => String(a.identifiant || '').toLowerCase())
    )
    const by = {}
    ;(declarations || []).forEach((d) => {
      const raw = String(d.agent_nom || '').trim()
      if (!raw) return
      const key = normPrimeName(raw)
      if (!key) return
      if (!by[key]) by[key] = { key, label: raw, count: 0, orphan: 0 }
      by[key].count += 1
      if (!accountIds.has(String(d.agent_identifiant || '').toLowerCase())) {
        by[key].orphan += 1
      }
    })
    return Object.values(by).sort((a, b) => a.label.localeCompare(b.label))
  }, [declarations, agents])

  const orphanCount = (nom) => {
    const key = normPrimeName(nom)
    const found = nameOptions.find((n) => n.key === key)
    return found ? found.orphan : 0
  }

  const linkAgent = async () => {
    if (!linkNom || !linkIdentifiant) return
    const n = orphanCount(linkNom)
    if (n === 0) {
      setLinkMsg(
        'No declaration to link for this name (already linked to an account, or no declaration).'
      )
      return
    }
    if (
      !window.confirm(
        `Link ${n} declaration(s) from "${linkNom}" to the AeroPrimes account ${linkIdentifiant} ?\n\nThe person will get back their full bonus history.`
      )
    )
      return
    setLinkBusy(true)
    setLinkMsg('')
    try {
      const res = await profileStore.adminLinkAgentDeclarations(
        activeProfile.code,
        linkNom,
        linkIdentifiant
      )
      if (res?.error) {
        setLinkMsg(
          res.error === 'agent_inconnu'
            ? 'AeroPrimes account not found.'
            : 'Failed to link.'
        )
      } else {
        setLinkMsg(
          `${res?.count ?? n} declaration(s) linked to the account ${
            res?.identifiant || linkIdentifiant
          }.`
        )
        setLinkNom('')
        setLinkIdentifiant('')
        await loadPrimes()
        await loadAgents()
      }
    } catch {
      setLinkMsg('Failed to link.')
    }
    setLinkBusy(false)
  }
  const [agentBusy, setAgentBusy] = useState(null)
  const [managersList, setManagersList] = useState(null)
  const [assignId, setAssignId] = useState(null)
  const [assignValue, setAssignValue] = useState('')

  const [notifyEmail, setNotifyEmail] = useState('')
  const [savedEmail, setSavedEmail] = useState('')
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
      const res = await profileStore.adminListDeclarations(activeProfile.code, '')
      if (res?.error) setError('Unable to load the requests.')
      else setDeclarations(res.declarations || [])
    } catch {
      setError('Unable to load the requests.')
    }
  }

  const loadAgents = async () => {
    if (!activeProfile?.code) return
    try {
      const res = await profileStore.adminListAgents(activeProfile.code)
      if (res?.error) setAgentsError('Unable to load the agent accounts.')
      else setAgents(res.agents || [])
    } catch {
      setAgentsError('Unable to load the agent accounts.')
    }
  }

  useEffect(() => {
    if (!activeProfile?.code) return
    profileStore
      .adminListDeclarations(activeProfile.code, '')
      .then((res) => {
        if (res?.error) setError('Unable to load the requests.')
        else setDeclarations(res.declarations || [])
      })
      .catch(() => setError('Unable to load the requests.'))
  }, [activeProfile])

  useEffect(() => {
    if (!activeProfile?.code) return
    profileStore
      .adminListAgents(activeProfile.code)
      .then((res) => {
        if (res?.error) setAgentsError('Unable to load the agent accounts.')
        else setAgents(res.agents || [])
      })
      .catch(() => setAgentsError('Unable to load the agent accounts.'))
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
          setSavedEmail(res.email || '')
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
      if (res?.error === 'email_invalide') setNotifyError('Invalid email address.')
      else if (res?.error) setNotifyError("Failed to save.")
      else {
        setNotifyMsg('Address saved.')
        setSavedEmail(res.email || notifyEmail)
        setNotifyEmail(res.email || notifyEmail)
      }
    } catch (err) {
      setNotifyError(`Failed to save: ${err?.message || 'offline?'}`)
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
      if (res?.error) setNotifyError("Failed to save.")
      else {
        setNotifyMsg('Configuration saved.')
        setNotifyPrivateKey('')
        await refreshNotifyInfo()
      }
    } catch (err) {
      setNotifyError(`Failed to save: ${err?.message || 'offline?'}`)
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
        setNotifyError("First enter your email address above.")
      else if (res?.error === 'config_manquante')
        setNotifyError("Incomplete sending configuration (Brevo key + sender address).")
      else if (res?.error) setNotifyError("Failed to send the test.")
      else
        setNotifyMsg('Test email sent — check your inbox (and spam).')
    } catch (err) {
      setNotifyError(`Failed to send the test: ${err?.message || 'offline?'}`)
    }
    setNotifyBusy(false)
  }

  const sendRecapTest = async () => {
    setNotifyBusy(true)
    setNotifyMsg('')
    setNotifyError('')
    try {
      const res = await profileStore.adminSendPrimesRecapNow(activeProfile?.code)
      if (res?.error === 'aucun_destinataire')
        setNotifyError("First enter your email address above (manager address).")
      else if (res?.error) setNotifyError(`Failed recap: ${res.error}`)
      else if (res?.ok)
        setNotifyMsg(
          `Recap "${res.label}" sent to ${res.recipients} address(es): ${res.agents} agent(s), ${res.total} declaration(s).`
        )
      else setNotifyError("Failed to send the recap.")
    } catch (err) {
      setNotifyError(`Failed to send the recap: ${err?.message || 'offline?'}`)
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
      if (res?.error === 'categorie_invalide') setError('Invalid category.')
      else if (res?.error) setError('Failed to approve.')
      else afterDecision()
    } catch {
      setError('Failed to approve.')
    }
    setBusyId(null)
  }

  const handleRefuse = async (id) => {
    const motif = window.prompt('Rejection reason (required):')
    if (!motif || !motif.trim()) return
    setBusyId(id)
    setError('')
    try {
      const res = await profileStore.adminRefuseDeclaration(
        activeProfile?.code,
        id,
        motif.trim()
      )
      if (res?.error === 'motif_requis') setError('The reason is required.')
      else if (res?.error) setError('Failed to refuse.')
      else afterDecision()
    } catch {
      setError('Failed to refuse.')
    }
    setBusyId(null)
  }

  const handleDeleteDeclaration = async (d) => {
    if (
      !window.confirm(
        `Delete this bonus request?\n\n${d.avion || '—'} · ${d.element || '—'}\n${
          d.agent_identifiant ? `If "${d.agent_nom || d.agent_identifiant}" has an AeroPrimes account, it will only disappear from your view: the person keeps their declarations in their history.` : 'This action is irreversible.'
        }`
      )
    )
      return
    setBusyId(d.id)
    setError('')
    setInfo('')
    try {
      const res = await profileStore.adminDeleteDeclaration(activeProfile?.code, d.id)
      if (res?.error) setError('Failed to delete.')
      else if (res?.hidden) {
        setInfo(
          `Removed from your manager view — the person keeps their declarations in their AeroPrimes history.`
        )
        afterDecision()
      } else afterDecision()
    } catch {
      setError('Failed to delete (offline?).')
    }
    setBusyId(null)
  }

  const handleDeleteAgentHistory = async () => {
    if (!detailAgent) return
    if (
      !window.confirm(
        `Delete the ENTIRE bonus history of "${detailInfo?.nom || detailAgent}" ?\n\n${
          detailInfo?.identifiant
            ? "As this person has an AeroPrimes account, the history will only disappear from your view: they keep everything in AeroPrimes."
            : 'This action is irreversible.'
        }`
      )
    )
      return
    setBusyId('all')
    setError('')
    setInfo('')
    try {
      const res = await profileStore.adminDeleteAgentDeclarations(
        activeProfile?.code,
        detailInfo?.nom || detailInfo?.identifiant || detailAgent
      )
      if (res?.error) setError('Failed to delete.')
      else {
        if (res?.hidden) {
          setInfo(
            'History removed from your manager view — the person keeps their declarations in AeroPrimes.'
          )
        }
        setDetailAgent(null)
        afterDecision()
      }
    } catch {
      setError('Failed to delete (offline?).')
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
      if (res?.error) setAgentsError('Failed to update the account.')
      else await loadAgents()
    } catch {
      setAgentsError('Failed to update the account.')
    }
    setAgentBusy(null)
  }

  const handleDeleteAgent = async (agent) => {
    if (
      !window.confirm(
        `Permanently delete the account "${agent.identifiant}" ?\n\nThe agent will no longer be able to sign in. Their declarations remain in the history.`
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
      if (res?.error) setAgentsError('Failed to delete.')
      else await loadAgents()
    } catch {
      setAgentsError('Failed to delete.')
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
      else if (res?.error) setAgentsError("Failed to assign.")
      else {
        setAssignId(null)
        setAssignValue('')
        loadPrimes()
        loadAgents()
        window.dispatchEvent(new Event('primes-updated'))
      }
    } catch {
      setAgentsError("Failed to assign.")
    }
    setAgentBusy(null)
  }

  const sorted = useMemo(() => {
    const list = [...(declarations || [])]
    return list.sort((a, b) => primeDay(b).localeCompare(primeDay(a)))
  }, [declarations])

  // Synthèse : 1 personne = 1 ligne, regroupée par nom (les déclarations leader
  // arrivent avec un identifiant généré depuis le nom, qui peut différer du compte).
  const agentStats = useMemo(() => {
    const by = {}
    ;(declarations || []).forEach((d) => {
      const key = declKey(d)
      if (!by[key]) {
        by[key] = {
          key,
          identifiant: '',
          nom: '',
          pending: 0,
          refused: 0,
          total: 0,
          valid: { V034: 0, V035: 0 },
        }
      }
      const a = by[key]
      if (!a.nom && d.agent_nom) a.nom = String(d.agent_nom).trim()
      if (d.agent_identifiant) {
        const id = String(d.agent_identifiant)
        const linked = (agents || []).some(
          (ag) => String(ag.identifiant || '').toLowerCase() === id.toLowerCase()
        )
        if (linked || !a.identifiant) a.identifiant = id
      }
      a.total += 1
      if (d.statut === 'soumise') a.pending += 1
      else if (d.statut === 'refusee') a.refused += 1
      else if (
        d.statut === 'validee' &&
        (d.categorie === 'V034' || d.categorie === 'V035')
      ) {
        a.valid[d.categorie] += 1
      }
    })
    return Object.values(by).sort((a, b) =>
      (a.nom || a.identifiant).localeCompare(b.nom || b.identifiant)
    )
  }, [declarations, agents])

  const detailItems = useMemo(() => {
    if (!detailAgent) return []
    return (declarations || []).filter((d) => declKey(d) === detailAgent)
  }, [detailAgent, declarations])

  const detailPending = useMemo(
    () => [...detailItems.filter((d) => d.statut === 'soumise')].sort((a, b) => primeDay(a).localeCompare(primeDay(b))),
    [detailItems]
  )

  const detailMonths = useMemo(() => {
    const map = {}
    ;(detailItems || [])
      .filter((d) => d.statut !== 'soumise')
      .forEach((d) => {
        const key = primeDay(d).slice(0, 7)
        if (!map[key]) map[key] = { key, label: formatMonth(key), items: [], count: 0, valid: 0 }
        map[key].items.push(d)
        map[key].count += 1
        if (d.statut === 'validee') map[key].valid += 1
      })
    const list = Object.values(map).sort((a, b) => b.key.localeCompare(a.key))
    list.forEach((m) =>
      m.items.sort((a, b) => primeDay(b).localeCompare(primeDay(a)))
    )
    return list
  }, [detailItems])

  const [expandedDetailMonths, setExpandedDetailMonths] = useState([])

  const toggleDetailMonth = (key) =>
    setExpandedDetailMonths((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )

  // À l'ouverture d'un détail : mois en cours déplié (sinon le plus récent)
  useEffect(() => {
    if (!detailAgent) {
      setExpandedDetailMonths([])
      return
    }
    const keys = detailMonths.map((m) => m.key)
    if (!keys.length) {
      setExpandedDetailMonths([])
      return
    }
    const nowKey = new Date().toISOString().slice(0, 7)
    setExpandedDetailMonths(keys.includes(nowKey) ? [nowKey] : [keys[0]])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailAgent])

  const detailInfo = agentStats.find((a) => a.key === detailAgent) || null

  const pendingFor = (key) =>
    (declarations || [])
      .filter((d) => declKey(d) === key && d.statut === 'soumise')
      .sort((a, b) => primeDay(a).localeCompare(primeDay(b)))

  const toggleExpandedAgent = (key) =>
    setExpandedAgents((prev) =>
      prev.includes(key) ? prev.filter((i) => i !== key) : [...prev, key]
    )

  const exportExcel = () => {
    // Feuille 1 : synthèse (1 agent = 1 ligne)
    const synth = agentStats.map((a) => [
      a.nom || a.identifiant,
      a.valid.V034,
      a.valid.V035,
      a.total,
    ])
    const wsSynth = XLSX.utils.aoa_to_sheet([
      ['Agent', 'Toilet T1 (V034)', 'Toilet T2 (V035)', 'Total declared'],
      ...synth,
    ])
    wsSynth['!cols'] = [22, 17, 17, 14].map((wch) => ({ wch }))

    // Feuille 2 : détail complet
    const rows = sorted.map((d) => [
      d.created_at ? new Date(d.created_at).toLocaleDateString('en-GB') : '',
      d.agent_nom || '',
      d.agent_identifiant || '',
      d.date_intervention || '',
      d.avion || '',
      d.element || '',
      d.description || '',
      catLabel(d.categorie),
      d.statut || '',
      d.motif_refus || '',
      d.decided_at ? new Date(d.decided_at).toLocaleDateString('en-GB') : '',
    ])
    const wsDetail = XLSX.utils.aoa_to_sheet([
      [
        'Sent date',
        'Agent',
        'Identifiant',
        'Intervention date',
        'Aircraft',
        'Item',
        'Description',
        'Category',
        'Statut',
        'Motif refus',
        'Decided on',
      ],
      ...rows,
    ])
    wsDetail['!cols'] = [12, 22, 14, 14, 12, 18, 45, 20, 10, 26, 12].map((wch) => ({
      wch,
    }))

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, wsSynth, 'Summary')
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Detail')
    XLSX.writeFile(wb, `primes-${new Date().toISOString().slice(0, 10)}.xlsx`)
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
            title="Export the displayed requests to Excel"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exporter Excel
          </button>
        </div>

        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {info && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2 mb-3">
          {info}
        </p>
      )}
        {declarations === null && <p className="text-sm text-slate-400">Loading…</p>}
        {declarations && declarations.length === 0 && (
          <p className="text-sm text-slate-400 italic">No request for now.</p>
        )}
        {declarations && declarations.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Agent</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 text-center">Pending</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 text-center">
                    Toilette T1 (V034)
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-700 text-center">
                    Toilette T2 (V035)
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-700 text-center">Refused</th>
                  <th className="px-3 py-2 font-semibold text-slate-700 text-center">Total</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {agentStats.map((a) => (
                  <Fragment key={a.key}>
                  <tr className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <span className="font-medium">{a.nom || '—'}</span>
                      <span className="block text-[11px] text-slate-400">{a.identifiant}</span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      {a.pending > 0 ? (
                        <button
                          onClick={() => toggleExpandedAgent(a.key)}
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            expandedAgents.includes(a.key)
                              ? 'bg-amber-300 text-amber-900'
                              : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                          }`}
                          title="Show / hide the bonuses to approve"
                        >
                          {a.pending} to approve
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                      <td className="px-3 py-2 text-center font-semibold text-emerald-700">
                        {a.valid.V034 || '—'}
                      </td>
                      <td className="px-3 py-2 text-center font-semibold text-emerald-700">
                        {a.valid.V035 || '—'}
                      </td>
                      <td className="px-3 py-2 text-center text-red-600">{a.refused || '—'}</td>
                      <td className="px-3 py-2 text-center font-semibold">{a.total}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => setDetailAgent(a.key)}
                          className="text-sky-600 hover:underline text-xs font-semibold"
                          title="View the full history and approve"
                        >
                          Detail
                        </button>
                      </td>
                  </tr>
                  {expandedAgents.includes(a.key) && (
                    <tr className="bg-amber-50/40">
                      <td colSpan={7} className="px-3 pb-3 pt-1">
                        <div className="space-y-1.5">
                          {pendingFor(a.key).map((d) => (
                            <div
                              key={d.id}
                              className="flex flex-wrap items-center gap-2 border border-amber-200 bg-white rounded-lg px-3 py-2"
                            >
                              <span className="font-mono font-bold text-sky-700 text-sm whitespace-nowrap">
                                {d.avion || '—'}
                              </span>
                              {d.trfx && (
                                <span className="inline-flex items-center justify-center shrink-0 font-mono text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                                  {d.trfx}
                                </span>
                              )}
                              <span className="text-xs text-slate-600">{d.element || '—'}</span>
                              <span className="text-[11px] text-slate-400">
                                {d.date_intervention
                                  ? new Date(
                                      `${d.date_intervention}T12:00:00`
                                    ).toLocaleDateString('en-GB')
                                  : new Date(d.created_at).toLocaleDateString('en-GB')}
                              </span>
                              <span
                                className="flex-1 min-w-[140px] truncate text-xs text-slate-600"
                                title={d.description}
                              >
                                {d.description}
                              </span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {busyId === d.id ? (
                                  <span className="text-xs text-slate-400">…</span>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => handleValidate(d.id, 'V034')}
                                      className="rounded-full px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                                      title="Approve as Toilet T1 (V034)"
                                    >
                                      T1 (V034)
                                    </button>
                                    <button
                                      onClick={() => handleValidate(d.id, 'V035')}
                                      className="rounded-full px-2.5 py-1 text-xs font-bold bg-teal-600 text-white hover:bg-teal-700"
                                      title="Approve as Toilet T2 (V035)"
                                    >
                                      T2 (V035)
                                    </button>
                                    <button
                                      onClick={() => handleRefuse(d.id)}
                                      className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-red-300 text-red-600 hover:bg-red-50"
                                    >
                                      <X className="h-3.5 w-3.5" /> Refuse
                                    </button>
                                    <button
                                      onClick={() => handleDeleteDeclaration(d)}
                                      className="rounded-full p-1 text-slate-400 hover:text-red-600"
                                      title="Delete this request"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rattachement manuel : n'importe quelle personne → compte AeroPrimes */}
      {nameOptions.length > 0 && agents && agents.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 border-l-4 border-l-amber-500">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
            <Link2 className="h-5 w-5 text-amber-500" /> Link declarations to an
            AeroPrimes account
          </h2>
          <p className="text-xs text-slate-400 mb-3">
            Choose a person then their AeroPrimes account: all their declarations will move
            under their username and they will find them in their history. People “not
            linked” are flagged (useful when the name entered differs from the account).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={linkNom}
              onChange={(e) => setLinkNom(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[220px]"
            >
              <option value="">— Person —</option>
              {nameOptions.map((n) => (
                <option key={n.key} value={n.label}>
                  {n.label} ({n.count} decl.
                  {n.orphan > 0 ? ` · ${n.orphan} not linked` : ' · linked'})
                </option>
              ))}
            </select>
            <span className="text-slate-400 font-bold">→</span>
            <select
              value={linkIdentifiant}
              onChange={(e) => setLinkIdentifiant(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white min-w-[220px]"
            >
              <option value="">— Compte AeroPrimes —</option>
              {agents.map((a) => (
                <option key={a.identifiant} value={a.identifiant}>
                  {a.identifiant} · {a.nom}
                </option>
              ))}
            </select>
            <button
              onClick={linkAgent}
              disabled={!linkNom || !linkIdentifiant || linkBusy}
              className="flex items-center gap-2 bg-amber-600 text-white px-4 py-2 rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-semibold"
            >
              <Link2 className="h-4 w-4" />
              {linkBusy ? 'Linking…' : 'Link'}
            </button>
          </div>
          {linkMsg && <p className="text-sm text-emerald-700 mt-2">{linkMsg}</p>}
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
          <Users className="h-5 w-5 text-sky-500" /> Agent accounts
          {agents && (
            <span className="text-sm font-normal text-slate-400">({agents.length})</span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Deactivate an account to block its sign-in, or delete it — its declarations
          remain in the history. “Assign” links the agent to a manager (pending
          bonuses follow the new manager).
        </p>
        {agentsError && <p className="text-sm text-red-600 mb-3">{agentsError}</p>}
        {agents === null && <p className="text-sm text-slate-400">Loading…</p>}
        {agents && agents.length === 0 && (
          <p className="text-sm text-slate-400 italic">No agent account for now.</p>
        )}
        {agents && agents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[900px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Identifiant</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Nom</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Manager</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Registered on</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Pending</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Approved</th>
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
                        <span className="text-xs italic text-slate-400">Not assigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {a.created_at
                        ? new Date(a.created_at).toLocaleDateString('en-GB')
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
                            <option value="">— Not assigned —</option>
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
                            title="Cancel"
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
                            title="Link or change manager — pending bonuses follow"
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
                                <UserX className="h-3.5 w-3.5" /> Deactivate
                              </>
                            ) : (
                              <>
                                <UserCheck className="h-3.5 w-3.5" /> Reactivate
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => handleDeleteAgent(a)}
                            disabled={agentBusy === a.identifiant}
                            className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Delete
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
              SENDING ACTIVE
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          You receive an email as soon as a declaration is submitted by one of your agents. Each
          manager saves their own address here.
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
            Save
          </button>
        </div>
        <p className="text-xs mt-2">
          {savedEmail ? (
            <span className="inline-flex items-center gap-1 text-emerald-700 font-semibold">
              <Check className="h-3.5 w-3.5" /> Notification email saved:{' '}
              {savedEmail}
            </span>
          ) : (
            <span className="text-amber-700 font-semibold">
              No notification email saved for now.
            </span>
          )}
        </p>
        <button
          onClick={sendTestEmail}
          disabled={notifyBusy}
          className="mt-2 text-sky-600 hover:underline text-xs disabled:opacity-50"
        >
          Send a test email
        </button>
        <button
          onClick={sendRecapTest}
          disabled={notifyBusy}
          className="mt-2 ml-4 text-sky-600 hover:underline text-xs disabled:opacity-50"
          title="Send last month’s recap now (the real one goes out automatically on the 1st of each month)"
        >
          Send last month’s recap (test)
        </button>
        {(notifyMsg || notifyError) && (
          <p className={`text-sm mt-2 ${notifyError ? 'text-red-600' : 'text-emerald-700'}`}>
            {notifyError || notifyMsg}
          </p>
        )}

        <details className="mt-4">
          <summary className="cursor-pointer text-xs font-medium text-slate-500">
            Sending configuration (EmailJS, free) — to fill in once
          </summary>
          <div className="grid gap-2 mt-3 max-w-2xl">
            <input
              value={notifyServiceId}
              onChange={(e) => setNotifyServiceId(e.target.value)}
              placeholder="Service ID (e.g. service_xxxxxxx)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              value={notifyTemplateId}
              onChange={(e) => setNotifyTemplateId(e.target.value)}
              placeholder="Template ID (e.g. template_xxxxxxx)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              value={notifyPublicKey}
              onChange={(e) => setNotifyPublicKey(e.target.value)}
              placeholder="Public key (user_id)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <input
              type="password"
              value={notifyPrivateKey}
              onChange={(e) => setNotifyPrivateKey(e.target.value)}
              placeholder="Private key (secret)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={saveNotifyConfig}
              disabled={notifyBusy}
              className="bg-slate-800 text-white px-4 py-2 rounded-md hover:bg-slate-900 disabled:opacity-50 text-sm font-semibold w-fit"
            >
              Save the configuration
            </button>
            <p className="text-[11px] text-slate-400">
              An empty field does not replace the saved value. The private key is never
              shown again. Sender = your dedicated Gmail address (EmailJS service).
            </p>
          </div>
        </details>
      </div>
      )}

      {detailAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDetailAgent(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b flex items-center justify-between gap-2 bg-slate-900 text-white rounded-t-xl">
              <h2 className="font-bold truncate">
                {detailInfo?.nom || detailAgent}
                {detailInfo?.identifiant && (
                <span className="text-slate-400 font-normal text-sm">
                  {' '}
                  · {detailInfo.identifiant}
                </span>
              )}
              </h2>
              <div className="flex items-center gap-3 shrink-0 text-xs">
                <span className="bg-amber-500/20 text-amber-200 border border-amber-400/40 rounded-full px-2.5 py-1 font-bold">
                  {detailInfo?.pending || 0} pending
                </span>
                <span className="text-emerald-300 font-bold">
                  T1 : {detailInfo?.valid.V034 || 0} · T2 : {detailInfo?.valid.V035 || 0}
                </span>
                {detailItems.length > 0 && (
                  <button
                    onClick={handleDeleteAgentHistory}
                    disabled={busyId === 'all'}
                    className="inline-flex items-center gap-1 text-red-200 border border-red-400/40 hover:bg-red-500/20 rounded-full px-2.5 py-1 font-bold disabled:opacity-50"
                    title="Delete this agent’s entire bonus history"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete all
                  </button>
                )}
                <button
                  onClick={() => setDetailAgent(null)}
                  className="text-slate-400 hover:text-white p-1"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="p-5 overflow-y-auto space-y-5">
              {detailPending.length > 0 && (
                <div>
                  <h3 className="font-semibold text-amber-700 mb-2">
                    To approve ({detailPending.length})
                  </h3>
                  <div className="space-y-2">
                    {detailPending.map((d) => (
                      <div
                        key={d.id}
                        className="border border-amber-200 bg-amber-50/40 rounded-lg p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="font-mono font-bold text-sky-700 whitespace-nowrap">
                            {d.avion || '—'}
                          </span>
                          {d.trfx && (
                            <span className="inline-flex items-center justify-center shrink-0 font-mono text-xs font-bold text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap">
                              {d.trfx}
                            </span>
                          )}
                          <span className="text-slate-600">{d.element || '—'}</span>
                          <span className="text-xs text-slate-400">
                            {d.date_intervention
                              ? new Date(`${d.date_intervention}T12:00:00`).toLocaleDateString(
                                  'en-GB'
                                )
                              : new Date(d.created_at).toLocaleDateString('en-GB')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{d.description}</p>
                        <div className="mt-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {busyId === d.id ? (
                              <span className="text-xs text-slate-400">…</span>
                            ) : (
                              <>
                                <button
                                  onClick={() => handleValidate(d.id, 'V034')}
                                  className="rounded-full px-2.5 py-1 text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700"
                                  title="Approve as Toilet T1 (V034)"
                                >
                                  T1 (V034)
                                </button>
                                <button
                                  onClick={() => handleValidate(d.id, 'V035')}
                                  className="rounded-full px-2.5 py-1 text-xs font-bold bg-teal-600 text-white hover:bg-teal-700"
                                  title="Approve as Toilet T2 (V035)"
                                >
                                  T2 (V035)
                                </button>
                                <button
                                  onClick={() => handleRefuse(d.id)}
                                  className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold border border-red-300 text-red-600 hover:bg-red-50"
                                >
                                  <X className="h-3.5 w-3.5" /> Refuse
                                </button>
                                <button
                                  onClick={() => handleDeleteDeclaration(d)}
                                  className="rounded-full p-1 text-slate-400 hover:text-red-600"
                                  title="Delete this request"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="font-semibold text-slate-700 mb-2">History</h3>
                {detailMonths.length === 0 && (
                  <p className="text-sm text-slate-400 italic">No history for now.</p>
                )}
                {detailMonths.length > 0 && (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left bg-slate-50">
                        <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                        <th className="px-3 py-2 font-semibold text-slate-700 text-center">TRFX</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Item</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Description</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Category</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Statut</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailMonths.map((m) => {
                        const open = expandedDetailMonths.includes(m.key)
                        let lastDay = null
                        return (
                          <Fragment key={m.key}>
                            <tr
                              className="bg-slate-100 cursor-pointer hover:bg-slate-200"
                              onClick={() => toggleDetailMonth(m.key)}
                              title={open ? 'Collapse this month' : 'Expand this month'}
                            >
                              <td colSpan={7} className="px-3 py-1.5">
                                <span className="flex items-center gap-2 font-bold text-slate-700 text-[13px] uppercase tracking-wide">
                                  {open ? (
                                    <ChevronDown className="h-4 w-4 text-slate-500" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4 text-slate-500" />
                                  )}
                                  {m.label}
                                  <span className="ml-2 text-[11px] font-bold normal-case bg-sky-100 text-sky-800 rounded-full px-2 py-0.5">
                                    {m.count} prime{m.count > 1 ? 's' : ''}
                                  </span>
                                  {m.valid > 0 && (
                                    <span className="text-[11px] font-bold normal-case bg-emerald-100 text-emerald-800 rounded-full px-2 py-0.5">
                                      {m.valid} approved
                                    </span>
                                  )}
                                </span>
                              </td>
                            </tr>
                            {open &&
                              m.items.map((d) => {
                                const pd = primeDay(d)
                                const newDay = pd !== lastDay
                                lastDay = pd
                                return (
                                  <Fragment key={d.id}>
                                    {newDay && (
                                      <tr className="bg-slate-50">
                                        <td
                                          colSpan={7}
                                          className="px-3 py-1 font-semibold text-slate-500 text-xs"
                                        >
                                          {formatDay(pd)}
                                        </td>
                                      </tr>
                                    )}
                                    <tr className="border-b hover:bg-slate-50 align-top">
                                      <td className="px-3 py-2 font-mono font-bold text-sky-700 whitespace-nowrap">
                                        {d.avion || '—'}
                                      </td>
                                      <td className="px-3 py-2 font-mono text-sm text-slate-600 text-center whitespace-nowrap">
                                        {d.trfx || '—'}
                                      </td>
                                      <td className="px-3 py-2">{d.element || '—'}</td>
                                      <td className="px-3 py-2 max-w-[240px]">
                                        <span className="truncate block" title={d.description}>
                                          {d.description}
                                        </span>
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
                                            ? 'Approved'
                                            : d.statut === 'refusee'
                                            ? 'Refused'
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
                                      <td className="px-3 py-2 text-right">
                                <button
                                  onClick={() => handleDeleteDeclaration(d)}
                                  className="text-slate-400 hover:text-red-600"
                                  title="Delete this request"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </td>
                            </tr>
                          </Fragment>
                                )
                              })}
                          </Fragment>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
