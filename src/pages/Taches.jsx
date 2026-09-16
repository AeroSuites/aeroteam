import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import { getZoneColor, getCategoryColor, getCategoryLabel, isAssignedTo, assignmentTeams } from '../utils/helpers'
import ManualTaskForm from '../components/ManualTaskForm'
import NoteCell from '../components/NoteCell'
import { Search, Trash2, ChevronDown, ChevronRight, CheckCircle2, RotateCcw } from 'lucide-react'

export default function Taches() {
  const { tasks, teams, assignments, removeTask, removeTasksByBlock, addTasks, updateTask } = useApp()
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [selectedBlocks, setSelectedBlocks] = useState([])
  const [expandedZones, setExpandedZones] = useState([])

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

  const groupedByZone = useMemo(() => {
    const groups = {}
    filtered.forEach((t) => {
      const zone = t.workArea || 'Autre'
      if (!groups[zone]) groups[zone] = []
      groups[zone].push(t)
    })
    return groups
  }, [filtered])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Tâches par zone</h1>
        <p className="text-slate-600 mt-1">{filtered.length} tâches — groupées par zone de travail</p>
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

      {Object.keys(groupedByZone).length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          Aucune tâche trouvée pour les critères sélectionnés.
        </div>
      )}

      {Object.entries(groupedByZone)
        .sort((a, b) => b[1].length - a[1].length)
        .map(([zone, zoneTasks]) => {
          const zoneColor = getZoneColor(zone, zones)
          const assignedTeams = teams.filter((t) =>
            zoneTasks.some((task) => isAssignedTo(assignments, task.id, t.id))
          )
          const memberNames = [...new Set(assignedTeams.flatMap((t) => t.members))]
          const expanded = expandedZones.includes(zone)
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
                  {[...new Set(zoneTasks.map((t) => t.taskType).filter(Boolean))].map((blk) => {
                    const n = zoneTasks.filter((t) => t.taskType === blk).length
                    const total = tasks.filter((t) => t.taskType === blk).length
                    return (
                      <button
                        key={blk}
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
                    )
                  })}
                </div>
              </div>
              {expanded && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left bg-slate-50">
                      <th className="px-4 py-2 border-b">N°</th>
                      <th className="px-4 py-2 border-b">Tâche</th>
                      <th className="px-4 py-2 border-b">Bloc</th>
                      <th className="px-4 py-2 border-b">Skills</th>
                      <th className="px-4 py-2 border-b">TRFX</th>
                      <th className="px-4 py-2 border-b">Statut</th>
                      <th className="px-4 py-2 border-b">Appareil</th>
                      <th className="px-4 py-2 border-b">Note</th>
                      <th className="px-4 py-2 border-b">Équipe</th>
                      <th className="px-4 py-2 border-b"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {zoneTasks.map((task) => {
                      const teamIds = assignmentTeams(assignments, task.id)
                      const taskTeams = teamIds
                        .map((id) => teams.find((tm) => tm.id === id))
                        .filter(Boolean)
                      return (
                        <tr key={task.id} className="border-b hover:bg-slate-50">
                          <td className="px-4 py-2 font-bold text-slate-500">{task.seq || '-'}</td>
                          <td className="px-4 py-2 font-medium max-w-md" title={task.description}>
                            {task.description}
                          </td>
                          <td className="px-4 py-2">
                            <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: getCategoryColor(task.taskType) }}>
                              {getCategoryLabel(task.taskType) || '-'}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs">{task.skills || '-'}</td>
                          <td className="px-4 py-2 font-mono font-bold text-xs">{task.taskBarcode || '-'}</td>
                          <td className="px-4 py-2">
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
                          </td>
                          <td className="px-4 py-2">{task.registration || '-'}</td>
                          <td className="px-4 py-2">
                            <NoteCell
                              note={task.note}
                              onSave={(v) => updateTask(task.id, { note: v })}
                            />
                          </td>
                          <td className="px-4 py-2">
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
                          <td className="px-4 py-2">
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
