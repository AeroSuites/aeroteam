import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import {
  getCategoryColor,
  getCategoryLabel,
  getZoneColor,
  cleanShortValue,
  cleanTaskText,
  priorityToken,
} from '../utils/helpers'
import {
  CheckCircle2,
  RotateCcw,
  Pause,
  Play,
  FileText,
  ListChecks,
  X,
  ClipboardList,
  StickyNote,
  ChevronDown,
  ChevronRight,
  History,
} from 'lucide-react'

const formatChargeDate = (iso) => {
  if (!iso) return ''
  const d = new Date(`${iso}T12:00:00`)
  if (isNaN(d)) return iso
  const s = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

const statusPill = (status) =>
  status === 'ACTV'
    ? 'bg-green-100 text-green-700'
    : status === 'PAUSE'
    ? 'bg-amber-100 text-amber-700'
    : status === 'COMPLETE'
    ? 'bg-green-800 text-white'
    : 'bg-slate-100 text-slate-700'

export default function MaCharge() {
  const { charge, chargeHistory, updateChargeTask, updateChargeTasks, activeProfile } = useApp()
  const [descTask, setDescTask] = useState(null)
  const [openNoteId, setOpenNoteId] = useState(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [openHistory, setOpenHistory] = useState([])

  const tasks = useMemo(
    () => (charge && Array.isArray(charge.tasks) ? charge.tasks : []),
    [charge]
  )

  const groups = useMemo(() => {
    const byBlock = {}
    tasks.forEach((t) => {
      const b = t.taskType || 'AUTRE'
      const z = t.workArea || 'Autre'
      if (!byBlock[b]) byBlock[b] = {}
      if (!byBlock[b][z]) byBlock[b][z] = []
      byBlock[b][z].push(t)
    })
    return Object.entries(byBlock)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([block, zones]) => ({
        block,
        zones: Object.entries(zones)
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([zone, list]) => ({
            zone,
            tasks: [...list].sort((x, y) => Number(x.seq) - Number(y.seq)),
          })),
      }))
  }, [tasks])

  const done = tasks.filter((t) => t.mtxStatus === 'COMPLETE').length
  const paused = tasks.filter((t) => t.mtxStatus === 'PAUSE').length
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0

  const applyStatus = (list, status) =>
    updateChargeTasks(list.map((t) => t.id), { mtxStatus: status })

  const toggleNote = (t) => {
    if (openNoteId === t.id) {
      setOpenNoteId(null)
      setNoteDraft('')
      return
    }
    setOpenNoteId(t.id)
    setNoteDraft(t.note || '')
  }

  const saveNote = (taskId) => {
    updateChargeTask(taskId, { note: noteDraft.trim() || undefined })
    setOpenNoteId(null)
    setNoteDraft('')
  }

  const removeNote = (taskId) => {
    updateChargeTask(taskId, { note: undefined })
    setOpenNoteId(null)
    setNoteDraft('')
  }

  if (!charge) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Ma charge</h1>
          <p className="text-slate-600 mt-1">Charge de travail envoyée par votre leader</p>
        </div>
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <ClipboardList className="h-10 w-10 mx-auto text-slate-300 mb-3" />
          <p>Aucune charge reçue pour le moment.</p>
          <p className="text-sm text-slate-400 mt-1">
            Votre leader vous enverra votre charge de travail (date, avion, tâches).
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Ma charge</h1>
        <p className="text-slate-600 mt-1">
          Envoyée par {charge.leaderName || 'votre leader'}
          {charge.teamName ? ` · équipe ${charge.teamName}` : ''}
        </p>
      </div>

      {/* Bandeau : date · avion · équipe · progression */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-bold text-slate-900 text-lg">
              {formatChargeDate(charge.date)}
            </p>
            <p className="text-sm text-slate-600">
              ✈ {charge.aircraft || activeProfile?.aircraft || '—'}
              {charge.teamName ? ` · ${charge.teamName}` : ''}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-semibold text-slate-700">
              {done} / {tasks.length} faite{tasks.length > 1 ? 's' : ''}
              {paused > 0 ? ` · ${paused} en pause` : ''}
            </p>
            <p className="text-xs text-slate-400">
              {pct}% {charge.sentAt ? `· reçue le ${charge.sentAt.slice(0, 10)}` : ''}
            </p>
          </div>
        </div>
        <div className="mt-3 h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Consignes du jour reçues avec la charge */}
      {(charge.consignes || []).length > 0 && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2 mb-3">
            <ClipboardList className="h-4 w-4 text-amber-500" /> Consignes du jour
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {(charge.consignes || []).map((c, i) => (
              <div key={i} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                <p className="text-xs font-bold text-amber-800">
                  {String(c.title || '').replace('[C] ', '')}
                </p>
                <div className="mt-1 space-y-0.5">
                  {String(c.content || '')
                    .split('\n')
                    .map((line, li) => (
                      <p
                        key={li}
                        className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap"
                      >
                        {line || '\u00A0'}
                      </p>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Charge de travail */}
      {groups.map(({ block, zones }) => (
        <div key={block} className="bg-white rounded-xl shadow overflow-hidden">
          <div
            className="px-4 py-2 flex items-center justify-between gap-2 flex-wrap"
            style={{ backgroundColor: getCategoryColor(block) }}
          >
            <span className="font-bold text-white text-sm">
              {getCategoryLabel(block)}{' '}
              <span className="font-normal opacity-80">
                ({zones.reduce((n, z) => n + z.tasks.length, 0)})
              </span>
            </span>
            <span className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  const all = zones.flatMap((z) => z.tasks)
                  const allDone = all.every((t) => t.mtxStatus === 'COMPLETE')
                  applyStatus(all, allDone ? 'ACTV' : 'COMPLETE')
                }}
                className="bg-white/20 hover:bg-white/50 rounded-full pl-1 pr-1.5 py-0.5 text-white inline-flex items-center gap-0.5"
                title="Marquer tout le bloc COMPLETE (ou rétablir ACTV)"
              >
                <CheckCircle2 className="h-3 w-3" />
                <span className="text-[10px] font-bold whitespace-nowrap">COMPLETE</span>
              </button>
            </span>
          </div>
          {zones.map(({ zone, tasks: zoneTasks }) => {
            const zoneAllDone =
              zoneTasks.length > 0 && zoneTasks.every((t) => t.mtxStatus === 'COMPLETE')
            return (
              <div key={zone} className="border-b border-slate-100 last:border-b-0">
                <div
                  className="px-3 py-1.5 flex items-center justify-between gap-2"
                  style={{ backgroundColor: `${getZoneColor(zone)}14` }}
                >
                  <span className="text-xs font-bold" style={{ color: getZoneColor(zone) }}>
                    📍 {zone}{' '}
                    <span className="font-normal opacity-70">({zoneTasks.length})</span>
                  </span>
                  <button
                    onClick={() =>
                      applyStatus(zoneTasks, zoneAllDone ? 'ACTV' : 'COMPLETE')
                    }
                    className={`inline-flex items-center gap-0.5 text-[10px] font-bold border rounded-full px-1.5 py-0.5 ${
                      zoneAllDone
                        ? 'text-amber-700 border-amber-300 hover:bg-amber-50'
                        : 'text-green-700 border-green-300 hover:bg-green-50'
                    }`}
                    title={
                      zoneAllDone
                        ? 'Rétablir toute la sous-tâche en ACTV'
                        : 'Marquer toute la sous-tâche COMPLETE'
                    }
                  >
                    {zoneAllDone ? (
                      <RotateCcw className="h-3 w-3" />
                    ) : (
                      <CheckCircle2 className="h-3 w-3" />
                    )}
                    {zoneAllDone ? 'ACTV' : 'COMPLETE'}
                  </button>
                </div>
                <ul className="divide-y divide-slate-50">
                  {zoneTasks.map((t) => {
                    const tok = priorityToken(`${t.description || ''} ${t.taskBarcode || ''}`)
                    return (
                      <li key={t.id}>
                        <div className="flex items-center gap-2 px-3 py-2 text-sm">
                        <span className="w-10 shrink-0 font-mono font-bold text-slate-500">
                          {cleanShortValue(t.seq) || '—'}
                        </span>
                        {t.taskBarcode && (
                          <span className="shrink-0 font-mono text-[10px] font-bold text-sky-700 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5">
                            {t.taskBarcode}
                          </span>
                        )}
                        <span
                          className={`flex-1 min-w-0 truncate text-slate-700 ${
                            t.taskDescription || t.taskSteps
                              ? 'cursor-pointer hover:underline decoration-dotted'
                              : ''
                          }`}
                          title={t.description}
                          onClick={() =>
                            (t.taskDescription || t.taskSteps) && setDescTask(t)
                          }
                        >
                          {t.description}
                        </span>
                        {tok && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                            {tok}
                          </span>
                        )}
                        {(t.taskDescription || t.taskSteps) && (
                          <FileText className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                        )}
                        {t.note ? (
                          <button
                            onClick={() => toggleNote(t)}
                            className={`shrink-0 inline-flex items-center gap-0.5 border rounded-full px-1.5 py-0.5 ${
                              openNoteId === t.id
                                ? 'bg-amber-200 border-amber-400 text-amber-900'
                                : 'bg-amber-50 border-amber-300 text-amber-800 hover:bg-amber-100'
                            }`}
                            title="Note enregistrée — afficher / masquer l'éditeur"
                          >
                            <StickyNote className="h-3.5 w-3.5 shrink-0" />
                            {openNoteId === t.id ? (
                              <ChevronDown className="h-3 w-3 shrink-0" />
                            ) : (
                              <ChevronRight className="h-3 w-3 shrink-0" />
                            )}
                          </button>
                        ) : (
                          <button
                            onClick={() => toggleNote(t)}
                            className={`shrink-0 inline-flex items-center justify-center border rounded-full p-1 ${
                              openNoteId === t.id
                                ? 'bg-amber-100 border-amber-300 text-amber-800'
                                : 'text-slate-300 border-transparent hover:text-amber-700'
                            }`}
                            title="Ajouter une note"
                          >
                            <StickyNote className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <span className="shrink-0 flex items-center gap-1">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusPill(
                              t.mtxStatus
                            )}`}
                          >
                            {t.mtxStatus || '—'}
                          </span>
                          {t.mtxStatus !== 'COMPLETE' ? (
                            <button
                              onClick={() => updateChargeTask(t.id, { mtxStatus: 'COMPLETE' })}
                              className="text-slate-300 hover:text-green-600"
                              title="Marquer COMPLETE"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => updateChargeTask(t.id, { mtxStatus: 'ACTV' })}
                              className="text-slate-300 hover:text-sky-600"
                              title="Rétablir ACTV"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                          )}
                          {t.mtxStatus !== 'PAUSE' ? (
                            <button
                              onClick={() => updateChargeTask(t.id, { mtxStatus: 'PAUSE' })}
                              className="text-slate-300 hover:text-amber-600"
                              title="Mettre en PAUSE"
                            >
                              <Pause className="h-4 w-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => updateChargeTask(t.id, { mtxStatus: 'ACTV' })}
                              className="text-slate-300 hover:text-green-600"
                              title="Reprendre (ACTV)"
                            >
                              <Play className="h-4 w-4" />
                            </button>
                          )}
                        </span>
                        </div>
                        {openNoteId === t.id && (
                          <div className="px-3 pb-3">
                            <textarea
                              autoFocus
                              value={noteDraft}
                              onChange={(e) => setNoteDraft(e.target.value)}
                              rows={3}
                              placeholder="Note pour le leader (avancement, pièce manquante, remarque…)"
                              className="w-full border border-amber-300 rounded-md px-3 py-2 text-sm resize-y"
                            />
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={() => saveNote(t.id)}
                                className="bg-amber-500 text-white px-3 py-1.5 rounded-md hover:bg-amber-600 text-xs font-semibold"
                              >
                                Enregistrer
                              </button>
                              {t.note && (
                                <button
                                  onClick={() => removeNote(t.id)}
                                  className="text-red-600 border border-red-200 hover:bg-red-50 rounded-md px-3 py-1.5 text-xs"
                                >
                                  Supprimer
                                </button>
                              )}
                              <button
                                onClick={() => {
                                  setOpenNoteId(null)
                                  setNoteDraft('')
                                }}
                                className="text-slate-500 hover:text-slate-800 px-2 py-1.5 text-xs"
                              >
                                Fermer
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </div>
      ))}

      {/* Charges précédentes (archives) */}
      <div className="bg-white rounded-xl shadow overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b bg-slate-50/50">
            <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
              <History className="h-4 w-4 text-slate-500" /> Charges précédentes (
              {chargeHistory.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Les 10 dernières charges retirées ou remplacées — clique pour voir les lignes.
            </p>
          </div>
          {chargeHistory.length === 0 && (
            <p className="px-4 sm:px-5 py-4 text-sm text-slate-400 italic">
              Aucune charge précédente pour le moment.
            </p>
          )}
          <ul className="divide-y divide-slate-100">
            {chargeHistory.map((h, i) => {
              const list = Array.isArray(h.tasks) ? h.tasks : []
              const done = list.filter((t) => t.mtxStatus === 'COMPLETE').length
              const open = openHistory.includes(i)
              return (
                <li key={i}>
                  <button
                    onClick={() =>
                      setOpenHistory((prev) =>
                        prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]
                      )
                    }
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-slate-50"
                  >
                    {open ? (
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <span className="font-semibold text-slate-700 shrink-0">
                      {formatChargeDate(h.date)}
                    </span>
                    <span className="text-slate-500 truncate">
                      {h.aircraft ? `✈ ${h.aircraft}` : ''}
                      {h.teamName ? ` · ${h.teamName}` : ''}
                    </span>
                    <span className="ml-auto shrink-0 text-xs font-bold text-slate-500">
                      {done}/{list.length} {list.length > 0 && done === list.length ? '✓' : ''}
                    </span>
                  </button>
                  {open && (
                    <ul className="px-4 pb-3 space-y-0.5">
                      {list.map((t) => (
                        <li key={t.id} className="flex items-center gap-2 text-xs text-slate-600">
                          <span className="w-10 shrink-0 font-mono font-bold text-slate-400">
                            {cleanShortValue(t.seq) || '—'}
                          </span>
                          <span className="flex-1 min-w-0 truncate" title={t.description}>
                            {t.description}
                          </span>
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${statusPill(
                              t.mtxStatus
                            )}`}
                          >
                            {t.mtxStatus || '—'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              )
            })}
          </ul>
      </div>

      {/* Popup description / étapes */}
      {descTask && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDescTask(null)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-start justify-between gap-3 bg-slate-900 text-white rounded-t-xl">
              <div className="min-w-0">
                <h2 className="font-bold truncate">
                  N° {cleanShortValue(descTask.seq) || '—'} · {descTask.description}
                </h2>
                <p className="text-xs text-slate-300 truncate">
                  {[
                    descTask.taskBarcode ? `TRFX ${descTask.taskBarcode}` : '',
                    descTask.registration || '',
                    descTask.workArea || '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <button
                onClick={() => setDescTask(null)}
                className="text-slate-300 hover:text-white shrink-0"
                title="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-5 overflow-y-auto space-y-4 bg-slate-50">
              {descTask.taskDescription && (
                <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-sky-600" />
                    <p className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                      Description détaillée
                    </p>
                  </div>
                  <p className="p-3 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                    {cleanTaskText(descTask.taskDescription)}
                  </p>
                </div>
              )}
              {descTask.taskSteps && (
                <div className="bg-white border border-emerald-200 rounded-lg overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-200 flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-emerald-600" />
                    <p className="text-[11px] font-bold text-emerald-700 uppercase tracking-wide">
                      Étapes (Task Steps)
                    </p>
                  </div>
                  <p className="p-3 whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">
                    {cleanTaskText(descTask.taskSteps)}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
