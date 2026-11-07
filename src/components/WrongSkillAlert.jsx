import { useState } from 'react'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { CATEGORIES, getCategoryLabel } from '../utils/helpers'
import TrfxLink from './TrfxLink'

// Alerte : lignes Found Fault (CORR) dans les slots ATA 11/12/21/23/25/33/35/
// 38/44/56 qui n'ont pas le skill CABB1B2 (mauvais skill dans le fichier).
// Elles sont exclues par le filtre Skills → on propose de les intégrer avec
// le skill corrigé (CABB1B2) et le bloc / la sous-tâche de son choix.
export default function WrongSkillAlert({ rows, onImport, zones }) {
  const [blocks, setBlocks] = useState(() =>
    Object.fromEntries((rows || []).map((_, i) => [i, 'CORR']))
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

  const subTaskFor = (i) =>
    subTasks[i] === '__NEW__'
      ? String(newSubTasks[i] || '').trim()
      : String(subTasks[i] || '').trim()

  const handleImport = () => {
    if (!onImport || checkedCount === 0) return
    onImport(
      selectable
        .filter(({ i }) => checked[i])
        .map(({ i }) => ({
          row: rows[i].row,
          taskType: blocks[i] || 'CORR',
          workArea: subTaskFor(i),
        }))
    )
  }

  const zoneOptions = [...new Set((zones || []).filter(Boolean))].sort()

  return (
    <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4">
      <h3 className="font-semibold text-rose-800 flex items-center gap-2 mb-1">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {selectable.length} Found Fault line(s) with a wrong skill
      </h3>
      <p className="text-xs text-rose-700 mb-3">
        Found Fault lines in Config Slots 11 / 12 / 21 / 23 / 25 / 33 / 35 / 38 / 44 / 56
        without the <strong>CABB1B2</strong> skill. They are excluded by the Skills
        filter — choose the block / sub-task, then import them with the corrected
        skill (CABB1B2).
      </p>
      <div className="max-h-64 overflow-auto rounded-lg border border-rose-200 bg-white">
        <table className="w-full min-w-[980px] text-xs">
          <thead className="sticky top-0 bg-rose-100 text-rose-900">
            <tr>
              <th className="px-2 py-1.5 w-8"></th>
              <th className="text-left px-2 py-1.5 w-14">N°</th>
              <th className="text-left px-2 py-1.5">Title</th>
              <th className="text-left px-2 py-1.5 w-36">TRFX</th>
              <th className="text-left px-2 py-1.5 w-24">Slot</th>
              <th className="text-left px-2 py-1.5 w-28">Current skill</th>
              <th className="text-left px-2 py-1.5 w-32">Block</th>
              <th className="text-left px-2 py-1.5 w-40">Sub-task</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rose-100">
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
                <td className="px-2 py-1 font-mono font-semibold text-slate-700">
                  {r.configSlot || '—'}
                </td>
                <td className="px-2 py-1">
                  {r.imported ? (
                    <span className="text-[11px] font-semibold text-green-700">imported</span>
                  ) : (
                    <span className="font-semibold text-rose-700">{r.skills || '—'}</span>
                  )}
                </td>
                <td className="px-2 py-1">
                  <select
                    value={blocks[i] || 'CORR'}
                    onChange={(e) => setBlocks((prev) => ({ ...prev, [i]: e.target.value }))}
                    disabled={!checked[i] || r.imported}
                    className="w-full border border-rose-300 rounded px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:opacity-60"
                    title="Choose the block for this line"
                  >
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
                    className="w-full border border-rose-300 rounded px-1.5 py-1 text-xs bg-white disabled:bg-slate-50 disabled:opacity-60"
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
                      className="mt-1 w-full border border-rose-300 rounded px-2 py-1 text-xs disabled:bg-slate-50 disabled:opacity-60"
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
          disabled={checkedCount === 0}
          className="flex items-center gap-2 bg-rose-600 text-white px-4 py-1.5 rounded-md hover:bg-rose-700 disabled:opacity-50 text-sm font-semibold"
          title="Import the checked lines with the skill corrected to CABB1B2"
        >
          <CheckCircle2 className="h-4 w-4" />
          Import checked lines into Tasks ({checkedCount})
        </button>
        <span className="text-xs text-rose-700 font-semibold">
          Skill will be replaced by CABB1B2.
        </span>
      </div>
    </div>
  )
}
