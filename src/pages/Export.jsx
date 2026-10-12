import { useApp } from '../context/AppContext'
import { exportToExcel } from '../utils/export'
import { assignedTaskCount } from '../utils/helpers'
import { FileSpreadsheet, Trash2, Download } from 'lucide-react'

export default function Export() {
  const { tasks, teams, assignments, resetData, activeProfile, updateOwnProfile } = useApp()
  const assigned = assignedTaskCount(assignments)
  const unassigned = tasks.length - assigned

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Export & Backup</h1>
        <p className="text-slate-600 mt-1">
          Download your schedule, manage your data.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="inline-flex p-2 rounded-lg bg-green-50 text-green-600 mb-3">
            <FileSpreadsheet className="h-6 w-6" />
          </div>
          <h2 className="text-xl font-semibold mb-2">Export to Excel</h2>
          <p className="text-sm text-slate-600 mb-4">
            Generates an Excel file with all tasks and their assignments.
          </p>
          <button
            onClick={() => exportToExcel({ tasks, teams, assignments })}
            disabled={tasks.length === 0}
            className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Download className="h-4 w-4" /> Download the workload (.xlsx)
          </button>
        </div>
      </div>

      {/* Résumé avant export */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-xl font-semibold mb-4">Schedule summary</h2>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
          <Summary label="Tasks" value={tasks.length} />
          <Summary label="Assigned" value={assigned} />
          <Summary label="Unassigned" value={unassigned} />
          <Summary label="Teams" value={teams.length} />
          <Summary label="Members" value={teams.reduce((a, t) => a + t.members.length, 0)} />
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Danger zone</h2>
        <p className="text-sm text-red-600 mb-4">
          Resets all work data (tasks, teams, assignments, preparation, instructions
          and members assigned to the day's aircraft) and removes the aircraft
          linked to the profile. Permanent members and Notepad notes are kept.
          This action is irreversible.
        </p>
        <button
          onClick={async () => {
            if (
              window.confirm(
                'Are you sure you want to reset all work data? (permanent members and Notepad notes are kept, aircraft removed)'
              )
            ) {
              try {
                await updateOwnProfile({
                  name: activeProfile?.name,
                  aircraft: '',
                })
              } catch {
                // l'avion sera retiré à la prochaine occasion
              }
              resetData()
            }
          }}
          className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 flex items-center gap-2"
        >
          <Trash2 className="h-4 w-4" /> Reset all
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
