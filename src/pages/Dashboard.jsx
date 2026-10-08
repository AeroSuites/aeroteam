import { useMemo, useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { openPdfPrint, drawCheckboxCell, drawPriorityBadge, hidePriorityCellText } from '../utils/pdfPrint'
import TeamChargeCards from '../components/TeamChargeCards'
import { buildRecapPdf } from '../utils/recapPdf'
import { useApp } from '../context/AppContext'
import {
  getCategoryColor,
  getZoneColor,
  groupTasksByCategory,
  getCategoryLabel,
  hexToRgb,
  isAssignedTo,
  assignedTaskCount,
  assignmentTeams,
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
  Printer,
  FileDown,
  Pencil,
  Trash2,
  Check,
  Users,
  X,
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
  const { tasks, teams, assignments, notes, updateNote, removeNote, members, dayMembers, dayLeaders, pockets, activeProfile, agentsProgress, clearAgentCharge } = useApp()
  const [editingConsigneId, setEditingConsigneId] = useState(null)
  const [consigneText, setConsigneText] = useState('')
  const [historyAgent, setHistoryAgent] = useState(null)
  const [openHist, setOpenHist] = useState([])
  const [agentsOpen, setAgentsOpen] = useState(false)

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

  const buildTeamPdf = (team) => {
    const teamTasks = tasks.filter((x) => isAssignedTo(assignments, x.id, team.id))
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = pageWidth - margin * 2

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(team.name, margin, 15)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.text(
      `${teamTasks.length} tâche(s) · ${team.members.length} membre(s) : ${
        team.members.join(', ') || '—'
      } · ${new Date().toLocaleDateString('fr-FR')}`,
      margin,
      21
    )

    const groups = {}
    teamTasks.forEach((t) => {
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
                colSpan: 7,
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
            t.note || '',
          ]),
          styles: { fontSize: 8, cellPadding: 1.2, textColor: [0, 0, 0], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 12 },
            2: { cellWidth: 16 },
            3: { cellWidth: 30, fontStyle: 'bold', textColor: [0, 0, 0] },
            5: { cellWidth: 26 },
            6: { cellWidth: 40, textColor: [0, 0, 0], fontStyle: 'bolditalic' },
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
          didParseCell: (data) => {
            hidePriorityCellText(data)
            // N° de ligne coloré selon le statut (comme les badges de la page Tâches)
            if (data.section === 'body' && data.column.index === 1) {
              const t = zoneTasks[data.row.index]
              if (t && t.mtxStatus === 'COMPLETE') {
                data.cell.styles.textColor = [22, 163, 74]
                data.cell.styles.fontStyle = 'bold'
              } else if (t && t.mtxStatus === 'PAUSE') {
                data.cell.styles.textColor = [217, 119, 6]
                data.cell.styles.fontStyle = 'bold'
              }
            }
          },
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

  const stats = useMemo(() => {
    const total = tasks.length
    const assigned = assignedTaskCount(assignments)
    const unassigned = total - assigned
    const totalMembers = teams.reduce((acc, t) => acc + t.members.length, 0)
    const avgPerTeam = teams.length ? (assigned / teams.length).toFixed(1) : '0'
    return { total, assigned, unassigned, totalMembers, avgPerTeam }
  }, [tasks, teams, assignments])

  const allUnassigned = useMemo(
    () => tasks.filter((t) => assignmentTeams(assignments, t.id).length === 0),
    [tasks, assignments]
  )

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
                        const isItem = line.trim().startsWith('- ')
                        const item = isItem ? line.trim().slice(2) : line
                        if (!String(item).trim()) return null
                        const tok = priorityToken(line)
                        return (
                          <p
                            key={li}
                            className={`whitespace-pre-wrap leading-relaxed ${
                              isItem ? 'flex items-start gap-1.5 text-xs text-slate-700' : 'text-[11px] text-slate-500'
                            }`}
                          >
                            {isItem && (
                              <span className="text-amber-500 font-bold leading-4 shrink-0">•</span>
                            )}
                            <span className="flex-1">
                              {item}
                              {tok && (
                                <span
                                  className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"
                                  title="Ligne prioritaire (MEL / EXMP / NSRE)"
                                >
                                  {tok}
                                </span>
                              )}
                            </span>
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
        {/* Membres assignés à l'avion du jour (effectif reçu avec les consignes) */}
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Users className="h-5 w-5 text-sky-500" /> Membres assignés à l'avion
            {activeProfile?.aircraft && (
              <span className="text-sm font-normal text-slate-400">
                · {activeProfile.aircraft}
              </span>
            )}
          </h2>
          {dayMembers.length === 0 ? (
            <p className="text-slate-500 text-sm">
              Aucun membre assigné pour le moment — ils arrivent avec les consignes importées
              (Import consignes).
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                <span className="font-semibold text-slate-700">{dayMembers.length}</span> membre(s)
                assigné(s) à l'avion du jour
              </p>
              {/* Même style que l'effectif d'Import consignes : bloc avion + pastilles */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-w-[420px]">
                <div
                  className="px-3 py-1.5 flex items-center justify-between"
                  style={{ backgroundColor: getZoneColor(activeProfile?.aircraft || 'Avion') }}
                >
                  <span className="text-white font-mono font-bold text-sm">
                    {activeProfile?.aircraft || 'Avion'}
                  </span>
                  <span className="text-white/90 text-xs font-semibold">{dayMembers.length}</span>
                </div>
                <div className="p-2 flex flex-wrap gap-1">
                  {dayMembers.map((m) => {
                    const isLeader = (dayLeaders || []).includes(m)
                    return (
                      <span
                        key={m}
                        className={`px-2 py-0.5 rounded-full text-[11px] border ${
                          isLeader
                            ? 'bg-sky-600 border-sky-700 text-white font-bold'
                            : 'bg-slate-100 border-slate-200 text-slate-700 font-medium'
                        }`}
                        title={isLeader ? 'Leader' : undefined}
                      >
                        {isLeader ? '★ ' : ''}
                        {m}
                      </span>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>

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
                            const zoneColor = getZoneColor(zone)
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

      {/* Équipes et charge : cartes + exports (individuel tableau / récap complet) */}
      {teams.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-sky-500" /> Équipes et charge
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const doc = buildRecapPdf(activeProfile, {
                    teams,
                    tasks,
                    assignments,
                    members,
                    dayMembers,
                    notes,
                    pockets,
                  })
                  doc.save(
                    `recap-${
                      (activeProfile?.name || 'profil')
                        .toLowerCase()
                        .replace(/[^a-z0-9]+/g, '-')
                        .replace(/^-|-$/g, '') || 'profil'
                    }-${new Date().toISOString().slice(0, 10)}.pdf`
                  )
                }}
                className="flex items-center gap-1.5 bg-sky-600 text-white px-3 py-1.5 rounded-md hover:bg-sky-700 text-sm font-semibold"
                title="Récap complet de toutes les équipes (cartes) — même document que la vue manager"
              >
                <FileDown className="h-4 w-4" /> Récap complet (PDF)
              </button>
              <button
                onClick={() =>
                  openPdfPrint(
                    buildRecapPdf(activeProfile, {
                      teams,
                      tasks,
                      assignments,
                      members,
                      dayMembers,
                      notes,
                      pockets,
                    })
                  )
                }
                className="flex items-center gap-1.5 text-sky-700 border border-sky-200 hover:bg-sky-50 px-3 py-1.5 rounded-md text-sm font-semibold"
                title="Imprimer le récap complet"
              >
                <Printer className="h-4 w-4" /> Imprimer
              </button>
            </div>
          </div>
          <TeamChargeCards
            teams={teams}
            tasks={tasks}
            assignments={assignments}
            agentsProgress={agentsProgress}
            onExportPdf={(team) => {
              const doc = buildTeamPdf(team)
              doc.save(
                `equipe-${team.name.replace(/[^a-z0-9]+/gi, '-') || 'sans-nom'}.pdf`
              )
            }}
            onPrint={(team) => openPdfPrint(buildTeamPdf(team))}
          />
        </div>
      )}

      {/* Avancement des agents (charges envoyées par ce leader) — repliable */}
      {agentsProgress.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <button
            onClick={() => setAgentsOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 text-left"
            title={agentsOpen ? 'Replier cette section' : 'Déplier cette section'}
          >
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-500" /> Avancement des agents
              <span className="text-sm font-normal text-slate-400">
                ({agentsProgress.length})
              </span>
            </h2>
            {agentsOpen ? (
              <ChevronDown className="h-5 w-5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="h-5 w-5 text-slate-400 shrink-0" />
            )}
          </button>
          {agentsOpen && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-4">
            {agentsProgress.map((a) => {
              const list = Array.isArray(a.tasks) ? a.tasks : []
              const hist = Array.isArray(a.chargeHistory) ? a.chargeHistory : []
              const hasActive = !!a.date
              const done = list.filter((t) => t.mtxStatus === 'COMPLETE').length
              const paused = list.filter((t) => t.mtxStatus === 'PAUSE').length
              const pct = list.length ? Math.round((done / list.length) * 100) : 0
              const last = a.updated_at
                ? new Date(a.updated_at).toLocaleString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : ''
              return (
                <div key={a.id} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-slate-800 truncate">{a.name}</p>
                    <span className="flex items-center gap-1.5 shrink-0">
                      {hasActive && (
                        <span
                          className={`text-xs font-bold ${
                            pct === 100 ? 'text-emerald-600' : 'text-slate-500'
                          }`}
                        >
                          {done}/{list.length} {pct === 100 ? '✓' : ''}
                        </span>
                      )}
                      {hasActive && (
                        <button
                          onClick={async () => {
                            if (
                              window.confirm(
                                `Retirer la charge de « ${a.name} » ? (elle part dans l'historique)`
                              )
                            ) {
                              const res = await clearAgentCharge(a.id)
                              if (res?.error) window.alert("Échec du retrait de la charge.")
                            }
                          }}
                          className="text-slate-300 hover:text-red-600"
                          title="Retirer la charge de cet agent"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">
                    {hasActive ? (
                      <>
                        {a.teamName ? `${a.teamName} · ` : ''}
                        {a.aircraft || ''}
                        {a.date ? ` · ${a.date}` : ''}
                      </>
                    ) : (
                      'Aucune charge en cours'
                    )}
                  </p>
                  {hasActive ? (
                    <>
                      <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {paused > 0 ? `${paused} en pause · ` : ''}maj {last || '—'}
                      </p>
                    </>
                  ) : (
                    <p className="text-[11px] text-slate-400 mt-1">maj {last || '—'}</p>
                  )}
                  {hist.length > 0 && (
                    <button
                      onClick={() => {
                        setHistoryAgent(a)
                        setOpenHist([])
                      }}
                      className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-full px-2 py-0.5"
                      title={`Consulter les ${hist.length} charge(s) précédente(s)`}
                    >
                      📜 {hist.length} charge{hist.length > 1 ? 's' : ''} précédente
                      {hist.length > 1 ? 's' : ''}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
          )}
        </div>
      )}

      {/* Archives des charges d'un agent */}
      {historyAgent && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setHistoryAgent(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  Charges précédentes · {historyAgent.name}
                </h2>
                <p className="text-xs text-slate-300">
                  {(historyAgent.chargeHistory || []).length} archive(s) — clique pour voir les
                  lignes
                </p>
              </div>
              <button
                onClick={() => setHistoryAgent(null)}
                className="text-slate-300 hover:text-white shrink-0"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="overflow-y-auto divide-y divide-slate-100">
              {(historyAgent.chargeHistory || []).map((h, i) => {
                const list = Array.isArray(h.tasks) ? h.tasks : []
                const done = list.filter((t) => t.mtxStatus === 'COMPLETE').length
                const open = openHist.includes(i)
                return (
                  <li key={i}>
                    <button
                      onClick={() =>
                        setOpenHist((prev) =>
                          prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                        )
                      }
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-slate-50"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span className="font-semibold text-slate-700 shrink-0">
                        {h.date || '—'}
                      </span>
                      <span className="text-slate-500 truncate">
                        {h.aircraft ? `✈ ${h.aircraft}` : ''}
                        {h.teamName ? ` · ${h.teamName}` : ''}
                      </span>
                      <span className="ml-auto shrink-0 text-xs font-bold text-slate-500">
                        {done}/{list.length} {list.length > 0 && done === list.length ? '✓' : ''}
                      </span>
                    </button>
                    {open && (
                      <ul className="px-4 pb-3 space-y-0.5">
                        {list.map((t) => (
                          <li
                            key={t.id}
                            className="flex items-center gap-2 text-xs text-slate-600"
                          >
                            <span className="w-10 shrink-0 font-mono font-bold text-slate-400">
                              {cleanShortValue(t.seq) || '—'}
                            </span>
                            <span className="flex-1 min-w-0 truncate" title={t.description}>
                              {t.description}
                            </span>
                            {t.taskBarcode && (
                              <span className="shrink-0 font-mono text-[10px] font-bold text-sky-700 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
                                {t.taskBarcode}
                              </span>
                            )}
                            <span
                              className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                                t.mtxStatus === 'ACTV'
                                  ? 'bg-green-100 text-green-700'
                                  : t.mtxStatus === 'PAUSE'
                                  ? 'bg-amber-100 text-amber-700'
                                  : t.mtxStatus === 'COMPLETE'
                                  ? 'bg-green-800 text-white'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {t.mtxStatus || '—'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
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
