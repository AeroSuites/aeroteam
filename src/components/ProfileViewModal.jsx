import { useEffect, useState } from 'react'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as profileStore from '../lib/profileStore'
import {
  getCategoryColor,
  getCategoryLabel,
  getZoneColor,
  hexToRgb,
  makeId,
  isAssignedTo,
} from '../utils/helpers'
import { openPdfPrint, downloadPdfAsJpeg } from '../utils/pdfPrint'
import { X, UserCog, Users, ClipboardList, FileDown, Printer, Eraser, FileImage, RotateCcw, FolderKanban } from 'lucide-react'

function StatBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 text-center">
      <div className="text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  )
}

const groupBySubTask = (tasks) => {
  const groups = {}
  tasks.forEach((t) => {
    const z = t.workArea || 'Autre'
    if (!groups[z]) groups[z] = []
    groups[z].push(t)
  })
  return Object.entries(groups).sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0])
  )
}

const groupByBlock = (tasks) => {
  const by = {}
  tasks.forEach((t) => {
    const b = t.taskType || 'AUTRE'
    if (!by[b]) by[b] = []
    by[b].push(t)
  })
  return Object.entries(by).sort((a, b) => b[1].length - a[1].length)
}

// Sous-tâches groupées ensemble d'abord, blocs à l'intérieur
const groupTeamTasks = (teamTasks) => {
  const zones = {}
  teamTasks.forEach((t) => {
    const z = t.workArea || 'Autre'
    if (!zones[z]) zones[z] = []
    zones[z].push(t)
  })
  return Object.entries(zones)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))
    .map(([zone, tasks]) => ({ zone, blocks: groupByBlock(tasks) }))
}

function profileTitle(profile) {
  const air = profile?.aircraft || ''
  const name = profile?.name || ''
  if (air && name.includes(air)) return name
  return air ? `${name}  ·  ${air}` : name
}

