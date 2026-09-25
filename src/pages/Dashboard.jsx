import { Fragment, useMemo, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { openPdfPrint, downloadPdfAsJpeg, drawCheckboxCell, drawPriorityBadge, hidePriorityCellText } from '../utils/pdfPrint'
import { useApp } from '../context/AppContext'
import {
  getCategoryColor,
  getZoneColor,
  groupTasksByCategory,
getFirstName,
getCategoryLabel,
hexToRgb,
isAssignedTo,
assignmentTeams,
assignedTaskCount,
consigneDay,
priorityToken,
logicalToday,
} from '../utils/helpers'
import {
  ClipboardList,
  CheckCircle2,
  Plane,
  AlertTriangle,
  Clock,
  ChevronDown,
  ChevronRight,
  X,
  Printer,
  FileDown,
  Image as ImageIcon,
  Pencil,
  Trash2,
  Check,
} from 'lucide-react'

function groupByZone(blockTasks) {
  const groups = {}
  blockTasks.forEach((t) => {
    const zone = t.workArea || 'Autre'
    if (!groups[zone]) groups[zone] = []
    groups[zone].push(t)
  })
  return groups
}

export default function Dashboard() {
  const { tasks, teams, assignments, notes, updateNote, removeNote } = useApp()
  const [selectedTeamId, setSelectedTeamId] = useState(null)
  const [editingConsigneId, setEditingConsigneId] = useState(null)
  const [consigneText, setConsigneText] = useState('')

  const { todayConsignes, weekConsignes } = useMemo(() => {
    const DAY_ORDER = {
      DIMANCHE: 0,
      LUNDI: 1,
      MARDI: 2,
      MERCREDI: 3,
      JEUDI: 4,
      VENDREDI: 5,
      SAMEDI: 6,
    }
    const todayIdx = logicalToday().getDay() // 0 = dimanche (avant 6 h : la veille)
    const todayName = Object.keys(DAY_ORDER)[todayIdx]
    const all = notes
      .filter((n) => String(n.title || '').startsWith('[C] '))
      .map((n) => {
        const day = consigneDay(n.title)
        const idx = day ? DAY_ORDER[day] ?? 99 : 99
        return { n, ordre: (idx - todayIdx + 7) % 7 }
      })
      .sort(
        (a, b) =>
          a.ordre - b.ordre ||
          String(a.n.title).localeCompare(String(b.n.title))
      )
      .map((x) => x.n)
    const today = all.filter((n) => consigneDay(n.title) === todayName)
    return { todayConsignes: today, weekConsignes: all }
  }, [notes])
  const [showAllConsignes, setShowAllConsignes] = useState(false)
  const consignes = showAllConsignes ? weekConsignes : todayConsignes

  const ALL_BLOCKS_KEY = 'dashboard-expanded-blocks'
  const [expandedBlocks, setExpandedBlocks] = useState(() => [])

  useEffect(() => {
    localStorage.setItem(ALL_BLOCKS_KEY, JSON.stringify(expandedBlocks))
  }, [expandedBlocks])

  const toggleBlock = (block) =>
    setExpandedBlocks((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    )

  const selectedTeam = teams.find((t) => t.id === selectedTeamId) || null
  const selectedTeamTasks = selectedTeam
    ? tasks.filter((t) => isAssignedTo(assignments, t.id, selectedTeam.id))
    : []

  // Tâches structurées comme le PDF : bloc -> sous-tâche (zone) -> lignes
  const buildTeamStructured = (tasksList) => {
    const blocks = {}
    tasksList.forEach((t) => {
      const b = t.taskType || 'AUTRE'
      if (!blocks[b]) blocks[b] = {}
      const z = t.workArea || 'Autre'
      if (!blocks[b][z]) blocks[b][z] = []
      blocks[b][z].push(t)
    })
    return Object.entries(blocks).map(([blk, zones]) => ({
      blk,
      zones: Object.entries(zones)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([zone, tasks]) => ({ zone, tasks })),
    }))
  }
  const teamStructured = buildTeamStructured(selectedTeamTasks)

  const buildTeamPdf = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = pageWidth - margin * 2

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(selectedTeam.name, margin, 15)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${selectedTeamTasks.length} tâche(s) · ${selectedTeam.members.length} membre(s) : ${
        selectedTeam.members.join(', ') || '—'
      } · ${new Date().toLocaleDateString('fr-FR')}`,
      margin,
      21
    )

    const groups = {}
    selectedTeamTasks.forEach((t) => {
      const blk = t.taskType || 'AUTRE'
      const zone = t.workArea || 'Sans zone'
      if (!groups[blk]) groups[blk] = { zones: {} }
      if (!groups[blk].zones[zone]) groups[blk].zones[zone] = []
      groups[blk].zones[zone].push(t)
    })

    let y = 28
    Object.entries(groups).forEach(([blk, info]) => {
      const zoneNames = Object.keys(info.zones).sort()
      const count = zoneNames.reduce((acc, z) => acc + info.zones[z].length, 0)
      if (y > pageHeight - 25) {
        doc.addPage()
        y = 14
      }
      doc.setFillColor(...hexToRgb(getCategoryColor(blk)))
      doc.rect(margin, y, contentWidth, 7, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(`Bloc ${getCategoryLabel(blk)} · ${count} tâche(s)`, margin + 2, y + 4.6)
      doc.setTextColor(0, 0, 0)
      y += 10

      zoneNames.forEach((zone) => {
        const zoneTasks = info.zones[zone]
        autoTable(doc, {
          startY: y,
          pageBreak: 'auto',
          margin: { left: margin, right: margin },
          head: [
            [
              {
                content: `${zone} (${zoneTasks.length})`,
                colSpan: 6,
                styles: {
                  fillColor: hexToRgb(getZoneColor(zone)),
                  textColor: [255, 255, 255],
                  fontStyle: 'bold',
                  fontSize: 9,
                },
              },
            ],
          ],
          body: zoneTasks.map((t) => [
            '',
            t.seq !== undefined && t.seq !== '' ? String(t.seq) : '—',
            priorityToken(`${t.description || ''} ${t.taskBarcode || ''}`),
            t.taskBarcode || '—',
            t.description || '',
            t.registration || '—',
          ]),
          styles: { fontSize: 8, cellPadding: 1.2, textColor: [0, 0, 0], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 12 },
            2: { cellWidth: 16 },
            3: { cellWidth: 30, fontStyle: 'bold', textColor: [0, 0, 0] },
            5: { cellWidth: 26 },
          },
          didDrawCell: (data) => {
            drawCheckboxCell(doc, data)
            const t = zoneTasks[data.row.index]
            drawPriorityBadge(
              doc,
              data,
              t ? priorityToken(`${t.description || ''} ${t.taskBarcode || ''}`) : ''
            )
          },
          didParseCell: (data) => hidePriorityCellText(data),
        })
        y = doc.lastAutoTable.finalY + 5
        if (y > pageHeight - 15) {
          doc.addPage()
          y = 14
        }
      })
    })
    return doc
  }

  const exportTeamPdf = () => {
    if (!selectedTeam || !selectedTeamTasks.length) return
    const doc = buildTeamPdf()
    doc.save(
      `equipe-${selectedTeam.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sans-nom'}-${new Date().toISOString().slice(0, 10)}.pdf`
    )
  }

  const printTeamPdf = () => {
    if (!selectedTeam || !selectedTeamTasks.length) return
    openPdfPrint(buildTeamPdf())
  }

  const zones = useMemo(() => {
    return [...new Set(tasks.map((t) => t.workArea).filter(Boolean))].sort()
  }, [tasks])

  const stats = useMemo(() => {
    const total = tasks.length
    const assigned = assignedTaskCount(assignments)
    const unassigned = total - assigned
    const totalMembers = teams.reduce((acc, t) => acc + t.members.length, 0)
    const avgPerTeam = teams.length ? (assigned / teams.length).toFixed(1) : '0'
    return { total, assigned, unassigned, totalMembers, avgPerTeam }
  }, [tasks, teams, assignments])

  const byBlock = useMemo(() => {
    const counts = {}
    tasks.forEach((t) => {
      const c = t.taskType || 'AUTRE'
      counts[c] = (counts[c] || 0) + 1
    })
    return counts
  }, [tasks])

  const hoursTotal = useMemo(() => {
    return tasks.reduce((acc, t) => {
      const h = t.scheduledHours
      if (!h) return acc
      const [hh, mm] = String(h).split(':').map(Number)
      if (!isNaN(hh)) return acc + hh + (isNaN(mm) ? 0 : mm / 60)
      return acc
    }, 0)
  }, [tasks])

  const teamLoad = useMemo(
    () =>
      teams.map((team) => {
        const teamTaskIds = Object.entries(assignments)
          .filter(([, ids]) =>
            Array.isArray(ids) ? ids.includes(team.id) : ids === team.id
          )
          .map(([taskId]) => taskId)
        const teamTasks = tasks.filter((t) => teamTaskIds.includes(t.id))
        const byBlock = {}
        teamTasks.forEach((t) => {
          const zone = t.workArea || 'Autre'
          const key = `${t.taskType || 'AUTRE'} / ${zone}`
          if (!byBlock[key]) byBlock[key] = { count: 0, seqs: [] }
          byBlock[key].count += 1
          if (t.seq !== undefined && t.seq !== '') byBlock[key].seqs.push(String(t.seq))
        })
        Object.values(byBlock).forEach((v) =>
          v.seqs.sort((a, b) => Number(a) - Number(b))
        )
        return {
          ...team,
          count: teamTasks.length,
          membersCount: team.members.length,
          memberFirstNames: team.members.map(getFirstName),
          byBlock,
          perMember: team.members.length
            ? (teamTasks.length / team.members.length).toFixed(1)
            : '0',
        }
      }),
    [teams, tasks, assignments]
  )

  const allUnassigned = useMemo(
    () => tasks.filter((t) => assignmentTeams(assignments, t.id).length === 0),
    [tasks, assignments]
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Tableau de bord</h1>
        <p className="text-slate-600 mt-1">Vue d'ensemble du workpackage</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={<ClipboardList className="h-6 w-6" />} label="Tâches totales" value={stats.total} color="bg-sky-50 text-sky-600" />
        <StatCard icon={<CheckCircle2 className="h-6 w-6" />} label="Tâches assignées" value={stats.assigned} color="bg-green-50 text-green-600" />
        <StatCard icon={<AlertTriangle className="h-6 w-6" />} label="Non assignées" value={stats.unassigned} color="bg-amber-50 text-amber-600" />
        <StatCard icon={<Clock className="h-6 w-6" />} label="Heures totales" value={`${hoursTotal.toFixed(1)}h`} color="bg-violet-50 text-violet-600" />
      </div>

      {weekConsignes.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-amber-500" /> Consignes{' '}
              {showAllConsignes ? 'de la semaine' : 'du jour'}
              <span className="text-sm font-normal text-slate-400">({consignes.length})</span>
            </h2>
            <button
              onClick={() => setShowAllConsignes((v) => !v)}
              className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-3 py-1"
            >
              {showAllConsignes ? "Voir aujourd'hui uniquement" : 'Voir toute la semaine'}
            </button>
          </div>
          {consignes.length === 0 ? (
            <p className="text-sm text-slate-400 italic">
              Aucune consigne pour aujourd'hui — utilisez « Voir toute la semaine » pour afficher
              les autres jours.
            </p>
          ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {consignes.map((n) => (
              <div key={n.id} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-bold text-amber-800">
                    {String(n.title).replace('[C] ', '')}
                  </p>
                  {editingConsigneId !== n.id && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          setEditingConsigneId(n.id)
                          setConsigneText(n.content || '')
                        }}
                        className="text-slate-400 hover:text-sky-600 p-0.5"
                        title="Modifier cette consigne"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Supprimer la consigne « ${String(n.title).replace('[C] ', '')} » ?`
                            )
                          ) {
                            removeNote(n.id)
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 p-0.5"
                        title="Supprimer cette consigne"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                {editingConsigneId === n.id ? (
                  <div className="mt-1 flex flex-col gap-1.5">
                    <textarea
                      autoFocus
                      value={consigneText}
                      onChange={(e) => setConsigneText(e.target.value)}
                      rows={Math.min(14, Math.max(4, consigneText.split('\n').length + 1))}
                      className="w-full border border-amber-300 rounded-md px-2 py-1.5 text-xs bg-white"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          updateNote(n.id, { content: consigneText })
                          setEditingConsigneId(null)
                        }}
                        className="flex items-center gap-1 bg-amber-600 text-white px-2.5 py-1 rounded-md text-xs font-semibold hover:bg-amber-700"
                      >
                        <Check className="h-3.5 w-3.5" /> Enregistrer
                      </button>
                      <button
                        onClick={() => setEditingConsigneId(null)}
                        className="text-xs text-slate-500 hover:text-slate-800 px-1"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 space-y-0.5">
                    {String(n.content || '—')
                      .split('\n')
                      .map((line, li) => {
                        const tok = priorityToken(line)
                        return (
                          <p
                            key={li}
                            className="whitespace-pre-wrap text-xs text-slate-700 leading-relaxed"
                          >
                            {line || '\u00A0'}
                            {tok && (
                              <span
                                className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"
                                title="Ligne prioritaire (MEL / EXMP)"
                              >
                                {tok}
                              </span>
                            )}
                          </p>
                        )
                      })}
                  </div>
                )}
              </div>
            ))}
          </div>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Plane className="h-5 w-5 text-sky-500" /> Répartition par bloc
          </h2>
          {tasks.length === 0 ? (
            <p className="text-slate-500">Importez des tâches pour voir la répartition.</p>
          ) : (
            <div className="space-y-3">
              {Object.entries(byBlock)
                .sort((a, b) => b[1] - a[1])
                .map(([block, count]) => {
                  const color = getCategoryColor(block)
                  const pct = Math.round((count / tasks.length) * 100)
                  return (
                    <div key={block}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{getCategoryLabel(block)}</span>
                        <span className="text-slate-500">{count} ({pct}%)</span>
                      </div>
                      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </div>

        {allUnassigned.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4 sm:p-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold">À traiter (non assignées)</h2>
              <span className="text-sm text-slate-500">{allUnassigned.length} tâche(s)</span>
            </div>
            <div className="max-h-80 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {Object.entries(groupTasksByCategory(allUnassigned)).map(([block, blockTasks]) => {
                const color = getCategoryColor(block)
                const blockExpanded = expandedBlocks.includes(block)
                return (
                  <div key={block}>
                    <div
                      className="px-3 py-2 cursor-pointer select-none"
                      style={{ backgroundColor: `${color}14`, borderLeft: `4px solid ${color}` }}
                      onClick={() => toggleBlock(block)}
                    >
                      <div className="flex items-center gap-2">
                        {blockExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
                        )}
                        <span className="font-semibold text-sm" style={{ color }}>
                          {getCategoryLabel(block)}
                        </span>
                        <span className="text-xs text-slate-500">({blockTasks.length} tâche(s))</span>
                      </div>
                    </div>
                    {blockExpanded && (
                      <div className="space-y-2 p-2">
                        {Object.entries(groupByZone(blockTasks))
                          .sort((a, b) => a[0].localeCompare(b[0]))
                          .map(([zone, zoneTasks]) => {
                            const zoneColor = getZoneColor(zone, zones)
                            return (
                              <div key={zone} className="rounded-lg border overflow-hidden" style={{ borderColor: `${zoneColor}88`, borderWidth: 2 }}>
                                <div
                                  className="px-3 py-1.5 flex items-center justify-between"
                                  style={{ backgroundColor: zoneColor }}
                                >
                                  <span className="text-sm font-bold text-white">📍 {zone}</span>
                                  <span className="text-xs text-white/90">({zoneTasks.length})</span>
                                </div>
                                <div className="bg-white">
                                  {zoneTasks.map((task, i) => (
                                    <div
                                      key={task.id}
                                      className={`px-3 py-1.5 flex items-center gap-2 text-sm ${i > 0 ? 'border-t border-dashed border-slate-200' : ''}`}
                                    >
                                      <span className="w-10 shrink-0 font-bold text-slate-500">{task.seq || '—'}</span>
                                      {task.taskBarcode && (
                                        <span className="shrink-0 font-mono text-[11px] font-bold text-black bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                                          {task.taskBarcode}
                                        </span>
                                      )}
                                      <span className="flex-1 truncate text-slate-700" title={task.description}>
                                        {task.description}
                                      </span>
                                      {task.note && (
                                        <span
                                          className="shrink-0 max-w-[160px] truncate text-[10px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5"
                                          title={task.note}
                                        >
                                          {task.note}
                                        </span>
                                      )}
                                      {task.taskType && (
                                        <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${getCategoryColor(task.taskType)}22`, color: getCategoryColor(task.taskType) }}>
                                          {getCategoryLabel(task.taskType)}
                                        </span>
                                      )}
                                      {task.registration && (
                                        <span className="shrink-0 text-xs text-slate-400">✈ {task.registration}</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      {teams.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-500" /> Récap détaillé de la charge par équipe
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="text-left bg-slate-50 border-b">
                  <th className="px-4 py-2 font-semibold text-slate-700">Équipe</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">Tâches</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">Membres</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">Par membre</th>
                  <th className="px-4 py-2 font-semibold text-slate-700">Blocs (répartition)</th>
                </tr>
              </thead>
              <tbody>
                {teamLoad
                  .sort((a, b) => b.count - a.count)
                  .map((team) => (
                    <tr key={team.id} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => setSelectedTeamId(team.id)}>
                      <td className="px-4 py-2 font-medium underline decoration-dotted underline-offset-4" style={{ color: team.color }}>
                        {team.name}
                        {team.memberFirstNames.length > 0 && (
                          <div className="text-xs font-normal text-slate-500 underline-none pt-0.5">
                            {team.memberFirstNames.join(', ')}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2">{team.count}</td>
                      <td className="px-4 py-2">{team.membersCount}</td>
                      <td className="px-4 py-2">{team.perMember}</td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-1">
                          {Object.keys(team.byBlock).length === 0 && (
                            <span className="text-xs text-slate-400 italic">—</span>
                          )}
                          {Object.entries(team.byBlock)
                            .sort((a, b) => b[1].count - a[1].count)
                            .map(([key, info]) => {
                              const [blk, zone] = key.split(' / ')
                              const blkColor = getCategoryColor(blk)
                              const zoneColor = getZoneColor(zone, zones)
                              return (
                                <div key={key} className="flex flex-col gap-0.5">
                                  <div className="flex items-center gap-1.5">
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                                      style={{ backgroundColor: blkColor }}
                                    >
                                      {getCategoryLabel(blk)}
                                    </span>
                                    <span
                                      className="px-2 py-0.5 rounded-full text-xs font-bold text-white whitespace-nowrap"
                                      style={{ backgroundColor: zoneColor }}
                                    >
                                      {zone}
                                    </span>
                                    <span className="text-xs text-slate-500">
                                      · {info.count}
                                    </span>
                                  </div>
                                  {info.seqs.length > 0 && (
                                    <span className="text-[11px] font-mono font-bold text-slate-600 ml-1">
                                      N° {info.seqs.join(', ')}
                                    </span>
                                  )}
                                </div>
                              )
                            })}
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 pt-3">
            Charge moyenne : {stats.avgPerTeam} tâches / équipe ·{' '}
            {stats.totalMembers} technicien(s) au total
          </p>
        </div>
      )}

      {selectedTeam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print-target" onClick={() => setSelectedTeamId(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-3 flex items-center justify-between border-b" style={{ backgroundColor: selectedTeam.color }}>
              <div className="text-white">
                <h2 className="font-bold text-lg">{selectedTeam.name}</h2>
                <p className="text-white/90 text-xs">
                  {selectedTeamTasks.length} tâche(s) assignée(s) ·{' '}
                  {selectedTeam.members.length} membre(s) : {selectedTeam.members.join(', ') || '—'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={exportTeamPdf}
                  disabled={selectedTeamTasks.length === 0}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  title="Exporter la charge de l'équipe en PDF"
                >
                  <FileDown className="h-4 w-4" /> Exporter en PDF
                </button>
                <button
                  onClick={() => {
                    if (!selectedTeam || !selectedTeamTasks.length) return
                    downloadPdfAsJpeg(
                      buildTeamPdf(),
                      `equipe-${selectedTeam.name.replace(/[^a-z0-9]+/gi, '-') || 'sans-nom'}.pdf`
                    )
                  }}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  title="Exporter la charge de l'équipe en image JPEG"
                >
                  <ImageIcon className="h-4 w-4" /> JPEG
                </button>
                <button
                  onClick={printTeamPdf}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
                  title="Imprimer la charge de l'équipe"
                >
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button onClick={() => setSelectedTeamId(null)} className="text-white/80 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
            <div className="overflow-y-auto p-4">
              {selectedTeamTasks.length === 0 && (
                <p className="text-slate-500">Aucune tâche assignée à cette équipe.</p>
              )}
              {selectedTeamTasks.length > 0 && (
                <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="text-left bg-slate-100 rounded">
                                <th className="px-3 py-2 font-bold text-black">TRFX</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">N°</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Type</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Bloc</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Tâche</th>
                      <th className="px-3 py-2 font-semibold text-slate-700">Appareil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamStructured.map(({ blk, zones }) => (
                      <Fragment key={blk}>
                        <tr className="bg-slate-200/70">
                          <td colSpan={6} className="px-3 py-1 text-xs font-bold text-white" style={{ backgroundColor: getCategoryColor(blk) }}>
                            Bloc {getCategoryLabel(blk)}{' '}
                            <span className="font-normal opacity-90">
                              ({zones.reduce((a, z) => a + z.tasks.length, 0)} tâche
                              {zones.reduce((a, z) => a + z.tasks.length, 0) > 1 ? 's' : ''})
                            </span>
                          </td>
                        </tr>
                        {zones.map(({ zone, tasks }) => (
                          <Fragment key={zone}>
                            <tr className="bg-slate-50">
                              <td colSpan={6} className="px-3 py-1 text-xs font-bold text-slate-700">
                                {'📍 '}{zone}{' '}
                                <span className="font-normal text-slate-400">({tasks.length})</span>
                              </td>
                            </tr>
                            {tasks.map((task) => (
                              <tr key={task.id} className="border-b hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono font-bold text-xs text-black whitespace-nowrap">
                                  {task.taskBarcode || '—'}
                                </td>
                                <td className="px-3 py-2 font-bold text-slate-500 whitespace-nowrap">
                                  {task.seq || '—'}
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span
                                    className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
                                    style={{ backgroundColor: getCategoryColor(task.taskType) }}
                                  >
                                    {getCategoryLabel(task.taskType) || '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: getZoneColor(task.workArea, zones) }}>
                                    {task.workArea || '—'}
                                  </span>
                                </td>
                                <td className="px-3 py-2 max-w-md text-slate-600 text-xs" title={task.description}>
                                  <span className="flex items-center gap-1 min-w-0">
                                    <span className="truncate">{task.description || '—'}</span>
                                    {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`) && (
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"
                                        title="Ligne prioritaire (MEL / EXMP)"
                                      >
                                        {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`)}
                                      </span>
                                    )}
                                  </span>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-slate-600">
                                  {task.registration || '—'}
                                </td>
                              </tr>
                            ))}
                          </Fragment>
                        ))}
                      </Fragment>
                    ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className="bg-white rounded-xl shadow p-3 sm:p-5">
      <div className={`inline-flex p-1.5 sm:p-2 rounded-lg ${color}`}>{icon}</div>
      <div className="mt-2 sm:mt-3 text-2xl sm:text-3xl font-bold text-slate-900">{value}</div>
      <div className="text-xs sm:text-sm text-slate-500 truncate">{label}</div>
    </div>
  )
}
