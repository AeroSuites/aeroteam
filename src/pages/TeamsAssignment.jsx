import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import ManualTaskForm from '../components/ManualTaskForm'
import LeaderPrimesForm from '../components/LeaderPrimesForm'
import NoteCell from '../components/NoteCell'
import ConsignesAvions from '../components/ConsignesAvions'
import { getCategoryColor, getZoneColor, getCategoryLabel, assignmentTeams, isAssignedTo, priorityToken, priorityTokens, cleanTaskText, consigneDay, logicalToday, TEAM_COLORS, PRIMES_ENABLED } from '../utils/helpers'
import { Users, ClipboardList, Undo2, ChevronDown, ChevronRight, Wand2, Trash2, Lock, LockOpen, X, Send, FileText, ListChecks, Plus, Pencil, Star, BookUser, Upload, Search, Eraser } from 'lucide-react'
import SendChargeToAgent from '../components/SendChargeToAgent'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

export default function TeamsAssignment() {
  const {
    tasks, teams, assignments, assignTask, unassignTask, updateTeam, addTasks,
    removeTasksByBlock, updateTask, clearAgentChargesByTeam,
    members, dayMembers, dayLeaders, notes, addTeam, removeTeam,
    addMembers, addDayMembers, clearDayMembers, removeMember,
  } = useApp()
  const [dragTask, setDragTask] = useState(null)
  const [sendTeam, setSendTeam] = useState(null)
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [prioFilter, setPrioFilter] = useState([])
  const [lastAutoAssignments, setLastAutoAssignments] = useState(null)
  const [tab, setTab] = useState('affectation')
  const [descTask, setDescTask] = useState(null)

  // ---- Gestion des équipes / membres (fusion de l'ancienne page Équipes) ----
  const [memberTab, setMemberTab] = useState('permanent')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState([])
  const [memberInput, setMemberInput] = useState('')
  const [memberSearch, setMemberSearch] = useState('')
  const [showMembers, setShowMembers] = useState(false)
  const [showConsignesTeams, setShowConsignesTeams] = useState(false)
  const [pickedConsignes, setPickedConsignes] = useState([])
  const [perTeamCounts, setPerTeamCounts] = useState({})
  const [globalCount, setGlobalCount] = useState('')
  const [mergedName, setMergedName] = useState('')
  const [mergedNameTouched, setMergedNameTouched] = useState(false)
  const [excludedMembers, setExcludedMembers] = useState([])
  const [pickedMembers, setPickedMembers] = useState({})
  const [memberPickerFor, setMemberPickerFor] = useState(null)
  const [openAddMember, setOpenAddMember] = useState([])
  const [addMemberSearch, setAddMemberSearch] = useState({})

  // Équipes pouvant recevoir des tâches à la répartition automatique
  const autoTeams = useMemo(() => teams.filter((t) => !t.locked), [teams])
  const autoLockedCount = teams.length - autoTeams.length

  // Blocs exclus de la répartition automatique (vide = tous les blocs)
  // Blocs sélectionnés pour la répartition automatique (rien par défaut)
  const [autoSelectedBlocks, setAutoSelectedBlocks] = useState([])
  const [autoExcludedZones, setAutoExcludedZones] = useState([])

  const toggleAutoBlock = (block) => {
    const isSelected = autoSelectedBlocks.includes(block)
    if (isSelected) {
      setAutoExcludedZones((prev) => prev.filter((k) => !k.startsWith(`${block}::`)))
      setAutoSelectedBlocks((prev) => prev.filter((b) => b !== block))
    } else {
      const zoneKeys = Object.keys(allBlockZones[block] || {}).map((z) =>
        zoneScopeKey(block, z)
      )
      setAutoExcludedZones((prev) => [...new Set([...prev, ...zoneKeys])])
      setAutoSelectedBlocks((prev) => [...prev, block])
    }
  }

  const toggleAutoAll = () => {
    if (autoSelectedBlocks.length === blocks.length) {
      setAutoSelectedBlocks([])
    } else {
      setAutoSelectedBlocks([...blocks])
      setAutoExcludedZones([])
    }
  }

  const zoneScopeKey = (block, zone) => `${block}::${zone}`

  const toggleAutoZone = (block, zone) => {
    const key = zoneScopeKey(block, zone)
    setAutoExcludedZones((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  }

  // Sous-blocs (zones) par bloc avec leur nombre de tâches sans équipe
  const allBlockZones = {}
  tasks.forEach((t) => {
    if (assignmentTeams(assignments, t.id).length) return
    const block = t.taskType || 'AUTRE'
    const zone = t.workArea || 'Other'
    if (!allBlockZones[block]) allBlockZones[block] = {}
    allBlockZones[block][zone] = (allBlockZones[block][zone] || 0) + 1
  })

  const autoScopeTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (assignmentTeams(assignments, t.id).length) return false
        const block = t.taskType || 'AUTRE'
        if (!autoSelectedBlocks.includes(block)) return false
        const zone = t.workArea || 'Other'
        return !autoExcludedZones.includes(zoneScopeKey(block, zone))
      }),
    [tasks, assignments, autoSelectedBlocks, autoExcludedZones]
  )

  const autoScopeCount = autoScopeTasks.length

  // Répartition automatique : blocs entiers, équilibrés par nombre de tâches,
  // Found Fault (CORR) distribué en priorité
  const autoAssign = () => {
    if (!autoTeams.length) return
    const unassigned = autoScopeTasks
    if (!unassigned.length) return

    const snapshot = { ...assignments }
    const byBlock = {}
    unassigned.forEach((t) => {
      const block = t.taskType || 'AUTRE'
      if (!byBlock[block]) byBlock[block] = []
      byBlock[block].push(t)
    })

    const blockOrder = Object.keys(byBlock).sort((a, b) => {
      const pa = a === 'CORR' ? 0 : 1
      const pb = b === 'CORR' ? 0 : 1
      if (pa !== pb) return pa - pb
      return byBlock[b].length - byBlock[a].length
    })

    const applied = {}
    const load = {}
    autoTeams.forEach((t) => {
      load[t.id] = Object.values(assignments).filter((ids) =>
        Array.isArray(ids) ? ids.includes(t.id) : ids === t.id
      ).length
    })

    const idealPerTeam = unassigned.length / autoTeams.length
    const leastLoadedTeam = () =>
      [...autoTeams].sort((t1, t2) => load[t1.id] - load[t2.id])[0]

    const giveTask = (task, teamId) => {
      applied[task.id] = teamId
      load[teamId] += 1
    }

    blockOrder.forEach((block) => {
      const blockTasks = byBlock[block]
      const target = leastLoadedTeam()
      const wholeBlockKeepsBalance = load[target.id] + blockTasks.length <= idealPerTeam + 1
      if (wholeBlockKeepsBalance) {
        blockTasks.forEach((t) => giveTask(t, target.id))
      } else {
        // Le bloc est trop gros pour rester entier sans déséquilibrer :
        // on le répartit tâche par tâche vers l'équipe la moins chargée
        blockTasks.forEach((t) => giveTask(t, leastLoadedTeam().id))
      }
    })

    Object.entries(applied).forEach(([taskId, teamId]) => assignTask(taskId, teamId))
    setLastAutoAssignments(snapshot)
  }

  const undoAutoAssign = () => {
    if (!lastAutoAssignments) return
    const snapshot = lastAutoAssignments
    const allIds = new Set([...Object.keys(snapshot), ...Object.keys(assignments)])
    allIds.forEach((id) => {
      const prev = snapshot[id]
      const prevTeams = Array.isArray(prev) ? prev : prev ? [prev] : []
      const curTeams = assignmentTeams(assignments, id)
      // Retirer les équipes ajoutées par la répartition automatique
      curTeams.forEach((tid) => {
        if (!prevTeams.includes(tid)) unassignTask(id, tid)
      })
      // Remettre les équipes telles qu'avant
      prevTeams.forEach((tid) => {
        if (!curTeams.includes(tid)) assignTask(id, tid)
      })
    })
    setLastAutoAssignments(null)
  }

  const zones = useMemo(() => {
    return [...new Set(tasks.map((t) => t.workArea).filter(Boolean))].sort()
  }, [tasks])

  const blocks = [...new Set(tasks.map((t) => t.taskType).filter(Boolean))].sort()

  const toggleBlock = (block) => {
    setSelectedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    )
  }

  const selectAll = () => setSelectedBlocks([])
  const selectNone = () => setSelectedBlocks([...blocks])

  // selectedBlocks = blocs masqués. Vide => tout affiché.
  const visibleBlocksList = blocks.filter((b) => !selectedBlocks.includes(b))

  // Regroupement par sous-tâche/zone (comme la page Tâches) :
  // Found Fault reste regroupé dans un bloc avec ses sous-tâches.
  const [expandedZoneCards, setExpandedZoneCards] = useState([])
  const [expandedSubZones, setExpandedSubZones] = useState([])

  const toggleZoneCard = (key) =>
    setExpandedZoneCards((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )

  const toggleSubZone = (key) =>
    setExpandedSubZones((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )

  // Blocs masqués (selectedBlocks) => tâches filtrées avant regroupement
  const prioTokensOf = (t) =>
    priorityTokens(`${t.description || ''} ${t.taskBarcode || ''}`)

  const preFilteredTasks = useMemo(
    () => tasks.filter((t) => !selectedBlocks.includes(t.taskType || 'AUTRE')),
    [tasks, selectedBlocks]
  )

  // Compteurs des jetons de priorité (sur les tâches affichées par les filtres de bloc)
  const prioCounts = useMemo(() => {
    const counts = { MEL: 0, EXMP: 0, NSRE: 0, TLI: 0, IDT: 0 }
    preFilteredTasks.forEach((t) => {
      prioTokensOf(t).forEach((tok) => {
        counts[tok] += 1
      })
    })
    return counts
  }, [preFilteredTasks])

  const filteredTasks = useMemo(
    () =>
      prioFilter.length === 0
        ? preFilteredTasks
        : preFilteredTasks.filter((t) =>
            prioTokensOf(t).some((tok) => prioFilter.includes(tok))
          ),
    [preFilteredTasks, prioFilter]
  )

  const zoneGroups = useMemo(() => {
    const groups = {}
    filteredTasks.forEach((t) => {
      const isFF = (t.taskType || '') === 'CORR'
      const key = isFF ? '__FOUND_FAULT__' : t.workArea || 'Other'
      if (!groups[key]) {
        groups[key] = {
          key,
          label: isFF ? getCategoryLabel('CORR') : key,
          isFF,
          zones: {},
        }
      }
      const sub = t.workArea || 'No sub-task'
      if (!groups[key].zones[sub]) groups[key].zones[sub] = []
      groups[key].zones[sub].push(t)
    })
    return Object.values(groups).sort(
      (a, b) => (a.isFF ? 1 : 0) - (b.isFF ? 1 : 0) || a.label.localeCompare(b.label)
    )
  }, [filteredTasks])

  // Affecter à une équipe toutes les tâches d'une sous-tâche (tous blocs confondus)
  // Affecte toute une sous-tâche : hors Found Fault (les CORR restent dans
  // leur bloc, affectables via « tout le bloc »)
  const assignZoneAll = (zone, teamId) => {
    filteredTasks
      .filter(
        (t) =>
          (t.workArea || 'Other') === zone && (t.taskType || 'AUTRE') !== 'CORR'
      )
      .forEach((t) => manualAssign(t.id, teamId))
  }

  // Affecte toute une sous-tâche d'un bloc précis (ex. SEATS du Found Fault,
  // sans toucher au SEATS du JIC)
  const assignZoneInBlock = (zone, block, teamId) => {
    filteredTasks
      .filter(
        (t) =>
          (t.workArea || 'Other') === zone && (t.taskType || 'AUTRE') === block
      )
      .forEach((t) => manualAssign(t.id, teamId))
  }

  // Vide la charge d'une équipe : toutes ses lignes sont désassignées
  const clearTeamCharge = (teamId) => {
    const team = (teams || []).find((t) => t.id === teamId)
    tasks
      .filter((t) => assignmentTeams(assignments, t.id).includes(teamId))
      .forEach((t) => unassignTask(t.id, teamId))
    if (team) clearAgentChargesByTeam(team.name)
  }

  const manualAssign = (taskId, teamId) => {
    setLastAutoAssignments(null)
    assignTask(taskId, teamId)
  }

  const manualUnassign = (taskId, teamId) => {
    setLastAutoAssignments(null)
    unassignTask(taskId, teamId)
  }

  const handleDrop = (teamId) => {
    if (dragTask) {
      manualAssign(dragTask, teamId)
    }
    setDragTask(null)
  }

  // Renomme le titre d'une ligne (description de la tâche)
  const renameTask = (task) => {
    const next = window.prompt('New line title:', task.description || '')
    if (next === null) return
    const name = String(next).trim()
    if (!name) return
    updateTask(task.id, { description: name })
  }

  const assignedCount = (teamId) =>
    Object.values(assignments).filter((ids) =>
      Array.isArray(ids) ? ids.includes(teamId) : ids === teamId
    ).length

  // Répartition blocs/zones affectés à une équipe (+ tâches individuelles)
  const teamBlocks = (teamId) => {
    const groups = {}
    tasks.forEach((t) => {
      if (isAssignedTo(assignments, t.id, teamId) && t.taskType) {
        const zone = t.workArea || 'Other'
        const key = `${t.taskType} / ${zone}`
        if (!groups[key]) groups[key] = { count: 0, tasks: [] }
        groups[key].count += 1
        groups[key].tasks.push(t)
      }
    })
    Object.values(groups).forEach((g) =>
      g.tasks.sort((a, b) => Number(a.seq) - Number(b.seq))
    )
    return groups
  }

  // Affecter tout un bloc à une équipe — uniquement les lignes AFFICHÉES
  // (respecte les filtres de blocs et de priorités)
  const assignWholeBlock = (block, teamId) => {
    const unassigned = filteredTasks.filter(
      (t) => t.taskType === block && assignmentTeams(assignments, t.id).length === 0
    )
    unassigned.forEach((t) => manualAssign(t.id, teamId))
  }

  // ---- Fusion Équipes : membres, équipes d'après les consignes ----
  const activeMembers = memberTab === 'permanent' ? members : dayMembers

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
    setPickedConsignes([])
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
    setPickedConsignes([])
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
  }

  const handleBulkAdd = () => {
    const names = memberInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (memberTab === 'permanent') addMembers(names)
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
        if (memberTab === 'permanent') addMembers(names)
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
    setMemberTab(next)
    setSelected([])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Teams & assignment</h1>
        <p className="text-slate-600 mt-1">
          Manage teams and members, then assign tasks in the same place: by{' '}
          <strong>entire block</strong> (menu at the top of each block), <strong>line by line</strong> or by drag and drop.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setTab('affectation')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
            tab === 'affectation'
              ? 'bg-sky-600 border-sky-600 text-white shadow-lg ring-2 ring-sky-300'
              : 'bg-white border-slate-200 text-slate-600 hover:border-sky-400 hover:bg-sky-50'
          }`}
        >
          Task assignment
        </button>
        {PRIMES_ENABLED && (
          <button
            onClick={() => setTab('primes')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold border-2 transition-all ${
              tab === 'primes'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg ring-2 ring-emerald-300'
                : 'bg-white border-emerald-300 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-50'
            }`}
          >
            Toilet bonuses — beneficiaries
          </button>
        )}
      </div>

      {tab === 'affectation' || !PRIMES_ENABLED ? (
        <>

      <ConsignesAvions />


      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-sky-600">
        <div>
          <p className="text-sm font-semibold text-slate-800">Add a line manually</p>
          <p className="text-xs text-slate-500">
            The line appears unassigned, ready to be assigned below.
          </p>
        </div>
        <ManualTaskForm
          onAdd={(list) => {
            addTasks(list)
            setExpandedZoneCards((prev) => [
              ...new Set([
                ...prev,
                ...list.map((t) =>
                  (t.taskType || '') === 'CORR' ? '__FOUND_FAULT__' : t.workArea || 'No zone'
                ),
              ]),
            ])
          }}
          zoneOptions={zones}
          existingTasks={tasks}
        />
      </div>

      {/* Membres : permanents / du jour (repliable) */}
      <div className="bg-white rounded-xl shadow">
        <button
          onClick={() => setShowMembers(!showMembers)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <BookUser className="h-4 w-4 text-sky-500" /> Members
            <span className="text-xs font-normal text-slate-400">
              ({members.length} permanent · {dayMembers.length} today)
            </span>
          </h2>
          {showMembers ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {showMembers && (
          <div className="px-4 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <div className="inline-flex p-1 rounded-lg bg-slate-100">
                <button
                  onClick={() => switchTab('permanent')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    memberTab === 'permanent'
                      ? 'bg-white text-slate-900 shadow'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Permanent members ({members.length})
                </button>
                <button
                  onClick={() => switchTab('jour')}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                    memberTab === 'jour'
                      ? 'bg-white text-slate-900 shadow'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Assigned to today's aircraft ({dayMembers.length})
                </button>
              </div>
            </div>

            <p className="text-sm text-slate-500 mb-4">
              {memberTab === 'permanent'
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
                    memberTab === 'permanent'
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
              {memberTab === 'jour' && dayMembers.length > 0 && (
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
                    {memberTab === 'permanent'
                      ? 'No permanent members.'
                      : 'No members for the day (they arrive with imported instructions).'}
                  </span>
                )}
                {activeMembers.map((m) => {
                  const isLeader = memberTab === 'jour' && (dayLeaders || []).includes(m)
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
        )}
      </div>

      {/* Équipes d'après les consignes du jour (repliable) */}
      <div className="bg-white rounded-xl shadow border-l-4 border-l-sky-500">
        <button
          onClick={() => setShowConsignesTeams(!showConsignesTeams)}
          className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <Users className="h-4 w-4 text-sky-500" /> Teams from instructions
            {consignesDay && (
              <span className="text-xs font-normal text-slate-400">({consignesDay})</span>
            )}
          </h2>
          {showConsignesTeams ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {showConsignesTeams && (
          <div className="px-4 pb-4">
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
                  remaining members are added manually ("Add members" on the team card).
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Répartition automatique assistée */}
      {teams.length > 0 && blocks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-sky-600" /> Automatic distribution
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {autoTeams.length === 0
                  ? 'All teams are locked: unlock at least one to distribute.'
                  : autoSelectedBlocks.length === 0
                    ? 'No block selected: automatic distribution will not touch any task. First check a block.'
                    : autoScopeCount === 0
                      ? 'Block(s) selected but no sub-block checked: check the required sub-blocks (or "All").'
                      : `${autoScopeCount} task(s) selected — balanced by number of tasks across the ${autoTeams.length} unlocked team(s) (whole blocks when balance allows), Found Fault first.`}
                {autoLockedCount > 0 && autoTeams.length > 0 && (
                  <span className="text-amber-600 font-semibold">
                    {' '}— {autoLockedCount} locked team(s) will receive nothing.
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lastAutoAssignments && (
                <button
                  onClick={undoAutoAssign}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-md"
                  title="Restore the assignments from before automatic distribution"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Cancel
                </button>
              )}
              <button
                onClick={autoAssign}
                disabled={autoScopeCount === 0 || autoTeams.length === 0}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                title="Distribute unassigned tasks from the selected blocks and sub-blocks across the unlocked teams"
              >
                <Users className="h-4 w-4" /> Distribute automatically
              </button>
            </div>
          </div>
          {blocks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Blocks to distribute:</span>
              {blocks.map((block) => {
                const active = autoSelectedBlocks.includes(block)
                const color = getCategoryColor(block)
                const count = tasks.filter(
                  (t) =>
                    (t.taskType || 'AUTRE') === block &&
                    assignmentTeams(assignments, t.id).length === 0
                ).length
                return (
                  <button
                    key={block}
                    onClick={() => toggleAutoBlock(block)}
                    className="px-2.5 py-1 rounded-full text-xs font-semibold transition-all border-2"
                    style={{
                      backgroundColor: active ? color : 'transparent',
                      borderColor: color,
                      color: active ? '#fff' : color,
                    }}
                    title={
                      active
                        ? 'Click to exclude this block from the distribution'
                        : 'Click to include this block in the distribution'
                    }
                  >
                    {getCategoryLabel(block)} ({count})
                  </button>
                )
              })}
              {blocks
                .filter((b) => autoSelectedBlocks.includes(b))
                .map((block) => {
                  const zoneEntries = Object.entries(allBlockZones[block] || {}).sort((a, b) =>
                    a[0].localeCompare(b[0])
                  )
                  if (!zoneEntries.length) return null
                  return (
                    <div key={block} className="w-full flex flex-wrap items-center gap-1.5 pl-3">
                      <span className="text-[11px] font-semibold text-slate-400">
                        {getCategoryLabel(block)}: sub-blocks
                      </span>
                      {zoneEntries.map(([zone, count]) => {
                        const key = zoneScopeKey(block, zone)
                        const active = !autoExcludedZones.includes(key)
                        const color = getZoneColor(zone, zones)
                        return (
                          <button
                            key={key}
                            onClick={() => toggleAutoZone(block, zone)}
                            className="px-2 py-0.5 rounded-full text-[11px] font-semibold transition-all border-2"
                            style={{
                              backgroundColor: active ? color : 'transparent',
                              borderColor: color,
                              color: active ? '#fff' : color,
                            }}
                            title={
                              active
                                ? 'Click to remove this sub-block from the distribution'
                                : 'Click to include this sub-block in the distribution'
                            }
                          >
                            {zone} ({count})
                          </button>
                        )
                      })}
                      {zoneEntries.length > 1 && (
                        <button
                          onClick={() =>
                            setAutoExcludedZones((prev) =>
                              prev.filter((k) => !k.startsWith(`${block}::`))
                            )
                          }
                          className="text-[11px] text-sky-600 hover:underline"
                          title={`Re-include all sub-blocks of ${getCategoryLabel(block)}`}
                        >
                          All
                        </button>
                      )}
                    </div>
                  )
                })}
              {blocks.length > 1 && (
                <button onClick={toggleAutoAll} className="text-xs text-sky-600 hover:underline">
                  {autoSelectedBlocks.length === blocks.length
                    ? 'Unselect all'
                    : 'Select all'}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filtre multi-blocs */}
      {blocks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-slate-700">Filter by block</h2>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-sky-600 hover:underline">Show all</button>
              <span className="text-slate-300">|</span>
              <button onClick={selectNone} className="text-slate-500 hover:underline">Hide all</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {blocks.map((block) => {
              const hidden = selectedBlocks.includes(block)
              const active = !hidden
              const color = getCategoryColor(block)
              const count = tasks.filter((t) => t.taskType === block).length
              return (
                <button
                  key={block}
                  onClick={() => toggleBlock(block)}
                  className="px-3 py-1.5 rounded-full text-sm font-semibold transition-all border-2"
                  style={{
                    backgroundColor: active ? color : 'transparent',
                    borderColor: color,
                    color: active ? '#fff' : color,
                  }}
                >
                  {getCategoryLabel(block)} ({count})
                </button>
              )
            })}
            {selectedBlocks.length > 0 && (
              <span className="text-xs text-slate-400 self-center">
                Showing: {visibleBlocksList.length} block(s)
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-3 pt-3 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-500">Priorities:</span>
            {['MEL', 'EXMP', 'NSRE', 'TLI', 'IDT'].map((tok) => (
              <button
                key={tok}
                onClick={() =>
                  setPrioFilter((prev) =>
                    prev.includes(tok) ? prev.filter((x) => x !== tok) : [...prev, tok]
                  )
                }
                className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                  prioFilter.includes(tok)
                    ? 'bg-[#ff0000] border-[#ff0000] text-white'
                    : 'bg-white border-[#ff0000] text-[#ff0000] hover:bg-[#ff0000]/10'
                }`}
                title={`Show ${tok} lines (can be combined with the other filters)`}
              >
                {tok} ({prioCounts[tok]})
              </button>
            ))}
            {prioFilter.length > 0 && (
              <button
                onClick={() => setPrioFilter([])}
                className="text-xs text-sky-600 hover:underline"
              >
                Show all again
              </button>
            )}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg">
          Create teams first before assigning tasks. Go to the "Teams" page.
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="min-w-0 space-y-4">
          {zoneGroups.length === 0 && (
            <div className="bg-white rounded-xl shadow p-8 text-center text-slate-500">
              <ClipboardList className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              No block is displayed. Select blocks above, or import your Excel file.
            </div>
          )}

          {zoneGroups.map((group) => {
            const groupTasks = Object.values(group.zones).flat()
            const cardColor = group.isFF
              ? getCategoryColor('CORR')
              : getZoneColor(group.label, zones)
            const unassignedInGroup = groupTasks.filter(
              (t) => assignmentTeams(assignments, t.id).length === 0
            )
            const cardOpen = expandedZoneCards.includes(group.key)
            const groupBlocks = [...new Set(groupTasks.map((t) => t.taskType || 'AUTRE'))].sort()
            const groupMemberNames = [
              ...new Set(
                teams
                  .filter((t) =>
                    groupTasks.some((task) => isAssignedTo(assignments, task.id, t.id))
                  )
                  .flatMap((t) => t.members)
              ),
            ]
            return (
              <div
                key={group.key}
                className={`bg-white rounded-xl shadow overflow-hidden${cardOpen ? ' ring-2 ring-black' : ''}`}
              >
                <div
                  className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                  style={{ backgroundColor: cardColor }}
                  onClick={() => toggleZoneCard(group.key)}
                  title={cardOpen ? 'Collapse this block' : 'Expand this block'}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {cardOpen ? (
                      <ChevronDown className="h-5 w-5 text-white shrink-0" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-white shrink-0" />
                    )}
                    <h3 className="font-bold text-white text-sm truncate">
                      {group.isFF ? 'Bloc Found Fault' : `📍 ${group.label}`}{' '}
                      <span className="font-normal opacity-80">({groupTasks.length})</span>
                    </h3>
                    {groupMemberNames.length > 0 && (
                      <span
                        className="text-white/90 text-xs font-semibold truncate"
                        title={`Members: ${groupMemberNames.join(', ')}`}
                      >
                        Members: {groupMemberNames.join(', ')}
                      </span>
                    )}
                  </div>
                  <div
                    className="flex flex-wrap items-center gap-1.5 justify-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-white/90 text-[11px] whitespace-nowrap">
                      {unassignedInGroup.length} unassigned
                    </span>
                    {teams.length > 0 && unassignedInGroup.length > 0 && (
                      <select
                        value=""
                        onChange={(e) => {
                          if (!e.target.value) return
                          if (group.isFF) assignWholeBlock('CORR', e.target.value)
                          else assignZoneAll(group.label, e.target.value)
                        }}
                        className="h-6 border-none rounded-full px-2 text-[11px] leading-none bg-white text-slate-800 cursor-pointer font-semibold"
                        title={group.isFF ? 'Assign the entire block' : 'Assign the entire sub-task'}
                      >
                        <option value="">{group.isFF ? '— Entire block —' : '— Entire sub-task —'}</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>To {t.name}</option>
                        ))}
                      </select>
                    )}
                    {groupBlocks.map((blk) => {
                      const n = groupTasks.filter((t) => (t.taskType || 'AUTRE') === blk).length
                      return (
                        <span
                          key={blk}
                          className="inline-flex items-center gap-1 h-6 rounded-full pl-2 pr-1 bg-white/25"
                        >
                          <span className="text-[10px] font-bold text-white whitespace-nowrap">
                            {getCategoryLabel(blk)} · {n}
                          </span>
                          <button
                            onClick={() => {
                              const total = tasks.filter((t) => (t.taskType || 'AUTRE') === blk).length
                              if (
                                window.confirm(
                                  `Delete the entire block ${getCategoryLabel(blk)} (${total} tasks, all zones)?\n\nAll these tasks will disappear from the planning.`
                                )
                              ) {
                                removeTasksByBlock(blk)
                              }
                            }}
                            className="text-white/80 hover:text-white"
                            title={`Delete the entire block ${getCategoryLabel(blk)}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </span>
                      )
                    })}
                  </div>
                </div>

                {cardOpen && (
                  <div className="p-4 space-y-3">
                    {Object.entries(group.zones)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([subZone, subTasks]) => {
                        const zoneColor = getZoneColor(subZone, zones)
                        const subKey = `${group.key}::${subZone}`
                        const subOpen = !group.isFF || expandedSubZones.includes(subKey)
                        const unassignedInZone = subTasks.filter(
                          (t) => assignmentTeams(assignments, t.id).length === 0
                        )
                        const subMemberNames = [
                          ...new Set(
                            teams
                              .filter((t) =>
                                subTasks.some((task) => isAssignedTo(assignments, task.id, t.id))
                              )
                              .flatMap((t) => t.members)
                          ),
                        ]
                        return (
                          <div
                            key={subZone}
                            className="rounded-lg border bg-white overflow-hidden"
                            style={{ borderColor: zoneColor, borderWidth: 2 }}
                          >
                            {group.isFF && (
                              <div
                                className="px-4 py-2 flex flex-wrap items-center justify-between gap-2 cursor-pointer"
                                style={{ backgroundColor: zoneColor }}
                                onClick={() => toggleSubZone(subKey)}
                              >
                                <div className="flex items-center gap-2 min-w-0 flex-1">
                                  {subOpen ? (
                                    <ChevronDown className="h-5 w-5 text-white shrink-0" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-white shrink-0" />
                                  )}
                                  <span className="text-sm font-bold text-white truncate">
                                    📍 {subZone}{' '}
                                    <span className="font-normal opacity-90">({subTasks.length})</span>
                                  </span>
                                  {subMemberNames.length > 0 && (
                                    <span
                                      className="text-white/90 text-xs font-semibold truncate"
                                      title={`Members: ${subMemberNames.join(', ')}`}
                                    >
                                      Members: {subMemberNames.join(', ')}
                                    </span>
                                  )}
                                </div>
                                <div
                                  className="flex flex-wrap items-center gap-1.5 justify-end"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <span className="text-white/90 text-[11px] whitespace-nowrap">
                                    {unassignedInZone.length} unassigned
                                  </span>
                                  {teams.length > 0 && unassignedInZone.length > 0 && (
                                    <select
                                      defaultValue=""
                                      onChange={(e) => {
                                        if (e.target.value)
                                          assignZoneInBlock(subZone, 'CORR', e.target.value)
                                        e.target.value = ''
                                      }}
                                      className="h-6 border-none rounded-full px-2 text-[11px] leading-none bg-white text-slate-800 cursor-pointer font-semibold"
                                      title="Assign the entire Found Fault sub-task"
                                    >
                                      <option value="">— Entire sub-task —</option>
                                      {teams.map((t) => (
                                        <option key={t.id} value={t.id}>To {t.name}</option>
                                      ))}
                                    </select>
                                  )}
                                </div>
                              </div>
                            )}
                            {subOpen && (
                              <ul className="divide-y divide-slate-100">
                                {subTasks.map((task) => {
                                  const assignedTeams = assignmentTeams(assignments, task.id)
                                    .map((tid) => teams.find((tm) => tm.id === tid))
                                    .filter(Boolean)
                                  const assigned = assignedTeams.length > 0
                                  return (
                                    <li
                                      key={task.id}
                                      draggable={!assigned}
                                      onDragStart={() => setDragTask(task.id)}
                                      onDragEnd={() => setDragTask(null)}
                                      className="px-4 py-2 hover:bg-slate-50 flex flex-wrap items-center gap-x-3 gap-y-2 cursor-grab"
                                    >
                                      <span
                                        className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                                        style={{ backgroundColor: getCategoryColor(task.taskType) }}
                                        title={`Block ${getCategoryLabel(task.taskType)}`}
                                      >
                                        {getCategoryLabel(task.taskType) || '—'}
                                      </span>
                                      <span className="w-10 shrink-0 text-center bg-slate-100 rounded-md px-2 py-1 text-xs font-bold text-slate-600">
                                        {task.seq || '—'}
                                      </span>
                                      <div className="flex-1 min-w-[220px]">
                                        <p className="text-sm font-medium" title={task.description}>
                                          <span className="flex items-center gap-1 min-w-0">
                                            <span
                                              className={`truncate ${
                                                task.taskDescription || task.taskSteps
                                                  ? 'cursor-pointer hover:underline decoration-dotted'
                                                  : ''
                                              }`}
                                              onClick={() =>
                                                (task.taskDescription || task.taskSteps) && setDescTask(task)
                                              }
                                            >
                                              {task.description}
                                            </span>
                                            {(task.taskDescription || task.taskSteps) && (
                                              <button
                                                onClick={() => setDescTask(task)}
                                                className="shrink-0 text-sky-600 hover:text-sky-800"
                                                title="View the detailed description and steps (Task_Description / Task_Steps)"
                                              >
                                                <FileText className="h-3.5 w-3.5" />
                                              </button>
                                            )}
                                            <button
                                              onClick={() => renameTask(task)}
                                              className="shrink-0 text-slate-400 hover:text-sky-700"
                                              title="Rename this line (title)"
                                            >
                                              <Pencil className="h-3.5 w-3.5" />
                                            </button>
                                            {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`) && (
                                              <span
                                                className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ff0000]/10 text-[#ff0000] border border-[#ff0000]/40 whitespace-nowrap"
                                                title="Priority line (MEL / EXMP)"
                                              >
                                                {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`)}
                                              </span>
                                            )}
                                          </span>
                                        </p>
                                        <p className="text-xs text-slate-400 truncate">
                                          {task.taskBarcode && (
                                            <span className="font-mono font-bold text-slate-500">
                                              {task.taskBarcode}  {' '}
                                            </span>
                                          )}
                                          {task.registration && `✈ ${task.registration}  `}
                                          {task.skills && `🔧 ${task.skills}  `}
                                        </p>
                                      </div>

                                      <NoteCell
                                        note={task.note}
                                        onSave={(v) => updateTask(task.id, { note: v })}
                                      />

                                      {assigned ? (
                                        <div className="flex flex-wrap items-center gap-1.5 shrink-0 ml-auto">
                                          {assignedTeams.map((teamChip) => (
                                            <span
                                              key={teamChip.id}
                                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                              style={{ backgroundColor: teamChip.color }}
                                            >
                                              {teamChip.name}
                                              <button
                                                onClick={() => manualUnassign(task.id, teamChip.id)}
                                                className="text-white/70 hover:text-white"
                                                title={`Unassign from ${teamChip.name}`}
                                              >
                                                <X className="h-3 w-3" />
                                              </button>
                                            </span>
                                          ))}
                                          {teams.some(
                                            (tm) => !assignedTeams.some((c) => c.id === tm.id)
                                          ) && (
                                            <select
                                              defaultValue=""
                                              onChange={(e) => {
                                                if (e.target.value) manualAssign(task.id, e.target.value)
                                              }}
                                              className="border border-slate-300 rounded-md px-2 py-1 text-xs shrink-0"
                                              title="Add another team"
                                            >
                                              <option value="">+ team</option>
                                              {teams
                                                .filter(
                                                  (tm) => !assignedTeams.some((c) => c.id === tm.id)
                                                )
                                                .map((tm) => (
                                                  <option key={tm.id} value={tm.id}>
                                                    {tm.name}
                                                  </option>
                                                ))}
                                            </select>
                                          )}
                                        </div>
                                      ) : (
                                        <select
                                          defaultValue=""
                                          onChange={(e) => {
                                            if (e.target.value) manualAssign(task.id, e.target.value)
                                          }}
                                          className="border border-slate-300 rounded-md px-2 py-1 text-xs shrink-0 ml-auto"
                                          title="Assign this line"
                                        >
                                          <option value="">— Line —</option>
                                          {teams.map((t) => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                          ))}
                                        </select>
                                      )}
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="min-w-0 space-y-4">
          <div className="bg-slate-900 rounded-xl shadow p-4 text-white">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h2 className="font-bold flex items-center gap-2">
                <Users className="h-5 w-5 text-sky-400" /> Teams
              </h2>
              <button
                onClick={() => setShowAdd(!showAdd)}
                className="flex items-center gap-1 text-xs font-semibold text-sky-300 border border-sky-400/40 hover:bg-sky-500/20 rounded-full px-2.5 py-1"
              >
                {showAdd ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {showAdd ? 'Cancel' : 'New team'}
              </button>
            </div>
            {showAdd && (
              <div className="bg-white rounded-lg p-3 mb-3 text-slate-800">
                <label className="block text-xs font-semibold text-slate-600 mb-1">Team name</label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Morning mechanical team"
                  className="w-full border border-slate-300 rounded-md px-3 py-2 mb-3 text-sm"
                />
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  Members (from the "{memberTab === 'permanent' ? 'Permanent members' : "Assigned to today's aircraft"}" tab)
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
                  <p className="text-xs text-amber-600 mb-2">
                    No members available in this tab. Add some in the Members panel above, or
                    first remove the members already assigned.
                  </p>
                )}
                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-md p-1.5 space-y-0.5 mb-2">
                  {visibleMembers.map((m) => (
                    <label key={m} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={selected.includes(m)}
                        onChange={() => toggleSelected(m)}
                        className="h-4 w-4 accent-sky-600"
                      />
                      {m}
                    </label>
                  ))}
                  {availableMembers.length > 0 && visibleMembers.length === 0 && (
                    <p className="text-xs text-slate-400 italic px-2 py-1">
                      No name matches "{memberSearch.trim()}".
                    </p>
                  )}
                </div>
                {selected.length > 0 && (
                  <p className="text-xs text-slate-500 mb-2">Selection: {selected.join(', ')}</p>
                )}
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                >
                  {selected.length > 0
                    ? `Create team (${selected.length} member${selected.length > 1 ? 's' : ''})`
                    : 'Create team (empty — members to add later)'}
                </button>
              </div>
            )}
            {teams.length === 0 && (
              <p className="text-sm text-slate-400">No teams created.</p>
            )}
            {teams.map((team) => (
              <div
                key={team.id}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => handleDrop(team.id)}
                className={`mb-2 rounded-lg transition-colors ${
                  dragTask ? 'ring-2 ring-sky-400 bg-slate-800' : 'bg-slate-800'
                }`}
                style={{ borderLeft: `4px solid ${team.color}` }}
              >
                <div className="px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sm flex items-center gap-1.5">
                      {team.locked && (
                        <Lock className="h-3.5 w-3.5 text-amber-400" />
                      )}
                      {team.name}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-2">
                      {team.locked && <span className="text-[10px] text-amber-400 font-semibold">locked</span>}
                      {assignedCount(team.id)} task(s)
                      {assignedCount(team.id) > 0 && (
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Clear the workload of team "${team.name}" (${assignedCount(team.id)} task(s))?\n\nThe lines will be unassigned (they remain in the tasks) and the workload sent to the agent will be removed.`
                              )
                            ) {
                              clearTeamCharge(team.id)
                            }
                          }}
                          className="text-slate-400 hover:text-amber-300"
                          title={`Clear the workload (unassign its ${assignedCount(team.id)} task(s)) — the team is kept`}
                        >
                          <Eraser className="h-4 w-4" />
                        </button>
                      )}
                      {assignedCount(team.id) > 0 && (
                        <button
                          onClick={() => setSendTeam(team)}
                          className="text-slate-400 hover:text-sky-300"
                          title={`Send ${team.name}'s workload to an agent profile`}
                        >
                          <Send className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => updateTeam(team.id, { locked: !team.locked })}
                        className={team.locked ? 'text-amber-300 hover:text-amber-100' : 'text-slate-500 hover:text-amber-300'}
                        title={
                          team.locked
                            ? 'Unlock this team (it will be able to receive tasks in automatic distribution)'
                            : 'Lock this team (it will no longer receive tasks in automatic distribution)'
                        }
                      >
                        {team.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => {
                          const next = window.prompt('New team name:', team.name)
                          if (next === null) return
                          const name = String(next).trim()
                          if (!name) return
                          updateTeam(team.id, { name })
                        }}
                        className="text-slate-400 hover:text-sky-300"
                        title="Rename team"
                      >
                        <Pencil className="h-4 w-4" />
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
                        className="text-red-400 hover:text-red-300"
                        title="Delete this team (also removes the workload sent to the agent)"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-1">
                    {team.members.length === 0 && <span>—</span>}
                    {team.members.map((m, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 bg-slate-700 rounded-full pl-2 pr-1 py-0.5 text-slate-200"
                      >
                        {m}
                        <button
                          onClick={() => removeFromTeam(team.id, m)}
                          className="text-slate-400 hover:text-red-400"
                          title={`Remove ${m} from this team`}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  {availableForTeam().length > 0 && (
                    <div className="mt-1.5">
                      <button
                        onClick={() => toggleAddMember(team.id)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-sky-300 hover:text-sky-200"
                        title="Show/hide the list of members to add"
                      >
                        {openAddMember.includes(team.id) ? (
                          <ChevronDown className="h-3 w-3" />
                        ) : (
                          <ChevronRight className="h-3 w-3" />
                        )}
                        Add members ({availableForTeam().length})
                      </button>
                      {openAddMember.includes(team.id) && (
                        <div className="mt-1.5">
                          <div className="relative mb-1.5">
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
                              className="w-full border border-slate-600 bg-slate-900 text-slate-100 rounded-md pl-8 pr-2 py-1.5 text-xs"
                            />
                          </div>
                          <div className="max-h-32 overflow-y-auto border border-slate-600 rounded-md p-1 space-y-0.5">
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
                                  className="w-full text-left bg-slate-800 hover:bg-slate-700 text-slate-200 rounded px-2 py-1 text-xs"
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
                  <div className="mt-2 flex flex-col gap-1">
                    {Object.keys(teamBlocks(team.id)).length === 0 && (
                      <span className="text-xs text-slate-500 italic">No block assigned</span>
                    )}
                    {Object.entries(teamBlocks(team.id))
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([key, info]) => {
                        const [blk, zone] = key.split(' / ')
                        const color = getCategoryColor(blk)
                        return (
                          <div
                            key={key}
                            className="rounded-md overflow-hidden"
                            style={{ border: `1px solid ${color}` }}
                          >
                            <div
                              className="px-2 py-1 text-[11px] font-bold text-white"
                              style={{ backgroundColor: color }}
                            >
                              {getCategoryLabel(blk)} · {zone}{' '}
                              <span className="font-normal opacity-90">
                                ({info.count} task{info.count > 1 ? 's' : ''})
                              </span>
                            </div>
                            {info.tasks.length > 0 && (
                              <div className="bg-white">
                                {info.tasks.map((t) => (
                                  <div
                                    key={t.id}
                                    className="px-2 py-1.5 text-xs border-t border-dashed border-slate-100"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="font-mono font-bold text-slate-600 w-9 shrink-0">
                                        {t.seq || '—'}
                                      </span>
                                      {t.taskBarcode && (
                                        <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
                                          {t.taskBarcode}
                                        </span>
                                      )}
                                      <span className="flex-1" />
                                      <button
                                        onClick={() => renameTask(t)}
                                        className="shrink-0 text-slate-400 hover:text-sky-700"
                                        title="Rename this line (title)"
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </button>
                                      {(t.taskDescription || t.taskSteps) && (
                                        <button
                                          onClick={() => setDescTask(t)}
                                          className="shrink-0 text-sky-600 hover:text-sky-800"
                                          title="View the detailed description and steps (Task_Description / Task_Steps)"
                                        >
                                          <FileText className="h-3 w-3" />
                                        </button>
                                      )}
                                      <button
                                        onClick={() => manualUnassign(t.id, team.id)}
                                        className="text-slate-400 hover:text-red-600 shrink-0"
                                        title="Unassign from team (the task becomes unassigned again)"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </div>
                                    <p
                                      className={`mt-0.5 font-medium text-slate-800 leading-snug ${
                                        t.taskDescription || t.taskSteps
                                          ? 'cursor-pointer hover:underline decoration-dotted'
                                          : ''
                                      }`}
                                      title={t.description}
                                      onClick={() =>
                                        (t.taskDescription || t.taskSteps) && setDescTask(t)
                                      }
                                    >
                                      {t.description}
                                    </p>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      </>
      ) : (
        <LeaderPrimesForm />
      )}

      {descTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDescTask(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  No. {descTask.seq || '—'} · {descTask.description}
                </h2>
                <p className="text-xs text-slate-300 truncate">
                  {[
                    descTask.taskBarcode ? `TRFX ${descTask.taskBarcode}` : '',
                    descTask.registration || '',
                    descTask.workArea || '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                onClick={() => setDescTask(null)}
                className="text-slate-300 hover:text-white shrink-0"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 bg-slate-50">
              {descTask.taskDescription && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sky-600" />
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      Detailed description
                    </p>
                  </div>
                  <p className="p-3 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                    {cleanTaskText(descTask.taskDescription)}
                  </p>
                </div>
              )}
              {descTask.taskSteps && (
                <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                      Steps (Task Steps)
                    </p>
                  </div>
                  <p className="p-3 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                    {cleanTaskText(descTask.taskSteps)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sendTeam && (
        <SendChargeToAgent team={sendTeam} onClose={() => setSendTeam(null)} />
      )}
    </div>
  )
}

const defaultColors = TEAM_COLORS
