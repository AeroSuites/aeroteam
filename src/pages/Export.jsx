import { useRef, useState } from 'react'
import { useApp } from '../context/AppContext'
import { exportToExcel } from '../utils/export'
import { assignedTaskCount } from '../utils/helpers'
import { FileSpreadsheet, Trash2, Download, Save, RotateCcw, Upload } from 'lucide-react'

export default function Export() {
  const {
    tasks, teams, assignments, resetData, activeProfile, updateOwnProfile,
    members, dayMembers, dayLeaders, prepTasks, notes, pockets, primeRequests,
    charge, chargeHistory, restoreSession,
  } = useApp()
  const assigned = assignedTaskCount(assignments)
  const unassigned = tasks.length - assigned

  // Sessions locales (snapshots) — stockées dans ce navigateur, par profil
  const sessionsKey = `maintenance-app-sessions-${activeProfile?.code || ''}`
  const [sessions, setSessions] = useState(() => {
    try {
      const raw = localStorage.getItem(sessionsKey)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })
  const [sessionName, setSessionName] = useState('')
  const [sessionMsg, setSessionMsg] = useState('')
  const importSessionsRef = useRef(null)

  const persistSessions = (list) => {
    setSessions(list)
    try {
      localStorage.setItem(sessionsKey, JSON.stringify(list))
    } catch {
      setSessionMsg('Local storage is full: delete an old session first.')
    }
  }

  const saveSession = () => {
    const name = sessionName.trim() || `Session ${new Date().toLocaleString('en-GB')}`
    const snapshot = {
      id: `session-${Date.now()}`,
      name,
      savedAt: new Date().toISOString(),
      data: {
        tasks, teams, assignments, members, dayMembers, dayLeaders,
        prepTasks, notes, pockets, primeRequests, charge, chargeHistory,
      },
    }
    persistSessions([snapshot, ...sessions])
    setSessionName('')
    setSessionMsg(`Session “${name}” saved locally.`)
  }

  const restore = (session) => {
    if (
      !window.confirm(
        `Restore the session “${session.name}”${
          session.savedAt ? ` (${new Date(session.savedAt).toLocaleString('en-GB')})` : ''
        }?\n\nThe current data of this profile will be replaced (cloud included). Save the current session first if needed.`
      )
    )
      return
    restoreSession(session.data)
    setSessionMsg(`Session “${session.name}” restored.`)
  }

  const removeSession = (session) => {
    persistSessions(sessions.filter((s) => s.id !== session.id))
  }

  // Sauvegarde transportable : exporte toutes les sessions locales en .json
  const exportSessions = () => {
    const payload = {
      app: 'aeroteam-sessions',
      version: 1,
      exportedAt: new Date().toISOString(),
      profile: activeProfile?.code || '',
      profileName: activeProfile?.name || '',
      sessions,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `aeroteam-sessions-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 30000)
    setSessionMsg(`${sessions.length} session(s) exported.`)
  }

  // Importe un fichier .json de sessions (fusion, doublons ignorés)
  const importSessions = (file) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target.result || ''))
        const incoming = Array.isArray(parsed) ? parsed : parsed?.sessions
        if (!Array.isArray(incoming)) throw new Error('format')
        const existing = new Set(sessions.map((s) => `${s.name}|${s.savedAt || ''}`))
        const valid = incoming
          .filter((s) => s && s.data && typeof s.data === 'object')
          .filter((s) => !existing.has(`${s.name}|${s.savedAt || ''}`))
          .map((s) => ({
            ...s,
            id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          }))
        if (!valid.length) throw new Error('empty')
        persistSessions([...valid, ...sessions])
        setSessionMsg(`${valid.length} session(s) imported.`)
      } catch {
        setSessionMsg('Invalid file: no AeroTeam session found.')
      }
      if (importSessionsRef.current) importSessionsRef.current.value = ''
    }
    reader.readAsText(file)
  }

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

      {/* Sessions locales */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h2 className="text-xl font-semibold mb-1 flex items-center gap-2">
          <Save className="h-5 w-5 text-sky-500" /> Local sessions
        </h2>
        <p className="text-sm text-slate-600 mb-4">
          Save the current session (tasks, teams, members, preparation, notepad…) in
          this browser and restore it later. Stored on this device only.
        </p>
        <div className="flex flex-wrap gap-2 mb-4">
          <input
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            placeholder={`Session ${new Date().toLocaleString('en-GB')}`}
            className="flex-1 min-w-[220px] border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <button
            onClick={saveSession}
            className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 flex items-center gap-2 text-sm font-semibold"
          >
            <Save className="h-4 w-4" /> Save current session
          </button>
          <button
            onClick={exportSessions}
            disabled={sessions.length === 0}
            className="bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-md hover:bg-slate-50 disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
            title="Download all local sessions as a .json file (keep it in Files / OneDrive)"
          >
            <Download className="h-4 w-4" /> Export sessions (.json)
          </button>
          <label className="inline-flex items-center gap-2 bg-white text-slate-700 border border-slate-300 px-4 py-2 rounded-md hover:bg-slate-50 cursor-pointer text-sm font-semibold">
            <Upload className="h-4 w-4" /> Import sessions (.json)
            <input
              ref={importSessionsRef}
              type="file"
              accept=".json,application/json"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) importSessions(e.target.files[0])
              }}
            />
          </label>
        </div>
        {sessionMsg && (
          <p
            className={`text-sm font-semibold mb-3 ${
              /invalid|full/i.test(sessionMsg) ? 'text-red-600' : 'text-green-700'
            }`}
          >
            {sessionMsg}
          </p>
        )}
        {sessions.length === 0 ? (
          <p className="text-sm text-slate-400 italic">No local session saved yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <li key={s.id} className="py-2 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[200px]">
                  <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
                  <p className="text-xs text-slate-400">
                    {s.savedAt ? new Date(s.savedAt).toLocaleString('en-GB') : ''}
                    {s.data
                      ? ` · ${(s.data.teams || []).length} team(s) · ${(s.data.tasks || []).length} task(s) · ${(s.data.members || []).length} member(s)`
                      : ''}
                  </p>
                </div>
                <button
                  onClick={() => restore(s)}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 border border-sky-200 hover:bg-sky-50 rounded-full px-3 py-1"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </button>
                <button
                  onClick={() => removeSession(s)}
                  className="text-slate-400 hover:text-red-600"
                  title="Delete this local session"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
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
