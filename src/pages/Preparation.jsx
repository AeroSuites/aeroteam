import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { openPdfPrint, downloadPdfAsJpeg, drawCheckboxCell, drawPriorityBadge, hidePriorityCellText } from '../utils/pdfPrint'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import {
  detectColumns,
  parseExcelRows,
  getCategoryColor,
  getZoneColor,
  getCategoryLabel,
  hexToRgb,
  makeId,
  filterNewPrepTasks,
  taskContentKey,
  cleanShortValue,
  priorityToken,
  priorityTokens,
} from '../utils/helpers'
import ManualTaskForm from '../components/ManualTaskForm'
import NoteCell from '../components/NoteCell'
import TaskTreeSelect, { groupTasksTree } from '../components/TaskTreeSelect'
import {
  Upload,
  FileSpreadsheet,
  Trash2,
  X,
  ChevronDown,
  ChevronRight,
  FolderClock,
  Plus,
  FolderPlus,
  Printer,
  Pencil,
  Check,
  FileDown,
  FileImage,
  CheckCircle2,
  RotateCcw,
  Undo2,
  Search,
} from 'lucide-react'

export default function Preparation() {
  const {
    prepTasks,
    pockets,
    addPrepTasks,
    removePrepTask,
    removePrepTasksByBlock,
    removePrepTasksByZone,
    removePrepTasksByIds,
    updatePrepTask,
    updatePrepTasks,
    clearPrepTasks,
    addTasks,
    addPocket,
    renamePocket,
    addTasksToPocket,
    removeTasksFromPocket,
    removePocket,
    activeProfile,
    tasks,
  } = useApp()

  const fileInputRef = useRef(null)
  const [preview, setPreview] = useState([])
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState([])
  const [newPocketName, setNewPocketName] = useState('')
  const [renameId, setRenameId] = useState(null)
  const [renameText, setRenameText] = useState('')
  const [printPocketId, setPrintPocketId] = useState(null)
  const [selectedTasks, setSelectedTasks] = useState([])
  const [previewSelected, setPreviewSelected] = useState({})
  const [previewDone, setPreviewDone] = useState({})
  const [previewExpandedBlocks, setPreviewExpandedBlocks] = useState([])
  const [previewExpandedZones, setPreviewExpandedZones] = useState([])
  const [importMsg, setImportMsg] = useState('')
  const [expandedSubZones, setExpandedSubZones] = useState([])
  // Filtres de la liste (comme la page Tâches) : recherche + blocs + priorités
  const [prepSearch, setPrepSearch] = useState('')
  const [hiddenBlocks, setHiddenBlocks] = useState([])
  const [prioFilter, setPrioFilter] = useState([])

  const toggleSubZone = (key) =>
    setExpandedSubZones((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    )
  const [transferPocketId, setTransferPocketId] = useState(null)
  const [transferTargetCode, setTransferTargetCode] = useState('')
  const [transferProfiles, setTransferProfiles] = useState([])
  const [transferring, setTransferring] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  const [transferError, setTransferError] = useState('')

  useEffect(() => {
    if (!activeProfile?.id) return
    profileStore
      .listProfilesPublic()
      .then((res) => {
        const list = (res?.profiles || []).filter((p) => p.id !== activeProfile.id)
        setTransferProfiles(list)
      })
      .catch(() => setTransferProfiles([]))
  }, [activeProfile])

  const transferPocket = async (p) => {
    const target = transferProfiles.find((tp) => tp.id === transferTargetCode)
    if (!target || !activeProfile?.code) {
      setTransferError('Choose a recipient profile.')
      return
    }
    setTransferring(true)
    setTransferError('')
    setTransferMsg('')
    try {
      const taskIds = new Set(p.taskIds || [])
      const copiedTasks = prepTasks
        .filter((t) => taskIds.has(t.id))
        .map((t) => ({ ...t, id: makeId('prep') }))
      const res = await profileStore.pocketTransferTo(
        activeProfile.code,
        target.id,
        { id: makeId('pocket'), name: p.name, taskIds: copiedTasks.map((t) => t.id) },
        copiedTasks
      )
      if (res?.error === 'cible_invalide') {
        setTransferError('Invalid recipient profile.')
      } else if (res?.error) {
        setTransferError('Failed to copy.')
      } else {
        setTransferMsg(`Pocket “${p.name}” copied to “${target.name}”.`)
        setTransferPocketId(null)
        setTransferTargetCode('')
      }
    } catch {
      setTransferError('Failed to transfer (offline?).')
    }
    setTransferring(false)
  }

  const handleFile = useCallback((file) => {
    setError('')
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
        const detected = detectColumns(rows[0])
        if (detected.description === undefined) {
          setError('Column "Task_Name" not found. Check the file format.')
          return
        }
        const parsed = parseExcelRows(rows.slice(1), detected)
        const doneKeys = new Set(
          (tasks || []).filter((t) => t.mtxStatus === 'COMPLETE').map(taskContentKey)
        )
        const doneMap = Object.fromEntries(
          parsed.map((t) => [t.id, doneKeys.has(taskContentKey(t))])
        )
        setPreview(parsed)
        setImportMsg('')
        setPreviewDone(doneMap)
        setPreviewSelected(Object.fromEntries(parsed.map((t) => [t.id, !doneMap[t.id]])))
        setPreviewExpandedBlocks([])
        setPreviewExpandedZones([])
      } catch (err) {
        setError(`Failed to read the file: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [tasks])

  // Réintégration dans Tâches (retour arrière d'un transfert)
  const reintegrerTasks = (list) => {
    const tasksList = (list || []).filter(Boolean)
    if (!tasksList.length) return
    addTasks(tasksList)
    tasksList.forEach((t) => removePrepTask(t.id))
  }

  const handleImport = () => {
    const list = preview.filter((t) => previewSelected[t.id])
    if (!list.length) return
    const ignoredDone = preview.filter((t) => previewDone[t.id] && !previewSelected[t.id]).length
    const fresh = filterNewPrepTasks(prepTasks, list)
    const ignored = list.length - fresh.length
    if (fresh.length) addPrepTasks(fresh)
    setImportMsg(
      `${fresh.length} line(s) added${
        ignored ? ` · ${ignored} already present ignored` : ''
      }${ignoredDone ? ` · ${ignoredDone} done (COMPLETE) ignored` : ''}.`
    )
    setPreview([])
    setPreviewSelected({})
    setPreviewDone({})
    setFileName('')
  }

  const togglePreviewTask = (id) =>
    setPreviewSelected((prev) => ({ ...prev, [id]: !prev[id] }))

  const togglePreviewTasks = (list) => {
    setPreviewSelected((prev) => {
      const selectable = list.filter((t) => !previewDone[t.id])
      const allOn = selectable.length > 0 && selectable.every((t) => prev[t.id])
      const next = { ...prev }
      selectable.forEach((t) => {
        next[t.id] = !allOn
      })
      return next
    })
  }

  const toggleZone = (zone) => {
    setCollapsed((prev) =>
      prev.includes(zone) ? prev.filter((z) => z !== zone) : [...prev, zone]
    )
  }

  // Blocs présents dans la préparation (pour les filtres)
  const prepBlocks = useMemo(
    () => [...new Set(prepTasks.map((t) => t.taskType).filter(Boolean))].sort(),
    [prepTasks]
  )

  // Liste après recherche (n°, tâche, TRFX, zone, skills) + blocs masqués
  const basePrepTasks = useMemo(() => {
    const q = prepSearch.trim().toLowerCase()
    return prepTasks.filter((t) => {
      const blk = t.taskType || 'AUTRE'
      if (hiddenBlocks.includes(blk)) return false
      if (!q) return true
      const hay = [
        cleanShortValue(t.seq),
        t.description,
        t.taskBarcode,
        t.workArea,
        t.skills,
        getCategoryLabel(blk),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [prepTasks, prepSearch, hiddenBlocks])

  // Compteurs des jetons de priorité (MEL / EXMP / NSRE / TLI / IDT)
  const prepPrioCounts = useMemo(() => {
    const counts = { MEL: 0, EXMP: 0, NSRE: 0, TLI: 0, IDT: 0 }
    basePrepTasks.forEach((t) => {
      priorityTokens(`${t.description || ''} ${t.taskBarcode || ''}`).forEach((tok) => {
        counts[tok] += 1
      })
    })
    return counts
  }, [basePrepTasks])

  // Liste finale : filtre priorité cumulable
  const filteredPrepTasks = useMemo(
    () =>
      prioFilter.length === 0
        ? basePrepTasks
        : basePrepTasks.filter((t) =>
            priorityTokens(`${t.description || ''} ${t.taskBarcode || ''}`).some((tok) =>
              prioFilter.includes(tok)
            )
          ),
    [basePrepTasks, prioFilter]
  )

  // Regroupement : par zone/sous-tâche, SAUF les Found Fault (CORR) qui restent
  // regroupés dans un seul bloc avec leurs sous-tâches.
  const zoneGroups = useMemo(() => {
    const groups = {}
    filteredPrepTasks.forEach((t) => {
      const isFF = (t.taskType || '') === 'CORR'
      const key = isFF ? '__FOUND_FAULT__' : t.workArea || 'No zone'
      if (!groups[key]) {
        groups[key] = {
          key,
          label: isFF ? getCategoryLabel('CORR') : key,
          isFF,
          zones: {},
        }
      }
      const sub = t.workArea || 'No sub-task'
      if (!groups[key].zones[sub]) groups[key].zones[sub] = []
      groups[key].zones[sub].push(t)
    })
    return Object.values(groups).sort(
      (a, b) => (a.isFF ? 1 : 0) - (b.isFF ? 1 : 0) || a.label.localeCompare(b.label)
    )
  }, [filteredPrepTasks])

  // Replie par défaut chaque nouvelle zone (tuiles fermées au chargement)
  useEffect(() => {
    setCollapsed((prev) => [...new Set([...prev, ...zoneGroups.map((g) => g.label)])])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneGroups.map((g) => g.label).join('|')])

  const previewTree = useMemo(() => groupTasksTree(preview), [preview])
  const previewSelectedCount = preview.filter((t) => previewSelected[t.id]).length
  const previewDoneCount = preview.filter((t) => previewDone[t.id]).length

  const allZones = useMemo(() => {
    return [...new Set(prepTasks.map((t) => t.workArea).filter(Boolean))].sort()
  }, [prepTasks])

  const taskById = useMemo(() => {
    const map = {}
    prepTasks.forEach((t) => (map[t.id] = t))
    return map
  }, [prepTasks])

  const formatHours = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

  // ---------- Pochettes ----------
  const createPocket = () => {
    const name = String(newPocketName || '').trim()
    if (!name) return
    addPocket(name)
    setNewPocketName('')
  }

  const assignToPocket = (pocketId, taskIds) => {
    if (!pocketId) return
    addTasksToPocket(pocketId, taskIds)
  }

  // ---------- Déplacement de lignes (bloc / sous-tâche) ----------
  const [moveSelected, setMoveSelected] = useState({})
  const [moveIds, setMoveIds] = useState(null)
  const [moveBlk, setMoveBlk] = useState('')
  const [moveZone, setMoveZone] = useState('')
  const [moveZoneNew, setMoveZoneNew] = useState(false)

  const toggleMoveSel = (id) =>
    setMoveSelected((prev) => {
      const next = { ...prev }
      if (next[id]) delete next[id]
      else next[id] = true
      return next
    })

  const selectedMoveIds = prepTasks.filter((t) => moveSelected[t.id]).map((t) => t.id)

  const selectZoneForMove = (list) =>
    setMoveSelected((prev) => {
      const next = { ...prev }
      list.forEach((t) => {
        next[t.id] = true
      })
      return next
    })

  const openMove = (ids) => {
    if (!ids || ids.length === 0) return
    const first = prepTasks.find((t) => t.id === ids[0])
    setMoveIds(ids)
    setMoveBlk(first?.taskType || 'JIC')
    setMoveZone(first?.workArea || '')
    setMoveZoneNew(false)
  }

  const applyMove = () => {
    const updates = { taskType: moveBlk, workArea: moveZone.trim() }
    updatePrepTasks(moveIds || [], updates)
    setMoveIds(null)
    setMoveSelected({})
  }

  const pocketTaskIds = (p) => (Array.isArray(p?.taskIds) ? p.taskIds : [])

  // { pocketId: nbTaches } pour un ensemble de tâches donné
  const pocketCounts = (scopeIds) => {
    const out = {}
    pockets.forEach((p) => {
      const n = scopeIds.filter((id) => pocketTaskIds(p).includes(id)).length
      if (n) out[p.id] = n
    })
    return out
  }

  const removeScopeFromPocket = (pocketId, scopeIds) => {
    const target = scopeIds.filter((id) => pocketTaskIds(pocketById[pocketId]).includes(id))
    if (target.length) removeTasksFromPocket(pocketId, target)
  }

  const pocketById = useMemo(() => {
    const map = {}
    pockets.forEach((p) => (map[p.id] = p))
    return map
  }, [pockets])

  const pocketStats = useMemo(() => {
    const map = {}
    pockets.forEach((p) => {
      const ids = pocketTaskIds(p)
      let hours = 0
      let missing = 0
      ids.forEach((id) => {
        const t = taskById[id]
        if (!t) {
          missing += 1
          return
        }
        const h = parseFloat(t.scheduledHours)
        if (!isNaN(h)) hours += h
      })
      map[p.id] = { count: ids.length, hours, missing }
    })
    return map
  }, [pockets, taskById])

  const openPrint = (pocketId) => {
    const p = pocketById[pocketId]
    if (!p) return
    setSelectedTasks(pocketTaskIds(p))
    setPrintPocketId(pocketId)
  }

  const buildPocketPdf = () => {
    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 10
    const contentWidth = pageWidth - margin * 2

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    doc.text(printPocket.name, margin, 15)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const hours = Object.entries(printByBlock).reduce(
      (acc, [, info]) => acc + info.totalHours,
      0
    )
    doc.text(
      `${printTasks.length} / ${pocketTaskIds(printPocket).length} line(s) selected · ${hours.toFixed(1)} h · ${new Date().toLocaleDateString('en-GB')}`,
      margin,
      21
    )

    let y = 28
    const blockNames = Object.keys(printByBlock)

    if (blockNames.length === 0) {
      doc.text('No tasks selected.', margin, y + 4)
    }

    blockNames.forEach((blk) => {
      const info = printByBlock[blk]
      if (y > pageHeight - 25) {
        doc.addPage()
        y = 14
      }
      doc.setFillColor(...hexToRgb(getCategoryColor(blk)))
      doc.rect(margin, y, contentWidth, 7, 'F')
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(255, 255, 255)
      doc.text(
        `Block ${getCategoryLabel(blk)} · ${info.count} task(s) · ${info.totalHours.toFixed(1)} h`,
        margin + 2,
        y + 4.6
      )
      doc.setTextColor(0, 0, 0)
      y += 10

      Object.keys(info.zones).forEach((zone) => {
        const zoneTasks = info.zones[zone]
        autoTable(doc, {
          startY: y,
          pageBreak: 'auto',
          margin: { left: margin, right: margin },
          head: [
            [
              {
                content: `${zone} (${zoneTasks.length})`,
                colSpan: 7,
                styles: {
                  fillColor: hexToRgb(getZoneColor(zone)),
                  textColor: [255, 255, 255],
                  fontStyle: 'bold',
                  fontSize: 9,
                },
              },
            ],
          ],
          body: zoneTasks.map((t) => [
            '',
            cleanShortValue(t.seq) || '—',
            priorityToken(`${t.description || ''} ${t.taskBarcode || ''}`),
            t.taskBarcode || '—',
            t.description || '',
            t.registration || '—',
            t.note || '',
          ]),
          styles: { fontSize: 8, cellPadding: 1.2, textColor: [0, 0, 0], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 8 },
            1: { cellWidth: 12 },
            2: { cellWidth: 16 },
            3: { cellWidth: 30, fontStyle: 'bold', textColor: [0, 0, 0] },
            5: { cellWidth: 26, halign: 'left' },
            6: { cellWidth: 40, textColor: [0, 0, 0], fontStyle: 'bolditalic' },
          },
          didDrawCell: (data) => {
            drawCheckboxCell(doc, data)
            const t = zoneTasks[data.row.index]
            drawPriorityBadge(
              doc,
              data,
              t ? priorityToken(`${t.description || ''} ${t.taskBarcode || ''}`) : ''
            )
          },
          didParseCell: (data) => hidePriorityCellText(data),
        })
        y = doc.lastAutoTable.finalY + 5
        if (y > pageHeight - 15) {
          doc.addPage()
          y = 14
        }
      })
    })
    return doc
  }

  const exportPocketPdf = () => {
    if (!printPocket) return
    const doc = buildPocketPdf()
    doc.save(
      `pocket-${printPocket.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'no-name'}-${new Date().toISOString().slice(0, 10)}.pdf`
    )
  }

  const exportPocketJpeg = () => {
    if (!printPocket) return
    const doc = buildPocketPdf()
    downloadPdfAsJpeg(
      doc,
      `pocket-${printPocket.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'no-name'}.pdf`
    )
  }

  const printPocketPdf = () => {
    if (!printPocket) return
    openPdfPrint(buildPocketPdf())
  }

  const printPocket = printPocketId ? pocketById[printPocketId] : null
  const printTasks = useMemo(() => {
    if (!printPocket) return []
    const ids = pocketTaskIds(printPocket)
    return ids
      .filter((id) => selectedTasks.includes(id) && taskById[id])
      .map((id) => taskById[id])
  }, [printPocket, selectedTasks, taskById])

  // Regrouper les tâches de la pochette à l'impression par bloc puis zone
  const printByBlock = useMemo(() => {
    const map = {}
    printTasks.forEach((t) => {
      const blk = t.taskType || 'AUTRE'
      if (!map[blk]) map[blk] = { zones: {}, count: 0, totalHours: 0 }
      const zone = t.workArea || 'No zone'
      if (!map[blk].zones[zone]) map[blk].zones[zone] = []
      map[blk].zones[zone].push(t)
      map[blk].count += 1
      const h = parseFloat(t.scheduledHours)
      if (!isNaN(h)) map[blk].totalHours += h
    })
    Object.keys(map).forEach((blk) => {
      map[blk].zones = Object.fromEntries(
        Object.entries(map[blk].zones).sort((a, b) => a[0].localeCompare(b[0]))
      )
    })
    return map
  }, [printTasks])

  const emptyPockets = pockets.filter((p) => pocketTaskIds(p).length === 0)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Workload preparation</h1>
          <p className="text-slate-600 mt-1">
            Remaining workload for the next vacation — {prepTasks.length} lines
            {zoneGroups.length > 0 &&
              ` · ${[...new Set(prepTasks.map((t) => t.taskType).filter(Boolean))].length} blocks`}
          </p>
        </div>
        {prepTasks.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Clear the entire current workload preparation?')) clearPrepTasks()
            }}
            className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 px-3 py-2 rounded-md"
          >
            <X className="h-4 w-4" /> Clear all
          </button>
        )}
      </div>

      {/* Barre de déplacement multiple */}
      {selectedMoveIds.length > 0 && (
        <div className="bg-white rounded-xl shadow p-3 border-l-4 border-l-sky-600 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-slate-700">
            <strong>{selectedMoveIds.length}</strong> line(s) selected — move to
            another block / sub-task:
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openMove(selectedMoveIds)}
              className="bg-sky-600 text-white px-3 py-1.5 rounded-md hover:bg-sky-700 text-xs font-semibold"
              title="Move all checked lines"
            >
              Move ({selectedMoveIds.length})
            </button>
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Delete the ${selectedMoveIds.length} selected line(s) permanently?\n\nThey will also be removed from the pockets.`
                  )
                ) {
                  removePrepTasksByIds(selectedMoveIds)
                  setMoveSelected({})
                }
              }}
              className="bg-white text-red-600 border border-red-200 px-3 py-1.5 rounded-md hover:bg-red-50 text-xs font-semibold"
              title="Delete all selected lines"
            >
              Delete ({selectedMoveIds.length})
            </button>
            <button
              onClick={() => setMoveSelected({})}
              className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-md px-2 py-1.5"
            >
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-6 sm:p-8 text-center bg-white hover:border-sky-400 transition-colors cursor-pointer"
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
            e.target.value = ''
          }}
        />
        <Upload className="h-10 w-10 mx-auto text-slate-400" />
        <p className="mt-3 font-medium text-slate-700">
          Upload the remaining workload file (end of day)
        </p>
        <p className="text-sm text-slate-500 mt-1">Supported formats: .xlsx, .xls, .csv</p>
        {fileName && (
          <p className="mt-3 inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {preview.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b">
            <div>
              <h2 className="text-lg font-semibold">
                Preview — {previewSelectedCount} / {preview.length} line(s) selected
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Uncheck a block, a sub-task or a line to exclude it from the import.
                {previewDoneCount > 0 &&
                  ` ${previewDoneCount} line(s) already done (COMPLETE in Tasks) unchecked automatically.`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  setPreviewSelected(
                    Object.fromEntries(preview.map((t) => [t.id, !previewDone[t.id]]))
                  )
                }
                className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-1"
              >
                Check all
              </button>
              <button
                onClick={() => setPreviewSelected({})}
                className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-1"
              >
                Uncheck all
              </button>
              <button
                onClick={() => {
                  setPreview([])
                  setPreviewSelected({})
                  setPreviewDone({})
                  setFileName('')
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={previewSelectedCount === 0}
                className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold disabled:opacity-50"
              >
                Add to preparation ({previewSelectedCount})
              </button>
            </div>
          </div>
          <div className="max-h-[440px] overflow-y-auto">
            <TaskTreeSelect
              tree={previewTree}
              selected={previewSelected}
              onToggleTask={togglePreviewTask}
              onToggleTasks={togglePreviewTasks}
              expandedBlocks={previewExpandedBlocks}
              setExpandedBlocks={setPreviewExpandedBlocks}
              expandedZones={previewExpandedZones}
              setExpandedZones={setPreviewExpandedZones}
              idPrefix="prep"
              doneMap={previewDone}
            />
          </div>
        </div>
      )}

      {prepTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b bg-slate-50/50">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-sky-600" />
              Virtual pockets
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Create pockets and assign blocks, zones or tasks to them. A pocket can
              then be printed.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={newPocketName}
                onChange={(e) => setNewPocketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createPocket()
                }}
                placeholder="Pocket name (e.g. Mechanical team afternoon)"
                className="border border-slate-300 rounded-md px-3 py-2 text-sm flex-1 min-w-[220px]"
              />
              <button
                onClick={createPocket}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Create pocket
              </button>
            </div>
          </div>

          {transferMsg && (
            <div className="px-4 sm:px-6 text-sm text-emerald-700 mb-2">{transferMsg}</div>
          )}
          {transferError && (
            <div className="px-4 sm:px-6 text-sm text-red-600 mb-2">{transferError}</div>
          )}

          {pockets.length === 0 ? (
            <p className="px-4 sm:px-6 py-6 text-sm text-slate-500">
              No pocket yet. Create one above, then assign blocks or
              tasks with the block / zone / line dropdowns below.
            </p>
          ) : (
            <div className="grid gap-3 p-4 sm:p-5 sm:grid-cols-2 xl:grid-cols-3">
              {pockets.map((p) => {
                const st = pocketStats[p.id] || { count: 0, hours: 0 }
                return (
                  <div key={p.id} className="border border-slate-200 rounded-lg p-4 flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      {renameId === p.id ? (
                        <input
                          autoFocus
                          value={renameText}
                          onChange={(e) => setRenameText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              renamePocket(p.id, renameText)
                              setRenameId(null)
                            }
                            if (e.key === 'Escape') setRenameId(null)
                          }}
                          onBlur={() => {
                            renamePocket(p.id, renameText)
                            setRenameId(null)
                          }}
                          className="border border-sky-400 rounded-md px-2 py-1 text-sm font-semibold flex-1"
                        />
                      ) : (
                        <h3 className="font-semibold text-slate-900 leading-tight">{p.name}</h3>
                      )}
                      <button
                        onClick={() => {
                          if (renameId === p.id) {
                            renamePocket(p.id, renameText)
                            setRenameId(null)
                          } else {
                            setRenameId(p.id)
                            setRenameText(p.name)
                          }
                        }}
                        className="text-slate-400 hover:text-sky-600 p-1 rounded"
                        title={renameId === p.id ? 'Save the new name' : 'Rename the pocket'}
                      >
                        {renameId === p.id ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-xs font-semibold">
                        {st.count} task{st.count > 1 ? 's' : ''}
                      </span>
                      {st.missing > 0 && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs">
                          {st.missing} deleted task{st.missing > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        onClick={() => openPrint(p.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-md hover:bg-slate-700 text-sm font-semibold"
                        title="Show and print the pocket"
                      >
                        <Printer className="h-4 w-4" /> Open / Print
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Delete the pocket “${p.name}”?`)) {
                            removePocket(p.id)
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 p-2 rounded border border-slate-200"
                        title="Delete the pocket"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="border-t border-slate-100 pt-2">
                      {transferPocketId === p.id ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <select
                            value={transferTargetCode}
                            onChange={(e) => setTransferTargetCode(e.target.value)}
                            className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white flex-1 min-w-[140px]"
                          >
                            <option value="">— Recipient profile —</option>
                            {transferProfiles.map((pp) => (
                              <option key={pp.id} value={pp.id}>
                                {pp.name}
                                {pp.aircraft ? ` (${pp.aircraft})` : ''}
                              </option>
                            ))}
                          </select>
                          <button
                            onClick={() => transferPocket(p)}
                            disabled={transferring || !transferTargetCode}
                            className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-full px-3 py-1 disabled:opacity-50"
                          >
                            {transferring ? 'Transferring…' : 'Transfer'}
                          </button>
                          <button
                            onClick={() => {
                              setTransferPocketId(null)
                              setTransferTargetCode('')
                            }}
                            className="text-slate-400 hover:text-slate-700 p-1"
                            title="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                          <button
                            onClick={() => {
                              setTransferPocketId(p.id)
                              setTransferTargetCode('')
                              setTransferMsg('')
                              setTransferError('')
                            }}
                            disabled={transferProfiles.length === 0}
                            className="w-full text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-3 py-1 disabled:opacity-50"
                            title="Copy this pocket (with its lines) to another profile — the original profile keeps it"
                          >
                            Copy to another profile
                          </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {emptyPockets.length > 0 && (
            <p className="px-4 sm:px-6 pb-4 text-xs text-slate-400">
              {emptyPockets.map((p) => p.name).join(' · ')}: empty pocket(s) — assign
              blocks or tasks to them.
            </p>
          )}
        </div>
      )}

      {prepTasks.length === 0 && preview.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <FolderClock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          No workload preparation. Upload the remaining workload file above.
        </div>
      )}

      {importMsg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {importMsg}
        </p>
      )}

      {prepTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-sky-600">
          <p className="text-sm font-semibold text-slate-800">Add a line manually</p>
          <ManualTaskForm
            onAdd={(list) => {
              addPrepTasks(list)
              const labels = list.map((t) =>
                (t.taskType || '') === 'CORR'
                  ? getCategoryLabel('CORR')
                  : t.workArea || 'No zone'
              )
              setCollapsed((prev) => prev.filter((z) => !labels.includes(z)))
            }}
            zoneOptions={allZones}
            existingTasks={prepTasks}
          />
        </div>
      )}

      {/* Filtres de la liste : recherche + blocs (comme la page Tâches) */}
      {prepTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-40 sm:w-52 shrink-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                value={prepSearch}
                onChange={(e) => setPrepSearch(e.target.value)}
                placeholder="Search (No., task, TRFX, zone…)"
                className="w-full border border-slate-300 rounded-md pl-9 pr-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {prepBlocks.map((blk) => {
                const hidden = hiddenBlocks.includes(blk)
                const count = prepTasks.filter(
                  (t) => (t.taskType || 'AUTRE') === blk
                ).length
                const color = getCategoryColor(blk)
                return (
                  <button
                    key={blk}
                    onClick={() =>
                      setHiddenBlocks((prev) =>
                        prev.includes(blk) ? prev.filter((x) => x !== blk) : [...prev, blk]
                      )
                    }
                    className="px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all"
                    style={
                      hidden
                        ? { backgroundColor: 'transparent', borderColor: color, color }
                        : { backgroundColor: color, borderColor: color, color: '#fff' }
                    }
                    title={hidden ? 'Show this block again' : 'Hide this block'}
                  >
                    {getCategoryLabel(blk)} ({count})
                  </button>
                )
              })}
              {(hiddenBlocks.length > 0 || prepSearch) && (
                <button
                  onClick={() => {
                    setHiddenBlocks([])
                    setPrepSearch('')
                  }}
                  className="text-xs text-sky-600 hover:underline"
                >
                  Show all
                </button>
              )}
            </div>
          </div>
          {/* Filtres de priorité (cumulables, comme la page Tâches) */}
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {['MEL', 'EXMP', 'NSRE', 'TLI', 'IDT'].map((tok) => (
              <button
                key={tok}
                onClick={() =>
                  setPrioFilter((prev) =>
                    prev.includes(tok) ? prev.filter((x) => x !== tok) : [...prev, tok]
                  )
                }
                className={`px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${
                  prioFilter.includes(tok)
                    ? 'bg-[#ff0000] border-[#ff0000] text-white'
                    : 'bg-white border-[#ff0000] text-[#ff0000] hover:bg-[#ff0000]/10'
                }`}
                title={`Show ${tok} lines (can be combined with other filters)`}
              >
                {tok} ({prepPrioCounts[tok]})
              </button>
            ))}
            {prioFilter.length > 0 && (
              <button
                onClick={() => setPrioFilter([])}
                className="text-xs text-sky-600 hover:underline"
              >
                Show all
              </button>
            )}
          </div>
          {(prepSearch || hiddenBlocks.length > 0 || prioFilter.length > 0) && (
            <p className="text-xs text-slate-400 mt-2">
              {filteredPrepTasks.length} line(s) shown out of {prepTasks.length}
            </p>
          )}
        </div>
      )}

      {prepTasks.length > 0 && filteredPrepTasks.length === 0 && (
        <div className="bg-white rounded-xl shadow p-8 text-center text-slate-500">
          No lines match the filters.
        </div>
      )}

      {/* Charge groupée par zone — même mise en page que la page Tâches */}
      {zoneGroups.length > 0 && (
        <div className="grid gap-4">
          {zoneGroups.map((group) => {
              const zoneTasks = Object.values(group.zones).flat()
              const zone = group.label
              const zoneColor = group.isFF
                ? getCategoryColor('CORR')
                : getZoneColor(group.label, allZones)
              const expanded = !collapsed.includes(zone)
              const zoneTaskIds = zoneTasks.map((t) => t.id)
              const zoneHours = zoneTasks.reduce((acc, t) => {
                const h = parseFloat(t.scheduledHours)
                return acc + (isNaN(h) ? 0 : h)
              }, 0)
              // Blocs présents dans cette zone (le choix pochette par bloc
              // n'apparaît que si la zone en contient plusieurs)
              const zoneBlocks = [...new Set(zoneTasks.map((t) => t.taskType).filter(Boolean))]
              return (
                <div
                  key={zone}
                  className={`bg-white rounded-xl shadow overflow-hidden${expanded ? ' ring-2 ring-black' : ''}`}
                >
                  <div
                    className="px-3 sm:px-4 py-2 flex items-center justify-between flex-wrap gap-2 cursor-pointer"
                    style={{ backgroundColor: zoneColor }}
                    onClick={() => toggleZone(zone)}
                    title={expanded ? 'Collapse this zone' : 'Expand this zone'}
                  >
                    <div className="flex items-center gap-2">
                      {expanded ? (
                        <ChevronDown className="h-5 w-5 text-white" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-white" />
                      )}
                      <h2 className="font-bold text-white text-sm">
                        {zone}{' '}
                        <span className="font-normal opacity-80">({zoneTasks.length})</span>
                        {zoneHours > 0 && (
                          <span className="font-normal opacity-80"> · {formatHours(zoneHours)} h</span>
                        )}
                      </h2>
                    </div>
                    <div
                      className="flex items-center gap-1.5 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <PocketChips
                        dark
                        counts={pocketCounts(zoneTaskIds)}
                        pocketById={pocketById}
                        onRemove={(pid) => removeScopeFromPocket(pid, zoneTaskIds)}
                      />
                      <div onClick={(e) => e.stopPropagation()}>
                        <PocketSelect
                          variant="dark"
                          pockets={pockets}
                          placeholder="Assign zone..."
                          onSelect={(pid) => assignToPocket(pid, zoneTaskIds)}
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          selectZoneForMove(zoneTasks)
                        }}
                        className="bg-white/20 hover:bg-white/50 rounded-full pl-1 pr-1.5 py-0.5 text-white inline-flex items-center gap-0.5"
                        title={`Select all lines in zone ${zone} (batch move)`}
                      >
                        <Plus className="h-3 w-3" />
                        <span className="text-[10px] font-bold whitespace-nowrap">sel.</span>
                      </button>
                      {zoneBlocks.map((blk) => {
                        const n = zoneTasks.filter((t) => t.taskType === blk).length
                        const total = prepTasks.filter((t) => t.taskType === blk).length
                        return (
                          <span key={blk} className="inline-flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Carte de zone : on ne supprime que le bloc de CETTE zone
                                // (le bloc Found Fault reste global, il n'a pas de zone unique)
                                if (
                                  window.confirm(
                                    group.isFF
                                      ? `Delete the whole ${getCategoryLabel(blk)} block (${total} line(s))?`
                                      : `Delete the ${n} ${getCategoryLabel(blk)} line(s) in zone ${zone}?`
                                  )
                                ) {
                                  if (group.isFF) removePrepTasksByBlock(blk)
                                  else removePrepTasksByZone(zone, blk)
                                }
                              }}
                              className="bg-white/25 hover:bg-white/40 px-1.5 py-0.5 rounded-full text-[10px] font-semibold text-white flex items-center gap-1"
                              title={
                                group.isFF
                                  ? `Delete the whole ${getCategoryLabel(blk)} block (${total} lines)`
                                  : `Delete the ${n} ${getCategoryLabel(blk)} line(s) in zone ${zone}`
                              }
                            >
                              {getCategoryLabel(blk)} · {n}
                              <Trash2 className="h-3 w-3 opacity-80" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                // Carte de zone : on ne réintègre que le bloc de CETTE zone
                                // (le bloc Found Fault reste global, il n'a pas de zone unique)
                                reintegrerTasks(
                                  prepTasks.filter(
                                    (t) =>
                                      (t.taskType || 'AUTRE') === blk &&
                                      (group.isFF || (t.workArea || 'Other') === zone)
                                  )
                                )
                              }}
                              className="bg-white/20 hover:bg-white/40 rounded-full p-1 text-white"
                              title={`Return ${
                                group.isFF
                                  ? `the whole ${getCategoryLabel(blk)} block`
                                  : `the ${getCategoryLabel(blk)} lines in zone ${zone}`
                              } to Tasks`}
                            >
                              <Undo2 className="h-3 w-3" />
                            </button>
                            {zoneBlocks.length > 1 && (
                              <PocketSelect
                                variant="dark"
                                compact
                                pockets={pockets}
                                placeholder={`${getCategoryLabel(blk)} → pocket`}
                                onSelect={(pid) =>
                                  assignToPocket(
                                    pid,
                                    zoneTasks
                                      .filter((t) => (t.taskType || 'AUTRE') === blk)
                                      .map((t) => t.id)
                                  )
                                }
                              />
                            )}
                          </span>
                        )
                      })}
                    </div>
                  </div>
                  {expanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm min-w-[760px]">
                        <thead>
                          <tr className="text-left bg-slate-50">
                            <th className="px-1 py-2 border-b text-[10px] text-slate-500" title="Check to select (batch move)">sel.</th>
                            <th className="px-2 py-2 border-b">No.</th>
                            <th className="px-2 py-2 border-b">Task</th>
                            <th className="px-0.5 py-2 border-b">Block</th>
                            <th className="px-0.5 py-2 border-b">Skills</th>
                              <th className="px-0.5 py-2 border-b font-bold text-black">TRFX</th>
                            <th className="px-0.5 py-2 border-b">Status</th>
                            <th className="px-0.5 py-2 border-b">Aircraft</th>
                            <th className="px-0.5 py-2 border-b">Note</th>
                            <th className="px-0.5 py-2 border-b">Pocket</th>
                            <th className="px-4 py-2 border-b"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(group.zones)
                            .sort((a, b) => a[0].localeCompare(b[0]))
                            .map(([subZone, subTasks]) => {
                              const subOpen = expandedSubZones.includes(`${group.key}::${subZone}`)
                              return (
                              <Fragment key={subZone}>
                                {group.isFF && (
                                  <>
                                    <tr>
                                      <td colSpan={11} style={{ height: 10 }} className="p-0" />
                                    </tr>
                                    <tr
                                      className="border-b border-slate-100 cursor-pointer hover:brightness-110"
                                      onClick={() => toggleSubZone(`${group.key}::${subZone}`)}
                                      title={subOpen ? 'Collapse this sub-task' : 'Expand this sub-task'}
                                    >
                                      <td colSpan={11} className="px-2 py-0.5">
                                        <span
                                          className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold uppercase tracking-wide text-white"
                                          style={{ backgroundColor: getZoneColor(subZone, allZones) }}
                                        >
                                          {subOpen ? (
                                            <ChevronDown className="h-4 w-4" />
                                          ) : (
                                            <ChevronRight className="h-4 w-4" />
                                          )}
                                          📍 {subZone}
                                          <span className="opacity-90 font-normal">
                                            ({subTasks.length})
                                          </span>
                                          <span
                                            className="ml-auto flex items-center gap-1.5"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <PocketSelect
                                              variant="dark"
                                              compact
                                              pockets={pockets}
                                              placeholder={`${subZone} → pocket`}
                                              onSelect={(pid) =>
                                                assignToPocket(
                                                  pid,
                                                  subTasks.map((t) => t.id)
                                                )
                                              }
                                            />
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                reintegrerTasks(
                                                  prepTasks.filter(
                                                    (t) =>
                                                      (t.workArea || 'Other') === subZone &&
                                                      (t.taskType || 'AUTRE') === 'CORR'
                                                  )
                                                )
                                              }}
                                              className="text-white/80 hover:text-white"
                                              title={`Return sub-task ${subZone} to Tasks`}
                                            >
                                              <Undo2 className="h-4 w-4" />
                                            </button>
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation()
                                                if (
                                                  window.confirm(
                                                    `Delete the whole sub-task ${subZone} from the Found Fault block (${subTasks.length} line(s))?`
                                                  )
                                                ) {
                                                  removePrepTasksByZone(subZone, 'CORR')
                                                }
                                              }}
                                              className="text-white/80 hover:text-white"
                                              title={`Delete the whole sub-task ${subZone} (Found Fault)`}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </button>
                                          </span>
                                        </span>
                                      </td>
                                    </tr>
                                  </>
                                )}
                          {(!group.isFF || subOpen) &&
                            subTasks.map((task) => {
                            const h = parseFloat(task.scheduledHours)
                            const inPocket = pockets.filter((p) => pocketTaskIds(p).includes(task.id))
                            return (
                              <tr
                                key={task.id}
                                className="border-b hover:bg-slate-100"
                                style={
                                  group.isFF && subOpen
                                    ? { backgroundColor: `${getZoneColor(subZone, allZones)}14` }
                                    : undefined
                                }
                              >
                                <td className="px-1 py-2 text-center">
                                  <input
                                    type="checkbox"
                                    checked={!!moveSelected[task.id]}
                                    onChange={() => toggleMoveSel(task.id)}
                                    className="h-3.5 w-3.5 accent-sky-600"
                                    title="Select for a batch move"
                                  />
                                </td>
                                <td className="px-2 py-2 font-bold text-slate-500">
                                  {cleanShortValue(task.seq) || '-'}
                                </td>
                                <td className="px-2 py-2 font-medium max-w-md" title={task.description}>
                                  <span className="flex items-center gap-1 min-w-0">
                                    <span className="truncate">{task.description}</span>
                                    {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`) && (
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#ff0000]/10 text-[#ff0000] border border-[#ff0000]/40 whitespace-nowrap"
                                        title="Priority line (MEL / EXMP)"
                                      >
                                        {priorityToken(`${task.description || ''} ${task.taskBarcode || ''}`)}
                                      </span>
                                    )}
                                  </span>
                                  {!isNaN(h) && (
                                    <div className="text-[11px] text-slate-400 font-normal">
                                      {formatHours(h)} h
                                    </div>
                                  )}
                                </td>
                                <td className="px-0.5 py-2">
                                  <span
                                    className="px-2 py-0.5 rounded-full text-xs font-semibold text-white"
                                    style={{ backgroundColor: getCategoryColor(task.taskType) }}
                                  >
                                    {getCategoryLabel(task.taskType) || '-'}
                                  </span>
                                </td>
                                <td className="px-0.5 py-2 text-xs">{task.skills || '-'}</td>
                                <td className="px-0.5 py-2 font-mono font-bold text-xs">
                                  {task.taskBarcode || '-'}
                                </td>
                                <td className="px-0.5 py-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                                      task.mtxStatus === 'ACTV'
                                        ? 'bg-green-100 text-green-700'
                                        : task.mtxStatus === 'PAUSE'
                                        ? 'bg-amber-100 text-amber-700'
                                        : task.mtxStatus === 'COMPLETE'
                                        ? 'bg-green-800 text-white'
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {task.mtxStatus || '—'}
                                  </span>
                                  {task.mtxStatus !== 'COMPLETE' ? (
                                    <button
                                      onClick={() => updatePrepTask(task.id, { mtxStatus: 'COMPLETE' })}
                                      className="text-slate-300 hover:text-green-600 ml-1"
                                      title="Mark the task COMPLETE"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => updatePrepTask(task.id, { mtxStatus: 'ACTV' })}
                                      className="text-slate-300 hover:text-sky-600 ml-1"
                                      title="Restore the task ACTV"
                                    >
                                      <RotateCcw className="h-3.5 w-3.5" />
                                    </button>
                                  )}
                                </td>
                                <td className="px-0.5 py-2">{task.registration || '-'}</td>
                                <td className="px-0.5 py-2">
                                  <NoteCell
                                    note={task.note}
                                    onSave={(v) => updatePrepTask(task.id, { note: v })}
                                  />
                                </td>
                                <td className="px-0.5 py-2">
                                  <div className="flex flex-wrap items-center gap-1">
                                    {inPocket.map((p) => (
                                      <span
                                        key={p.id}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-300 rounded text-[10px] font-semibold"
                                        title={`In pocket “${p.name}” — click the cross to remove`}
                                      >
                                        {p.name}
                                        <button
                                          onClick={() => removeTasksFromPocket(p.id, [task.id])}
                                          className="text-sky-400 hover:text-red-600"
                                        >
                                          <X className="h-3 w-3" />
                                        </button>
                                      </span>
                                    ))}
                                    <PocketSelect
                                      pockets={pockets}
                                      placeholder="+ pocket"
                                      compact
                                      onSelect={(pid) => assignToPocket(pid, [task.id])}
                                    />
                                  </div>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => openMove([task.id])}
                                      className="text-slate-400 hover:text-sky-600"
                                      title="Move this line (block / sub-task)"
                                    >
                                      <Pencil className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => reintegrerTasks([task])}
                                      className="text-slate-400 hover:text-emerald-600"
                                      title="Return this line to Tasks (undo the transfer)"
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Delete this line?'))
                                          removePrepTask(task.id)
                                      }}
                                      className="text-slate-400 hover:text-red-600"
                                      title="Delete this line"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )
                          })}
                              </Fragment>
                              )
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      )}

      {/* ------- Modal de déplacement (bloc / sous-tâche) ------- */}
      {moveIds?.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setMoveIds(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  Move {moveIds.length} line{moveIds.length > 1 ? 's' : ''}
                </h2>
                <p className="text-xs text-slate-300 truncate">
                  {(() => {
                    const first = prepTasks.find((t) => t.id === moveIds[0])
                    return first
                      ? `N° ${first.seq || '—'} · ${first.description}${
                          moveIds.length > 1 ? ` (+${moveIds.length - 1} more)` : ''
                        }`
                      : ''
                  })()}
                </p>
              </div>
              <button
                onClick={() => setMoveIds(null)}
                className="text-slate-300 hover:text-white shrink-0"
                title="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <label className="block text-sm font-medium text-slate-700">
                Block
                <select
                  value={moveBlk}
                  onChange={(e) => setMoveBlk(e.target.value)}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  {['JIC', 'CORR', 'MPC', 'ADHOC', 'EO', 'AUTRE'].map((b) => (
                    <option key={b} value={b}>
                      {getCategoryLabel(b)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm font-medium text-slate-700">
                Sub-task / zone
                <select
                  value={moveZoneNew ? '__new__' : moveZone}
                  onChange={(e) => {
                    const v = e.target.value
                    if (v === '__new__') {
                      setMoveZoneNew(true)
                      setMoveZone('')
                    } else {
                      setMoveZoneNew(false)
                      setMoveZone(v)
                    }
                  }}
                  className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
                >
                  <option value="">— Choose a sub-task —</option>
                  {allZones.map((z) => (
                    <option key={z} value={z}>
                      {z}
                    </option>
                  ))}
                  <option value="__new__">➕ New sub-task…</option>
                </select>
              </label>
              {moveZoneNew && (
                <label className="block text-sm font-medium text-slate-700">
                  New sub-task name
                  <input
                    autoFocus
                    value={moveZone}
                    onChange={(e) => setMoveZone(e.target.value)}
                    placeholder="E.g. CAB SECURITY"
                    className="mt-1 w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
                  />
                </label>
              )}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setMoveIds(null)}
                  className="px-4 py-2 rounded-md text-sm text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  onClick={applyMove}
                  className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
                >
                  Save {moveIds.length > 1 ? `(${moveIds.length} lines)` : ''}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ------- Modal d'impression de pochette ------- */}
      {printPocket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 print-target" onClick={() => setPrintPocketId(null)}>
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b-2 flex items-center justify-between gap-3 bg-slate-900 print:border-slate-600 print:bg-slate-900">
              <div className="flex items-center gap-3 min-w-0">
                <span className="bg-sky-500 text-white p-2 rounded-lg shrink-0">
                  <FolderPlus className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{printPocket.name}</h1>
                  <p className="text-sm text-slate-300 mt-0.5">
                    Virtual pocket · {printTasks.length} / {pocketTaskIds(printPocket).length} line(s)
                    selected · {new Date().toLocaleDateString('en-GB')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button
                  onClick={exportPocketJpeg}
                  disabled={printTasks.length === 0}
                  className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                >
                  <FileImage className="h-4 w-4" /> JPEG
                </button>
                <button
                  onClick={exportPocketPdf}
                  disabled={printTasks.length === 0}
                  className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                >
                  <FileDown className="h-4 w-4" /> Export as PDF
                </button>
                <button
                  onClick={printPocketPdf}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md hover:bg-slate-700 text-sm font-semibold"
                >
                  <Printer className="h-4 w-4" /> Print
                </button>
                <button
                  onClick={() => setPrintPocketId(null)}
                  className="text-slate-500 hover:text-slate-800 p-2 rounded hover:bg-slate-200"
                  title="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
              {/* Colonne de gauche : répartition */}
              <div className="w-full sm:w-56 shrink-0 border-r border-slate-100 bg-slate-50 p-4 overflow-y-auto print-hide">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                  Distribution by block
                </h3>
                {Object.keys(printByBlock).length === 0 ? (
                  <p className="text-sm text-slate-500">No tasks selected.</p>
                ) : (
                  <>
                    <button
                      onClick={() => {
                        const allIds = pocketTaskIds(printPocket).filter((id) => taskById[id])
                        setSelectedTasks((prev) =>
                          allIds.every((id) => prev.includes(id)) ? [] : allIds
                        )
                      }}
                      className="w-full text-left text-xs font-semibold text-sky-700 bg-sky-50 border border-sky-200 rounded-md px-3 py-1.5 mb-3 hover:bg-sky-100"
                    >
                      {pocketTaskIds(printPocket).every((id) => selectedTasks.includes(id))
                        ? 'Uncheck all'
                        : 'Check all'}
                    </button>
                    <ul className="space-y-2">
                    {Object.keys(printByBlock).map((blk) => (
                      <li key={blk}>
                        <button
                          onClick={() => {
                            const ids = printByBlock[blk].zones
                              ? Object.values(printByBlock[blk].zones).flat().map((t) => t.id)
                              : []
                            setSelectedTasks((prev) => {
                              if (ids.every((id) => prev.includes(id))) {
                                return prev.filter((id) => !ids.includes(id))
                              }
                              return [...new Set([...prev, ...ids])]
                            })
                          }}
                          className="w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-md bg-white border border-slate-200 hover:border-sky-400"
                        >
                          <span className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: getCategoryColor(blk) }}
                            />
                            <span className="text-sm font-semibold">{getCategoryLabel(blk)}</span>
                          </span>
                          <span className="text-xs text-slate-500">
                            {printByBlock[blk].count} task(s)
                          </span>
                        </button>
                      </li>
                    ))}
                    </ul>
                  </>
                )}
              </div>

              {/* Colonne principale : liste détaillée */}
              <div className="flex-1 p-4 overflow-y-auto bg-white">
                {Object.keys(printByBlock).length === 0 ? (
                  <p className="text-sm text-slate-500">Check tasks on the left to include them.</p>
                ) : (
                  <div className="space-y-5">
                    {Object.keys(printByBlock).map((blk) => (
                      <div key={blk} className="print-pocket-block">
<div
  className="px-3 py-2 rounded-t-md flex items-center justify-between gap-2 flex-wrap text-white font-bold"
  style={{ backgroundColor: getCategoryColor(blk) }}
>
  <span>
    Block {getCategoryLabel(blk)} · {printByBlock[blk].count} task(s)
  </span>
  <span className="inline-flex items-center gap-1.5 bg-white/25 px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wide">
    <FolderPlus className="h-3.5 w-3.5" />
    {printPocket.name}
  </span>
</div>
                        <div className="border border-t-0 border-slate-200 rounded-b-md overflow-hidden">
                          {Object.keys(printByBlock[blk].zones).map((zone) => (
                            <div key={zone} className="print-pocket-zone">
                              <div className="px-3 py-1.5 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-600 uppercase tracking-wide flex items-center justify-between gap-2">
                                <span>
                                  {zone} <span className="font-normal text-slate-400 normal-case">({printByBlock[blk].zones[zone].length})</span>
                                </span>
                              </div>
                              <table className="w-full text-sm">
                                <tbody className="divide-y divide-slate-100">
                                  {printByBlock[blk].zones[zone].map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-50">
                                      <td className="px-3 py-1.5 w-8 print:hidden">
                                        <input
                                          type="checkbox"
                                          checked={selectedTasks.includes(t.id)}
                                          onChange={() =>
                                            setSelectedTasks((prev) =>
                                              prev.includes(t.id)
                                                ? prev.filter((id) => id !== t.id)
                                                : [...prev, t.id]
                                            )
                                          }
                                        />
                                      </td>
                                      <td className="px-3 py-1.5 font-mono text-xs text-slate-500 w-12">{t.seq || '-'}</td>
                                      <td className="px-3 py-1.5 text-slate-800">{t.description}</td>
                                      <td className="px-2 py-1.5 text-right w-8 print:hidden">
                                        <button
                                          onClick={() => removeTasksFromPocket(printPocket.id, [t.id])}
                                          className="text-slate-300 hover:text-red-600 p-1 rounded"
                                          title="Remove this task from the pocket"
                                        >
                                          <X className="h-3.5 w-3.5" />
                                        </button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                    <div className="text-right text-sm font-semibold text-slate-700">
                      Total: {printTasks.length} task(s)
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PocketSelect({ pockets, placeholder, onSelect, variant = 'light', compact }) {
  const [value, setValue] = useState('')
  const dark = variant === 'dark'
  return (
    <div className="flex items-center gap-0">
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value
          setValue('')
          if (v) onSelect(v)
        }}
        className={
          compact
            ? 'h-6 border border-slate-300 rounded-full px-2 text-[11px] leading-none text-slate-700 max-w-[130px] bg-white'
            : dark
              ? 'border border-white/60 rounded-md px-2 py-1 text-xs font-medium bg-white text-slate-800 hover:border-white max-w-[200px]'
              : 'border border-slate-300 rounded-md px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:border-sky-400 max-w-[200px]'
        }
        title={pockets.length === 0 ? "Create a pocket first" : placeholder}
      >
        <option value="" className="text-slate-400">
          {pockets.length === 0 ? '— No pocket —' : placeholder}
        </option>
        {pockets.map((p) => (
          <option key={p.id} value={p.id} className="text-slate-800 bg-white font-semibold">
            {p.name}
          </option>
        ))}
      </select>
    </div>
  )
}

function PocketChips({ counts, pocketById, onRemove, dark }) {
  const entries = Object.entries(counts)
  if (entries.length === 0) return null
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      {entries.map(([pid, n]) => {
        const p = pocketById[pid]
        if (!p) return null
        return (
          <span
            key={pid}
            className={
              dark
                ? 'inline-flex items-center gap-1.5 h-6 pl-1.5 pr-1.5 rounded-full text-[10px] font-bold text-white bg-slate-900 border border-white/90 shadow'
                : 'inline-flex items-center gap-1.5 h-6 pl-1.5 pr-2 rounded-full text-xs font-bold text-sky-950 bg-sky-100 border-2 border-sky-500 shadow-sm'
            }
            title={`In pocket “${p.name}” (${n}) — click to remove`}
          >
            <FolderPlus className={dark ? 'h-3.5 w-3.5 text-sky-300' : 'h-3.5 w-3.5 text-sky-600'} />
            <span>{p.name}</span>
            <span className={dark ? 'opacity-75' : 'text-sky-600'}>({n})</span>
            <button
              onClick={() => onRemove(pid)}
              className="hover:text-red-400 -mr-0.5"
              title={`Remove from pocket “${p.name}”`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )
      })}
    </span>
  )
}