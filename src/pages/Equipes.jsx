import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import ConsignesAvions from '../components/ConsignesAvions'
import SendChargeToAgent from '../components/SendChargeToAgent'
import { UserPlus, Users, Trash2, Plus, X, BookUser, Upload, Lock, LockOpen, Pencil, Star, ChevronDown, ChevronRight, Send, Search } from 'lucide-react'
import { consigneDay, logicalToday, assignmentTeams, TEAM_COLORS } from '../utils/helpers'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

export default function Equipes() {
  const {
    teams, members, dayMembers, dayLeaders, assignments, notes, tasks,
    addTeam, updateTeam, removeTeam, unassignTask,
    addMembers, addDayMembers, clearDayMembers, removeMember,
    clearAgentChargesByTeam,
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
  // Envoi de la charge d'une équipe à un profil agent (fenêtre partagée)
  const [sendTeam, setSendTeam] = useState(null)
  // Recherche dans la liste « Ajouter des membres » (par équipe)
  const [addMemberSearch, setAddMemberSearch] = useState({})

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
        "Clear all members assigned to today's aircraft? (permanent members and existing teams are kept)"
      )
    )
      return
    clearDayMembers()
  }

  const switchTab = (next) => {
    setTab(next)
    setSelected([])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Team management</h1>
          <p className="text-slate-600 mt-1">
            {teams.length} team(s) — create your teams from the "Permanent members"
            or "Assigned to today's aircraft" tab.
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 flex items-center gap-2"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Cancel' : 'New team'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-1">
            Create a team{' '}
            <span className="text-xs font-normal text-slate-400">
              — from the "{tab === 'permanent' ? 'Permanent members' : "Assigned to today's aircraft"}" tab
            </span>
          </h2>
          <label className="block text-sm font-medium text-slate-700 mb-1 mt-3">Team name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Morning mechanical team"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4"
          />
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Members (check the names from the active tab)
          </label>
          {availableMembers.length > 0 && (
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={`Search a name among ${availableMembers.length}…`}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
            />
          )}
          {availableMembers.length === 0 && (
            <p className="text-sm text-amber-600 mb-3">
              No members available in this tab. Add some in the panel above, or
              first remove the members already assigned.
            </p>
          )}
          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1 mb-2">
            {availableMembers.length > 0 && visibleMembers.length === 0 && (
              <p className="text-sm text-slate-400 italic px-2 py-1">
                No name matches "{memberSearch.trim()}".
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
              Selection: {selected.join(', ')}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50"
          >
            {selected.length > 0
              ? `Create team (${selected.length} member${selected.length > 1 ? 's' : ''})`
              : "Create team (empty — members to add later)"}
          </button>
        </div>
      )}

      {/* Consignes des avions (jour × shift) — visibles aussi depuis les équipes */}
      <ConsignesAvions scope="equipes" />

      {/* Gestion des membres : deux onglets */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookUser className="h-5 w-5 text-sky-500" /> Members
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
              Permanent members ({members.length})
            </button>
            <button
              onClick={() => switchTab('jour')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'jour'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Assigned to today's aircraft ({dayMembers.length})
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          {tab === 'permanent'
            ? 'Permanent list of technicians: never erased by reset, used to build stable teams.'
            : "Staff assigned to today's aircraft: can be cleared at any time (and on reset), used to build the day's teams."}
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
                  ? 'Add permanent members (comma-separated)'
                  : "Add today's members (comma-separated)"
              }
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={handleBulkAdd}
              className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm"
            >
              Add
            </button>
            <label
              className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm cursor-pointer"
              title="Upload a member list from a file (.txt, .csv)"
            >
              <Upload className="h-4 w-4" />
              Upload a file
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
              Clear the day's members
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 content-start">
            {activeMembers.length === 0 && (
              <span className="text-sm text-slate-400 italic">
                {tab === 'permanent'
                  ? 'No permanent members.'
                  : 'No members for the day (they arrive with imported instructions).'}
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
            <Users className="h-5 w-5 text-sky-500" /> Teams from instructions
            {consignesDay && (
              <span className="text-sm font-normal text-slate-400">({consignesDay})</span>
            )}
          </h2>
          {dayConsignes.length === 0 ? (
            <p className="text-sm text-slate-500">
              No instructions found in this profile. Instructions arrive with the file
              (Import instructions → sent to the profile).
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-2">
                Check the instructions to turn into teams ({pickedConsignes.length}/
                {proposedTeams.length}) · unassigned members:{' '}
                <span className="font-semibold text-slate-700">{availableMembers.length}</span> ·
                to distribute: <span className="font-semibold text-slate-700">{assignableMembers.length}</span> ·
                remaining: <span className="font-semibold text-sky-700">{remainingToAssign}</span>
              </p>

              {availableMembers.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] text-slate-500 mb-1">
                    Click a member to hide them from automatic assignment (they can still
                    be added manually later):
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
                              ? 'Hidden: will not be assigned automatically'
                              : 'Available for automatic assignment (click to hide)'
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
                    No instructions for this day.
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
                          title={consumed ? 'Instruction already assigned to a team' : undefined}
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
                              assigned
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
                                title="Number of members for this instruction (blocked if the total exceeds the members to distribute)"
                              />
                              member(s)
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
                              title="Choose one or more people from the day's staff for this instruction"
                            >
                              👥 {picked.length ? `(${picked.length})` : 'Choose'}
                            </button>
                          </div>
                        )}
                      </div>
                      {checked && memberPickerFor === c && (
                        <div className="mx-2 mb-1 border border-slate-200 rounded-md p-2 bg-slate-50">
                          <p className="text-[11px] text-slate-500 mb-1">
                            People assigned to this instruction (day's staff):
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
                                  title={on ? 'Unassign' : 'Assign to this instruction'}
                                >
                                  {on ? '✓ ' : ''}
                                  {m}
                                </button>
                              )
                            })}
                          </div>
                          {availableMembers.length - pickerMembers.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              {availableMembers.length - pickerMembers.length} person(s) already
                              taken by another instruction (remove them from the other instruction to
                              get them back).
                            </p>
                          )}
                          {picked.length > 0 && (
                            <p className="text-[10px] text-slate-400 mt-1">
                              The chosen people will be placed in this instruction's team;
                              the entered number fills in with the remaining members.
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
                    <strong>Automatic merge</strong> (shared people):{' '}
                    {merged.map((g) => g.join(' + ')).join('  |  ')}
                  </div>
                )
              })()}

              <div className="flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-slate-700">
                  Apply to all
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
                    title="Applies the same number of members to all checked instructions (capped total)"
                  />
                </label>
                <button
                  onClick={createTeamsFromSelection}
                  disabled={pickedConsignes.length === 0}
                  className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                  title="Creates one team per checked instruction, with automatic member distribution"
                >
                  Create {pickedConsignes.length} team{pickedConsignes.length > 1 ? 's' : ''}
                  {pickedConsignes.length > 0
                    ? ` (${totalCounts} member${totalCounts > 1 ? 's' : ''} in total)`
                    : ''}
                </button>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-end gap-3">
                <label className="text-sm font-medium text-slate-700 flex-1 min-w-[240px]">
                  Merge the selection into a single team
                  <input
                    value={mergedName}
                    onChange={(e) => {
                      setMergedNameTouched(true)
                      setMergedName(e.target.value)
                    }}
                    placeholder="Merged team name"
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </label>
                <button
                  onClick={createMergedTeam}
                  disabled={!mergedName.trim() || pickedConsignes.length === 0}
                  className="bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 disabled:opacity-50 text-sm font-semibold"
                  title="A single team with all checked instructions (cumulative members)"
                >
                  Create merged team ({totalCounts} member{totalCounts > 1 ? 's' : ''})
                </button>
              </div>
              <p className="text-[11px] text-slate-400 mt-2">
                For each instruction: enter a <strong>number of members</strong> (distributed
                automatically) and/or click <strong>👥 Choose</strong> to assign one or
                more specific people from the day's staff. The chosen people are
                placed in the team, the number fills in with the remaining members. Round-robin
                distribution (e.g. 6 people / 3 instructions = 2 per team); hidden or
                remaining members are added manually ("+ Add to this team").
              </p>
            </>
          )}
        </div>
      )}

      {teams.length === 0 && !showAdd && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          No teams yet. Create your first team.
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
                  {team.locked && <span className="text-[10px] font-semibold text-amber-200">locked</span>}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = window.prompt("New team name:", team.name)
                    if (next === null) return
                    const name = String(next).trim()
                    if (!name) return
                    updateTeam(team.id, { name })
                  }}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title="Rename team"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updateTeam(team.id, { locked: !team.locked })}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title={
                    team.locked
                      ? 'Unlock this team (it will be able to receive tasks in automatic distribution)'
                      : 'Lock this team (it will no longer receive tasks in automatic distribution)'
                  }
                >
                  {team.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                </button>
                <button
                  onClick={async () => {
                    if (
                      window.confirm(
                        `Delete team "${team.name}"?\n\nThe workload sent to an agent for this team will be removed (it remains in the agent's history).`
                      )
                    ) {
                      await clearAgentChargesByTeam(team.name)
                      removeTeam(team.id)
                    }
                  }}
                  className="text-white/80 hover:text-white"
                  title="Delete team (also removes the workload sent to the agent)"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600">
                  <span className="font-semibold">{team.members.length}</span> member(s)
                </span>
                <span className="flex items-center gap-2 text-sm text-slate-600">
                  <span>
                    <span className="font-semibold">{taskCountByTeam(team.id)}</span> task(s)
                    assigned
                  </span>
                  {taskCountByTeam(team.id) > 0 && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Clear the workload of team "${team.name}" (${taskCountByTeam(
                              team.id
                            )} task(s))?\n\nThe lines will be unassigned (they remain in the tasks) and the workload sent to the agent will be removed.`
                          )
                        ) {
                          clearTeamCharge(team.id)
                        }
                      }}
                      className="text-slate-400 hover:text-red-600"
                      title={`Clear the team's workload (unassign its ${taskCountByTeam(
                        team.id
                      )} task(s))`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  {taskCountByTeam(team.id) > 0 && (
                    <button
                      onClick={() => setSendTeam(team)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-1"
                      title="Send this team's workload to an agent profile (date + aircraft + day's instructions)"
                    >
                      <Send className="h-3.5 w-3.5" /> Send to an agent
                    </button>
                  )}
                </span>
              </div>

              <ul className="space-y-1 mb-4">
                {team.members.length === 0 && (
                  <li className="text-sm text-slate-400 italic">No members</li>
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
                    title="Show/hide the list of members to add"
                  >
                    {openAddMember.includes(team.id) ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                    Add members ({availableForTeam().length})
                  </button>
                  {openAddMember.includes(team.id) && (
                    <div className="mt-2">
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input
                          value={addMemberSearch[team.id] || ''}
                          onChange={(e) =>
                            setAddMemberSearch((prev) => ({
                              ...prev,
                              [team.id]: e.target.value,
                            }))
                          }
                          placeholder="Search a name…"
                          className="w-full border border-slate-300 rounded-md pl-8 pr-2 py-1.5 text-xs"
                        />
                      </div>
                      <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md p-1.5 space-y-1">
                        {(() => {
                          const q = normSearch((addMemberSearch[team.id] || '').trim())
                          const list = availableForTeam().filter(
                            (m) => !q || normSearch(m).includes(q)
                          )
                          if (list.length === 0) {
                            return (
                              <p className="text-xs text-slate-400 italic px-1">
                                No name matches.
                              </p>
                            )
                          }
                          return list.map((m) => (
                            <button
                              key={m}
                              onClick={() => addToTeam(team.id, m)}
                              className="w-full text-left bg-slate-50 hover:bg-sky-50 text-slate-700 hover:text-sky-700 rounded px-2 py-1 text-xs"
                            >
                              + {m}
                            </button>
                          ))
                        })()}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {sendTeam && (
        <SendChargeToAgent team={sendTeam} onClose={() => setSendTeam(null)} />
      )}
    </div>
  )
}

const defaultColors = TEAM_COLORS
