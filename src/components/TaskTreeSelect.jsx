import { ChevronDown, ChevronRight } from 'lucide-react'
import { getCategoryColor, getCategoryLabel } from '../utils/helpers'

// Arbre de sélection : bloc → sous-tâche (zone) → lignes, avec cases à cocher.
// Utilisé par Import consignes (charge) et Préparation de vac suivante.

export function groupTasksTree(list) {
  const blocks = {}
  list.forEach((t) => {
    const b = t.taskType || 'AUTRE'
    const z = t.workArea || 'Autre'
    if (!blocks[b]) blocks[b] = {}
    if (!blocks[b][z]) blocks[b][z] = []
    blocks[b][z].push(t)
  })
  return Object.entries(blocks)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([block, zones]) => ({
      block,
      zones: Object.entries(zones)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([zone, tasks]) => ({
          zone,
          tasks: [...tasks].sort((x, y) => Number(x.seq) - Number(y.seq)),
        })),
    }))
}

export default function TaskTreeSelect({
  tree,
  selected,
  onToggleTask,
  onToggleTasks,
  expandedBlocks,
  setExpandedBlocks,
  expandedZones,
  setExpandedZones,
  idPrefix,
}) {
  return tree.map(({ block, zones }) => {
    const blockTasks = zones.flatMap((z) => z.tasks)
    const blockSelected = blockTasks.filter((t) => selected[t.id]).length
    const blockOpen = expandedBlocks.includes(block)
    const color = getCategoryColor(block)
    return (
      <div key={`${idPrefix}-${block}`} className="border-b border-slate-100">
        <div
          className="flex items-center gap-2 px-3 py-2"
          style={{ backgroundColor: `${color}14`, borderLeft: `4px solid ${color}` }}
        >
          <input
            type="checkbox"
            checked={blockSelected === blockTasks.length && blockTasks.length > 0}
            ref={(el) => {
              if (el)
                el.indeterminate = blockSelected > 0 && blockSelected < blockTasks.length
            }}
            onChange={() => onToggleTasks(blockTasks)}
            className="h-4 w-4 accent-sky-600 shrink-0"
          />
          <button
            onClick={() =>
              setExpandedBlocks((prev) =>
                prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
              )
            }
            className="flex items-center gap-2 flex-1 min-w-0 text-left"
          >
            {blockOpen ? (
              <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="h-4 w-4 text-slate-500 shrink-0" />
            )}
            <span className="font-semibold text-sm" style={{ color }}>
              {getCategoryLabel(block)}
            </span>
            <span className="text-xs text-slate-500">
              ({blockSelected}/{blockTasks.length})
            </span>
          </button>
        </div>
        {blockOpen &&
          zones.map(({ zone, tasks }) => {
            const zoneKey = `${idPrefix}::${block}::${zone}`
            const zoneOpen = expandedZones.includes(zoneKey)
            const zoneSelected = tasks.filter((t) => selected[t.id]).length
            return (
              <div key={zoneKey}>
                <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 bg-slate-50 border-t border-slate-100">
                  <input
                    type="checkbox"
                    checked={zoneSelected === tasks.length && tasks.length > 0}
                    ref={(el) => {
                      if (el)
                        el.indeterminate = zoneSelected > 0 && zoneSelected < tasks.length
                    }}
                    onChange={() => onToggleTasks(tasks)}
                    className="h-4 w-4 accent-sky-600 shrink-0"
                  />
                  <button
                    onClick={() =>
                      setExpandedZones((prev) =>
                        prev.includes(zoneKey)
                          ? prev.filter((k) => k !== zoneKey)
                          : [...prev, zoneKey]
                      )
                    }
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    {zoneOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    )}
                    <span className="text-xs font-semibold text-slate-700">📍 {zone}</span>
                    <span className="text-[11px] text-slate-400">
                      ({zoneSelected}/{tasks.length})
                    </span>
                  </button>
                </div>
                {zoneOpen &&
                  tasks.map((task) => (
                    <label
                      key={task.id}
                      className="flex items-center gap-2 pl-14 pr-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer border-t border-dashed border-slate-100"
                    >
                      <input
                        type="checkbox"
                        checked={!!selected[task.id]}
                        onChange={() => onToggleTask(task.id)}
                        className="h-4 w-4 accent-sky-600 shrink-0"
                      />
                      <span className="w-10 shrink-0 font-bold text-slate-500">
                        {task.seq || '—'}
                      </span>
                      {task.taskBarcode && (
                        <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
                          {task.taskBarcode}
                        </span>
                      )}
                      <span
                        className="flex-1 min-w-0 truncate text-slate-700"
                        title={task.description}
                      >
                        {task.description}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {task.scheduledHours || ''}
                      </span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {task.registration || ''}
                      </span>
                    </label>
                  ))}
              </div>
            )
          })}
      </div>
    )
  })
}
