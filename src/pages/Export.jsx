import { useApp } from '../context/AppContext'
import { exportToExcel, exportTeamsJSON } from '../utils/export'
import { assignedTaskCount } from '../utils/helpers'
import { FileSpreadsheet, FileJson, Trash2, Download } from 'lucide-react'

export default function Export() {
  const { tasks, teams, assignments, resetData } = useApp()
  const assigned = assignedTaskCount(assignments)
  const unassigned = tasks.length - assigned

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Export & Sauvegarde</h1>
        <p className="text-slate-600 mt-1">
          Téléchargez votre planning, gérez vos données.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="inline-flex p-2 rounded-lg bg-green-50 text-green-600 mb-3">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Exporter en Excel</h2>
          <p className="text-sm text-slate-600 mb-4">
            Génère un fichier Excel avec toutes les tâches et leurs affectations.
          </p>
          <button
            onClick={() => exportToExcel({ tasks, teams, assignments })}
            disabled={tasks.length === 0}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Télécharger le planning (.xlsx)
          </button>
        </div>

        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="inline-flex p-2 rounded-lg bg-sky-50 text-sky-600 mb-3">
            <FileJson className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Exporter en JSON</h2>
          <p className="text-sm text-slate-600 mb-4">
            Sauvegarde structurée par équipe, avec les tâches associées.
          </p>
          <button
            onClick={() => exportTeamsJSON({ teams, assignments, tasks })}
            disabled={tasks.length === 0}
            className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Télécharger le planning (.json)
          </button>
        </div>
      </div>

      {/* Résumé avant export */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-xl font-semibold mb-4">Résumé du planning</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Summary label="Tâches" value={tasks.length} />
          <Summary label="Assignées" value={assigned} />
          <Summary label="Non assignées" value={unassigned} />
          <Summary label="Équipes" value={teams.length} />
          <Summary label="Membres" value={teams.reduce((a, t) => a + t.members.length, 0)} />
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Zone danger</h2>
        <p className="text-sm text-red-600 mb-4">
          Réinitialise toutes les données de travail (tâches, équipes, affectations,
          préparation, consignes et membres assignés à l'avion du jour). Seuls les membres
          permanents sont conservés. Cette action est irréversible.
        </p>
        <button
          onClick={() => {
            if (window.confirm('Êtes-vous sûr de vouloir réinitialiser toutes les données de travail ? (seuls les membres permanents sont conservés)')) {
              resetData()
            }
          }}
          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" /> Tout réinitialiser
        </button>
      </div>
    </div>
  )
}

function Summary({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  )
}
