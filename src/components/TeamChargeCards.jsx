import { useState } from 'react'
import { ChevronDown, ChevronRight, FileDown, Printer } from 'lucide-react'
import {
  getCategoryColor,
  getCategoryLabel,
  getZoneColor,
  isAssignedTo,
  cleanShortValue,
} from '../utils/helpers'

// Fin de TRFX : après « TRFX900 » (ex. TRFX900ABCD → ABCD) ; sinon le code
// complet, sinon l'immatriculation.
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
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([zone, list]) => {
      const by = {}
      list.forEach((t) => {
        const b = t.taskType || 'AUTRE'
        if (!by[b]) by[b] = []
        by[b].push(t)
      })
      return {
        zone,
        blocks: Object.entries(by).sort((a, b) => b[1].length - a[1].length),
      }
    })
}

// Cartes d'équipes avec leur charge (même présentation que le récap manager)
// Chaque carte est pliée par défaut ; clic sur le bandeau pour déplier.
export default function TeamChargeCards({
  teams,
  tasks,
  assignments,
  onExportPdf,
  onPrint,
}) {
  // Par défaut, toutes les cartes sont pliées : on mémorise celles DÉPLIÉES
  const [expanded, setExpanded] = useState([])
  const toggleCard = (id) =>
    setExpanded((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))

  if (!(teams || []).length) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(teams || []).map((team) => {
        const teamTasks = (tasks || []).filter((t) =>
          isAssignedTo(assignments, t.id, team.id)
        )
        const zoneGroups = groupTeamTasks(teamTasks)
        const isCollapsed = !expanded.includes(team.id)
        return (
          <div key={team.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <div
              className="px-3 py-2 flex items-center justify-between gap-2 text-white cursor-pointer select-none"
              style={{ backgroundColor: team.color || '#64748b' }}
              onClick={() => toggleCard(team.id)}
              title={isCollapsed ? 'Déplier cette équipe' : 'Replier cette équipe'}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                {isCollapsed ? (
                  <ChevronRight className="h-4 w-4 shrink-0" />
                ) : (
                  <ChevronDown className="h-4 w-4 shrink-0" />
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
                <span className="text-xs opacity-90">
                  {teamTasks.length} tâche{teamTasks.length > 1 ? 's' : ''}
                </span>
              </span>
            </div>
            {!isCollapsed && (
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
                <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
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
                                <li key={t.id} className="text-[11px] text-slate-600 flex gap-1.5">
                                  <span className="font-mono font-bold shrink-0">
                                    {cleanShortValue(t.seq) || '—'}
                                  </span>
                                  <span className="truncate" title={t.description}>
                                    {t.description}
                                  </span>
                                  {trfxTail(t) && (
                                    <span className="shrink-0 ml-auto font-mono text-[10px] font-bold text-sky-700">
                                      {trfxTail(t)}
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
        )
      })}
    </div>
  )
}
