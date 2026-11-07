import { useCallback, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '../context/AppContext'
import { groupTasksTree } from '../components/TaskTreeSelect'
import MissingSkillsAlert from '../components/MissingSkillsAlert'
import WrongSkillAlert from '../components/WrongSkillAlert'
import { detectColumns, parseExcelRows, findRowsWithoutSkill, findWrongSkillFoundFault, getCategoryColor, getCategoryLabel, taskContentKey, CATEGORIES } from '../utils/helpers'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

export default function ImportExcel() {
  const { tasks, addTasks, updateTasks, prepTasks, updatePrepTasks } = useApp()
  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [imported, setImported] = useState(false)
  const [importedCount, setImportedCount] = useState(0)
  const [stats, setStats] = useState(null)
  const [expandedBlocks, setExpandedBlocks] = useState([])
  const [expandedZones, setExpandedZones] = useState([])
  const [selected, setSelected] = useState({})
  // Lignes du fichier sans skill (exclues par le filtre) — signalées à l'utilisateur
  const [missingSkills, setMissingSkills] = useState([])
  const [importColumns, setImportColumns] = useState(null)
  const [missingMsg, setMissingMsg] = useState('')
  // Found Fault dans les slots ATA ciblés avec un mauvais skill (≠ CABB1B2)
  const [wrongSkillLines, setWrongSkillLines] = useState([])
  const [wrongSkillMsg, setWrongSkillMsg] = useState('')
  // Lignes COMPLETE du fichier (même immatriculation) — proposées à l'import
  const [completeLines, setCompleteLines] = useState([])
  const [completeImported, setCompleteImported] = useState(0)
  const [includeCompleteCheck, setIncludeCompleteCheck] = useState(false)

  // Arborescence du fichier : bloc -> sous-tâche (zone) -> lignes
  const tree = useMemo(() => groupTasksTree(preview), [preview])

  const selectedCount = preview.filter((t) => selected[t.id]).length

  const toggleTask = (id) => setSelected((prev) => ({ ...prev, [id]: !prev[id] }))

  const toggleTasks = (list) => {
    setSelected((prev) => {
      const allOn = list.every((t) => prev[t.id])
      const next = { ...prev }
      list.forEach((t) => {
        next[t.id] = !allOn
      })
      return next
    })
  }

  const selectAll = () =>
    setSelected(Object.fromEntries(preview.map((t) => [t.id, true])))

  const selectNone = () => setSelected({})

  const handleFile = useCallback(
    (file) => {
      setError('')
      setImported(false)
      setMissingSkills([])
      setMissingMsg('')
      setWrongSkillLines([])
      setWrongSkillMsg('')
      setCompleteLines([])
      setCompleteImported(0)
      setIncludeCompleteCheck(false)
      setFileName(file.name)
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
          if (!rows || rows.length < 2) {
            setError('The file is empty or does not contain enough lines.')
            return
          }
          const hdr = rows[0]
          const detected = detectColumns(hdr)

          // Vérifier que la description est détectable
          if (detected.description === undefined) {
            setError('Column "Task_Name" not found. Check the file format.')
            return
          }

          const parsed = parseExcelRows(rows.slice(1), detected)
          setPreview(parsed)
          setSelected(Object.fromEntries(parsed.map((t) => [t.id, true])))
          setExpandedBlocks([])
          setExpandedZones([])
          // Lignes sans skill : exclues par le filtre Skills → à signaler
          setImportColumns(detected)
          setMissingSkills(findRowsWithoutSkill(rows.slice(1), detected))
          setWrongSkillLines(findWrongSkillFoundFault(rows.slice(1), detected))
          // Lignes COMPLETE (hors filtres skill/type) : proposées au moment de
          // l'import si le fichier concerne la même immatriculation.
          setCompleteLines(
            parseExcelRows(rows.slice(1), detected, { skipStatusFilter: true }).filter(
              (t) => String(t.mtxStatus || '').toUpperCase() === 'COMPLETE'
            )
          )

          // Statistiques de filtrage
          const totalLines = rows.length - 1
          const kept = parsed.length
          const filteredOut = totalLines - kept
          setStats({ totalLines, kept, filteredOut })
        } catch (err) {
          setError(`Error reading the file: ${err.message}`)
        }
      }
      reader.readAsArrayBuffer(file)
    },
    []
  )

  // Intégration manuelle des lignes sans skill : le skill saisi remplit la
  // colonne manquante, le bloc et la sous-tâche choisis sont appliqués, puis
  // la ligne est importée (filtres Skills et Task Type contournés).
  const handleImportMissingSkills = (items) => {
    if (!importColumns || !items.length) return
    const parsedTasks = []
    let ignored = 0
    items.forEach((it) => {
      const skill = String(it.skill || '').trim()
      if (!skill) return
      const row = [...it.row]
      row[importColumns.skills] = skill
      const one = parseExcelRows([row], importColumns, {
        skipSkillFilter: true,
        skipTypeFilter: true,
      })
      if (!one.length) {
        ignored += 1
        return
      }
      const t = one[0]
      if (it.taskType) {
        t.taskType = it.taskType
        t.category = it.taskType
      }
      if (it.workArea) {
        t.workArea = it.workArea
        t.zone = it.workArea
      }
      parsedTasks.push(t)
    })
    if (parsedTasks.length) addTasks(parsedTasks)
    const done = new Set(items.map((it) => it.row))
    setMissingSkills((prev) =>
      prev.map((r) => (done.has(r.row) ? { ...r, imported: true } : r))
    )
    setStats((s) =>
      s
        ? {
            ...s,
            kept: s.kept + parsedTasks.length,
            filteredOut: Math.max(0, s.filteredOut - parsedTasks.length),
          }
        : s
    )
    setMissingMsg(
      `${parsedTasks.length} line(s) added to Tasks${
        ignored ? ` · ${ignored} ignored (status filter)` : ''
      }.`
    )
  }

  // Intégration des Found Fault au mauvais skill : le skill est corrigé en
  // CABB1B2, le bloc et la sous-tâche choisis sont appliqués.
  const handleImportWrongSkill = (items) => {
    if (!importColumns || !items.length) return
    const parsedTasks = []
    let ignored = 0
    items.forEach((it) => {
      const row = [...it.row]
      row[importColumns.skills] = 'CABB1B2'
      const one = parseExcelRows([row], importColumns)
      if (!one.length) {
        ignored += 1
        return
      }
      const t = one[0]
      t.skills = 'CABB1B2'
      t.taskType = it.taskType || 'CORR'
      t.category = t.taskType
      if (it.workArea) {
        t.workArea = it.workArea
        t.zone = it.workArea
      }
      parsedTasks.push(t)
    })
    if (parsedTasks.length) addTasks(parsedTasks)
    const done = new Set(items.map((it) => it.row))
    setWrongSkillLines((prev) =>
      prev.map((r) => (done.has(r.row) ? { ...r, imported: true } : r))
    )
    setStats((s) =>
      s
        ? {
            ...s,
            kept: s.kept + parsedTasks.length,
            filteredOut: Math.max(0, s.filteredOut - parsedTasks.length),
          }
        : s
    )
    setWrongSkillMsg(
      `${parsedTasks.length} Found Fault line(s) added to Tasks (skill CABB1B2)${
        ignored ? ` · ${ignored} ignored (status filter)` : ''
      }.`
    )
  }

  const handleImport = () => {
    const list = preview.filter((t) => selected[t.id])
    const fileTasks = [...preview, ...completeLines]
    if (!list.length && !(includeCompleteCheck && completeLines.length)) return

    // Alerte immatriculations : le fichier concerne-t-il un autre avion que la
    // charge déjà en place ? (import accidentel sans effacer l'ancienne charge)
    const regsOf = (arr) =>
      [...new Set((arr || []).map((t) => t.registration).filter(Boolean))]
    const newRegs = regsOf(fileTasks)
    const existingRegs = regsOf(tasks)
    if (newRegs.length > 1) {
      if (
        !window.confirm(
          `⚠ This file contains multiple registrations: ${newRegs.join(
            ', '
          )}.\n\nContinue the import?`
        )
      ) {
        return
      }
    } else if (
      newRegs.length === 1 &&
      existingRegs.length > 0 &&
      !existingRegs.includes(newRegs[0])
    ) {
      if (
        !window.confirm(
          `⚠ This file is for aircraft ${newRegs[0]} while the current workload is for ${existingRegs.join(
            ', '
          )}.\n\nBoth workloads will get mixed up. Consider clearing the old workload (Export/Reset) if necessary.\n\nContinue the import anyway?`
        )
      ) {
        return
      }
    }

    // Même immatriculation : proposer d'intégrer (ou d'exclure) les lignes
    // Lignes COMPLETE : incluses uniquement si la case dédiée est cochée
    // (le choix se fait avant l'import, sans pop-up).
    addTasks(list)
    let completeAdded = 0
    if (includeCompleteCheck && completeLines.length > 0) {
      const bySeq = new Map()
      tasks.forEach((t) => {
        if (t.seq !== undefined && t.seq !== '') bySeq.set(String(t.seq), t)
      })
      const toAdd = []
      const toUpdate = []
      completeLines.forEach((t) => {
        const existing = t.seq !== undefined && t.seq !== '' ? bySeq.get(String(t.seq)) : null
        if (existing) {
          if (existing.mtxStatus !== 'COMPLETE') toUpdate.push(existing.id)
        } else {
          toAdd.push(t)
        }
      })
      if (toAdd.length) addTasks(toAdd)
      if (toUpdate.length) {
        updateTasks(toUpdate, { mtxStatus: 'COMPLETE' })
        // Synchronise les copies déjà transférées dans Préparation (même clé)
        const keys = new Set(
          tasks.filter((t) => toUpdate.includes(t.id)).map(taskContentKey)
        )
        const prepIds = (prepTasks || [])
          .filter((t) => keys.has(taskContentKey(t)))
          .map((t) => t.id)
        if (prepIds.length) updatePrepTasks(prepIds, { mtxStatus: 'COMPLETE' })
      }
      completeAdded = toAdd.length + toUpdate.length
    }
    setCompleteImported(completeAdded)
    setImportedCount(list.length)
    setImported(true)
  }

  const zoneOptions = [
    ...new Set(
      [
        ...preview.map((t) => t.workArea),
        ...missingSkills.map((r) => r.workArea),
        ...wrongSkillLines.map((r) => r.workArea),
      ].filter(Boolean)
    ),
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Import your tasks</h1>
          <p className="text-slate-600 mt-1">
            Upload your Workpackage Report. Tasks are filtered and classified automatically.
          </p>
        </div>
        <a
          href="https://www.vic.klm.com"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white border border-sky-300 text-sky-700 px-4 py-2 rounded-md hover:bg-sky-50 text-sm font-semibold"
          title="Open the Victory tracking site (company network or VPN required)"
        >
          <ExternalLink className="h-4 w-4" /> Open Victory tracking
        </a>
      </div>

      {/* Rappel des filtres actifs */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
        <h3 className="font-semibold text-sky-800 flex items-center gap-2 mb-2">
          <Filter className="h-5 w-5" /> Active import filters
        </h3>
        <div className="text-sm text-sky-700 space-y-1">
          <p>• <strong>Skills</strong>: all lines where one of the skills starts with CABB (e.g. B1B2/CABB1B2)</p>
          <p>• <strong>MTX Status</strong>: only ACTV, PAUSE and IN WORK</p>
          <p>• <strong>Task Type</strong>: all blocks (JIC, Found Fault, MPC, ADHOC, EO)</p>
        </div>
      </div>

      {missingSkills.some((r) => !r.imported) && (
        <MissingSkillsAlert
          key={fileName}
          rows={missingSkills}
          onImport={handleImportMissingSkills}
          zones={zoneOptions}
        />
      )}
      {missingMsg && (
        <p className="text-sm text-green-700 font-semibold">{missingMsg}</p>
      )}

      {wrongSkillLines.some((r) => !r.imported) && (
        <WrongSkillAlert
          key={`wrong-${fileName}`}
          rows={wrongSkillLines}
          onImport={handleImportWrongSkill}
          zones={zoneOptions}
        />
      )}
      {wrongSkillMsg && (
        <p className="text-sm text-green-700 font-semibold">{wrongSkillMsg}</p>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-10 text-center bg-white hover:border-sky-400 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          const file = e.dataTransfer.files[0]
          if (file) handleFile(file)
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            if (e.target.files[0]) handleFile(e.target.files[0])
          }}
        />
        <Upload className="h-12 w-12 mx-auto text-slate-400" />
        <p className="mt-4 text-lg font-medium text-slate-700">
          Click or drag and drop your Excel file here
        </p>
        <p className="text-sm text-slate-500 mt-1">Supported formats: .xlsx, .xls, .csv</p>
        {fileName && (
          <p className="mt-3 inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </p>
        )}
      </div>

      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{stats.totalLines}</div>
            <div className="text-sm text-slate-500">Total lines</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.kept}</div>
            <div className="text-sm text-slate-500">After filters</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{stats.filteredOut}</div>
            <div className="text-sm text-slate-500">Excluded</div>
          </div>
        </div>
      )}

      {(preview.length > 0 || completeLines.length > 0) && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b">
            <div>
              <h2 className="text-xl font-semibold">
                Selection — {selectedCount} / {preview.length} task(s)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Grouped by <strong>block → sub-task → line</strong>: check what you want to
                import (unchecking a block or a sub-task excludes all of its content).
              </p>
              {preview.length === 0 && completeLines.length > 0 && (
                <p className="text-xs text-amber-700 mt-0.5">
                  No ACTV line in this file: only the COMPLETE lines can be included
                  (same aircraft as the current workload only).
                </p>
              )}
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={selectAll}
                  className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-0.5"
                >
                  Check all
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-0.5"
                >
                  Uncheck all
                </button>
              </div>
            </div>
            <button
              onClick={handleImport}
              disabled={
                selectedCount === 0 &&
                !(includeCompleteCheck && completeLines.length > 0)
              }
              className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {selectedCount > 0
                ? `Import ${selectedCount} task(s)`
                : `Import COMPLETE lines (${completeLines.length})`}
            </button>
          </div>

          {completeLines.length > 0 && (
            <label className="flex items-start gap-2 px-6 py-3 bg-amber-50 border-b border-amber-200 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeCompleteCheck}
                onChange={(e) => setIncludeCompleteCheck(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-sky-600 shrink-0"
              />
              <span>
                <strong>Include the {completeLines.length} COMPLETE line(s)</strong> with
                status COMPLETE. Lines already present (same number) are set to COMPLETE.
                Unchecked = the COMPLETE lines are excluded.
              </span>
            </label>
          )}

          {imported && (
            <div className="bg-green-50 border-b border-green-200 text-green-700 px-6 py-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {importedCount} tasks imported successfully!
              {completeImported > 0 &&
                ` · ${completeImported} COMPLETE line(s) included`}
            </div>
          )}

          <div className="max-h-[540px] overflow-y-auto">
            {tree.map(({ block, zones }) => {
              const blockTasks = zones.flatMap((z) => z.tasks)
              const blockSelected = blockTasks.filter((t) => selected[t.id]).length
              const blockOpen = expandedBlocks.includes(block)
              const color = getCategoryColor(block)
              return (
                <div key={block} className="border-b border-slate-100">
                  <div
                    className="flex items-center gap-2 px-3 py-2"
                    style={{ backgroundColor: `${color}14`, borderLeft: `4px solid ${color}` }}
                  >
                    <input
                      type="checkbox"
                      checked={blockSelected === blockTasks.length && blockTasks.length > 0}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            blockSelected > 0 && blockSelected < blockTasks.length
                      }}
                      onChange={() => toggleTasks(blockTasks)}
                      className="h-4 w-4 accent-sky-600 shrink-0"
                    />
                    <button
                      onClick={() =>
                        setExpandedBlocks((prev) =>
                          prev.includes(block)
                            ? prev.filter((b) => b !== block)
                            : [...prev, block]
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
                    zones.map(({ zone, tasks: zoneTasks }) => {
                      const zoneKey = `${block}::${zone}`
                      const zoneOpen = expandedZones.includes(zoneKey)
                      const zoneSelected = zoneTasks.filter((t) => selected[t.id]).length
                      return (
                        <div key={zoneKey}>
                          <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 bg-slate-50 border-t border-slate-100">
                            <input
                              type="checkbox"
                              checked={zoneSelected === zoneTasks.length && zoneTasks.length > 0}
                              ref={(el) => {
                                if (el)
                                  el.indeterminate =
                                    zoneSelected > 0 && zoneSelected < zoneTasks.length
                              }}
                              onChange={() => toggleTasks(zoneTasks)}
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
                              <span className="text-xs font-semibold text-slate-700">
                                📍 {zone}
                              </span>
                              <span className="text-[11px] text-slate-400">
                                ({zoneSelected}/{zoneTasks.length})
                              </span>
                            </button>
                          </div>
                          {zoneOpen &&
                            zoneTasks.map((task) => (
                              <label
                                key={task.id}
                                className="flex items-center gap-2 pl-14 pr-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer border-t border-dashed border-slate-100"
                              >
                                <input
                                  type="checkbox"
                                  checked={!!selected[task.id]}
                                  onChange={() => toggleTask(task.id)}
                                  className="h-4 w-4 accent-sky-600 shrink-0"
                                />
                                <span className="w-10 shrink-0 font-bold text-slate-500">
                                  {task.seq || '—'}
                                </span>
                                <span className="flex-1 min-w-0 truncate text-slate-700" title={task.description}>
                                  {task.description}
                                </span>
                                <span className="shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-200 text-slate-700">
                                  {task.skills}
                                </span>
                                <span
                                  className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${
                                    task.mtxStatus === 'ACTV'
                                      ? 'bg-green-100 text-green-700'
                                      : task.mtxStatus === 'PAUSE'
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {task.mtxStatus}
                                </span>
                                <span className="shrink-0 text-xs text-slate-400 w-12 text-right">
                                  {task.scheduledHours || ''}
                                </span>
                                <span className="shrink-0 text-xs text-slate-400 w-16 text-right">
                                  {task.registration || ''}
                                </span>
                              </label>
                            ))}
                        </div>
                      )
                    })}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold">Saved tasks ({tasks.length})</h2>
            <div className="flex gap-2 flex-wrap">
              {CATEGORIES.filter((c) => tasks.some((t) => t.taskType === c)).map((cat) => (
                <span
                  key={cat}
                  className="inline-block px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{ backgroundColor: getCategoryColor(cat) }}
                >
                  {getCategoryLabel(cat)} : {tasks.filter((t) => t.taskType === cat).length}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
