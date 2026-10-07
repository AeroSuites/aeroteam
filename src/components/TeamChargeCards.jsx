import { useState } from 'react'
import { ChevronDown, ChevronRight, FileDown, FileText, ListChecks, Printer, StickyNote, X } from 'lucide-react'
import {
  getCategoryColor,
  getCategoryLabel,
  getZoneColor,
  isAssignedTo,
  cleanShortValue,
  cleanTaskText,
  taskContentKey,
} from '../utils/helpers'

// Fin de TRFX : après « TRFX900 » (ex. TRFX900ABCD → ABCD) ; sinon le code
// complet, sinon l'immatriculation. (Utilisé par le PDF exporté.)
export function trfxTail(task) {
  const b = String(task?.taskBarcode || '')
  const m = b.match(/TRFX900(.*)$/i)
  if (m) return m[1] || b
  return b || String(task?.registration || '')
}

function groupTeamTasks(teamTasks) {
  const zones = {}
  teamTasks.forEach((t) => {
    const z = t.workArea || 'Autre'
    if (!zones[z]) zones[z] = []
    zones[z].push(t)
  })
  return Object.entries(zones)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([zone, list]) => {
      const by = {}
      list.forEach((t) => {
        const b = t.taskType || 'AUTRE'
        if (!by[b]) by[b] = []
        by[b].push(t)
      })
      return {
        zone,
        blocks: Object.entries(by).sort((a, b) => a[0].localeCompare(b[0])),
      }
    })
}

