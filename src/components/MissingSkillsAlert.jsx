import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CATEGORIES, getCategoryLabel } from '../utils/helpers'
import TrfxLink from './TrfxLink'

// Skill proposé par défaut pour les lignes sans skill
const DEFAULT_SKILL = 'CAB1B2'

// Alerte : lignes du fichier Victory sans skill (colonne « Skills » vide).
// Elles sont exclues par le filtre Skills → on propose de renseigner le skill
// manquant, de choisir le bloc / la sous-tâche, et de les intégrer malgré tout.
export default function MissingSkillsAlert({ rows, onImport, importLabel, zones }) {
  const [skills, setSkills] = useState(() =>
    Object.fromEntries((rows || []).map((_, i) => [i, DEFAULT_SKILL]))
  )
  const [blocks, setBlocks] = useState(() =>
    Object.fromEntries(
      (rows || []).map((r, i) => [i, CATEGORIES.includes(r.taskType) ? r.taskType : ''])
    )
  )
  const [subTasks, setSubTasks] = useState(() =>
    Object.fromEntries((rows || []).map((r, i) => [i, r.workArea || '']))
  )
  const [newSubTasks, setNewSubTasks] = useState({})
  const [checked, setChecked] = useState(() =>
    Object.fromEntries((rows || []).map((_, i) => [i, true]))
  )

  if (!rows || rows.length === 0) return null

  const selectable = rows.map((r, i) => ({ r, i })).filter(({ r }) => !r.imported)
  const checkedCount = selectable.filter(({ i }) => checked[i]).length
  const allFilled = selectable.every(
    ({ i }) => !checked[i] || String(skills[i] || '').trim()
  )
  const canImport = Boolean(onImport) && checkedCount > 0 && allFilled

  const subTaskFor = (i) =>
    subTasks[i] === '__NEW__'
      ? String(newSubTasks[i] || '').trim()
      : String(subTasks[i] || '').trim()

  const handleImport = () => {
    if (!canImport) return
    const items = selectable
      .filter(({ i }) => checked[i])
      .map(({ i }) => ({
        row: rows[i].row,
        skill: String(skills[i] || '').trim(),
        taskType: blocks[i] || '',
        workArea: subTaskFor(i),
      }))
    onImport(items)
  }

  const remaining = selectable.length
  const zoneOptions = [...new Set((zones || []).filter(Boolean))].sort()

  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
      <h3 className="font-semibold text-amber-800 flex items-center gap-2 mb-1">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {remaining} line(s) without skill — excluded from the import
      </h3>
      <p className="text-xs text-amber-700 mb-3">
        The Skills column is empty on these lines: they are dropped by the Skills
        filter. Fill in the missing skill (default {DEFAULT_SKILL}), choose the block /
        sub-task, then import them anyway.
      </p>
      <div className="max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full min-w-[880px] text-xs">
          <thead className="sticky top-0 bg-amber-100 text-amber-900">
            <tr>
              <th className="px-2 py-1.5 w-8"></th>
              <th className="text-left px-2 py-1.5 w-14">N°</th>
              <th className="text-left px-2 py-1.5">Title</th>
              <th className="text-left px-2 py-1.5 w-36">TRFX</th>
              <th className="text-left px-2 py-1.5 w-32">Skill</th>
              <th className="text-left px-2 py-1.5 w-32">Block</th>
              <th className="text-left px-2 py-1.5 w-40">Sub-task</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {rows.map((r, i) => (
              <tr key={i} className={r.imported ? 'opacity-60' : ''}>
                <td className="px-2 py-1 text-center">
                  {r.imported ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 inline" />
                  ) : (
                    <input
                      type="checkbox"
                      checked={!!checked[i]}
                      onChange={() => setChecked((prev) => ({ ...prev, [i]: !prev[i] }))}
                      className="h-4 w-4 accent-sky-600"
                    />
                  )}
                </td>
                <td className="px-2 py-1 font-bold text-slate-600">{r.seq || '—'}</td>
                <td className="px-2 py-1 text-slate-700">{r.description || '—'}</td>
                <td className="px-2 py-1 font-mono font-bold text-sky-700">
                  {r.taskBarcode ? <TrfxLink value={r.taskBarcode} /> : '—'}
                </td>
                <td className="px-2 py-1">
                  {r.imported ? (
                    <span className="text-[11px] font-semibold text-green-700">
                      imported ({skills[i] || '—'})
                    </span>
                  ) : (
                    <input
                      value={skills[i] || ''}
                      onChange={(e) => setSkills((prev) => ({ ...prev, [i]: e.target.value }))}
                      placeholder={DEFAULT_SKILL}
                      disabled={!checked[i]}
                      className="w-full border border-amber-300 rounded px-2 py-1 text-xs disabled:bg-slate-50 disabled:opacity-60"
                    />
                  )}
                </td>
                <td className="px-2 py-1">
                  <select
                    value={blocks[i] || ''}
                    onChange={(e) => setBlocks((prev) => ({ ...prev, [i]: e.target.value }))}
                    disabled={!checked[i] || r.imported}
                    className="w-full border border-amber-300 rounded px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:opacity-60"
                    title="Choose the block for this line"
                  >
                    <option value="">— Block —</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {getCategoryLabel(c)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-2 py-1">
                  <select
                    value={subTasks[i] || ''}
                    onChange={(e) => setSubTasks((prev) => ({ ...prev, [i]: e.target.value }))}
                    disabled={!checked[i] || r.imported}
                    className="w-full border border-amber-300 rounded px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:opacity-60"
                    title="Choose an existing sub-task or create a new one"
                  >
                    <option value="">— Sub-task —</option>
                    {zoneOptions.map((z) => (
                      <option key={z} value={z}>
                        {z}
                      </option>
                    ))}
                    <option value="__NEW__">➕ New sub-task…</option>
                  </select>
                  {subTasks[i] === '__NEW__' && !r.imported && (
                    <input
                      value={newSubTasks[i] || ''}
                      onChange={(e) =>
                        setNewSubTasks((prev) => ({ ...prev, [i]: e.target.value }))
                      }
                      placeholder="New sub-task name"
                      disabled={!checked[i]}
                      className="mt-1 w-full border border-amber-300 rounded px-2 py-1 text-xs disabled:bg-slate-50 disabled:opacity-60"
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          onClick={handleImport}
          disabled={!canImport}
          className="flex items-center gap-2 bg-amber-600 text-white px-4 py-1.5 rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-semibold"
          title="Import the checked lines even though they had no skill (the skill entered is saved on the line)"
        >
          <CheckCircle2 className="h-4 w-4" />
          {importLabel || 'Import checked lines into Tasks'} ({checkedCount})
        </button>
        {checkedCount > 0 && !allFilled && (
          <span className="text-xs text-amber-700 font-semibold">
            Fill in the skill for each checked line to import it.
          </span>
        )}
      </div>
    </div>
  )
}
