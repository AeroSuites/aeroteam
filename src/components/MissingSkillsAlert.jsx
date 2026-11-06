import { AlertTriangle } from 'lucide-react'

// Alerte : lignes du fichier Victory sans skill (colonne « Skills » vide).
// Elles sont exclues par le filtre Skills → risque d'oubli de traitement.
export default function MissingSkillsAlert({ rows }) {
  if (!rows || rows.length === 0) return null
  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4">
      <h3 className="font-semibold text-amber-800 flex items-center gap-2 mb-1">
        <AlertTriangle className="h-5 w-5 shrink-0" />
        {rows.length} line(s) without skill — excluded from the import
      </h3>
      <p className="text-xs text-amber-700 mb-3">
        The Skills column is empty on these lines: they are dropped by the Skills
        filter. Process them manually — they will not appear in the imported tasks.
      </p>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-amber-200 bg-white">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-amber-100 text-amber-900">
            <tr>
              <th className="text-left px-2 py-1.5 w-16">N°</th>
              <th className="text-left px-2 py-1.5">Title</th>
              <th className="text-left px-2 py-1.5 w-44">TRFX</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-amber-100">
            {rows.map((r, i) => (
              <tr key={i}>
                <td className="px-2 py-1 font-bold text-slate-600">{r.seq || '—'}</td>
                <td className="px-2 py-1 text-slate-700">{r.description || '—'}</td>
                <td className="px-2 py-1 font-mono font-bold text-sky-700">
                  {r.taskBarcode || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
