import { Fragment, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getZoneColor, getCategoryColor, getCategoryLabel, isAssignedTo, assignmentTeams, filterNewPrepTasks, taskContentKey } from '../utils/helpers'
import ManualTaskForm from '../components/ManualTaskForm'
import NoteCell from '../components/NoteCell'
import { Search, Trash2, ChevronDown, ChevronRight, CheckCircle2, RotateCcw, Plus, ListChecks, X, Pause, Play, Check } from 'lucide-react'

export default function Taches() {
  const {
    tasks,
    teams,
    assignments,
    removeTask,
    removeTasksByBlock,
    removeTasksByZone,
    addTasks,
    updateTask,
    prepTasks,
    addPrepTasks,
  } = useApp()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [expandedZones, setExpandedZones] = useState([])
  const [expandedSubZones, setExpandedSubZones] = useState([])

  const toggleSubZone = (key) =>
    setExpandedSubZones((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )

  // Sélection « à suivre » (préparation de la vacation suivante)
  const [followSelected, setFollowSelected] = useState({})
  const [transferMsg, setTransferMsg] = useState('')

  const followTasks = useMemo(
    () => tasks.filter((t) => followSelected[t.id]),
    [tasks, followSelected]
  )

  // Lignes déjà présentes dans la préparation (transfert ou import)
  const prepMarks = useMemo(() => {
    const ids = new Set()
    const keys = new Set()
    ;(prepTasks || []).forEach((t) => {
      ids.add(t.id)
      keys.add(taskContentKey(t))
    })
    return { ids, keys }
  }, [prepTasks])

  const isTransferred = (task) =>
    prepMarks.ids.has(task.id) || prepMarks.keys.has(taskContentKey(task))

  const followGrouped = useMemo(() => {
    const map = {}
    followTasks.forEach((t) => {
      const b = t.taskType || 'AUTRE'
      const z = t.workArea || 'Autre'
      if (!map[b]) map[b] = {}
      if (!map[b][z]) map[b][z] = []
      map[b][z].push(t)
    })
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([blk, zonesMap]) => [
        blk,
        Object.entries(zonesMap).sort((a, b) => a[0].localeCompare(b[0])),
      ])
  }, [followTasks])

  const toggleFollow = (id) => {
    setTransferMsg('')
    setFollowSelected((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })
  }

  const addBlockToFollow = (blk) => {
    setTransferMsg('')
    setFollowSelected((prev) => {
      const next = { ...prev }
      tasks
        .filter((t) => (t.taskType || 'AUTRE') === blk)
        .forEach((t) => {
          next[t.id] = true
        })
      return next
    })
  }

  const transferToPrep = () => {
    const fresh = filterNewPrepTasks(prepTasks, followTasks)
    const ignored = followTasks.length - fresh.length
    if (fresh.length) addPrepTasks(fresh)
    setTransferMsg(
      `${fresh.length} ligne(s) transférée(s) vers Préparation vac suivante${
        ignored ? ` · ${ignored} déjà présente(s) ignorée(s)` : ''
      }.`
    )
    setFollowSelected({})
  }

  const toggleZone = (zone) => {
    setExpandedZones((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    )
  }

  const zones = useMemo(() => {
    return [...new Set(tasks.map((t) => t.workArea).filter(Boolean))].sort()
  }, [tasks])

  const blocks = useMemo(() => {
    return [...new Set(tasks.map((t) => t.taskType).filter(Boolean))].sort()
  }, [tasks])

  const statuses = useMemo(() => [...new Set(tasks.map((t) => t.mtxStatus).filter(Boolean))], [tasks])

  // hiddenBlocks = blocs masqués. Vide => tout affiché.
  const toggleBlock = (block) => {
    setSelectedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    )
  }

  const selectAll = () => setSelectedBlocks([])
  const selectNone = () => setSelectedBlocks([...blocks])

  const shownBlocks = blocks.filter((b) => !selectedBlocks.includes(b))

  const filtered = useMemo(() => {
    const isAllBlocks = shownBlocks.length === blocks.length || blocks.length === 0
    const visibleSet = isAllBlocks ? null : new Set(shownBlocks)
    return tasks.filter((t) => {
      if (visibleSet && !visibleSet.has(t.taskType)) return false
      const matchStatus = statusFilter === 'all' || t.mtxStatus === statusFilter
      const q = filter.toLowerCase()
      const matchText =
        !q ||
        t.description?.toLowerCase().includes(q) ||
        t.workArea?.toLowerCase().includes(q) ||
        t.skills?.toLowerCase().includes(q) ||
        t.registration?.toLowerCase().includes(q)
      return matchStatus && matchText
    })
  }, [tasks, filter, statusFilter, shownBlocks, blocks])

  // Regroupement : par zone/sous-tâche, SAUF les Found Fault (CORR) qui restent
  // regroupés dans un seul bloc avec leurs sous-tâches.
  const zoneGroups = useMemo(() => {
    const groups = {}
    filtered.forEach((t) => {
      const isFF = (t.taskType || '') === 'CORR'
      const key = isFF ? '__FOUND_FAULT__' : t.workArea || 'Autre'
      if (!groups[key]) {
        groups[key] = {
          key,
          label: isFF ? getCategoryLabel('CORR') : key,
          isFF,
          zones: {},
        }
      }
      const sub = t.workArea || 'Sans sous-tâche'
      if (!groups[key].zones[sub]) groups[key].zones[sub] = []
      groups[key].zones[sub].push(t)
    })
    return Object.values(groups).sort((a, b) => {
      const ca = Object.values(a.zones).reduce((n, l) => n + l.length, 0)
      const cb = Object.values(b.zones).reduce((n, l) => n + l.length, 0)
      return cb - ca
    })
  }, [filtered])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Tâches par zone</h1>
        <p className="text-slate-600 mt-1">{filtered.length} tâches — groupées par zone de travail</p>
        <p className="text-xs text-slate-400 mt-1">
          Case <strong>« à suivre »</strong> : prépare la vacation suivante (transfert vers
          Préparation) — le bouton <strong>+ à suivre</strong> d'un bloc l'ajoute en entier. Un{' '}
          <span className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-emerald-100 text-emerald-700 align-middle">
            <Check className="h-2.5 w-2.5" />
          </span>{' '}
          vert signale une ligne déjà transférée.
        </p>
      </div>

      {/* Carte « À suivre » → transfert vers la préparation de vac suivante */}
      <div className="bg-white rounded-xl shadow p-4 border-l-4 border-l-sky-600">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-sky-500" /> À suivre
            <span className="text-xs font-normal text-slate-400">({followTasks.length})</span>
          </h2>
          {followTasks.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={transferToPrep}
                className="bg-sky-600 text-white px-3 py-1.5 rounded-md hover:bg-sky-700 text-xs font-semibold"
                title="Ajouter ces lignes à la préparation de la vac suivante (classement et notes conservés, doublons ignorés)"
              >
                Transférer vers Préparation ({followTasks.length})
              </button>
              <button
                onClick={() => setFollowSelected({})}
                className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-md px-2 py-1.5"
                title="Vider la sélection"
              >
                Vider
              </button>
            </div>
          )}
        </div>
        {transferMsg && <p className="text-[11px] text-emerald-700 mt-2">{transferMsg}</p>}
        {followTasks.length === 0 ? (
          <p className="text-xs text-slate-400 italic mt-2">
            Cochez des lignes — ou le <strong>+ à suivre</strong> d'un bloc — pour préparer la
            vacation suivante.
          </p>
        ) : (
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3 mt-2">
            {followGrouped.map(([blk, zonesList]) => (
              <div
                key={blk}
                className="border border-slate-100 rounded-lg p-2 max-h-56 overflow-y-auto"
              >
                <p
                  className="text-[10px] font-bold uppercase tracking-wide"
                  style={{ color: getCategoryColor(blk) }}
                >
                  {getCategoryLabel(blk)} ({zonesList.reduce((a, [, l]) => a + l.length, 0)})
                </p>
                {zonesList.map(([zone, list]) => (
                  <div key={zone} className="mt-0.5">
                    <p className="text-[10px] text-slate-500 font-semibold">📍 {zone}</p>
                    <ul className="space-y-0.5">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-start gap-1.5 text-xs text-slate-700">
                          <span className="font-mono text-slate-400 shrink-0 w-8">
                            {t.seq || '—'}
                          </span>
                          <span className="flex-1 min-w-0 truncate" title={t.description}>
                            {t.description}
                          </span>
                          {t.note && (
                            <span className="shrink-0 text-amber-600" title={`Note : ${t.note}`}>
                              ✎
                            </span>
                          )}
                          <button
                            onClick={() => toggleFollow(t.id)}
                            className="shrink-0 text-slate-300 hover:text-red-600"
                            title="Retirer de la liste"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Ajout manuel — bien visible */}
      <div className="bg-white rounded-xl shadow p-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-sky-600">
        <div>
          <p className="text-sm font-semibold text-slate-800">Ajouter une ligne manuellement</p>
        </div>
        <ManualTaskForm onAdd={addTasks} zoneOptions={zones} existingTasks={tasks} />
      </div>

      {/* Filtres et recherche */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Rechercher..."
              className="border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm w-40 sm:w-52"
            />
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-md px-3 py-2 text-sm">
            <option value="all">Tous statuts</option>
            {statuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

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
                <div key={block} className="flex items-center gap-1">
                  <button
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
                  <button
                    onClick={() => {
                      if (window.confirm(`Supprimer tout le bloc ${getCategoryLabel(block)} (${count} tâches) ?`)) {
                        removeTasksByBlock(block)
                      }
                    }}
                    className="text-slate-400 hover:text-red-600 transition-colors"
                    title={`Supprimer le bloc ${getCategoryLabel(block)}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )
            })}
            {selectedBlocks.length > 0 && (
              <span className="text-xs text-slate-400 self-center">
                Affichage : {filtered.length} tâches
              </span>
            )}
          </div>
        </div>
      )}

      {zoneGroups.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          Aucune tâche trouvée pour les critères sélectionnés.
        </div>
      )}

      {zoneGroups.map((group) => {
          const zoneTasks = Object.values(group.zones).flat()
          const zone = group.label
          const zoneColor = group.isFF
            ? getCategoryColor('CORR')
            : getZoneColor(group.label, zones)
          const assignedTeams = teams.filter((t) =>
            zoneTasks.some((task) => isAssignedTo(assignments, task.id, t.id))
          )
          const memberNames = [...new Set(assignedTeams.flatMap((t) => t.members))]
          const expanded = expandedZones.includes(zone)
          const transferredCount = zoneTasks.filter((t) => isTransferred(t)).length
          return (
            <div key={zone} className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: zoneColor }}>
                <div className="flex items-center gap-2 cursor-pointer" onClick={() => toggleZone(zone)}>
                  {expanded ? (
                    <ChevronDown className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
                  ) : (
                    <ChevronRight className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
                  )}
                  <div>
                    <h2 className="font-bold text-white text-base sm:text-lg">
                      {zone}{' '}
                      <span className="font-normal opacity-80">({zoneTasks.length})</span>
                    </h2>
                    {memberNames.length > 0 && (
                      <p className="text-white font-bold text-sm mt-0.5">
                        Membres : {memberNames.join(', ')}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5">
                  {transferredCount > 0 && (
                    <span
                      className="bg-emerald-500/90 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white whitespace-nowrap self-center"
                      title="Lignes de cette zone déjà transférées vers Préparation vac suivante"
                    >
                      ✓ {transferredCount} transférée{transferredCount > 1 ? 's' : ''}
                    </span>
                  )}
                  {[...new Set(zoneTasks.map((t) => t.taskType).filter(Boolean))].map((blk) => {
                    const n = zoneTasks.filter((t) => t.taskType === blk).length
                    const total = tasks.filter((t) => t.taskType === blk).length
                    return (
                      <span key={blk} className="inline-flex items-center gap-1">
                        <button
                          onClick={() => {
                            if (
                              window.confirm(
                                `Supprimer tout le bloc ${getCategoryLabel(blk)} (${total} tâche(s) au total, toutes zones) ?\n\nCes tâches disparaîtront partout (affectations comprises).`
                              )
                            ) {
                              removeTasksByBlock(blk)
                            }
                          }}
                          className="bg-white/25 hover:bg-white/40 px-2 py-0.5 rounded-full text-xs font-semibold text-white flex items-center gap-1"
                          title={`Supprimer tout le bloc ${getCategoryLabel(blk)} (${total} tâches, toutes zones confondues)`}
                        >
                          {getCategoryLabel(blk)} · {n}
                          <Trash2 className="h-3 w-3 opacity-80" />
                        </button>
                        <button
                          onClick={() => addBlockToFollow(blk)}
                          className="bg-white/20 hover:bg-white/50 rounded-full pl-1 pr-1.5 py-0.5 text-white inline-flex items-center gap-0.5"
                          title={`Ajouter tout le bloc ${getCategoryLabel(blk)} à suivre (préparation vac suivante)`}
                        >
                          <Plus className="h-3 w-3" />
                          <span className="text-[10px] font-bold whitespace-nowrap">à suivre</span>
                        </button>
                      </span>
                    )
                  })}
                  {!group.isFF && (
                    <button
                      onClick={() => {
                        if (
                          window.confirm(
                            `Supprimer toute la sous-tâche ${zone} (${zoneTasks.length} tâche(s), tous blocs) ?\n\nCes tâches disparaîtront partout (affectations comprises).`
                          )
                        ) {
                          removeTasksByZone(zone)
                        }
                      }}
                      className="bg-white/20 hover:bg-white/40 text-white p-1 rounded-full"
                      title={`Supprimer toute la sous-tâche ${zone}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
              {expanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left bg-slate-50">
                      <th className="px-1 py-2 border-b text-[11px] text-slate-700 font-bold whitespace-nowrap" title="Cocher pour préparer la vacation suivante (transfert vers Préparation)">à suivre</th>
                      <th className="px-2 py-2 border-b whitespace-nowrap">N°</th>
                      <th className="px-2 py-2 border-b whitespace-nowrap">Tâche</th>
                      <th className="px-0.5 py-2 border-b whitespace-nowrap">Bloc</th>
                      <th className="hidden lg:table-cell px-0.5 py-2 border-b whitespace-nowrap">Skills</th>
                      <th className="px-0.5 py-2 border-b whitespace-nowrap">TRFX</th>
                      <th className="px-0.5 py-2 border-b whitespace-nowrap">Statut</th>
                      <th className="hidden md:table-cell px-0.5 py-2 border-b whitespace-nowrap">Appareil</th>
                      <th className="px-0.5 py-2 border-b whitespace-nowrap">Note</th>
                      <th className="px-0.5 py-2 border-b whitespace-nowrap">Équipe</th>
                      <th className="px-2 py-2 border-b whitespace-nowrap"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(group.zones)
                      .sort((a, b) => a[0].localeCompare(b[0]))
                      .map(([subZone, subTasks]) => {
                        const subOpen = expandedSubZones.includes(`${group.key}::${subZone}`)
                        return (
                        <Fragment key={subZone}>
                          {group.isFF && (
                            <>
                              <tr>
                                <td colSpan={11} style={{ height: 10 }} className="p-0" />
                              </tr>
                              <tr
                                className="border-b border-slate-100 cursor-pointer hover:brightness-110"
                                onClick={() => toggleSubZone(`${group.key}::${subZone}`)}
                                title={subOpen ? 'Replier cette sous-tâche' : 'Déplier cette sous-tâche'}
                              >
                                <td colSpan={11} className="px-2 py-0.5">
                                  <span
                                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wide text-white"
                                    style={{ backgroundColor: getZoneColor(subZone, zones) }}
                                  >
                                    {subOpen ? (
                                      <ChevronDown className="h-4 w-4" />
                                    ) : (
                                      <ChevronRight className="h-4 w-4" />
                                    )}
                                    📍 {subZone}
                                    <span className="opacity-90 font-normal">({subTasks.length})</span>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        if (
                                          window.confirm(
                                            `Supprimer toute la sous-tâche ${subZone} du bloc Found Fault (${subTasks.length} tâche(s)) ?\n\nCes tâches disparaîtront partout (affectations comprises).`
                                          )
                                        ) {
                                          removeTasksByZone(subZone, 'CORR')
                                        }
                                      }}
                                      className="ml-auto text-white/80 hover:text-white"
                                      title={`Supprimer toute la sous-tâche ${subZone} (Found Fault)`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </span>
                                </td>
                              </tr>
                            </>
                          )}
                    {(!group.isFF || subOpen) &&
                      subTasks.map((task) => {
                      const teamIds = assignmentTeams(assignments, task.id)
                      const taskTeams = teamIds
                        .map((id) => teams.find((tm) => tm.id === id))
                        .filter(Boolean)
                      return (
                              <tr
                                key={task.id}
                                className="border-b hover:bg-slate-100"
                                style={
                                  group.isFF && subOpen
                                    ? { backgroundColor: `${getZoneColor(subZone, zones)}14` }
                                    : undefined
                                }
                              >
                          <td className="px-1 py-2 text-center">
                            {isTransferred(task) ? (
                              <span
                                className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-100 text-emerald-700"
                                title="Déjà transférée vers Préparation vac suivante"
                              >
                                <Check className="h-3 w-3" />
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={!!followSelected[task.id]}
                                onChange={() => toggleFollow(task.id)}
                                className="h-3.5 w-3.5 accent-sky-600"
                                title="Cocher pour préparer la vacation suivante"
                              />
                            )}
                          </td>
                          <td className="px-2 py-2 font-bold text-slate-500">{task.seq || '-'}</td>
                          <td className="px-2 py-2 font-medium max-w-md truncate" title={task.description}>
                            {task.description}
                          </td>
                          <td className="px-0.5 py-2 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: getCategoryColor(task.taskType) }}>
                              {getCategoryLabel(task.taskType) || '-'}
                            </span>
                          </td>
                          <td className="hidden lg:table-cell px-0.5 py-2 text-xs whitespace-nowrap">{task.skills || '-'}</td>
                          <td className="px-0.5 py-2 font-mono font-bold text-xs whitespace-nowrap">{task.taskBarcode || '-'}</td>
                          <td className="px-0.5 py-2 whitespace-nowrap">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                task.mtxStatus === 'ACTV'
                                  ? 'bg-green-100 text-green-700'
                                  : task.mtxStatus === 'PAUSE'
                                  ? 'bg-amber-100 text-amber-700'
                                  : task.mtxStatus === 'COMPLETE'
                                  ? 'bg-green-800 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {task.mtxStatus}
                            </span>
                            {task.mtxStatus !== 'COMPLETE' ? (
                              <button
                                onClick={() => updateTask(task.id, { mtxStatus: 'COMPLETE' })}
                                className="text-slate-300 hover:text-green-600 ml-1"
                                title="Marquer la tâche COMPLETE"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => updateTask(task.id, { mtxStatus: 'ACTV' })}
                                className="text-slate-300 hover:text-sky-600 ml-1"
                                title="Rétablir la tâche ACTV"
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {task.mtxStatus !== 'PAUSE' ? (
                              <button
                                onClick={() => updateTask(task.id, { mtxStatus: 'PAUSE' })}
                                className="text-slate-300 hover:text-amber-600 ml-1"
                                title="Mettre la tâche en PAUSE"
                              >
                                <Pause className="h-3.5 w-3.5" />
                              </button>
                            ) : (
                              <button
                                onClick={() => updateTask(task.id, { mtxStatus: 'ACTV' })}
                                className="text-slate-300 hover:text-green-600 ml-1"
                                title="Reprendre la tâche (ACTV)"
                              >
                                <Play className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </td>
                          <td className="hidden md:table-cell px-0.5 py-2 whitespace-nowrap">{task.registration || '-'}</td>
                          <td className="px-0.5 py-2">
                            <NoteCell
                              note={task.note}
                              onSave={(v) => updateTask(task.id, { note: v })}
                            />
                          </td>
                          <td className="px-0.5 py-2">
                            {taskTeams.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {taskTeams.map((tm) => (
                                  <span
                                    key={tm.id}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                    style={{ backgroundColor: tm.color }}
                                  >
                                    {tm.name}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">Non assignée</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            <button
                              onClick={() => {
                                if (window.confirm('Supprimer cette tâche ?')) {
                                  removeTask(task.id)
                                }
                              }}
                              className="text-slate-400 hover:text-red-600"
                              title="Supprimer la tâche"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                        </Fragment>
                        )
                      })}
                  </tbody>
                </table>
              </div>
              )}
            </div>
          )
      })}
    </div>
  )
}
