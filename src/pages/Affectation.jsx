import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getCategoryColor, getZoneColor, getCategoryLabel, assignmentTeams, isAssignedTo } from '../utils/helpers'
import ManualTaskForm from '../components/ManualTaskForm'
import { Users, ClipboardList, Undo2, ChevronDown, ChevronRight, Wand2, Trash2, Lock, LockOpen, Pencil, Check, X } from 'lucide-react'

export default function Affectation() {
  const { tasks, teams, assignments, assignTask, unassignTask, updateTeam, addTasks, removeTasksByBlock, updateTask } = useApp()
  const [dragTask, setDragTask] = useState(null)
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [expandedBlocks, setExpandedBlocks] = useState([])
  const [expandedZones, setExpandedZones] = useState([])
  const [lastAutoAssignments, setLastAutoAssignments] = useState(null)
  const [noteEditId, setNoteEditId] = useState(null)
  const [noteText, setNoteText] = useState('')

  const saveTaskNote = (id) => {
    updateTask(id, { note: noteText.trim() || undefined })
    setNoteEditId(null)
  }

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
    const zone = t.workArea || 'Autre'
    if (!allBlockZones[block]) allBlockZones[block] = {}
    allBlockZones[block][zone] = (allBlockZones[block][zone] || 0) + 1
  })

  const autoScopeTasks = useMemo(
    () =>
      tasks.filter((t) => {
        if (assignmentTeams(assignments, t.id).length) return false
        const block = t.taskType || 'AUTRE'
        if (!autoSelectedBlocks.includes(block)) return false
        const zone = t.workArea || 'Autre'
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
      const prevTeam = snapshot[id]
      if (prevTeam) {
        if (!isAssignedTo(assignments, id, prevTeam)) assignTask(id, prevTeam)
      } else {
        assignmentTeams(assignments, id).forEach((tid) => unassignTask(id, tid))
      }
    })
    setLastAutoAssignments(null)
  }

  const toggleBlockCollapse = (block) => {
    setExpandedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    )
  }

  const toggleZoneCollapse = (key) => {
    setExpandedZones((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
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

  // Grouper par bloc
  const groupedByBlock = useMemo(() => {
    const groups = {}
    tasks.forEach((t) => {
      const block = t.taskType || 'AUTRE'
      if (!groups[block]) groups[block] = []
      groups[block].push(t)
    })
    return groups
  }, [tasks])

  // Grouper les tâches d'un bloc par work area
  const groupByZone = (blockTasks) => {
    const groups = {}
    blockTasks.forEach((t) => {
      const zone = t.workArea || 'Autre'
      if (!groups[zone]) groups[zone] = []
      groups[zone].push(t)
    })
    return groups
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

  const assignedCount = (teamId) =>
    Object.values(assignments).filter((ids) =>
      Array.isArray(ids) ? ids.includes(teamId) : ids === teamId
    ).length

  // Répartition blocs/zones affectés à une équipe (+ tâches individuelles)
  const teamBlocks = (teamId) => {
    const groups = {}
    tasks.forEach((t) => {
      if (isAssignedTo(assignments, t.id, teamId) && t.taskType) {
        const zone = t.workArea || 'Autre'
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

  // Affecter tout un bloc à une équipe
  const assignWholeBlock = (block, teamId) => {
    const unassigned = tasks.filter(
      (t) => t.taskType === block && assignmentTeams(assignments, t.id).length === 0
    )
    unassigned.forEach((t) => manualAssign(t.id, teamId))
  }

  // Affecter toutes les tâches d'un bloc ET d'une zone à une équipe
  const assignWholeZone = (block, zone, teamId) => {
    const unassigned = tasks.filter(
      (t) =>
        t.taskType === block &&
        (t.workArea || 'Autre') === zone &&
        assignmentTeams(assignments, t.id).length === 0
    )
    unassigned.forEach((t) => manualAssign(t.id, teamId))
  }

  const bulkSelectValue = ''

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Affectation des tâches</h1>
        <p className="text-slate-600 mt-1">
          Affectez par <strong>bloc complet</strong> (menu en haut de chaque bloc) ou <strong>ligne par ligne</strong>. Glissez-déposez également possible.
        </p>
      </div>

      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-sky-600">
        <div>
          <p className="text-sm font-semibold text-slate-800">Ajouter une ligne manuellement</p>
          <p className="text-xs text-slate-500">
            La ligne apparaît non assignée, prête à être affectée ci-dessous.
          </p>
        </div>
        <ManualTaskForm onAdd={addTasks} zoneOptions={zones} existingTasks={tasks} />
      </div>

      {/* Répartition automatique assistée */}
      {teams.length > 0 && blocks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-sky-600" /> Répartition automatique
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {autoTeams.length === 0
                  ? 'Toutes les équipes sont verrouillées : déverrouillez-en au moins une pour répartir.'
                  : autoSelectedBlocks.length === 0
                    ? 'Aucun bloc sélectionné : la répartition automatique ne touchera aucune tâche. Cochez d’abord un bloc.'
                    : autoScopeCount === 0
                      ? 'Bloc(s) sélectionné(s) mais aucun sous-bloc coché : cochez les sous-blocs voulus (ou « Tous »).'
                      : `${autoScopeCount} tâche(s) sélectionnée(s) — équilibre par nombre de tâches entre les ${autoTeams.length} équipe(s) déverrouillée(s) (blocs entiers quand l'équilibre le permet), Found Fault en priorité.`}
                {autoLockedCount > 0 && autoTeams.length > 0 && (
                  <span className="text-amber-600 font-semibold">
                    {' '}— {autoLockedCount} équipe(s) verrouillée(s) ne recevront rien.
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {lastAutoAssignments && (
                <button
                  onClick={undoAutoAssign}
                  className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-md"
                  title="Rétablir les affectations d'avant la répartition automatique"
                >
                  <Undo2 className="h-3.5 w-3.5" /> Annuler
                </button>
              )}
              <button
                onClick={autoAssign}
                disabled={autoScopeCount === 0 || autoTeams.length === 0}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                title="Répartir les tâches sans équipe des blocs et sous-blocs sélectionnés sur les équipes déverrouillées"
              >
                <Users className="h-4 w-4" /> Répartir automatiquement
              </button>
            </div>
          </div>
          {blocks.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-slate-500">Blocs à répartir :</span>
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
                        ? 'Cliquer pour ne pas répartir ce bloc'
                        : 'Cliquer pour inclure ce bloc dans la répartition'
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
                        {getCategoryLabel(block)} : sous-blocs
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
                                ? 'Cliquer pour retirer ce sous-bloc de la répartition'
                                : 'Cliquer pour inclure ce sous-bloc dans la répartition'
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
                          title={`Ré-inclure tous les sous-blocs de ${getCategoryLabel(block)}`}
                        >
                          Tous
                        </button>
                      )}
                    </div>
                  )
                })}
              {blocks.length > 1 && (
                <button onClick={toggleAutoAll} className="text-xs text-sky-600 hover:underline">
                  {autoSelectedBlocks.length === blocks.length
                    ? 'Tout désélectionner'
                    : 'Tout sélectionner'}
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
            <h2 className="text-sm font-semibold text-slate-700">Filtrer par bloc</h2>
            <div className="flex gap-2 text-xs">
              <button onClick={selectAll} className="text-sky-600 hover:underline">Tout afficher</button>
              <span className="text-slate-300">|</span>
              <button onClick={selectNone} className="text-slate-500 hover:underline">Tout masquer</button>
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
                Affichage : {visibleBlocksList.length} bloc(s)
              </span>
            )}
          </div>
        </div>
      )}

      {teams.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-3 rounded-lg">
          Créez d'abord des équipes avant d'affecter des tâches. Allez dans la page « Équipes ».
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          {visibleBlocksList.length === 0 && (
            <div className="bg-white rounded-xl shadow p-8 text-center text-slate-500">
              <ClipboardList className="h-12 w-12 mx-auto text-slate-300 mb-3" />
              Aucun bloc n'est affiché. Sélectionnez des blocs ci-dessus, ou importez votre fichier Excel.
            </div>
          )}

          {visibleBlocksList.map((block) => {
            const blockTasks = groupedByBlock[block] || []
            const blockColor = getCategoryColor(block)
            const unassignedInBlock = blockTasks.filter(
              (t) => assignmentTeams(assignments, t.id).length === 0
            )
            const blockExpanded = expandedBlocks.includes(block)
            return (
              <div key={block} className="bg-white rounded-xl shadow overflow-hidden">
                <div className="px-4 py-2 flex flex-wrap items-center justify-between gap-2" style={{ backgroundColor: blockColor }}>
                  <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleBlockCollapse(block)}>
                    {blockExpanded ? (
                      <ChevronDown className="h-5 w-5 text-white" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-white" />
                    )}
                    <h3 className="font-bold text-white text-sm">
                      Bloc {getCategoryLabel(block)} <span className="font-normal opacity-80">({blockTasks.length})</span>
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-white/90 text-xs">
                      {unassignedInBlock.length} non assignée(s)
                    </span>
                    {teams.length > 0 && (
                      <select
                        value={bulkSelectValue}
                        onChange={(e) => {
                          if (e.target.value) {
                            assignWholeBlock(block, e.target.value)
                            e.target.value = ''
                          }
                        }}
                        className="border-none rounded-md px-2 py-1 text-xs bg-white text-slate-800 cursor-pointer font-semibold flex items-center gap-1"
                        title="Affecter tout le bloc"
                      >
                        <option value="">— Affecter tout le bloc —</option>
                        {teams.map((t) => (
                          <option key={t.id} value={t.id}>À {t.name} ({unassignedInBlock.length} tâches)</option>
                        ))}
                      </select>
                    )}
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer tout le bloc ${getCategoryLabel(block)} (${blockTasks.length} tâches) ?\n\nToutes ces tâches disparaîtront du planning.`
                          )
                        ) {
                          removeTasksByBlock(block)
                        }
                      }}
                      className="bg-white/10 hover:bg-white/25 text-white p-1.5 rounded"
                      title={`Supprimer tout le bloc ${getCategoryLabel(block)}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {blockExpanded && (
                <div className="p-4 space-y-3">
                  {Object.entries(groupByZone(blockTasks))
                    .sort((a, b) => b[1].length - a[1].length)
                    .map(([zone, zoneTasks]) => {
                      const zoneColor = getZoneColor(zone, zones)
                      const unassignedInZone = zoneTasks.filter(
                        (t) => assignmentTeams(assignments, t.id).length === 0
                      )
                      const zoneKey = `${block}::${zone}`
                      const zoneExpanded = expandedZones.includes(zoneKey)
                      return (
                        <div
                          key={zone}
                          className="rounded-lg border bg-white overflow-hidden"
                          style={{ borderColor: zoneColor, borderWidth: 2 }}
                        >
                          <div
                            className="px-4 py-2 flex items-center justify-between gap-2"
                            style={{ backgroundColor: zoneColor }}
                          >
                            <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleZoneCollapse(zoneKey)}>
                              {zoneExpanded ? (
                                <ChevronDown className="h-5 w-5 text-white" />
                              ) : (
                                <ChevronRight className="h-5 w-5 text-white" />
                              )}
                              <span className="text-sm font-bold text-white">
                                📍 {zone}{' '}
                                <span className="font-normal opacity-90">({zoneTasks.length})</span>
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-white/90 text-xs">
                                {unassignedInZone.length} non assignée(s)
                              </span>
                              {teams.length > 0 && unassignedInZone.length > 0 && (
                                <select
                                  defaultValue=""
                                  onChange={(e) => {
                                    if (e.target.value) {
                                      assignWholeZone(block, zone, e.target.value)
                                      e.target.value = ''
                                    }
                                  }}
                                  className="border-none rounded-md px-2 py-1 text-xs bg-white text-slate-800 cursor-pointer font-semibold"
                                  title="Affecter toute la zone"
                                >
                                  <option value="">— Toute la zone —</option>
                                  {teams.map((t) => (
                                    <option key={t.id} value={t.id}>À {t.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </div>
                          {zoneExpanded && (
                          <ul className="divide-y divide-slate-100">
                            {zoneTasks.map((task) => {
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
                                  className="px-4 py-2 hover:bg-slate-50 flex items-center gap-3 cursor-grab"
                                >
                                  <span className="w-10 shrink-0 text-center bg-slate-100 rounded-md px-2 py-1 text-xs font-bold text-slate-600">
                                    {task.seq || '—'}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium truncate" title={task.description}>
                                      {task.description}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                      {task.taskBarcode && (
                                        <span className="font-mono font-bold text-slate-500">
                                          {task.taskBarcode}  {' '}
                                        </span>
                                      )}
                                      {task.registration && `✈ ${task.registration}  `}
                                      {task.skills && `🔧 ${task.skills}  `}
                                    </p>
                                  </div>

                                  {noteEditId === task.id ? (
                                    <div className="flex items-center gap-1 shrink-0">
                                      <input
                                        autoFocus
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && saveTaskNote(task.id)}
                                        placeholder="Note…"
                                        className="border border-amber-300 rounded-md px-2 py-1 text-xs w-44"
                                      />
                                      <button
                                        onClick={() => saveTaskNote(task.id)}
                                        className="text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded p-1"
                                        title="Enregistrer la note"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setNoteEditId(null)}
                                        className="text-slate-400 hover:text-slate-700 p-1"
                                        title="Annuler"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setNoteEditId(task.id)
                                        setNoteText(task.note || '')
                                      }}
                                      className="inline-flex items-center gap-1 shrink-0 text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                      title={task.note || 'Ajouter / modifier la note'}
                                    >
                                      <Pencil className="h-3 w-3" />
                                      {task.note ? 'Note' : 'Ajouter une note'}
                                    </button>
                                  )}

                                  {assigned ? (
                                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
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
                                            title={`Retirer de ${teamChip.name}`}
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
                                          title="Ajouter une autre équipe"
                                        >
                                          <option value="">+ équipe</option>
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
                                      className="border border-slate-300 rounded-md px-2 py-1 text-xs shrink-0"
                                      title="Affecter cette ligne"
                                    >
                                      <option value="">— Ligne —</option>
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

        <div className="space-y-4">
          <div className="bg-slate-900 rounded-xl shadow p-4 text-white">
            <h2 className="font-bold mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-400" /> Équipes
            </h2>
            {teams.length === 0 && (
              <p className="text-sm text-slate-400">Aucune équipe créée.</p>
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
                      {team.locked && <span className="text-[10px] text-amber-400 font-semibold">verrouillée</span>}
                      {assignedCount(team.id)} tâche(s)
                      <button
                        onClick={() => updateTeam(team.id, { locked: !team.locked })}
                        className={team.locked ? 'text-amber-300 hover:text-amber-100' : 'text-slate-500 hover:text-amber-300'}
                        title={
                          team.locked
                            ? 'Déverrouiller cette équipe (elle pourra recevoir des tâches à la répartition automatique)'
                            : 'Verrouiller cette équipe (elle ne recevra plus de tâches à la répartition automatique)'
                        }
                      >
                        {team.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                      </button>
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-1 flex flex-wrap gap-1">
                    {team.members.length === 0 && <span>—</span>}
                    {team.members.map((m, i) => (
                      <span key={i} className="bg-slate-700 rounded-full px-2 py-0.5 text-slate-200">
                        {m}
                      </span>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-col gap-1">
                    {Object.keys(teamBlocks(team.id)).length === 0 && (
                      <span className="text-xs text-slate-500 italic">Aucun bloc affecté</span>
                    )}
                    {Object.entries(teamBlocks(team.id))
                      .sort((a, b) => b[1].count - a[1].count)
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
                                ({info.count} tâche{info.count > 1 ? 's' : ''})
                              </span>
                            </div>
                            {info.tasks.length > 0 && (
                              <div className="bg-white">
                                {info.tasks.map((t) => (
                                  <div
                                    key={t.id}
                                    className="flex items-center gap-2 px-2 py-1.5 text-xs border-t border-dashed border-slate-100"
                                  >
                                    <span className="font-mono font-bold text-slate-600 w-9 shrink-0">
                                      {t.seq || '—'}
                                    </span>
                                    {t.taskBarcode && (
                                      <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
                                        {t.taskBarcode}
                                      </span>
                                    )}
                                    <span className="flex-1 min-w-0 truncate font-medium text-slate-800" title={t.description}>
                                      {t.description}
                                    </span>
                                    {noteEditId === t.id ? (
                                      <div className="flex items-center gap-1 shrink-0">
                                        <input
                                          autoFocus
                                          value={noteText}
                                          onChange={(e) => setNoteText(e.target.value)}
                                          onKeyDown={(e) => e.key === 'Enter' && saveTaskNote(t.id)}
                                          placeholder="Note…"
                                          className="border border-amber-300 rounded-md px-2 py-1 text-xs w-40"
                                        />
                                        <button
                                          onClick={() => saveTaskNote(t.id)}
                                          className="text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded p-1"
                                          title="Enregistrer la note"
                                        >
                                          <Check className="h-3.5 w-3.5" />
                                        </button>
                                        <button
                                          onClick={() => setNoteEditId(null)}
                                          className="text-slate-400 hover:text-slate-700 p-1"
                                          title="Annuler"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </div>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          setNoteEditId(t.id)
                                          setNoteText(t.note || '')
                                        }}
                                        className="inline-flex items-center gap-1 shrink-0 text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                        title={t.note || 'Ajouter / modifier la note'}
                                      >
                                        <Pencil className="h-3 w-3" />
                                        {t.note ? 'Note' : 'Ajouter une note'}
                                      </button>
                                    )}
                                    <button
                                      onClick={() => manualUnassign(t.id, team.id)}
                                      className="text-slate-400 hover:text-red-600 shrink-0"
                                      title="Retirer de l'équipe (la tâche redevient non affectée)"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
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
    </div>
  )
}
