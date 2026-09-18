import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import { openPdfPrint, downloadPdfAsJpeg } from '../utils/pdfPrint'
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
} from 'lucide-react'

export default function Preparation() {
  const {
    prepTasks,
    pockets,
    addPrepTasks,
    removePrepTask,
    removePrepTasksByBlock,
    removePrepTasksByZone,
    updatePrepTask,
    clearPrepTasks,
    addTasks,
    addPocket,
    renamePocket,
    addTasksToPocket,
    removeTasksFromPocket,
    removePocket,
    activeProfile,
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
  const [previewExpandedBlocks, setPreviewExpandedBlocks] = useState([])
  const [previewExpandedZones, setPreviewExpandedZones] = useState([])
  const [importMsg, setImportMsg] = useState('')
  const [expandedSubZones, setExpandedSubZones] = useState([])

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
      setTransferError('Choisissez un profil destinataire.')
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
        setTransferError('Profil destinataire invalide.')
      } else if (res?.error) {
        setTransferError('Échec de la copie.')
      } else {
        setTransferMsg(`Pochette « ${p.name} » copiée vers « ${target.name} ».`)
        setTransferPocketId(null)
        setTransferTargetCode('')
      }
    } catch {
      setTransferError('Échec du transfert (hors ligne ?).')
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
          setError('Le fichier est vide ou ne contient pas assez de lignes.')
          return
        }
        const detected = detectColumns(rows[0])
        if (detected.description === undefined) {
          setError('Colonne "Task_Name" introuvable. Vérifiez le format du fichier.')
          return
        }
        const parsed = parseExcelRows(rows.slice(1), detected)
        setPreview(parsed)
        setImportMsg('')
        setPreviewSelected(Object.fromEntries(parsed.map((t) => [t.id, true])))
        setPreviewExpandedBlocks([])
        setPreviewExpandedZones([])
      } catch (err) {
        setError(`Erreur lors de la lecture du fichier: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

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
    const fresh = filterNewPrepTasks(prepTasks, list)
    const ignored = list.length - fresh.length
    if (fresh.length) addPrepTasks(fresh)
    setImportMsg(
      `${fresh.length} ligne(s) ajoutée(s)${
        ignored ? ` · ${ignored} déjà présente(s) ignorée(s)` : ''
      }.`
    )
    setPreview([])
    setPreviewSelected({})
    setFileName('')
  }

  const togglePreviewTask = (id) =>
    setPreviewSelected((prev) => ({ ...prev, [id]: !prev[id] }))

  const togglePreviewTasks = (list) => {
    setPreviewSelected((prev) => {
      const allOn = list.every((t) => prev[t.id])
      const next = { ...prev }
      list.forEach((t) => {
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

  // Regroupement : par zone/sous-tâche, SAUF les Found Fault (CORR) qui restent
  // regroupés dans un seul bloc avec leurs sous-tâches.
  const zoneGroups = useMemo(() => {
    const groups = {}
    prepTasks.forEach((t) => {
      const isFF = (t.taskType || '') === 'CORR'
      const key = isFF ? '__FOUND_FAULT__' : t.workArea || 'Sans zone'
      if (!groups[key]) {
        groups[key] = {
          key,
          label: isFF ? getCategoryLabel('CORR') : key,
          isFF,
          zones: {},
        }
      }
      const sub = t.workArea || 'Sans sous-tâche'
      if (!groups[key].zones[sub]) groups[key].zones[sub] = []
      groups[key].zones[sub].push(t)
    })
    return Object.values(groups).sort((a, b) => {
      const ca = Object.values(a.zones).reduce((n, l) => n + l.length, 0)
      const cb = Object.values(b.zones).reduce((n, l) => n + l.length, 0)
      return cb - ca
    })
  }, [prepTasks])

  // Replie par défaut chaque nouvelle zone (tuiles fermées au chargement)
  useEffect(() => {
    setCollapsed((prev) => [...new Set([...prev, ...zoneGroups.map((g) => g.label)])])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneGroups.map((g) => g.label).join('|')])

  const previewTree = useMemo(() => groupTasksTree(preview), [preview])
  const previewSelectedCount = preview.filter((t) => previewSelected[t.id]).length

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

  const assignZoneToPocket = (pocketId, zone) => {
    const ids = prepTasks
      .filter((t) => (t.workArea || 'Sans zone') === zone)
      .map((t) => t.id)
    assignToPocket(pocketId, ids)
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
      `${printTasks.length} / ${pocketTaskIds(printPocket).length} ligne(s) sélectionnée(s) · ${hours.toFixed(1)} h · ${new Date().toLocaleDateString('fr-FR')}`,
      margin,
      21
    )

    let y = 28
    const blockNames = Object.keys(printByBlock)

    if (blockNames.length === 0) {
      doc.text('Aucune tâche sélectionnée.', margin, y + 4)
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
        `Bloc ${getCategoryLabel(blk)} · ${info.count} tâche(s) · ${info.totalHours.toFixed(1)} h`,
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
                colSpan: 5,
                styles: {
                  fillColor: [226, 232, 240],
                  textColor: [30, 41, 59],
                  fontStyle: 'bold',
                  fontSize: 9,
                },
              },
            ],
          ],
          body: zoneTasks.map((t) => [
            t.seq !== undefined && t.seq !== '' ? String(t.seq) : '—',
            t.taskBarcode || '—',
            t.description || '',
            t.registration || '—',
            t.note || '',
          ]),
          styles: { fontSize: 8, cellPadding: 1.2 },
          columnStyles: {
            0: { cellWidth: 12 },
            1: { cellWidth: 30 },
            3: { cellWidth: 26, halign: 'left' },
            4: { cellWidth: 40, textColor: [87, 83, 78], fontStyle: 'italic' },
          },
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
      `pochette-${printPocket.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sans-nom'}-${new Date().toISOString().slice(0, 10)}.pdf`
    )
  }

  const exportPocketJpeg = () => {
    if (!printPocket) return
    const doc = buildPocketPdf()
    downloadPdfAsJpeg(
      doc,
      `pochette-${printPocket.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'sans-nom'}.pdf`
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
      const zone = t.workArea || 'Sans zone'
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
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Préparation de charge</h1>
          <p className="text-slate-600 mt-1">
            Charge restante pour la vacation suivante — {prepTasks.length} lignes
            {zoneGroups.length > 0 &&
              ` · ${[...new Set(prepTasks.map((t) => t.taskType).filter(Boolean))].length} blocs`}
          </p>
        </div>
        {prepTasks.length > 0 && (
          <button
            onClick={() => {
              if (window.confirm('Effacer toute la préparation de charge actuelle ?')) clearPrepTasks()
            }}
            className="flex items-center gap-2 text-sm text-red-600 hover:bg-red-50 border border-red-200 px-3 py-2 rounded-md"
          >
            <X className="h-4 w-4" /> Tout effacer
          </button>
        )}
      </div>

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
          Chargez le fichier de la charge restante (fin de journée)
        </p>
        <p className="text-sm text-slate-500 mt-1">Formats supportés : .xlsx, .xls, .csv</p>
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
                Aperçu — {previewSelectedCount} / {preview.length} ligne(s) sélectionnée(s)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Décochez un bloc, une sous-tâche ou une ligne pour ne pas l'importer.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() =>
                  setPreviewSelected(Object.fromEntries(preview.map((t) => [t.id, true])))
                }
                className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-1"
              >
                Tout cocher
              </button>
              <button
                onClick={() => setPreviewSelected({})}
                className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-1"
              >
                Tout décocher
              </button>
              <button
                onClick={() => {
                  setPreview([])
                  setPreviewSelected({})
                  setFileName('')
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleImport}
                disabled={previewSelectedCount === 0}
                className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold disabled:opacity-50"
              >
                Ajouter à la préparation ({previewSelectedCount})
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
            />
          </div>
        </div>
      )}

      {prepTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 sm:px-6 py-4 border-b bg-slate-50/50">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-sky-600" />
              Pochettes virtuelles
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Créez des pochettes et affectez-y des blocs, des zones ou des tâches. Une pochette peut
              ensuite être imprimée.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input
                value={newPocketName}
                onChange={(e) => setNewPocketName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createPocket()
                }}
                placeholder="Nom de la pochette (ex : Équipe mécanique après-midi)"
                className="border border-slate-300 rounded-md px-3 py-2 text-sm flex-1 min-w-[220px]"
              />
              <button
                onClick={createPocket}
                className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
              >
                <Plus className="h-4 w-4" /> Créer la pochette
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
              Aucune pochette pour le moment. Créez-en une ci-dessus, puis affectez des blocs ou des
              tâches avec les menus déroulants des blocs / zones / lignes ci-dessous.
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
                        title={renameId === p.id ? 'Enregistrer le nouveau nom' : 'Renommer la pochette'}
                      >
                        {renameId === p.id ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span className="px-2 py-0.5 bg-sky-50 text-sky-700 rounded-full text-xs font-semibold">
                        {st.count} tâche{st.count > 1 ? 's' : ''}
                      </span>
                      {st.missing > 0 && (
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs">
                          {st.missing} supprimé{st.missing > 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      <button
                        onClick={() => openPrint(p.id)}
                        className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-md hover:bg-slate-700 text-sm font-semibold"
                        title="Afficher et imprimer la pochette"
                      >
                        <Printer className="h-4 w-4" /> Ouvrir / Imprimer
                      </button>
                      <button
                        onClick={() => {
                          if (window.confirm(`Supprimer la pochette « ${p.name} » ?`)) {
                            removePocket(p.id)
                          }
                        }}
                        className="text-slate-400 hover:text-red-600 p-2 rounded border border-slate-200"
                        title="Supprimer la pochette"
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
                            <option value="">— Profil destinataire —</option>
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
                            {transferring ? 'Transfert…' : 'Transférer'}
                          </button>
                          <button
                            onClick={() => {
                              setTransferPocketId(null)
                              setTransferTargetCode('')
                            }}
                            className="text-slate-400 hover:text-slate-700 p-1"
                            title="Annuler"
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
                            title="Copier cette pochette (avec ses lignes) vers un autre profil — le profil d'origine la garde"
                          >
                            Copier vers un autre profil
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
              {emptyPockets.map((p) => p.name).join(' · ')} : pochette(s) vide(s) — affectez-y des
              blocs ou des tâches.
            </p>
          )}
        </div>
      )}

      {prepTasks.length === 0 && preview.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <FolderClock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          Aucune charge de préparation. Chargez le fichier de charge restante ci-dessus.
        </div>
      )}

      {importMsg && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {importMsg}
        </p>
      )}

      {prepTasks.length > 0 && (
        <div className="bg-white rounded-xl shadow p-3 flex flex-wrap items-center justify-between gap-2 border-l-4 border-l-sky-600">
          <p className="text-sm font-semibold text-slate-800">Ajouter une ligne manuellement</p>
          <ManualTaskForm onAdd={addPrepTasks} zoneOptions={allZones} />
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
              return (
                <div key={zone} className="bg-white rounded-xl shadow overflow-hidden">
                  <div
                    className="px-3 sm:px-5 py-2 sm:py-3 flex items-center justify-between flex-wrap gap-2"
                    style={{ backgroundColor: zoneColor }}
                  >
                    <div
                      className="flex items-center gap-2 cursor-pointer"
                      onClick={() => toggleZone(zone)}
                    >
                      {expanded ? (
                        <ChevronDown className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
                      ) : (
                        <ChevronRight className="h-5 sm:h-6 w-5 sm:w-6 text-white" />
                      )}
                      <div>
                        <h2 className="font-bold text-white text-base sm:text-lg">
                          {zone}{' '}
                          <span className="font-normal opacity-80">({zoneTasks.length})</span>
                        </h2>
                        {zoneHours > 0 && (
                          <p className="text-white font-bold text-sm mt-0.5">
                            {formatHours(zoneHours)} h
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap">
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
                          placeholder="Affecter la zone..."
                          onSelect={(pid) => assignZoneToPocket(pid, zone)}
                        />
                      </div>
                      {[...new Set(zoneTasks.map((t) => t.taskType).filter(Boolean))].map((blk) => {
                        const n = zoneTasks.filter((t) => t.taskType === blk).length
                        const total = prepTasks.filter((t) => t.taskType === blk).length
                        return (
                          <span key={blk} className="inline-flex items-center gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                if (
                                  window.confirm(
                                    `Supprimer tout le bloc ${getCategoryLabel(blk)} (${total} ligne(s) au total, toutes zones) ?`
                                  )
                                ) {
                                  removePrepTasksByBlock(blk)
                                }
                              }}
                              className="bg-white/25 hover:bg-white/40 px-2 py-0.5 rounded-full text-xs font-semibold text-white flex items-center gap-1"
                              title={`Supprimer tout le bloc ${getCategoryLabel(blk)} (${total} lignes, toutes zones confondues)`}
                            >
                              {getCategoryLabel(blk)} · {n}
                              <Trash2 className="h-3 w-3 opacity-80" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                reintegrerTasks(
                                  prepTasks.filter((t) => (t.taskType || 'AUTRE') === blk)
                                )
                              }}
                              className="bg-white/20 hover:bg-white/40 rounded-full p-1 text-white"
                              title={`Réintégrer tout le bloc ${getCategoryLabel(blk)} dans Tâches`}
                            >
                              <Undo2 className="h-3 w-3" />
                            </button>
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
                            <th className="px-2 py-2 border-b">N°</th>
                            <th className="px-2 py-2 border-b">Tâche</th>
                            <th className="px-0.5 py-2 border-b">Bloc</th>
                            <th className="px-0.5 py-2 border-b">Skills</th>
                            <th className="px-0.5 py-2 border-b">TRFX</th>
                            <th className="px-0.5 py-2 border-b">Statut</th>
                            <th className="px-0.5 py-2 border-b">Appareil</th>
                            <th className="px-0.5 py-2 border-b">Note</th>
                            <th className="px-0.5 py-2 border-b">Pochette</th>
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
                                      <td colSpan={10} style={{ height: 10 }} className="p-0" />
                                    </tr>
                                    <tr
                                      className="border-b border-slate-100 cursor-pointer hover:brightness-110"
                                      onClick={() => toggleSubZone(`${group.key}::${subZone}`)}
                                      title={subOpen ? 'Replier cette sous-tâche' : 'Déplier cette sous-tâche'}
                                    >
                                      <td colSpan={10} className="px-2 py-0.5">
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
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              reintegrerTasks(
                                                prepTasks.filter(
                                                  (t) =>
                                                    (t.workArea || 'Autre') === subZone &&
                                                    (t.taskType || 'AUTRE') === 'CORR'
                                                )
                                              )
                                            }}
                                            className="ml-auto text-white/80 hover:text-white"
                                            title={`Réintégrer la sous-tâche ${subZone} dans Tâches`}
                                          >
                                            <Undo2 className="h-4 w-4" />
                                          </button>
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              if (
                                                window.confirm(
                                                  `Supprimer toute la sous-tâche ${subZone} du bloc Found Fault (${subTasks.length} ligne(s)) ?`
                                                )
                                              ) {
                                                removePrepTasksByZone(subZone, 'CORR')
                                              }
                                            }}
                                            className="text-white/80 hover:text-white"
                                            title={`Supprimer toute la sous-tâche ${subZone} (Found Fault)`}
                                          >
                                            <Trash2 className="h-4 w-4" />
                                          </button>
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
                                <td className="px-2 py-2 font-bold text-slate-500">
                                  {task.seq || '-'}
                                </td>
                                <td className="px-2 py-2 font-medium max-w-md truncate" title={task.description}>
                                  {task.description}
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
                                      title="Marquer la tâche COMPLETE"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => updatePrepTask(task.id, { mtxStatus: 'ACTV' })}
                                      className="text-slate-300 hover:text-sky-600 ml-1"
                                      title="Rétablir la tâche ACTV"
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
                                        title={`Dans la pochette « ${p.name} » — cliquez sur la croix pour retirer`}
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
                                      placeholder="+ pochette"
                                      compact
                                      onSelect={(pid) => assignToPocket(pid, [task.id])}
                                    />
                                  </div>
                                </td>
                                <td className="px-2 py-2">
                                  <div className="flex items-center gap-1.5">
                                    <button
                                      onClick={() => reintegrerTasks([task])}
                                      className="text-slate-400 hover:text-emerald-600"
                                      title="Réintégrer cette ligne dans Tâches (annuler le transfert)"
                                    >
                                      <Undo2 className="h-4 w-4" />
                                    </button>
                                    <button
                                      onClick={() => {
                                        if (window.confirm('Supprimer cette ligne ?'))
                                          removePrepTask(task.id)
                                      }}
                                      className="text-slate-400 hover:text-red-600"
                                      title="Supprimer cette ligne"
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
                    Pochette virtuelle · {printTasks.length} / {pocketTaskIds(printPocket).length} ligne(s)
                    sélectionnée(s) · {new Date().toLocaleDateString('fr-FR')}
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
                  <FileDown className="h-4 w-4" /> Exporter en PDF
                </button>
                <button
                  onClick={printPocketPdf}
                  className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-md hover:bg-slate-700 text-sm font-semibold"
                >
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button
                  onClick={() => setPrintPocketId(null)}
                  className="text-slate-500 hover:text-slate-800 p-2 rounded hover:bg-slate-200"
                  title="Fermer"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 flex-1 min-h-0">
              {/* Colonne de gauche : répartition */}
              <div className="w-full sm:w-56 shrink-0 border-r border-slate-100 bg-slate-50 p-4 overflow-y-auto print-hide">
                <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">
                  Répartition par bloc
                </h3>
                {Object.keys(printByBlock).length === 0 ? (
                  <p className="text-sm text-slate-500">Aucune tâche sélectionnée.</p>
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
                        ? 'Tout décocher'
                        : 'Tout cocher'}
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
                            {printByBlock[blk].count} tâche(s)
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
                  <p className="text-sm text-slate-500">Cochez des tâches à gauche pour les inclure.</p>
                ) : (
                  <div className="space-y-5">
                    {Object.keys(printByBlock).map((blk) => (
                      <div key={blk} className="print-pocket-block">
<div
  className="px-3 py-2 rounded-t-md flex items-center justify-between gap-2 flex-wrap text-white font-bold"
  style={{ backgroundColor: getCategoryColor(blk) }}
>
  <span>
    Bloc {getCategoryLabel(blk)} · {printByBlock[blk].count} tâche(s)
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
                                          title="Retirer cette tâche de la pochette"
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
                      Total : {printTasks.length} tâche(s)
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
            ? 'border border-slate-300 rounded-md px-1.5 py-1 text-xs text-slate-700 max-w-[120px] bg-white'
            : dark
              ? 'border border-white/60 rounded-md px-2 py-1.5 text-xs font-medium bg-white text-slate-800 hover:border-white max-w-[200px]'
              : 'border border-slate-300 rounded-md px-2 py-1.5 text-xs font-medium text-slate-700 bg-white hover:border-sky-400 max-w-[200px]'
        }
        title={pockets.length === 0 ? "Créez d'abord une pochette" : placeholder}
      >
        <option value="" className="text-slate-400">
          {pockets.length === 0 ? '— Aucune pochette —' : placeholder}
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
                ? 'inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-bold text-white bg-slate-900 border border-white/90 shadow'
                : 'inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-bold text-sky-950 bg-sky-100 border-2 border-sky-500 shadow-sm'
            }
            title={`Dans la pochette « ${p.name} » (${n}) — cliquez pour retirer`}
          >
            <FolderPlus className={dark ? 'h-3.5 w-3.5 text-sky-300' : 'h-3.5 w-3.5 text-sky-600'} />
            <span>{p.name}</span>
            <span className={dark ? 'opacity-75' : 'text-sky-600'}>({n})</span>
            <button
              onClick={() => onRemove(pid)}
              className="hover:text-red-400 -mr-0.5"
              title={`Retirer de la pochette « ${p.name} »`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        )
      })}
    </span>
  )
}