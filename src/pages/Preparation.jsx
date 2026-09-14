import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
} from '../utils/helpers'
import ManualTaskForm from '../components/ManualTaskForm'
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
} from 'lucide-react'

export default function Preparation() {
  const {
    prepTasks,
    pockets,
    addPrepTasks,
    removePrepTask,
    removePrepTasksByBlock,
    updatePrepTask,
    clearPrepTasks,
    addPocket,
    renamePocket,
    addTasksToPocket,
    removeTasksFromPocket,
    removePocket,
    isAdmin,
    code,
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
  const [noteEditId, setNoteEditId] = useState(null)
  const [noteText, setNoteText] = useState('')
  const [transferPocketId, setTransferPocketId] = useState(null)
  const [transferTargetCode, setTransferTargetCode] = useState('')
  const [transferProfiles, setTransferProfiles] = useState([])
  const [transferring, setTransferring] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  const [transferError, setTransferError] = useState('')

  useEffect(() => {
    if (!isAdmin || !code) return
    profileStore
      .listProfiles(code)
      .then((res) => {
        const list = (res?.profiles || []).filter((p) => p.id !== activeProfile?.id)
        setTransferProfiles(list)
      })
      .catch(() => setTransferProfiles([]))
  }, [isAdmin, code, activeProfile])

  const transferPocket = async (p) => {
    const target = transferProfiles.find((tp) => tp.code === transferTargetCode)
    if (!target) {
      setTransferError('Choisissez un profil destinataire.')
      return
    }
    setTransferring(true)
    setTransferError('')
    setTransferMsg('')
    try {
      const taskIds = new Set(p.taskIds || [])
      const movedTasks = prepTasks.filter((t) => taskIds.has(t.id))
      const tgtRes = await profileStore.adminGetProfileData(code, target.id)
      if (!tgtRes?.ok) {
        setTransferError('Profil destinataire introuvable.')
        setTransferring(false)
        return
      }
      const tgt = tgtRes.profile?.data || {}
      const tgtData = {
        ...tgt,
        pockets: [
          ...(tgt.pockets || []),
          { id: p.id, name: p.name, taskIds: [...taskIds] },
        ],
        prepTasks: [...(tgt.prepTasks || []), ...movedTasks],
      }
      const saved = await profileStore.saveProfileData(
        target.code,
        tgtData,
        tgtRes.profile?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict') {
        setTransferError('Le profil destinataire a été modifié entre-temps. Réessayez.')
      } else if (saved?.error) {
        setTransferError('Échec du transfert.')
      } else {
        removePocket(p.id)
        movedTasks.forEach((t) => removePrepTask(t.id))
        setTransferMsg(`Pochette « ${p.name} » transférée à « ${target.name} ».`)
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
        setPreview(parseExcelRows(rows.slice(1), detected))
      } catch (err) {
        setError(`Erreur lors de la lecture du fichier: ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }, [])

  const handleImport = () => {
    if (!preview.length) return
    addPrepTasks(preview)
    setPreview([])
    setFileName('')
  }

  const toggleBlock = (block) => {
    setCollapsed((prev) =>
      prev.includes(block) ? prev.filter((b) => b !== block) : [...prev, block]
    )
  }

  const blocks = useMemo(() => {
    return [...new Set(prepTasks.map((t) => t.taskType).filter(Boolean))].sort()
  }, [prepTasks])

  // Replie par défaut chaque nouveau bloc (tuiles fermées au chargement)
  useEffect(() => {
    setCollapsed((prev) => [...new Set([...prev, ...blocks])])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks.join('|')])

  // Regrouper par bloc, puis par zone
  const byBlock = useMemo(() => {
    const map = {}
    prepTasks.forEach((t) => {
      const blk = t.taskType || 'AUTRE'
      if (!map[blk]) map[blk] = { zones: {}, totalHours: 0, count: 0 }
      const zone = t.workArea || 'Sans zone'
      if (!map[blk].zones[zone]) map[blk].zones[zone] = []
      map[blk].zones[zone].push(t)
      map[blk].count += 1
      const h = parseFloat(t.scheduledHours)
      if (!isNaN(h)) map[blk].totalHours += h
    })
    // Trier les zones par nom dans chaque bloc
    Object.keys(map).forEach((blk) => {
      map[blk].zones = Object.fromEntries(
        Object.entries(map[blk].zones).sort((a, b) => a[0].localeCompare(b[0]))
      )
    })
    return map
  }, [prepTasks])

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

  const assignBlockToPocket = (pocketId, block) => {
    const ids = prepTasks.filter((t) => (t.taskType || 'AUTRE') === block).map((t) => t.id)
    assignToPocket(pocketId, ids)
  }

  const assignZoneToPocket = (pocketId, block, zone) => {
    const ids = prepTasks
      .filter((t) => (t.taskType || 'AUTRE') === block && (t.workArea || 'Sans zone') === zone)
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
            {blocks.length > 0 && ` · ${blocks.length} blocs`}
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
            <h2 className="text-lg font-semibold">
              Aperçu — {preview.length} lignes chargées
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setPreview([])
                  setFileName('')
                }}
                className="px-4 py-2 rounded-md border border-slate-300 text-sm hover:bg-slate-50"
              >
                Annuler
              </button>
              <button
                onClick={handleImport}
                className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
              >
                Ajouter à la préparation ({preview.length})
              </button>
            </div>
          </div>
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="sticky top-0 bg-slate-50">
                <tr className="text-left">
                  <th className="px-4 py-2 border-b">N°</th>
                  <th className="px-4 py-2 border-b">Sous-tâche</th>
                  <th className="px-4 py-2 border-b">Bloc</th>
                  <th className="px-4 py-2 border-b">Zone</th>
                  <th className="px-4 py-2 border-b">Heures</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((task, idx) => (
                  <tr key={idx} style={{ backgroundColor: `${getCategoryColor(task.taskType)}12` }} className="border-b">
                    <td className="px-4 py-2 text-slate-500">{task.seq || '-'}</td>
                    <td className="px-4 py-2 font-medium max-w-xs truncate" title={task.description}>{task.description}</td>
                    <td className="px-4 py-2">
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: getCategoryColor(task.taskType) }}>
                        {getCategoryLabel(task.taskType) || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2 max-w-[150px] truncate" title={task.workArea}>{task.workArea || '-'}</td>
                    <td className="px-4 py-2">{task.scheduledHours ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                    {isAdmin && (
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
                                <option key={pp.id} value={pp.code}>
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
                            title="Transférer cette pochette (avec ses lignes) à un autre profil — passation de consigne"
                          >
                            Transférer à un autre profil
                          </button>
                        )}
                      </div>
                    )}
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

      {blocks.length === 0 && preview.length === 0 && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <FolderClock className="h-10 w-10 mx-auto text-slate-300 mb-2" />
          Aucune charge de préparation. Chargez le fichier de charge restante ci-dessus.
        </div>
      )}

      {blocks.length > 0 && (
        <div className="grid gap-4">
          {blocks
            .map((blk) => ({ blk, ...byBlock[blk] }))
            .sort((a, b) => b.totalHours - a.totalHours)
            .map(({ blk, zones, totalHours, count }) => {
              const color = getCategoryColor(blk)
              const isCollapsed = collapsed.includes(blk)
              const zoneNames = Object.keys(zones)
              const blockTaskIds = prepTasks
                .filter((t) => (t.taskType || 'AUTRE') === blk)
                .map((t) => t.id)
              const blockCounts = pocketCounts(blockTaskIds)
              return (
                <div key={blk} className="bg-white rounded-xl shadow overflow-hidden">
                  <div
                    className="px-4 sm:px-5 py-3 flex items-center justify-between gap-2 cursor-pointer"
                    style={{ backgroundColor: color }}
                    onClick={() => toggleBlock(blk)}
                  >
                    <div className="flex items-center gap-2">
                      {isCollapsed ? (
                        <ChevronRight className="h-5 w-5 text-white" />
                      ) : (
                        <ChevronDown className="h-5 w-5 text-white" />
                      )}
                      <h2 className="font-bold text-white text-lg">
                        {getCategoryLabel(blk)}{' '}
                        <span className="font-normal opacity-80">({count})</span>
                      </h2>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="bg-white/25 px-2.5 py-1 rounded-full text-xs font-semibold text-white">
                        {formatHours(totalHours)} h
                      </span>
                      <span className="hidden sm:block text-white/90 text-sm">
                        {zoneNames.length} zone{zoneNames.length > 1 ? 's' : ''}
                      </span>
                      <PocketChips
                        dark
                        counts={blockCounts}
                        pocketById={pocketById}
                        onRemove={(pid) => removeScopeFromPocket(pid, blockTaskIds)}
                      />
                      <div onClick={(e) => e.stopPropagation()}>
                        <PocketSelect
                          variant="dark"
                          pockets={pockets}
                          placeholder={`Affecter le bloc ${getCategoryLabel(blk)}...`}
                          onSelect={(pid) => assignBlockToPocket(pid, blk)}
                        />
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          if (window.confirm(`Supprimer tout le bloc ${getCategoryLabel(blk)} (${count} lignes) ?`)) {
                            removePrepTasksByBlock(blk)
                          }
                        }}
                        className="text-white/80 hover:text-white bg-white/10 hover:bg-white/20 p-1.5 rounded"
                        title={`Supprimer le bloc ${getCategoryLabel(blk)}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  {!isCollapsed && (
                    <div className="px-4 sm:px-5 py-2">
                      <ManualTaskForm onAdd={addPrepTasks} defaultBlock={blk} zoneOptions={allZones} existingTasks={prepTasks} />
                    </div>
                  )}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-100">
                      {zoneNames.map((zone) => (
                        <div key={zone} className="py-2">
                          <div
                            className="px-4 sm:px-5 py-1.5 flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide"
                            style={{ color: getZoneColor(zone, allZones) }}
                          >
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: getZoneColor(zone, allZones) }}
                            />
                            {zone}
                            <span className="text-slate-400 font-normal normal-case">
                              ({zones[zone].length})
                            </span>
                            <PocketChips
                              counts={pocketCounts(zones[zone].map((t) => t.id))}
                              pocketById={pocketById}
                              onRemove={(pid) =>
                                removeScopeFromPocket(pid, zones[zone].map((t) => t.id))
                              }
                            />
                            <span className="ml-auto">
                              <PocketSelect
                                pockets={pockets}
                                placeholder="Affecter la zone..."
                                onSelect={(pid) => assignZoneToPocket(pid, blk, zone)}
                              />
                            </span>
                          </div>
                          <ul className="px-4 sm:px-5 divide-y divide-slate-50">
                            {zones[zone].map((task) => {
                              const h = parseFloat(task.scheduledHours)
                              const inPocket = pockets.filter((p) => pocketTaskIds(p).includes(task.id))
                              return (
                                <li key={task.id} className="flex items-center gap-2 py-1.5 group">
                                  <span className="text-xs font-mono text-slate-400 w-12 shrink-0">
                                    {task.seq || '-'}
                                  </span>
                                  <span
                                    className="flex-1 text-sm text-slate-700 truncate"
                                    title={task.description}
                                  >
                                    {task.description}
                                  </span>
                                  {inPocket.length > 0 && (
                                    <span className="shrink-0 flex gap-1">
                                      {inPocket.map((p) => (
                                        <span
                                          key={p.id}
                                          className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-sky-50 text-sky-700 border border-sky-300 rounded text-[10px] font-semibold"
                                          title={`Dans la pochette « ${p.name} » — cliquez pour retirer`}
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
                                    </span>
                                  )}
                                  {noteEditId === task.id ? (
                                    <span className="shrink-0 flex items-center gap-1">
                                      <input
                                        autoFocus
                                        value={noteText}
                                        onChange={(e) => setNoteText(e.target.value)}
                                        placeholder="Note…"
                                        className="border border-slate-300 rounded px-1.5 py-0.5 text-xs w-28"
                                      />
                                      <button
                                        onClick={() => {
                                          updatePrepTask(task.id, { note: noteText.trim() || undefined })
                                          setNoteEditId(null)
                                        }}
                                        className="text-sky-600 hover:text-sky-800"
                                        title="Enregistrer la note"
                                      >
                                        <Check className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setNoteEditId(null)}
                                        className="text-slate-400 hover:text-slate-600"
                                        title="Annuler"
                                      >
                                        <X className="h-3.5 w-3.5" />
                                      </button>
                                    </span>
                                  ) : (
                                    <span className="shrink-0 flex items-center gap-1">
                                      {task.note ? (
                                        <span
                                          className="inline-flex items-center max-w-[110px] truncate bg-amber-50 text-amber-800 border border-amber-200 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                          title={task.note}
                                        >
                                          {task.note}
                                        </span>
                                      ) : null}
                                      <button
                                        onClick={() => {
                                          setNoteEditId(task.id)
                                          setNoteText(task.note || '')
                                        }}
                                        className="inline-flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-300 hover:bg-amber-100 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                                        title="Ajouter / modifier la note"
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                        {task.note ? 'Note' : 'Ajouter une note'}
                                      </button>
                                    </span>
                                  )}
                                  <span className="text-xs text-slate-500 shrink-0 w-14 text-right hidden sm:block">
                                    {!isNaN(h) ? `${formatHours(h)} h` : ''}
                                  </span>
                                  <PocketSelect
                                    pockets={pockets}
                                    placeholder="+ pochette"
                                    compact
                                    onSelect={(pid) => assignToPocket(pid, [task.id])}
                                  />
                                  <button
                                    onClick={() => {
                                      if (window.confirm('Supprimer cette ligne ?')) removePrepTask(task.id)
                                    }}
                                    className="text-slate-300 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                                    title="Supprimer cette ligne"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                </li>
                              )
                            })}
                          </ul>
                        </div>
                      ))}
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