import { useCallback, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { useApp } from '../context/AppContext'
import { groupTasksTree } from '../components/TaskTreeSelect'
import { detectColumns, parseExcelRows, getCategoryColor, getCategoryLabel, CATEGORIES } from '../utils/helpers'
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Filter,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

export default function ImportExcel() {
  const { tasks, addTasks } = useApp()
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

  // Arborescence du fichier : bloc -> sous-tâche (zone) -> lignes
  // (priorités « vac 01 », « vac 02 »… de la colonne shift d'abord)
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
      setFileName(file.name)
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result)
          const workbook = XLSX.read(data, { type: 'array' })
          const sheet = workbook.Sheets[workbook.SheetNames[0]]
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
          if (!rows || rows.length < 2) {
            setError('Le fichier est vide ou ne contient pas assez de lignes.')
            return
          }
          const hdr = rows[0]
          const detected = detectColumns(hdr)

          // Vérifier que la description est détectable
          if (detected.description === undefined) {
            setError('Colonne "Task_Name" introuvable. Vérifiez le format du fichier.')
            return
          }

          const parsed = parseExcelRows(rows.slice(1), detected)
          setPreview(parsed)
          setSelected(Object.fromEntries(parsed.map((t) => [t.id, true])))
          setExpandedBlocks([])
          setExpandedZones([])

          // Statistiques de filtrage
          const totalLines = rows.length - 1
          const kept = parsed.length
          const filteredOut = totalLines - kept
          setStats({ totalLines, kept, filteredOut })
        } catch (err) {
          setError(`Erreur lors de la lecture du fichier: ${err.message}`)
        }
      }
      reader.readAsArrayBuffer(file)
    },
    []
  )

  const handleImport = () => {
    const list = preview.filter((t) => selected[t.id])
    if (!list.length) return
    addTasks(list)
    setImportedCount(list.length)
    setImported(true)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Importer vos tâches</h1>
        <p className="text-slate-600 mt-1">
          Chargez votre Workpackage Report. Les tâches sont filtrées et classées automatiquement.
        </p>
      </div>

      {/* Rappel des filtres actifs */}
      <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
        <h3 className="font-semibold text-sky-800 flex items-center gap-2 mb-2">
          <Filter className="h-5 w-5" /> Filtres d'import actifs
        </h3>
        <div className="text-sm text-sky-700 space-y-1">
          <p>• <strong>Skills</strong> : toutes les lignes dont un des skills commence par CABB (ex. B1B2/CABB1B2)</p>
          <p>• <strong>MTX Status</strong> : uniquement ACTV, PAUSE et IN WORK</p>
          <p>• <strong>Task Type</strong> : tous les blocs (JIC, Found Fault, MPC, ADHOC, EO)</p>
        </div>
      </div>

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
          Cliquez ou glissez-déposez votre fichier Excel ici
        </p>
        <p className="text-sm text-slate-500 mt-1">Formats supportés : .xlsx, .xls, .csv</p>
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
            <div className="text-sm text-slate-500">Lignes totales</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{stats.kept}</div>
            <div className="text-sm text-slate-500">Après filtres</div>
          </div>
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <div className="text-2xl font-bold text-slate-400">{stats.filteredOut}</div>
            <div className="text-sm text-slate-500">Exclues</div>
          </div>
        </div>
      )}

      {preview.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b">
            <div>
              <h2 className="text-xl font-semibold">
                Sélection — {selectedCount} / {preview.length} tâche(s)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Classé par <strong>bloc → sous-tâche → ligne</strong> : cochez ce que vous voulez
                importer (décocher un bloc ou une sous-tâche exclut tout son contenu).
              </p>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={selectAll}
                  className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-0.5"
                >
                  Tout cocher
                </button>
                <button
                  onClick={selectNone}
                  className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-0.5"
                >
                  Tout décocher
                </button>
              </div>
            </div>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" /> Importer {selectedCount} tâche(s)
            </button>
          </div>

          {imported && (
            <div className="bg-green-50 border-b border-green-200 text-green-700 px-6 py-3 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" />
              {importedCount} tâches importées avec succès !
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
            <h2 className="text-xl font-semibold">Tâches enregistrées ({tasks.length})</h2>
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