// Une carte d'équipe : pliée par défaut, dépliable individuellement
function TeamCard({ team, tasks, assignments, onExportPdf, onPrint, agentsProgress }) {
  const [open, setOpen] = useState(false)
  const [descTask, setDescTask] = useState(null)
  const [notePopup, setNotePopup] = useState(null)
  const teamTasks = (tasks || []).filter((t) => isAssignedTo(assignments, t.id, team.id))
  const zoneGroups = groupTeamTasks(teamTasks)

  // Avancement de l'agent qui a reçu la charge de cette équipe (suivi leader)
  const agentInfo = (agentsProgress || []).find(
    (a) => a.teamName && a.teamName === team.name
  )
  const agentByKey = {}
  ;(agentInfo?.tasks || []).forEach((t) => {
    agentByKey[taskContentKey(t)] = t
  })
  const agentTotal = (agentInfo?.tasks || []).length
  const agentDone = (agentInfo?.tasks || []).filter(
    (t) => t.mtxStatus === 'COMPLETE'
  ).length

  return (
    <>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <div
          className="px-3 py-2 flex items-center justify-between gap-2 text-white cursor-pointer select-none"
          style={{ backgroundColor: team.color || '#64748b' }}
          onClick={() => setOpen((v) => !v)}
          title={open ? 'Replier cette équipe' : 'Déplier cette équipe'}
        >
          <span className="flex items-center gap-1.5 min-w-0">
            {open ? (
              <ChevronDown className="h-4 w-4 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0" />
            )}
            <span className="font-bold text-sm truncate">{team.name}</span>
          </span>
          <span
            className="flex items-center gap-1.5 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {(onExportPdf || onPrint) && (
              <span className="flex items-center gap-1">
                {onExportPdf && (
                  <button
                    onClick={() => onExportPdf(team)}
                    className="flex items-center gap-1 bg-white text-slate-800 rounded-full px-2 py-1 text-[10px] font-bold shadow-sm hover:bg-slate-100"
                    title={`Exporter la charge de « ${team.name} » en PDF (mise en page tableau)`}
                  >
                    <FileDown className="h-3.5 w-3.5" /> PDF
                  </button>
                )}
                {onPrint && (
                  <button
                    onClick={() => onPrint(team)}
                    className="flex items-center gap-1 bg-white/20 border border-white/60 text-white rounded-full px-2 py-1 text-[10px] font-bold hover:bg-white/30"
                    title={`Imprimer la charge de « ${team.name} »`}
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimer
                  </button>
                )}
              </span>
            )}
            {agentInfo && (
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap ${
                  agentTotal > 0 && agentDone === agentTotal
                    ? 'bg-emerald-500 text-white'
                    : 'bg-white/25 text-white'
                }`}
                title={`Agent ${agentInfo.name} : ${agentDone}/${agentTotal} faite(s)`}
              >
                👤 {agentDone}/{agentTotal}
              </span>
            )}
            <span className="text-xs opacity-90">
              {teamTasks.length} tâche{teamTasks.length > 1 ? 's' : ''}
            </span>
          </span>
        </div>
        {open && (
          <div className="p-3">
            <div className="flex flex-wrap gap-1">
              {team.members.length === 0 && (
                <span className="text-xs text-slate-400 italic">—</span>
              )}
              {team.members.map((m, i) => (
                <span
                  key={i}
                  className="bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 text-[11px]"
                >
                  {m}
                </span>
              ))}
            </div>
            {teamTasks.length > 0 && (
              <div className="mt-2 space-y-2">
                {zoneGroups.map(({ zone, blocks }) => (
                  <div key={zone}>
                    <p className="mb-1 inline-flex items-center gap-1.5">
                      <span
                        className="text-[10px] font-bold text-white rounded-full px-2 py-0.5 shadow-sm"
                        style={{ backgroundColor: getZoneColor(zone) }}
                      >
                        {zone}
                      </span>
                      <span className="text-[10px] text-slate-400 font-semibold">
                        {blocks.reduce((a, [, b]) => a + b.length, 0)}
                      </span>
                    </p>
                    <div className="space-y-1.5 pl-1">
                      {blocks.map(([blk, list]) => (
                        <div key={blk}>
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span
                              className="text-[10px] font-bold text-white rounded-full px-2 py-0.5"
                              style={{ backgroundColor: getCategoryColor(blk) }}
                            >
                              {getCategoryLabel(blk)}
                            </span>
                            <span className="text-[10px] text-slate-400">{list.length}</span>
                          </div>
                          <ul className="space-y-0.5 mb-1">
                            {list.map((t) => (
                              <li
                                key={t.id}
                                className={`text-[11px] text-slate-600 flex gap-1.5 rounded px-1 -mx-1 ${
                                  t.taskDescription || t.taskSteps
                                    ? 'cursor-pointer hover:bg-slate-100'
                                    : ''
                                }`}
                                onClick={() =>
                                  (t.taskDescription || t.taskSteps) && setDescTask(t)
                                }
                              >
                                <span className="font-mono font-bold shrink-0">
                                  {cleanShortValue(t.seq) || '—'}
                                </span>
                                <span className="truncate" title={t.description}>
                                  {t.description}
                                </span>
                                {(t.taskDescription || t.taskSteps) && (
                                  <FileText className="h-3 w-3 shrink-0 text-sky-600 mt-0.5" />
                                )}
                                {agentInfo &&
                                  agentByKey[taskContentKey(t)] &&
                                  agentByKey[taskContentKey(t)].note && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setNotePopup({
                                          task: t,
                                          note: agentByKey[taskContentKey(t)].note,
                                          status: agentByKey[taskContentKey(t)].mtxStatus,
                                          agentName: agentInfo.name,
                                        })
                                      }}
                                      className="shrink-0 inline-flex items-center justify-center text-amber-800 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded-full p-1"
                                      title="Lire la note de l'agent"
                                    >
                                      <StickyNote className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                {agentInfo && agentByKey[taskContentKey(t)] && (
                                  <span
                                    className={`shrink-0 h-2.5 w-2.5 rounded-full ${
                                      agentByKey[taskContentKey(t)].mtxStatus === 'COMPLETE'
                                        ? 'bg-emerald-500'
                                        : agentByKey[taskContentKey(t)].mtxStatus === 'PAUSE'
                                        ? 'bg-amber-500'
                                        : 'bg-slate-300'
                                    }`}
                                    title={`Agent ${agentInfo.name} : ${
                                      agentByKey[taskContentKey(t)].mtxStatus || 'ACTV'
                                    }`}
                                  />
                                )}
                                {(t.taskBarcode || t.registration) && (
                                  <span
                                    className="shrink-0 ml-auto font-mono text-[10px] font-bold text-sky-700"
                                    title={t.taskBarcode ? `TRFX ${t.taskBarcode}` : 'Avion'}
                                  >
                                    {t.taskBarcode || t.registration}
                                  </span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
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
                  N° {cleanShortValue(descTask.seq) || '—'} · {descTask.description}
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
                title="Fermer"
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
                      Description détaillée
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
                      Étapes (Task Steps)
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
      {notePopup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setNotePopup(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-amber-500 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  Note de {notePopup.agentName} · N°{' '}
                  {cleanShortValue(notePopup.task.seq) || '—'}
                </h2>
                <p className="text-xs text-amber-100 truncate">
                  {notePopup.task.description}
                </p>
              </div>
              <button
                onClick={() => setNotePopup(null)}
                className="text-amber-100 hover:text-white shrink-0"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto">
              <p className="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wide">
                Note ({notePopup.status || 'ACTV'})
              </p>
              <p className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                {notePopup.note}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// Liste des cartes d'équipes avec leur charge
export default function TeamChargeCards({ teams, tasks, assignments, onExportPdf, onPrint, agentsProgress }) {
  if (!(teams || []).length) return null
  const columns = [[], []]
  ;(teams || []).forEach((team, i) => {
    columns[i % 2].push(team)
  })
  return (
    <div className="flex flex-col md:flex-row items-start gap-3">
      {columns.map((column, ci) => (
        <div key={ci} className="flex w-full min-w-0 flex-col gap-3 md:flex-1">
          {column.map((team) => (
            <TeamCard
              key={team.id}
              team={team}
              tasks={tasks}
              assignments={assignments}
              onExportPdf={onExportPdf}
              onPrint={onPrint}
              agentsProgress={agentsProgress}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