function buildRecapPdf(profile, data) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const assignedCount = Object.keys(data?.assignments || {}).filter((id) =>
    Array.isArray(data.assignments[id])
      ? data.assignments[id].length > 0
      : data.assignments[id]
  ).length
  const notes = (data?.notes || []).filter((n) =>
    String(n.title || '').startsWith('[C] ')
  )

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(profileTitle(profile), margin, 15)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${(data?.tasks || []).length} tâches · ${assignedCount} affectées · ${
      (data?.tasks || []).length - assignedCount
    } non affectées · ${(data?.members || []).length} membres · ${new Date().toLocaleDateString('fr-FR')}`,
    margin,
    21
  )

  let y = 28

  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 15) {
      doc.addPage()
      y = 14
    }
  }

  // Consignes
  if (notes.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Consignes', margin, y)
    y += 6
    notes.forEach((n) => {
      ensureRoom(12)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'bold')
      doc.text(String(n.title).replace('[C] ', ''), margin, y)
      y += 4
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(n.content || '', contentWidth)
      lines.forEach((line) => {
        ensureRoom(4)
        doc.text(line, margin, y)
        y += 4
      })
      y += 3
    })
  } else {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text('Aucune consigne importée.', margin, y)
    y += 8
  }

  // Équipes
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  ensureRoom(12)
  doc.text(`Équipes (${(data?.teams || []).length})`, margin, y)
  y += 6

  ;(data?.teams || []).forEach((team) => {
    const teamTasks = (data?.tasks || []).filter((t) =>
      isAssignedTo(data.assignments, t.id, team.id)
    )
    ensureRoom(16)
    doc.setFillColor(...hexToRgb(team.color || '#64748b'))
    doc.rect(margin, y - 4.5, contentWidth, 7, 'F')
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(
      `${team.name} · ${teamTasks.length} tâche${teamTasks.length > 1 ? 's' : ''}`,
      margin + 2,
      y
    )
    doc.setTextColor(0, 0, 0)
    y += 3
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const memberLine = team.members.join(', ') || '—'
    doc.text(`Membres : ${memberLine}`, margin, y + 4)
    y += 7
    groupByBlock(teamTasks).forEach(([blk, tasks]) => {
      ensureRoom(12)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.text(
        `${getCategoryLabel(blk)} (${tasks.length})`,
        margin + 2,
        y
      )
      y += 3
      groupBySubTask(tasks).forEach(([zone, zoneTasks]) => {
        autoTable(doc, {
          startY: y,
          pageBreak: 'auto',
          margin: { left: margin + 4, right: margin },
          head: [
            [
              {
                content: `${zone} (${zoneTasks.length})`,
                colSpan: 3,
                styles: {
                  fillColor: [...hexToRgb(getZoneColor(zone)), 35],
                  textColor: [15, 23, 42],
                  fontStyle: 'bold',
                  fontSize: 8,
                },
              },
            ],
          ],
          body: zoneTasks.map((t) => [
            t.seq !== undefined && t.seq !== '' ? String(t.seq) : '—',
            t.description || '',
            t.registration || '',
          ]),
          styles: { fontSize: 7.5, cellPadding: 1, textColor: [0, 0, 0], fontStyle: 'bold' },
          columnStyles: {
            0: { cellWidth: 12 },
            2: { cellWidth: 22 },
          },
        })
        y = doc.lastAutoTable.finalY + 3
        ensureRoom(6)
      })
    })
    y += 4
  })

  return doc
}

function exportRecapPdf(profile, data) {
  const doc = buildRecapPdf(profile, data)
  doc.save(
    `recap-${(profile.name || 'profil')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'profil'}-${new Date().toISOString().slice(0, 10)}.pdf`
  )
}

function exportRecapJpeg(profile, data) {
  downloadPdfAsJpeg(buildRecapPdf(profile, data), `recap-${profile.name || 'profil'}.pdf`)
}

export default function ProfileViewModal({ profile, adminCode, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')
  const [purging, setPurging] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [transferFor, setTransferFor] = useState(null)
  const [transferTargetCode, setTransferTargetCode] = useState('')
  const [transferring, setTransferring] = useState(false)
  const [transferMsg, setTransferMsg] = useState('')
  const [transferError, setTransferError] = useState('')
  const [otherProfiles, setOtherProfiles] = useState([])

  useEffect(() => {
    if (!profile || !adminCode) return
    profileStore
      .listProfiles(adminCode)
      .then((res) => {
        const list = (res?.profiles || []).filter((p) => p.id !== profile.id)
        setOtherProfiles(list)
      })
      .catch(() => setOtherProfiles([]))
  }, [profile, adminCode])

  const transferPocket = async (pocket) => {
    const target = otherProfiles.find((p) => p.code === transferTargetCode)
    if (!target) {
      setTransferError('Choisissez un profil destinataire.')
      return
    }
    setTransferring(true)
    setTransferError('')
    setTransferMsg('')
    try {
      const [srcRes, tgtRes] = await Promise.all([
        profileStore.adminGetProfileData(adminCode, profile.id),
        profileStore.adminGetProfileData(adminCode, target.id),
      ])
      const src = srcRes?.profile?.data || {}
      const tgt = tgtRes?.profile?.data || {}
      const pocketObj = (src.pockets || []).find((p) => p.id === pocket.id)
      const taskIds = new Set(pocketObj?.taskIds || [])
      const copiedTasks = (src.prepTasks || [])
        .filter((t) => taskIds.has(t.id))
        .map((t) => ({ ...t, id: makeId('prep') }))
      const tgtData = {
        ...tgt,
        pockets: [
          ...(tgt.pockets || []),
          {
            id: makeId('pocket'),
            name: (pocketObj || pocket).name,
            taskIds: copiedTasks.map((t) => t.id),
          },
        ],
        prepTasks: [...(tgt.prepTasks || []), ...copiedTasks],
      }
      const saved = await profileStore.saveProfileData(
        target.code,
        tgtData,
        tgtRes?.profile?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict') {
        setTransferError('Le profil destinataire a été modifié entre-temps. Réessayez.')
      } else if (saved?.error) {
        setTransferError('Échec de la copie.')
      } else {
        setTransferMsg(`Pochette « ${pocket.name} » copiée vers « ${target.name} ».`)
        setTransferFor(null)
        setTransferTargetCode('')
      }
    } catch {
      setTransferError('Échec de la copie (hors ligne ?).')
    }
    setTransferring(false)
  }

  useEffect(() => {
    if (!profile) return
    let cancelled = false
    // eslint-disable-next-line react/set-state-in-effect -- réinitialisation à l'ouverture du modal
    setData(null)
    setError('')
    setMsg('')
    setLoading(true)
    profileStore
      .adminGetProfileData(adminCode, profile.id)
      .then((res) => {
        if (cancelled) return
        if (res?.error) setError('Impossible de lire le profil.')
        else setData(res.profile?.data || {})
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de lire le profil (hors ligne ?).')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [profile, adminCode])

  const handlePurge = async () => {
    if (
      !window.confirm(
        'Supprimer les consignes [C] des jours déjà passés (vous gardez aujourd’hui et les jours à venir) ? Cette action est irréversible.'
      )
    ) {
      return
    }
    setPurging(true)
    setError('')
    try {
      const res = await profileStore.adminPurgeConsignes(adminCode, profile.id)
      if (res?.ok) {
        const fresh = await profileStore.adminGetProfileData(adminCode, profile.id)
        if (fresh?.ok) setData(fresh.profile?.data || {})
      } else setError(res?.error === 'not_admin' ? "Votre code administrateur n'est plus valide." : 'Échec de la purge.')
    } catch {
      setError('Échec de la purge (hors ligne ?).')
    }
    setPurging(false)
  }

  const handleResetWork = async () => {
    if (!profile?.code) {
      setError("Le code de ce profil n'est pas disponible (migration à exécuter ?).")
      return
    }
    if (
      !window.confirm(
        "Réinitialiser le travail de ce profil ?\n\nTâches, équipes, affectations, préparation, consignes et membres assignés à l'avion du jour seront effacés, et l'avion associé sera retiré.\nLes membres permanents et les notes du Bloc-notes sont conservés. Action irréversible."
      )
    ) {
      return
    }
    setResetting(true)
    setError('')
    setMsg('')
    try {
      const fresh = await profileStore.adminGetProfileData(adminCode, profile.id)
      const d = fresh?.profile?.data || data || {}
      const cleared = {
        tasks: [],
        teams: [],
        assignments: {},
        members: d.members || [],
        dayMembers: [],
        prepTasks: [],
        notes: (d.notes || []).filter(
          (n) => !String(n.title || '').startsWith('[C] ')
        ),
        pockets: [],
      }
      const saved = await profileStore.saveProfileData(
        profile.code,
        cleared,
        fresh?.profile?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict') {
        setError('Le profil a été modifié entre-temps. Réessayez.')
      } else if (saved?.error) {
        setError('Échec de la réinitialisation.')
      } else {
        try {
          await profileStore.adminSetProfileAircraft(adminCode, profile.code, '')
        } catch {
          // l'avion pourra être retiré manuellement
        }
        const again = await profileStore.adminGetProfileData(adminCode, profile.id)
        if (again?.ok) {
          setData(again.profile?.data || {})
          setMsg('Réinitialisation effectuée (membres permanents conservés, avion retiré).')
        }
      }
    } catch {
      setError('Échec de la réinitialisation (hors ligne ?).')
    }
    setResetting(false)
  }

  if (!profile) return null

  const assignedCount = Object.keys(data?.assignments || {}).filter((id) =>
    Array.isArray(data.assignments[id])
      ? data.assignments[id].length > 0
      : data.assignments[id]
  ).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-4xl flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2 bg-slate-900 text-white rounded-t-xl">
          <h2 className="font-bold flex items-center gap-2">
            <UserCog className="h-5 w-5 text-sky-400" />
            <span className="truncate">{profileTitle(profile)}</span>
          </h2>
          <div className="flex items-center gap-2">
            {data && (
              <>
                <button
                  onClick={() => exportRecapPdf(profile, data)}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
                  title="Télécharger le récap en PDF"
                >
                  <FileDown className="h-4 w-4" /> Exporter PDF
                </button>
                <button
                  onClick={() => exportRecapJpeg(profile, data)}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
                  title="Télécharger le récap en image JPEG"
                >
                  <FileImage className="h-4 w-4" /> JPEG
                </button>
                <button
                  onClick={() => openPdfPrint(buildRecapPdf(profile, data))}
                  className="bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5"
                  title="Imprimer le récap au format PDF"
                >
                  <Printer className="h-4 w-4" /> Imprimer
                </button>
                <button
                  onClick={handleResetWork}
                  disabled={resetting}
                  className="bg-red-500/30 hover:bg-red-500/50 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  title="Efface le travail (tâches, équipes, affectations, préparation, membres du jour) — membres permanents et consignes conservés"
                >
                  <RotateCcw className="h-4 w-4" />{' '}
                  {resetting ? 'Réinitialisation…' : 'Réinitialiser le travail'}
                </button>
                <button
                  onClick={handlePurge}
                  disabled={purging}
                  className="bg-red-500/30 hover:bg-red-500/50 text-white px-3 py-1.5 rounded-md text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  title="Supprime les consignes [C] des jours déjà écoulés de la semaine (hier et avant) — aujourd'hui et les jours suivants sont conservés"
                >
                  <Eraser className="h-4 w-4" />{' '}
                  {purging ? 'Purge…' : 'Purger les consignes passées'}
                </button>
              </>
            )}
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1" title="Fermer">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          {loading && <p className="text-sm text-slate-400">Chargement…</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}

          {data && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <StatBox label="Tâches" value={(data.tasks || []).length} />
                <StatBox label="Affectées" value={assignedCount} />
                <StatBox label="Non affectées" value={(data.tasks || []).length - assignedCount} />
                <StatBox label="Membres" value={(data.members || []).length} />
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-amber-500" /> Consignes (
                  {(data.notes || []).filter((n) => String(n.title || '').startsWith('[C] ')).length})
                </h3>
                {(data.notes || [])
                  .filter((n) => String(n.title || '').startsWith('[C] ')).length === 0 && (
                  <p className="text-sm text-slate-400 italic">
                    Aucune consigne importée pour ce profil.
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {(data.notes || [])
                    .filter((n) => String(n.title || '').startsWith('[C] '))
                    .sort((a, b) => String(a.title).localeCompare(String(b.title)))
                    .map((n) => (
                      <div key={n.id} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
                        <p className="text-xs font-bold text-amber-800">
                          {String(n.title).replace('[C] ', '')}
                        </p>
                        <p className="whitespace-pre-wrap text-xs text-slate-700 mt-1 leading-relaxed">
                          {n.content || '—'}
                        </p>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <FolderKanban className="h-4 w-4 text-emerald-500" /> Pochettes (
                  {(data.pockets || []).length})
                </h3>
                {transferMsg && <p className="text-sm text-emerald-700 mb-2">{transferMsg}</p>}
                {transferError && <p className="text-sm text-red-600 mb-2">{transferError}</p>}
                {(data.pockets || []).length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    Aucune pochette virtuelle (créées dans Préparation vac suivante).
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {(data.pockets || []).map((p) => {
                      const count = (p.taskIds || []).length
                      return (
                        <li
                          key={p.id}
                          className="flex flex-wrap items-center justify-between gap-2 border border-slate-200 rounded-lg px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="font-medium text-sm">{p.name}</span>
                            <span className="ml-2 text-xs text-slate-400">{count} ligne(s)</span>
                          </div>
                          {transferFor === p.id ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <select
                                value={transferTargetCode}
                                onChange={(e) => setTransferTargetCode(e.target.value)}
                                className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                              >
                                <option value="">— Profil destinataire —</option>
                                {otherProfiles.map((pp) => (
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
                                {transferring ? 'Copie…' : 'Copier'}
                              </button>
                              <button
                                onClick={() => {
                                  setTransferFor(null)
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
                                setTransferFor(p.id)
                                setTransferTargetCode('')
                                setTransferMsg('')
                                setTransferError('')
                              }}
                              disabled={otherProfiles.length === 0}
                              className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-3 py-1 disabled:opacity-50"
                              title={
                                otherProfiles.length === 0
                                  ? 'Aucun autre profil disponible'
                                  : 'Copier cette pochette (avec ses lignes) vers un autre profil — le profil d’origine la garde'
                              }
                            >
                              Copier vers un autre profil
                            </button>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              <div>
                <h3 className="font-semibold text-slate-800 mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-sky-500" /> Équipes du profil (
                  {(data.teams || []).length})
                </h3>
                {(data.teams || []).length === 0 && (
                  <p className="text-sm text-slate-400 italic">
                    Aucune équipe créée — le leader monte ses équipes dans la page « Équipes » de
                    son profil.
                  </p>
                )}
                <div className="grid gap-3 md:grid-cols-2">
                  {(data.teams || []).map((team) => {
                    const teamTasks = (data.tasks || []).filter((t) =>
                      isAssignedTo(data.assignments, t.id, team.id)
                    )
                    const zoneGroups = groupTeamTasks(teamTasks)
                    return (
                      <div
                        key={team.id}
                        className="border border-slate-200 rounded-lg overflow-hidden"
                      >
                        <div
                          className="px-3 py-2 flex items-center justify-between gap-2 text-white"
                          style={{ backgroundColor: team.color || '#64748b' }}
                        >
                          <span className="font-bold text-sm truncate">{team.name}</span>
                          <span className="text-xs opacity-90 shrink-0">
                            {teamTasks.length} tâche{teamTasks.length > 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="p-3">
                          <div className="flex flex-wrap gap-1">
                            {team.members.length === 0 && (
                              <span className="text-xs text-slate-400 italic">—</span>
                            )}
                            {team.members.map((m, i) => (
                              <span
                                key={i}
                                className="bg-slate-100 text-slate-700 rounded-full px-2 py-0.5 text-[11px]"
                              >
                                {m}
                              </span>
                            ))}
                          </div>
                          {teamTasks.length > 0 && (
                            <div className="mt-2 space-y-2 max-h-72 overflow-y-auto">
                              {zoneGroups.map(({ zone, blocks }) => (
                                <div key={zone}>
                                  <p className="mb-1 inline-flex items-center gap-1.5">
                                    <span
                                      className="text-[10px] font-bold text-white rounded-full px-2 py-0.5 shadow-sm"
                                      style={{ backgroundColor: getZoneColor(zone) }}
                                    >
                                      {zone}
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-semibold">
                                      {blocks.reduce((a, [, b]) => a + b.length, 0)}
                                    </span>
                                  </p>
                                  <div className="space-y-1.5 pl-1">
                                    {blocks.map(([blk, tasks]) => (
                                      <div key={blk}>
                                        <div className="flex items-center gap-1.5 mb-0.5">
                                          <span
                                            className="text-[10px] font-bold text-white rounded-full px-2 py-0.5"
                                            style={{ backgroundColor: getCategoryColor(blk) }}
                                          >
                                            {getCategoryLabel(blk)}
                                          </span>
                                          <span className="text-[10px] text-slate-400">
                                            {tasks.length}
                                          </span>
                                        </div>
                                        <ul className="space-y-0.5 mb-1">
                                          {tasks.map((t) => (
                                            <li
                                              key={t.id}
                                              className="text-[11px] text-slate-600 flex gap-1.5"
                                            >
                                              <span className="font-mono font-bold shrink-0">
                                                {t.seq || '—'}
                                              </span>
                                              <span className="truncate" title={t.description}>
                                                {t.description}
                                              </span>
                                              {t.registration && (
                                                <span className="shrink-0 ml-auto font-mono text-[10px] font-bold text-sky-700">
                                                  ✈ {t.registration}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}