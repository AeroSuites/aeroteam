import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import ConsignesAvions from '../components/ConsignesAvions'
import { UserPlus, Users, Trash2, Plus, X, BookUser, Upload, Lock, LockOpen, Pencil, Star, ChevronDown, ChevronRight, Send } from 'lucide-react'
import { consigneDay, logicalToday, assignmentTeams, isAssignedTo, makeId, namesMatch } from '../utils/helpers'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

export default function Equipes() {
  const {
    teams, members, dayMembers, dayLeaders, assignments, notes, tasks,
    addTeam, updateTeam, removeTeam, unassignTask,
    addMembers, addDayMembers, clearDayMembers, removeMember,
    activeProfile, clearAgentChargesByTeam,
  } = useApp()
  const [tab, setTab] = useState('permanent')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState([])
  const [memberInput, setMemberInput] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  // Création d'équipes d'après les consignes : sélection + répartition auto
  const [pickedConsignes, setPickedConsignes] = useState([])
  const [perTeamCounts, setPerTeamCounts] = useState({})
  const [globalCount, setGlobalCount] = useState('')
  const [mergedName, setMergedName] = useState('')
  const [mergedNameTouched, setMergedNameTouched] = useState(false)
  const [excludedMembers, setExcludedMembers] = useState([])
  // Membres explicitement choisis par consigne (effectif du jour)
  const [pickedMembers, setPickedMembers] = useState({})
  const [memberPickerFor, setMemberPickerFor] = useState(null)
  // Cartes d'équipe : section « Ajouter des membres » repliée par défaut
  const [openAddMember, setOpenAddMember] = useState([])
  // Envoi de la charge d'une équipe à un profil agent
  const [sendTeam, setSendTeam] = useState(null)
  const [agents, setAgents] = useState(null)
  const [sendPick, setSendPick] = useState('')
  const [sendBusy, setSendBusy] = useState(false)
  const [sendMsg, setSendMsg] = useState('')
  const [sendError, setSendError] = useState('')

  const activeMembers = tab === 'permanent' ? members : dayMembers

  // Consignes du jour (lignes « - … » des notes [C] de la journée logique en cours)
  // Si aucune consigne aujourd'hui, on prend le dernier jour de consignes trouvé.
  const { dayConsignes, consignesDay } = useMemo(() => {
    const today = DAY_NAMES[logicalToday().getDay()]
    const byDay = {}
    ;(notes || [])
      .filter((n) => String(n.title || '').startsWith('[C] '))
      .forEach((n) => {
        const day = consigneDay(n.title) || '—'
        if (!byDay[day]) byDay[day] = []
        String(n.content || '')
          .split('\n')
          .forEach((line) => {
            const t = line.trim()
            if (!t.startsWith('- ')) return
            const item = t.slice(2).trim()
            if (item && !byDay[day].includes(item)) byDay[day].push(item)
          })
      })
    if (byDay[today]?.length) return { dayConsignes: byDay[today], consignesDay: today }
    const days = Object.keys(byDay).filter((d) => byDay[d].length)
    if (days.length) {
      days.sort((a, b) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b))
      const last = days[days.length - 1]
      return { dayConsignes: byDay[last], consignesDay: last }
    }
    return { dayConsignes: [], consignesDay: '' }
  }, [notes])

  // Consignes sans équipe du même nom → équipes vides à proposer
  const proposedTeams = useMemo(
    () =>
      dayConsignes.filter(
        (c) =>
          !teams.some(
            (t) => String(t.name || '').trim().toLowerCase() === c.toLowerCase()
          )
      ),
    [dayConsignes, teams]
  )

  // Vide la charge d'une équipe : toutes ses lignes sont désassignées
  // (+ la charge envoyée à un agent pour cette équipe est retirée)
  const clearTeamCharge = (teamId) => {
    const team = (teams || []).find((t) => t.id === teamId)
    tasks
      .filter((t) => assignmentTeams(assignments, t.id).includes(teamId))
      .forEach((t) => unassignTask(t.id, teamId))
    if (team) clearAgentChargesByTeam(team.name)
  }

  const taskCountByTeam = (teamId) =>
    tasks.filter((t) => assignmentTeams(assignments, t.id).includes(teamId)).length

  const openSend = async (team) => {
    setSendTeam(team)
    setSendPick('')
    setSendMsg('')
    setSendError('')
    if (agents === null) {
      try {
        const res = await profileStore.leaderListAgents(activeProfile?.code)
        setAgents(res?.ok ? res.agents || [] : [])
      } catch {
        setAgents([])
      }
    }
  }

  const sendCharge = async () => {
    const agent = (agents || []).find((a) => a.id === sendPick)
    if (!sendTeam || !agent) return
    setSendBusy(true)
    setSendError('')
    setSendMsg('')
    try {
      const d = logicalToday()
      const dayName = DAY_NAMES[d.getDay()]
      const dateIso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
        d.getDate()
      ).padStart(2, '0')}`
      const teamTasks = tasks.filter((t) => isAssignedTo(assignments, t.id, sendTeam.id))
      const registrations = [
        ...new Set(
          teamTasks.map((t) => t.registration || t.aircraftType).filter(Boolean)
        ),
      ]
      const anyRegistration = [
        ...new Set(
          (tasks || []).map((t) => t.registration || t.aircraftType).filter(Boolean)
        ),
      ][0]
      const aircraft = registrations[0] || anyRegistration || activeProfile?.aircraft || ''
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
        teamName: sendTeam.name,
        consignes,
        tasks: chargeTasks,
      })
      if (res?.error === 'pas_un_agent')
        setSendError(
          "Ce profil n'a pas le rôle Agent — changez son rôle dans Administration → Profils existants."
        )
      else if (res?.error === 'agent_introuvable')
        setSendError('Profil agent introuvable (migration SQL exécutée ?).')
      else if (res?.error) setSendError("Échec de l'envoi.")
      else {
        setSendMsg(
          `Charge envoyée à ${agent.name} : ${chargeTasks.length} ligne(s) + ${consignes.length} consigne(s).`
        )
        setSendPick('')
      }
    } catch {
      setSendError("Échec de l'envoi (migration SQL exécutée ? hors ligne ?).")
    }
    setSendBusy(false)
  }

  // Membres de l'onglet actif non encore affectés à une équipe
  const availableMembers = activeMembers.filter(
    (m) => !teams.some((t) => t.members.includes(m))
  )

  // Recherche par nom (insensible à la casse et aux accents)
  const normSearch = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const searchKey = normSearch(memberSearch.trim())
  const visibleMembers = searchKey
    ? availableMembers.filter((m) => normSearch(m).includes(searchKey))
    : availableMembers

  // ---- Création modulable d'équipes d'après les consignes ----
  // Aucune consigne cochée par défaut (sélection volontaire)
  useEffect(() => {
    setPickedConsignes([])
    setMergedNameTouched(false)
    setMergedName('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposedTeams.join('|')])

  // Le nom de l'équipe fusionnée = les consignes cochées séparées par « + »
  // (tant que l'utilisateur ne l'a pas modifié lui-même)
  useEffect(() => {
    if (mergedNameTouched) return
    setMergedName(pickedConsignes.join(' + '))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedConsignes.join('|'), mergedNameTouched])

  const togglePicked = (c) =>
    setPickedConsignes((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    )

  // Membres masqués de l'assignation automatique (ajoutables à la main plus tard)
  const assignableMembers = availableMembers.filter(
    (m) => !excludedMembers.includes(m)
  )

  const toggleExcluded = (m) =>
    setExcludedMembers((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
    )

  // Membres explicitement choisis par consigne (menu déroulant de l'effectif)
  const explicitFor = (c) =>
    (pickedMembers[c] || []).filter((m) => availableMembers.includes(m))

  const toggleMemberFor = (c, m) =>
    setPickedMembers((prev) => {
      const cur = prev[c] || []
      return { ...prev, [c]: cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m] }
    })

  // Valeur brute saisie pour une consigne (0 si vide)
  const rawCount = (c) => {
    const v = perTeamCounts[c]
    const n = Number(v)
    return v !== undefined && v !== '' && !isNaN(n) ? Math.max(0, Math.floor(n)) : 0
  }

  // Nombre de membres choisi pour une consigne (plafonné aux membres à répartir)
  const countFor = (c) => Math.min(rawCount(c), assignableMembers.length)

  // Total prévu par consigne : le nombre saisi, ou au moins les membres choisis
  const plannedFor = (c) => Math.max(countFor(c), explicitFor(c).length)

  // Membres déjà pris explicitement (toutes consignes cochées)
  const allExplicitMembers = pickedConsignes.flatMap((c) => explicitFor(c))
  const poolBase = assignableMembers.filter((m) => !allExplicitMembers.includes(m))

  const totalCounts = pickedConsignes.reduce((acc, c) => acc + plannedFor(c), 0)
  const autoNeedTotal = pickedConsignes.reduce(
    (acc, c) => acc + Math.max(0, plannedFor(c) - explicitFor(c).length),
    0
  )
  const remainingToAssign = Math.max(0, poolBase.length - autoNeedTotal)

  // Valeurs par défaut des compteurs quand la sélection change : champ vide
  useEffect(() => {
    setPerTeamCounts((prev) => {
      const next = {}
      pickedConsignes.forEach((c) => {
        next[c] = prev[c] !== undefined ? prev[c] : ''
      })
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedConsignes.join('|')])

  // Saisie d'un compteur : bloquée si le total dépasse les membres à répartir
  const setCount = (c, raw) => {
    const max = assignableMembers.length
    let v = String(raw ?? '')
    if (v !== '') {
      const n = Number(v)
      if (isNaN(n)) return
      const others = pickedConsignes
        .filter((x) => x !== c)
        .reduce((acc, x) => acc + rawCount(x), 0)
      v = String(Math.max(0, Math.min(Math.floor(n), max - others)))
    }
    setPerTeamCounts((prev) => ({ ...prev, [c]: v }))
  }

  // Applique un nombre à toutes les consignes cochées (total plafonné)
  const applyToAll = (v) => {
    const max = assignableMembers.length
    const k = Math.max(1, pickedConsignes.length)
    let next = ''
    if (String(v ?? '') !== '') {
      const n = Number(v)
      if (isNaN(n)) return
      next = String(Math.max(0, Math.min(Math.floor(n), Math.floor(max / k))))
    }
    setPerTeamCounts((prev) => {
      const out = { ...prev }
      pickedConsignes.forEach((c) => {
        out[c] = next
      })
      return out
    })
  }

  // Répartition automatique en tourniquet : 1 membre par équipe à chaque tour,
  // jusqu'au nombre demandé pour chaque consigne
  const distributeByCounts = (items) => {
    const pool = [...poolBase]
    const groups = items.map(() => [])
    const maxRounds = Math.max(0, ...items.map((it) => it.need))
    for (let round = 0; round < maxRounds && pool.length; round++) {
      items.forEach((it, i) => {
        if (round < it.need && pool.length) groups[i].push(pool.shift())
      })
    }
    return groups
  }

  // Regroupement automatique : les consignes qui partagent au moins une
  // personne choisie sont fusionnées en UNE seule équipe (sinon la même
  // personne se retrouverait dans plusieurs équipes).
  const consigneGroups = () => {
    const items = pickedConsignes.map((c) => ({ c, members: explicitFor(c) }))
    const parent = items.map((_, i) => i)
    const find = (i) => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    const union = (a, b) => {
      parent[find(a)] = find(b)
    }
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        if (items[i].members.some((m) => items[j].members.includes(m))) union(i, j)
      }
    }
    const groups = {}
    items.forEach((it, i) => {
      const root = find(i)
      if (!groups[root]) groups[root] = []
      groups[root].push(it.c)
    })
    return Object.values(groups)
  }

  const createTeamsFromSelection = () => {
    if (!pickedConsignes.length) return
    const groups = consigneGroups()
    const items = groups.map((group) => {
      const explicit = [...new Set(group.flatMap((c) => explicitFor(c)))]
      const target = group.reduce((acc, c) => acc + plannedFor(c), 0)
      return {
        name: group.join(' + '),
        explicit,
        need: Math.max(0, target - explicit.length),
      }
    })
    const auto = distributeByCounts(items)
    items.forEach((it, i) => {
      addTeam({
        name: it.name.slice(0, 60),
        members: [...it.explicit, ...(auto[i] || [])],
        color: defaultColors[(teams.length + i) % defaultColors.length],
      })
    })
  }

  // Fusion : toutes les consignes cochées → une seule équipe (membres cumulés)
  const createMergedTeam = () => {
    const name = mergedName.trim()
    if (!name || !pickedConsignes.length) return
    const explicit = pickedConsignes.flatMap((c) => explicitFor(c))
    const target = pickedConsignes.reduce((acc, c) => acc + plannedFor(c), 0)
    const groups = distributeByCounts([
      { name, explicit, need: Math.max(0, target - explicit.length) },
    ])
    addTeam({
      name: name.slice(0, 60),
      members: [...explicit, ...(groups[0] || [])],
      color: defaultColors[teams.length % defaultColors.length],
    })
  }


  const toggleSelected = (name) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    addTeam({ name: newName.trim(), members: [...selected], color: defaultColors[teams.length % defaultColors.length] })
    setNewName('')
    setSelected([])
    setMemberSearch('')
    setShowAdd(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBulkAdd = () => {
    const names = memberInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (tab === 'permanent') addMembers(names)
    else addDayMembers(names)
    setMemberInput('')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || '')
      const names = content
        .split(/\r\n|\r|\n|,|;|\t/)
        .map((n) => n.trim())
        .filter(Boolean)
      if (names.length) {
        if (tab === 'permanent') addMembers(names)
        else addDayMembers(names)
      }
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // Membres (permanents + du jour) pas encore affectés à cette équipe
  // Membres proposables pour une équipe : uniquement ceux non assignés
  // (retirer un membre d'une équipe le fait réapparaître ici)
  const availableForTeam = () =>
    [...new Set([...members, ...dayMembers])].filter(
      (m) => !teams.some((t) => t.members.includes(m))
    )

  const toggleAddMember = (teamId) =>
    setOpenAddMember((prev) =>
      prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]
    )

  const addToTeam = (teamId, name) => {
    const team = teams.find((t) => t.id === teamId)
    updateTeam(teamId, { members: [...team.members, name] })
  }

  const removeFromTeam = (teamId, memberName) => {
    const team = teams.find((t) => t.id === teamId)
    updateTeam(teamId, { members: team.members.filter((m) => m !== memberName) })
  }

  const handleClearDayMembers = () => {
    if (
      !window.confirm(
        'Effacer tous les membres assignés à l’avion du jour ? (les membres permanents et les équipes existantes sont conservés)'
      )
    )
      return
    clearDayMembers()
  }

  const switchTab = (next) => {
    setTab(next)
    setSelected([])
  }

  // Immatriculation de la charge : colonne Appareil des tâches de l'équipe,
  // sinon l'avion du profil
  const sendAircraft = sendTeam
    ? [...new Set(
        tasks
          .filter((t) => isAssignedTo(assignments, t.id, sendTeam.id))
          .map((t) => t.registration || t.aircraftType)
          .filter(Boolean)
      )][0] ||
      [...new Set((tasks || []).map((t) => t.registration || t.aircraftType).filter(Boolean))][0] ||
      activeProfile?.aircraft ||
      ''
    : ''

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Gestion des équipes</h1>
          <p className="text-slate-600 mt-1">
            {teams.length} équipe(s) — créez vos équipes depuis l'onglet « Membres permanents »
            ou « Assignés à l'avion du jour ».
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 flex items-center gap-2"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Annuler' : 'Nouvelle équipe'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-1">
            Créer une équipe{' '}
            <span className="text-xs font-normal text-slate-400">
              — depuis l'onglet « {tab === 'permanent' ? 'Membres permanents' : "Assignés à l'avion du jour"} »
            </span>
          </h2>
          <label className="block text-sm font-medium text-slate-700 mb-1 mt-3">Nom de l'équipe</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Équipe mécanique matin"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4"
          />
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Membres (cochez les noms de l'onglet actif)
          </label>
          {availableMembers.length > 0 && (
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={`Rechercher un nom parmi ${availableMembers.length}…`}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
            />
          )}
          {availableMembers.length === 0 && (
            <p className="text-sm text-amber-600 mb-3">
              Aucun membre disponible dans cet onglet. Ajoutez-en dans le panneau ci-dessus, ou
              retirez d'abord les membres déjà affectés.
            </p>
          )}
          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1 mb-2">
            {availableMembers.length > 0 && visibleMembers.length === 0 && (
              <p className="text-sm text-slate-400 italic px-2 py-1">
                Aucun nom ne correspond à « {memberSearch.trim()} ».
              </p>
            )}
            {visibleMembers.map((m) => {
              const checked = selected.includes(m)
              return (
                <label key={m} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelected(m)}
                    className="h-4 w-4 accent-sky-600"
                  />
                  {m}
                </label>
              )
            })}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-slate-500 mb-2">
              Sélection : {selected.join(', ')}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50"
          >
            {selected.length > 0
              ? `Créer l'équipe (${selected.length} membre${selected.length > 1 ? 's' : ''})`
              : "Créer l'équipe (vide — membres à ajouter plus tard)"}
          </button>
        </div>
      )}

      {/* Consignes des avions (jour × shift) — visibles aussi depuis les équipes */}
      <ConsignesAvions scope="equipes" />

      {/* Gestion des membres : deux onglets */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookUser className="h-5 w-5 text-sky-500" /> Membres
          </h2>
          <div className="inline-flex p-1 rounded-lg bg-slate-100">
            <button
              onClick={() => switchTab('permanent')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'permanent'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Membres permanents ({members.length})
            </button>
            <button
              onClick={() => switchTab('jour')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'jour'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Assignés à l'avion du jour ({dayMembers.length})
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          {tab === 'permanent'
            ? 'Liste permanente des techniciens : jamais effacée par la réinitialisation, elle sert à composer les équipes stables.'
            : 'Effectif assigné à l’avion du jour : effaçable à tout moment (et lors de la réinitialisation), sert à composer les équipes du jour.'}
        </p>

        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2 flex-1 min-w-[260px]">
            <input
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleBulkAdd()
                }
              }}
              placeholder={
                tab === 'permanent'
                  ? 'Ajouter des membres permanents (séparés par des virgules)'
                  : 'Ajouter des membres du jour (séparés par des virgules)'
              }
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={handleBulkAdd}
              className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm"
            >
              Ajouter
            </button>
            <label
              className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm cursor-pointer"
              title="Charger une liste de membres depuis un fichier (.txt, .csv)"
            >
              <Upload className="h-4 w-4" />
              Charger un fichier
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
          {tab === 'jour' && dayMembers.length > 0 && (
            <button
              onClick={handleClearDayMembers}
              className="text-red-600 border border-red-300 hover:bg-red-50 px-4 py-2 rounded-md text-sm font-semibold"
            >
              Effacer les membres du jour
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 content-start">
            {activeMembers.length === 0 && (
              <span className="text-sm text-slate-400 italic">
                {tab === 'permanent'
                  ? 'Aucun membre permanent.'
                  : 'Aucun membre du jour (ils arrivent avec les consignes importées).'}
              </span>
            )}
            {activeMembers.map((m) => {
              const isLeader = tab === 'jour' && (dayLeaders || []).includes(m)
              return (
                <span
                  key={m}
                  className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-sm border ${
                    isLeader
                      ? 'bg-sky-600 border-sky-700 text-white font-bold'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                  title={isLeader ? 'Leader' : undefined}
                >
                  {isLeader && <Star className="h-3 w-3 fill-white" />}
                  {m}
                  <button
                    onClick={() => removeMember(m)}
                    className={isLeader ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-red-600'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      </div>


      {/* Proposition : équipes d'après les consignes du jour (sélection + répartition) */}
      {tab === 'jour' && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 border-l-4 border-l-sky-500">
          <h2 className="font-semibold flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-sky-500" /> Équipes d'après les consignes
            {consignesDay && (
              <span className="text-sm font-normal text-slate-400">({consignesDay})</span>
            )}
          </h2>
          {dayConsignes.length === 0 ? (
            <p className="text-sm text-slate-500">
              Aucune consigne trouvée dans ce profil. Les consignes arrivent avec le fichier
              (Import consignes → envoi au profil).
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-2">
                Coche les consignes à transformer en équipes ({pickedConsignes.length}/
                {proposedTeams.length}) · membres non assignés :{' '}
                <span className="font-semibold text-slate-700">{availableMembers.length}</span> ·
                à répartir : <span className="font-semibold text-slate-700">{assignableMembers.length}</span> ·
                restants : <span className="font-semibold text-sky-700">{remainingToAssign}</span>
              </p>

              {availableMembers.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] text-slate-500 mb-1">
                    Cliquer un membre pour le masquer de l'assignation automatique (il restera
                    ajoutable à la main plus tard) :
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {availableMembers.map((m) => {
                      const off = excludedMembers.includes(m)
                      return (
                        <button
                          key={m}
                          onClick={() => toggleExcluded(m)}
                          className={`px-2 py-0.5 rounded-full text-[11px] border transition-colors ${
                            off
                              ? 'bg-slate-100 border-slate-200 text-slate-400 line-through'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          }`}
                          title={
                            off
                              ? 'Masqué : ne sera pas assigné automatiquement'
                              : 'Disponible pour l\'assignation automatique (cliquer pour masquer)'
                          }
                        >
                          {m}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1 mb-3">
                {dayConsignes.length === 0 && (
                  <p className="text-sm text-slate-400 italic px-2 py-1">
                    Aucune consigne pour ce jour.
                  </p>
                )}
                {dayConsignes.map((c) => {
                  // Consigne déjà assignée : une équipe (simple ou fusionnée) la contient
                  const consumed = teams.some((t) => {
                    const name = String(t.name || '').trim().toLowerCase()
                    const target = c.trim().toLowerCase()
                    const targetTrunc = c.slice(0, 60).trim().toLowerCase()
                    return (
                      name === target ||
                      name === targetTrunc ||
                      name.split(' + ').some((part) => part === target || part === targetTrunc)
                    )
                  })
                  const checked = !consumed && pickedConsignes.includes(c)
                  const picked = explicitFor(c)
                  const otherPicked = pickedConsignes
                    .filter((x) => x !== c)
                    .flatMap((x) => explicitFor(x))
                  const pickerMembers = availableMembers.filter(
                    (m) => !otherPicked.includes(m)
                  )
                  return (
                    <div
                      key={c}
                      className={`rounded ${consumed ? 'opacity-60' : ''}`}
                    >
                      <div
                        className={`flex items-center gap-2 px-2 py-1 rounded ${
                          consumed ? '' : 'hover:bg-slate-50'
                        }`}
                      >
                        <label
                          className={`flex items-start gap-2 text-sm flex-1 min-w-0 ${
                            consumed ? 'cursor-default' : 'cursor-pointer'
                          }`}
                          title={consumed ? 'Consigne déjà assignée à une équipe' : undefined}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={consumed}
                            onChange={() => !consumed && togglePicked(c)}
                            className="mt-0.5 h-4 w-4 accent-sky-600"
                          />
                          <span
                            className={`flex-1 ${consumed ? 'line-through text-slate-400' : ''}`}
                          >
                            {c}
                          </span>
                          {consumed && (
                            <span className="shrink-0 text-[10px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                              assignée
                            </span>
                          )}
                        </label>
                        {checked && (
                          <div className="flex items-center gap-2 shrink-0">
                            <label className="flex items-center gap-1 text-[11px] text-slate-500">
                              <input
                                type="number"
                                min="0"
                                max={assignableMembers.length}
                                value={perTeamCounts[c] ?? ''}
                                onChange={(e) => setCount(c, e.target.value)}
                                className="w-16 border border-slate-300 rounded px-1.5 py-1 text-sm"
                                title="Nombre de membres pour cette consigne (bloqué si le total dépasse les membres à répartir)"
                              />
                              membre(s)
                            </label>
                            <button
                              onClick={() =>
                                setMemberPickerFor(memberPickerFor === c ? null : c)
                              }
                              className={`text-[11px] font-semibold rounded-full px-2 py-1 border ${
                                picked.length
                                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                  : 'bg-white border-slate-300 text-slate-600'
                              }`}
                              title="Choisir une ou plusieurs personnes de l'effectif du jour pour cette consigne"
                            >
                              👥 {picked.length ? `(${picked.length})` : 'Choisir'}
                            </button>
                          </div>
                        )}
                      </div>
                      {checked && memberPickerFor === c && (
                        <div className="mx-2 mb-1 border border-slate-200 rounded-md p-2 bg-slate-50">
                          <p className="text-[11px] text-slate-500 mb-1">
                            Personnes affectées à cette consigne (effectif du jour) :
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {pickerMembers.map((m) => {
                              const on = picked.includes(m)
                              return (
                                <button
                                  key={m}
                                  onClick={() => toggleMemberFor(c, m)}
                                  className={`px-2 py-0.5 rounded-full text-[11px] border ${
                                    on
                                      ? 'bg-sky-600 border-sky-700 text-white font-bold'
                                      : 'bg-white border-slate-200 text-slate-700'
                                  }`}
                                  title={on ? 'Retirer' : 'Affecter à cette consigne'}
                                >
                                  {on ? '✓ ' : ''}
                                  {m}
                                </button>
                              )
                            })}
                          </div>
                          {availableMembers.length - pickerMembers.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {availableMembers.length - pickerMembers.length} personne(s) déjà
                              prise(s) par une autre consigne (retire-la de l'autre consigne pour
                              la récupérer).
                            </p>
                          )}
                          {picked.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              Les personnes choisies seront mises dans l'équipe de cette consigne ;
                              le nombre saisi complète avec les membres restants.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {(() => {
                const merged = consigneGroups().filter((g) => g.length > 1)
                if (!merged.length) return null
                return (
                  <div className="mb-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
                    <strong>Fusion automatique</strong> (personnes en commun) :{' '}
                    {merged.map((g) => g.join(' + ')).join('  |  ')}
                  </div>
                )
              })()}

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Appliquer à toutes
                  <input
                    type="number"
                    min="0"
                    max={assignableMembers.length}
                    value={globalCount}
                    onChange={(e) => {
                      setGlobalCount(e.target.value)
                      applyToAll(e.target.value)
                    }}
                    className="ml-2 w-24 border border-slate-300 rounded-md px-2 py-1.5 text-sm"
                    title="Applique le même nombre de membres à toutes les consignes cochées (total plafonné)"
                  />
                </label>
                <button
                  onClick={createTeamsFromSelection}
                  disabled={pickedConsignes.length === 0}
                  className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                  title="Crée une équipe par consigne cochée, avec la répartition automatique des membres"
                >
                  Créer {pickedConsignes.length} équipe{pickedConsignes.length > 1 ? 's' : ''}
                  {pickedConsignes.length > 0
                    ? ` (${totalCounts} membre${totalCounts > 1 ? 's' : ''} au total)`
                    : ''}
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-slate-700 flex-1 min-w-[240px]">
                  Fusionner la sélection en une seule équipe
                  <input
                    value={mergedName}
                    onChange={(e) => {
                      setMergedNameTouched(true)
                      setMergedName(e.target.value)
                    }}
                    placeholder="Nom de l'équipe fusionnée"
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </label>
                <button
                  onClick={createMergedTeam}
                  disabled={!mergedName.trim() || pickedConsignes.length === 0}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
                  title="Une seule équipe avec toutes les consignes cochées (membres cumulés)"
                >
                  Créer l'équipe fusionnée ({totalCounts} membre{totalCounts > 1 ? 's' : ''})
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                Pour chaque consigne : mets un <strong>nombre de membres</strong> (réparti
                automatiquement) et/ou clique <strong>👥 Choisir</strong> pour affecter une ou
                plusieurs personnes précises de l'effectif du jour. Les personnes choisies sont
                mises dans l'équipe, le nombre complète avec les membres restants. Répartition en
                tourniquet (ex. 6 personnes / 3 consignes = 2 par équipe) ; les membres masqués ou
                restants s'ajoutent à la main (« + Ajouter à cette équipe »).
              </p>
            </>
          )}
        </div>
      )}

      {teams.length === 0 && !showAdd && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          Aucune équipe pour l'instant. Créez votre première équipe.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team, idx) => (
          <div key={team.id} className="bg-white rounded-xl shadow overflow-hidden">
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ backgroundColor: defaultColors[idx % defaultColors.length] }}
            >
              <div className="flex items-center gap-2 text-white">
                <UserPlus className="h-5 w-5" />
                <h3 className="font-bold flex items-center gap-1.5">
                  {team.locked && <Lock className="h-3.5 w-3.5 text-amber-300" />}
                  {team.name}
                  {team.locked && <span className="text-[10px] font-semibold text-amber-200">verrouillée</span>}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = window.prompt("Nouveau nom de l'équipe :", team.name)
                    if (next === null) return
                    const name = String(next).trim()
                    if (!name) return
                    updateTeam(team.id, { name })
                  }}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title="Renommer l'équipe"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updateTeam(team.id, { locked: !team.locked })}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title={
                    team.locked
                      ? 'Déverrouiller cette équipe (elle pourra recevoir des tâches à la répartition automatique)'
                      : 'Verrouiller cette équipe (elle ne recevra plus de tâches à la répartition automatique)'
                  }
                >
                  {team.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                </button>
                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        `Supprimer l'équipe « ${team.name} » ?\n\nLa charge envoyée à un agent pour cette équipe sera retirée (elle reste dans l'historique de l'agent).`
                      )
                    ) {
                      await clearAgentChargesByTeam(team.name)
                      removeTeam(team.id)
                    }
                  }}
                  className="text-white/80 hover:text-white"
                  title="Supprimer l'équipe (retire aussi la charge envoyée à l'agent)"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600">
                  <span className="font-semibold">{team.members.length}</span> membre(s)
                </span>
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span>
                    <span className="font-semibold">{taskCountByTeam(team.id)}</span> tâche(s)
                    assignée(s)
                  </span>
                  {taskCountByTeam(team.id) > 0 && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Vider la charge de l'équipe « ${team.name} » (${taskCountByTeam(
                              team.id
                            )} tâche(s)) ?\n\nLes lignes seront désassignées (elles restent dans les tâches) et la charge envoyée à l'agent sera retirée.`
                          )
                        ) {
                          clearTeamCharge(team.id)
                        }
                      }}
                      className="text-slate-400 hover:text-red-600"
                      title={`Vider la charge de l'équipe (désassigner ses ${taskCountByTeam(
                        team.id
                      )} tâche(s))`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {taskCountByTeam(team.id) > 0 && (
                    <button
                      onClick={() => openSend(team)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-1"
                      title="Envoyer la charge de cette équipe à un profil agent (date + avion + consignes du jour)"
                    >
                      <Send className="h-3.5 w-3.5" /> Envoyer à un agent
                    </button>
                  )}
                </span>
              </div>

              <ul className="space-y-1 mb-4">
                {team.members.length === 0 && (
                  <li className="text-sm text-slate-400 italic">Aucun membre</li>
                )}
                {team.members.map((member, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-1.5 text-sm"
                  >
                    <span>{member}</span>
                    <button
                      onClick={() => removeFromTeam(team.id, member)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              {availableForTeam().length > 0 && (
                <div>
                  <button
                    onClick={() => toggleAddMember(team.id)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900"
                    title="Afficher/masquer la liste des membres à ajouter"
                  >
                    {openAddMember.includes(team.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Ajouter des membres ({availableForTeam().length})
                  </button>
                  {openAddMember.includes(team.id) && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {availableForTeam().map((m) => (
                        <button
                          key={m}
                          onClick={() => addToTeam(team.id, m)}
                          className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs hover:bg-sky-100 hover:text-sky-700"
                        >
                          + {m}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Envoi de la charge d'une équipe à un agent */}
      {sendTeam && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setSendTeam(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">Envoyer la charge · {sendTeam.name}</h2>
                <p className="text-xs text-slate-300">
                  {taskCountByTeam(sendTeam.id)} tâche(s) ·{' '}
                  {logicalToday().toLocaleDateString('fr-FR', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                  })}{' '}
                  · ✈ {sendAircraft || 'aucun avion'}
                </p>
              </div>
              <button
                onClick={() => setSendTeam(null)}
                className="text-slate-300 hover:text-white shrink-0"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {!sendAircraft && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Aucune immatriculation trouvée (ni dans la colonne Appareil des tâches, ni sur
                  votre profil) : la charge partira sans avion.
                </p>
              )}
              {agents === null && (
                <p className="text-sm text-slate-400">Chargement des agents…</p>
              )}
              {agents && agents.length === 0 && (
                <p className="text-sm text-slate-500">
                  Aucun profil agent. L'administrateur doit créer ou valider des profils avec le
                  rôle « Agent ».
                </p>
              )}
              {agents && agents.length > 0 && sendTeam.members.length === 0 && (
                <p className="text-sm text-slate-500">
                  Cette équipe n'a pas de membres : ajoutez des membres puis réessayez.
                </p>
              )}
              {agents &&
                agents.length > 0 &&
                sendTeam.members.map((member) => {
                  const agent = agents.find((a) => namesMatch(a.name, member))
                  const selected = agent && sendPick === agent.id
                  return (
                    <button
                      key={member}
                      onClick={() => agent && setSendPick(agent.id)}
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
                onClick={sendCharge}
                disabled={!sendPick || sendBusy}
                className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
              >
                {sendBusy ? 'Envoi…' : "Envoyer la charge"}
              </button>
              <button
                onClick={() => setSendTeam(null)}
                className="text-slate-500 hover:text-slate-800 px-3 py-2 text-sm"
              >
                Fermer
              </button>
              {sendMsg && <span className="text-xs text-emerald-700">{sendMsg}</span>}
              {sendError && <span className="text-xs text-red-600">{sendError}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const defaultColors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']