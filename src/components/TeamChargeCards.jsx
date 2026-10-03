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
export default function TeamChargeCards({ teams, tasks, assignments }) {
  if (!(teams || []).length) return null
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {(teams || []).map((team) => {
        const teamTasks = (tasks || []).filter((t) =>
          isAssignedTo(assignments, t.id, team.id)
        )
        const zoneGroups = groupTeamTasks(teamTasks)
        return (
          <div key={team.id} className="border border-slate-200 rounded-lg overflow-hidden">
            <div
              className="px-3 py-2 flex items-center justify-between gap-2 text-white"
              style={{ backgroundColor: team.color || '#64748b' }}
            >
              <span className="font-bold text-sm truncate">{team.name}</span>
              <span className="text-xs opacity-90 shrink-0">
                {teamTasks.length} tâche{teamTasks.length > 1 ? 's' : ''}
              </span>
            </div>
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
          </div>
        )
      })}
    </div>
  )
}
