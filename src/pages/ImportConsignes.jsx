import TaskTreeSelect, { groupTasksTree } from '../components/TaskTreeSelect'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import {
  parseConsignesWorkbook,
} from '../lib/consignesExcel'
import { buildProfileData } from '../lib/profileBuilder'
import {
  detectColumns,
  parseExcelRows,
  dedupeAndMerge,
  getCategoryColor,
  getCategoryLabel,
  getZoneColor,
  logicalToday,
} from '../utils/helpers'
import * as profileStore from '../lib/profileStore'
import { useApp } from '../context/AppContext'
import ProfileViewModal from '../components/ProfileViewModal'
import {
  Upload,
  FileSpreadsheet,
  Users,
  Plane,
  AlertTriangle,
  Rocket,
  CheckCircle2,
  XCircle,
  Pencil,
  RotateCcw,
  Clock,
  Trash2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
} from 'lucide-react'

const SHIFT_COLORS = {
  matin: '#10b981',
  soir: '#6366f1',
  nuit: '#3b82f6',
}


const STATE_KEY = 'import-consignes-session-v1'
const HISTORY_KEY = 'import-consignes-history'

// Jour par défaut à l'ouverture d'un fichier : aujourd'hui s'il existe dans
// le rapport, sinon le premier jour du fichier.
const TODAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
function defaultDayOf(days) {
  const today = TODAY_NAMES[logicalToday().getDay()]
  if (days.includes(today)) return today
  return days[0] || ''
}

export default function ImportConsignes() {
  const { activeProfile } = useApp()
  const fileInputRef = useRef(null)
  const [fileName, setFileName] = useState('')
  const [error, setError] = useState('')
  const [report, setReport] = useState(null)
  const [selectedDay, setSelectedDay] = useState('')
  const [selectedShift, setSelectedShift] = useState('matin')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState([])
  const [overrides, setOverrides] = useState({})
  const [editRow, setEditRow] = useState(null)
  const [editText, setEditText] = useState('')
  const [sessionInfo, setSessionInfo] = useState('')
  const [createdProfiles, setCreatedProfiles] = useState(null)
  const [allProfiles, setAllProfiles] = useState(null)
  const [assignments, setAssignments] = useState({})
  const [viewProfile, setViewProfile] = useState(null)
  const [history, setHistory] = useState([])

  const [chargeTab, setChargeTab] = useState('consignes')
  const [chargeFileName, setChargeFileName] = useState('')
  const [chargePreview, setChargePreview] = useState([])
  const [chargeStats, setChargeStats] = useState(null)
  const [chargeProfileCode, setChargeProfileCode] = useState('')
  const [chargeBusy, setChargeBusy] = useState(false)
  const [chargeMsg, setChargeMsg] = useState('')
  const [chargeError, setChargeError] = useState('')
  const [chargeSelected, setChargeSelected] = useState({})
  const [chargeExpandedBlocks, setChargeExpandedBlocks] = useState([])
  const [chargeExpandedZones, setChargeExpandedZones] = useState([])
  const [chargeAircraft, setChargeAircraft] = useState('')
  const [hideNoConsignes, setHideNoConsignes] = useState(true)
  const [chargeTargetTasks, setChargeTargetTasks] = useState(null)
  const [chargeRemoveSel, setChargeRemoveSel] = useState({})
  const chargeFileInputRef = useRef(null)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY)
      if (raw) setHistory(JSON.parse(raw) || [])
    } catch {
      // historique illisible : ignoré
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pushHistory = (entry) => {
    setHistory((prev) => {
      const next = [entry, ...prev].slice(0, 20)
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(next))
      } catch {
        // stockage indisponible
      }
      return next
    })
  }

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY)
    setHistory([])
  }

  // Profils avion (persistés en base) : cartes permanentes de récap
  const loadCreatedProfiles = async () => {
    if (!activeProfile?.code) return
    try {
      const res = await profileStore.listProfiles(activeProfile.code)
      const aircraft = (res?.profiles || []).filter(
        (p) => (p.aircraft || '').trim() !== ''
      )
      setCreatedProfiles(aircraft.sort((a, b) => (a.aircraft || '').localeCompare(b.aircraft || '')))
      setAllProfiles(res?.profiles || [])
    } catch {
      setCreatedProfiles([])
      setAllProfiles([])
    }
  }

  // Charge un profil par son code (identifiant + code requis à la connexion)
  const getProfileByCode = async (codeVal) => {
    const prof = (allProfiles || []).find((p) => p.code === codeVal)
    if (!prof) return null
    return profileStore.getProfile(prof.identifiant, prof.code)
  }

  // Restauration de la dernière session d'import
  useEffect(() => {
    loadCreatedProfiles()
    try {
      const raw = localStorage.getItem(STATE_KEY)
      if (!raw) return
      const st = JSON.parse(raw)
      if (!st?.report) return
      setReport(st.report)
      setFileName(st.fileName || '')
      setSelectedDay(st.selectedDay || defaultDayOf(Object.keys(st.report)))
      setSelectedShift(st.selectedShift || 'matin')
      setOverrides(st.overrides || {})
      setResults(st.results || [])
      setAssignments(st.assignments || {})
      if (st.savedAt) {
        setSessionInfo(
          `Session du ${new Date(st.savedAt).toLocaleString('fr-FR')} restaurée — fichier analysé conservé.`
        )
      }
    } catch {
      // stockage illisible : on repart de zéro
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persistance : uniquement quand un fichier a été analysé
  useEffect(() => {
    if (!report) return
    try {
      localStorage.setItem(
        STATE_KEY,
        JSON.stringify({
          fileName,
          savedAt: new Date().toISOString(),
          report,
          selectedDay,
          selectedShift,
          overrides,
          results,
          assignments,
        })
      )
    } catch {
      // stockage indisponible : non bloquant
    }
  }, [report, fileName, selectedDay, selectedShift, overrides, results, assignments])

  const clearSession = () => {
    localStorage.removeItem(STATE_KEY)
    setReport(null)
    setFileName('')
    setError('')
    setOverrides({})
    setResults([])
    setSelectedDay('')
    setSelectedShift('matin')
    setSessionInfo('')
  }

  const overrideKey = (immat) => `${selectedDay}::${immat}::${selectedShift}`

  const effectiveTasks = (immat) => {
    const ov = overrides[overrideKey(immat)]
    if (Array.isArray(ov)) return ov
    const block = sheet?.blocks.find((b) => b.immat === immat)
    return block?.shifts[selectedShift] || []
  }

  const unassignAircraft = async (p) => {
    if (
      !window.confirm(
        `Retirer l'avion de ce profil ?\n\nLa carte « ${p.aircraft} » disparaîtra, et les données de l'avion seront effacées du profil : consignes [C], membres assignés à l'avion du jour et équipes composées uniquement de ces membres.\nLes membres permanents et le reste du travail du leader sont conservés.`
      )
    )
      return
    try {
      const fresh = await profileStore.adminGetProfileData(activeProfile?.code, p.id)
      const d = fresh?.profile?.data || {}
      const daySet = new Set(d.dayMembers || [])
      const teams = (d.teams || [])
        .map((t) => ({
          ...t,
          members: (t.members || []).filter((m) => !daySet.has(m)),
        }))
        .filter((t) => t.members.length > 0)
      const teamIds = new Set(teams.map((t) => t.id))
      const assignments = {}
      Object.entries(d.assignments || {}).forEach(([k, v]) => {
        const kept = (Array.isArray(v) ? v : [v]).filter((tid) => teamIds.has(tid))
        if (kept.length) assignments[k] = kept
      })
      const cleared = {
        tasks: d.tasks || [],
        teams,
        assignments,
        members: d.members || [],
        dayMembers: [],
        prepTasks: d.prepTasks || [],
        notes: (d.notes || []).filter(
          (n) => !String(n.title || '').startsWith('[C] ')
        ),
        pockets: d.pockets || [],
      }
      const saved = await profileStore.saveProfileData(
        p.code,
        cleared,
        fresh?.profile?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict') {
        setError('Le profil a été modifié entre-temps. Réessayez.')
        return
      }
      if (saved?.error) {
        setError('Échec du retrait.')
        return
      }
      const res = await profileStore.adminSetProfileAircraft(
        activeProfile?.code,
        p.code,
        ''
      )
      if (res?.error) setError('Échec du retrait.')
      else {
        await loadCreatedProfiles()
        setResults((prev) => prev.filter((r) => r.summary || r.immat !== p.aircraft))
        setAssignments((prev) => {
          const next = { ...prev }
          delete next[p.aircraft]
          return next
        })
      }
    } catch {
      setError('Échec du retrait (hors ligne ?).')
    }
  }

  const handleChargeFile = (file) => {
    setChargeError('')
    setChargeMsg('')
    setChargeFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 })
        if (!rows || rows.length < 2) {
          setChargeError('Le fichier est vide ou ne contient pas assez de lignes.')
          return
        }
        const detected = detectColumns(rows[0])
        if (detected.description === undefined) {
          setChargeError('Colonne "Task_Name" introuvable. Vérifiez le format du fichier.')
          return
        }
        const parsed = parseExcelRows(rows.slice(1), detected)
        setChargePreview(parsed)
        setChargeSelected(Object.fromEntries(parsed.map((t) => [t.id, true])))
        setChargeExpandedBlocks([])
        setChargeExpandedZones([])
        setChargeAircraft('')
        setChargeStats({
          totalLines: rows.length - 1,
          kept: parsed.length,
          filteredOut: rows.length - 1 - parsed.length,
        })
      } catch (err) {
        setChargeError(`Erreur lors de la lecture du fichier : ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const sendCharge = async () => {
    const selectedTasks = chargePreview.filter((t) => chargeSelected[t.id])
    if (!selectedTasks.length || !chargeProfileCode || !activeProfile?.code) return
    setChargeBusy(true)
    setChargeError('')
    setChargeMsg('')
    try {
      const fresh = await getProfileByCode(chargeProfileCode)
      if (!fresh) {
        setChargeError('Profil introuvable.')
        setChargeBusy(false)
        return
      }
      const mergedTasks = dedupeAndMerge(fresh?.data?.tasks || [], selectedTasks)
      const updated = { ...(fresh.data || {}), tasks: mergedTasks }
      const saved = await profileStore.saveProfileData(
        chargeProfileCode,
        updated,
        fresh?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict')
        setChargeError('Le profil a été modifié entre-temps. Réessayez.')
      else if (saved?.error) setChargeError("Échec de l'envoi de la charge.")
      else {
        if (chargeAircraft) {
          try {
            await profileStore.adminSetProfileAircraft(
              activeProfile.code,
              chargeProfileCode,
              chargeAircraft
            )
          } catch {
            // l'avion pourra être associé manuellement
          }
        }
        setChargeMsg(`${selectedTasks.length} tâche(s) ajoutée(s) au profil.`)
        await loadCreatedProfiles()
        const again = await getProfileByCode(chargeProfileCode)
        if (again) setChargeTargetTasks({ tasks: again?.data?.tasks || [] })
        setChargeRemoveSel({})
      }
    } catch {
      setChargeError("Échec de l'envoi (hors ligne ?).")
    }
    setChargeBusy(false)
  }

  const chargeTree = useMemo(() => groupTasksTree(chargePreview), [chargePreview])

  const chargeRegistrations = useMemo(
    () =>
      [
        ...new Set(
          chargePreview
            .filter((t) => chargeSelected[t.id])
            .map((t) => t.registration)
            .filter(Boolean)
        ),
      ].sort(),
    [chargePreview, chargeSelected]
  )

  useEffect(() => {
    if (!chargeProfileCode) return
    const prof = (allProfiles || []).find((p) => p.code === chargeProfileCode)
    if (!prof) return
    let cancelled = false
    profileStore
      .getProfile(prof.identifiant, prof.code)
      .then((fresh) => {
        if (cancelled || !fresh) return
        setChargeTargetTasks({ tasks: fresh?.data?.tasks || [] })
        setChargeRemoveSel({})
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [chargeProfileCode, allProfiles])

  const removeChargeTasks = async () => {
    const removeIds = new Set(
      Object.keys(chargeRemoveSel).filter((id) => chargeRemoveSel[id])
    )
    if (!removeIds.size || !chargeProfileCode) return
    setChargeBusy(true)
    setChargeError('')
    setChargeMsg('')
    try {
      const fresh = await getProfileByCode(chargeProfileCode)
      if (!fresh) {
        setChargeError('Profil introuvable.')
        setChargeBusy(false)
        return
      }
      const data = fresh.data || {}
      const keptTasks = (data.tasks || []).filter((t) => !removeIds.has(t.id))
      const assignments = { ...(data.assignments || {}) }
      removeIds.forEach((id) => delete assignments[id])
      const updated = { ...data, tasks: keptTasks, assignments }
      const saved = await profileStore.saveProfileData(
        chargeProfileCode,
        updated,
        fresh?.rev ?? 0,
        false
      )
      if (saved?.error === 'conflict')
        setChargeError('Le profil a été modifié entre-temps. Réessayez.')
      else if (saved?.error) setChargeError('Échec du retrait.')
      else {
        setChargeMsg(`${removeIds.size} tâche(s) retirée(s) du profil.`)
        setChargeTargetTasks({ tasks: keptTasks })
        setChargeRemoveSel({})
      }
    } catch {
      setChargeError('Échec du retrait (hors ligne ?).')
    }
    setChargeBusy(false)
  }

  const chargeSelectedCount = chargePreview.filter((t) => chargeSelected[t.id]).length

  const toggleChargeTask = (id) =>
    setChargeSelected((prev) => ({ ...prev, [id]: !prev[id] }))

  const toggleChargeTasks = (taskList) => {
    setChargeSelected((prev) => {
      const allOn = taskList.every((t) => prev[t.id])
      const next = { ...prev }
      taskList.forEach((t) => {
        next[t.id] = !allOn
      })
      return next
    })
  }

  const handleFile = (file) => {
    setError('')
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const workbook = XLSX.read(data, { type: 'array', cellStyles: true })
        const results = parseConsignesWorkbook(workbook)
        setReport(results)
        const days = Object.keys(results)
        setSelectedDay(defaultDayOf(days))
        setSelectedShift('matin')
      } catch (err) {
        setError(`Erreur lors de la lecture : ${err.message}`)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const days = report ? Object.keys(report) : []
  const sheet = report && selectedDay ? report[selectedDay] : null

  // Avions éligibles pour le jour × shift sélectionné : consignes remplies
  const eligible = useMemo(() => {
    if (!sheet) return []
    return sheet.blocks
      .filter((b) => (b.shifts[selectedShift] || []).length > 0)
      .map((b) => b.immat)
  }, [sheet, selectedShift])

  // Avions présents à l'effectif de ce shift mais sans consignes ce jour-là
  const skippedBydayshift = useMemo(() => {
    if (!sheet) return []
    const haveTasks = new Set(eligible)
    const shiftEff = sheet.effectif.find((s) => s.shift === selectedShift)
    const withEffectif = new Set(
      (shiftEff?.members || []).flatMap((m) => m.aircrafts)
    )
    return [...withEffectif].filter((immat) => !haveTasks.has(immat)).sort()
  }, [sheet, eligible, selectedShift])

  // Affectations valides uniquement : un avion absent du fichier ne doit pas
  // rester en mémoire (fantôme) et être ré-appliqué à chaque clic.
  const activeAssignments = useMemo(
    () =>
      Object.entries(assignments).filter(
        ([immat, code]) => code && eligible.includes(immat)
      ),
    [assignments, eligible]
  )

  useEffect(() => {
    if (!report) return
    setAssignments((prev) => {
      const next = {}
      let changed = false
      Object.entries(prev).forEach(([immat, code]) => {
        if (eligible.includes(immat)) next[immat] = code
        else changed = true
      })
      return changed ? next : prev
    })
  }, [report, eligible])

  // Avions concernés par des consignes sur le shift SÉLECTIONNÉ uniquement
  // (modifications manuelles comprises) — sert au masquage des avions vides.
  const visibleBlocks = useMemo(() => {
    const blocks = sheet?.blocks || []
    if (!hideNoConsignes) return blocks
    return blocks.filter((b) => {
      const ov = overrides[`${selectedDay}::${b.immat}::${selectedShift}`]
      return (Array.isArray(ov) ? ov : b.shifts[selectedShift] || []).length > 0
    })
  }, [sheet, overrides, selectedDay, selectedShift, hideNoConsignes])

  const hiddenBlocksCount = (sheet?.blocks.length || 0) - visibleBlocks.length

  // Effectif du shift sélectionné uniquement : avions (couleur) -> membres
  // (les LEADERS — nom sur fond bleu dans le fichier — passent en premier et en bleu)
  const effectifShift = useMemo(() => {
    if (!sheet) return { aircrafts: [], byAircraft: {}, count: 0 }
    const sh = sheet.effectif.find((x) => x.shift === selectedShift)
    const byAircraft = {}
    ;(sh?.members || []).forEach((m) => {
      const seen = new Set()
      ;(m.aircrafts || []).forEach((a) => {
        if (seen.has(a)) return
        seen.add(a)
        if (!byAircraft[a]) byAircraft[a] = []
        byAircraft[a].push(m)
      })
    })
    Object.values(byAircraft).forEach((list) =>
      list.sort((x, y) => (y.leader ? 1 : 0) - (x.leader ? 1 : 0))
    )
    return {
      aircrafts: Object.keys(byAircraft).sort(),
      byAircraft,
      count: sh?.members.length || 0,
    }
  }, [sheet, selectedShift])

  const aircraftInfoForScope = (immat) => {
    const shiftEff = sheet.effectif.find((s) => s.shift === selectedShift)
    const members = (shiftEff?.members || [])
      .filter((m) => m.aircrafts.includes(immat))
      .map((m) => m.name)
    const block = sheet.blocks.find((b) => b.immat === immat)
    return {
      immat,
      totalTasks: effectiveTasks(immat).length,
      days: {
        [selectedDay]: {
          [selectedShift]: [...new Set(members)],
          consignes: { [selectedShift]: effectiveTasks(immat) },
          infos: block
            ? {
                typeVisite: block.typeVisite || '',
                dateEntree: block.dateEntree || '',
                heureEntree: block.heureEntree || '',
                osm: block.osm || '',
                config: block.config || '',
                position: block.position || '',
                dateSortie: block.dateSortie || '',
                heureSortie: block.heureSortie || '',
              }
            : null,
        },
      },
    }
  }

  const totalMembers = report
    ? Object.values(report).reduce(
        (acc, s) => acc + s.effectif.reduce((a, sh) => a + sh.members.length, 0),
        0
      )
    : 0
  const totalBlocks = report
    ? Object.values(report).reduce((acc, s) => acc + s.blocks.length, 0)
    : 0

  const selectClass =
    'border border-slate-300 rounded-md px-3 py-2 text-sm bg-white'

  const applyAssignments = async () => {
    const assigned = activeAssignments
    if (!assigned.length || !activeProfile?.code || !sheet) return
    setRunning(true)
    setResults([])
    const out = []
    const okCodes = []

    for (const [immat, profileCode] of assigned) {
      const aircraftInfo = aircraftInfoForScope(immat)
      try {
        const lookup = await getProfileByCode(profileCode)
        if (!lookup) {
          out.push({ immat, ok: false, error: 'profil introuvable' })
          continue
        }
        const scope = { day: selectedDay, shift: selectedShift }
        const merged = buildProfileData(lookup?.data || {}, aircraftInfo, scope)
        let saved = await profileStore.saveProfileData(
          profileCode,
          merged,
          lookup?.rev ?? 0,
          false
        )
        if (saved?.error === 'conflict') {
          const fresh = await getProfileByCode(profileCode)
          const merged2 = buildProfileData(fresh?.data || {}, aircraftInfo, scope)
          saved = await profileStore.saveProfileData(
            profileCode,
            merged2,
            fresh?.rev ?? 0,
            false
          )
        }
        if (saved?.error) {
          out.push({ immat, ok: false, error: saved.error })
          continue
        }
        // Avion(s) du profil : la liste ne garde que les avions présents dans
        // ce fichier (un avion d'un import précédent ne doit pas subsister) + celui-ci
        const currentAircrafts = String(lookup.aircraft || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        const fileAircrafts = new Set((sheet?.blocks || []).map((b) => b.immat))
        const nextAircrafts = [
          ...new Set([
            ...currentAircrafts.filter(
              (a) => fileAircrafts.has(a) || a === immat
            ),
            immat,
          ]),
        ]
        if (nextAircrafts.join(', ') !== currentAircrafts.join(', ')) {
          try {
            await profileStore.adminSetProfileAircraft(
              activeProfile.code,
              profileCode,
              nextAircrafts.join(', ')
            )
          } catch {
            // l'avion du profil sera réglé manuellement
          }
        }
        okCodes.push(immat)
        out.push({ immat, ok: true, profile: lookup.name })
      } catch (err) {
        out.push({ immat, ok: false, error: err?.message || 'erreur réseau' })
      }
      setResults([...out])
    }

    setResults([
      ...out,
      {
        summary: `Terminé : ${okCodes.length} affectation(s), ${
          out.filter((r) => !r.ok).length
        } échec(s) — ${selectedDay} ${selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}.`,
      },
    ])
    setRunning(false)
    await loadCreatedProfiles()
    pushHistory({
      date: new Date().toLocaleString('fr-FR'),
      day: selectedDay,
      shift: selectedShift,
      assigned: okCodes,
      updated: [],
      failed: out.filter((r) => !r.ok).length,
      fileName,
      aircrafts: eligible,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Import consignes (rapport)</h1>
        <p className="text-slate-600 mt-1">
          Analyse du fichier de consignes : choisissez le jour et le shift à consulter.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => setChargeTab('consignes')}
          className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold border-2 transition-all text-left ${
            chargeTab === 'consignes'
              ? 'bg-sky-600 border-sky-600 text-white shadow-lg ring-2 ring-sky-300'
              : 'bg-white border-slate-200 text-slate-600 hover:border-sky-400 hover:bg-sky-50'
          }`}
        >
          <ClipboardList
            className={`h-6 w-6 shrink-0 ${chargeTab === 'consignes' ? 'text-white' : 'text-sky-500'}`}
          />
          <span>
            <span className="block text-base">Consignes</span>
            <span
              className={`block text-[11px] font-normal ${
                chargeTab === 'consignes' ? 'text-sky-100' : 'text-slate-400'
              }`}
            >
              Rapport des consignes (jour × shift)
            </span>
          </span>
        </button>
        <button
          onClick={() => setChargeTab('charge')}
          className={`flex items-center gap-3 px-5 py-3 rounded-xl text-sm font-bold border-2 transition-all text-left ${
            chargeTab === 'charge'
              ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg ring-2 ring-emerald-300'
              : 'bg-white border-emerald-300 text-emerald-800 hover:border-emerald-500 hover:bg-emerald-50'
          }`}
        >
          <Rocket
            className={`h-6 w-6 shrink-0 ${chargeTab === 'charge' ? 'text-white' : 'text-emerald-600'}`}
          />
          <span>
            <span className="block text-base">Charge (Victory)</span>
            <span
              className={`block text-[11px] font-normal ${
                chargeTab === 'charge' ? 'text-emerald-100' : 'text-emerald-600'
              }`}
            >
              Workpackage Report → envoyer au profil
            </span>
          </span>
        </button>
      </div>

      {chargeTab === 'consignes' ? (
        <>
      {sessionInfo && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-sky-50 border border-sky-200 text-sky-800 px-4 py-3 rounded-lg text-sm">
          <span>💾 {sessionInfo}</span>
          <button
            onClick={clearSession}
            className="text-xs font-semibold text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 rounded-md px-2 py-1"
          >
            Effacer la session
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          <AlertTriangle className="h-5 w-5" /> {error}
        </div>
      )}

      <div
        className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-white hover:border-sky-400 transition-colors cursor-pointer"
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
          accept=".xlsm,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            if (e.target.files[0]) handleFile(e.target.files[0])
            e.target.value = ''
          }}
        />
        <Upload className="h-10 w-10 mx-auto text-slate-400" />
        <p className="mt-3 font-medium text-slate-700">
          Déposez ici votre fichier de consignes (ex. CONSIGNES S37.xlsm)
        </p>
        <p className="text-sm text-slate-500 mt-1">Formats : .xlsm, .xlsx, .xls</p>
        {fileName && (
          <p className="mt-3 inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </p>
        )}
      </div>

      {report && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{days.length}</div>
              <div className="text-sm text-slate-500">Feuilles jours lues</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{totalMembers}</div>
              <div className="text-sm text-slate-500">Membres affectés (tous shifts)</div>
            </div>
            <div className="bg-white rounded-xl shadow p-4 text-center">
              <div className="text-2xl font-bold text-slate-900">{totalBlocks}</div>
              <div className="text-sm text-slate-500">Blocs de charge (avions)</div>
            </div>
          </div>

          {history.length > 0 && (
            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
                  <Clock className="h-4 w-4 text-sky-500" /> Historique des imports
                </h2>
                <button
                  onClick={clearHistory}
                  className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:bg-red-50 rounded-md px-2 py-1"
                >
                  Effacer
                </button>
              </div>
              <ul className="space-y-1">
                {history.map((h, i) => (
                  <li key={i} className="text-xs text-slate-600 flex flex-wrap gap-x-2">
                    <span className="text-slate-400">{h.date}</span>
                    <span className="font-semibold">
                      {h.day} {h.shift.charAt(0).toUpperCase() + h.shift.slice(1)}
                    </span>
                    <span className="text-green-700">
                      {(h.assigned?.length ?? h.created?.length ?? 0)} affecté(s)
                    </span>
                    {(h.updated?.length ?? 0) > 0 && (
                      <span className="text-sky-700">{h.updated.length} mis à jour</span>
                    )}
                    {h.failed > 0 && <span className="text-red-600">{h.failed} échec(s)</span>}
                    <span className="text-slate-400 truncate">{h.fileName}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* Profils avion assignés — cartes permanentes de récap */}
          {(createdProfiles?.length > 0 || createdProfiles === null) && (
            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Plane className="h-5 w-5 text-sky-500" /> Avions assignés (récaps)
                {createdProfiles && (
                  <span className="text-sm font-normal text-slate-400">
                    ({createdProfiles.length})
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-500 mb-3">
                Cliquez sur une carte pour voir le récap du profil (équipes, tâches,
                répartition) et l'exporter ou l'imprimer.
              </p>
              {createdProfiles === null ? (
                <p className="text-sm text-slate-400">Chargement…</p>
              ) : createdProfiles.length === 0 ? (
                <p className="text-sm text-slate-400 italic">
                  Aucun avion assigné pour le moment (affectez les consignes ci-dessus).
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {createdProfiles.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setViewProfile(p)}
                      className="relative bg-white border border-slate-200 hover:border-sky-400 hover:shadow-md rounded-xl p-4 text-left transition-all cursor-pointer"
                      title={`Voir le récap de ${p.name}`}
                    >
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          unassignAircraft(p)
                        }}
                        className="absolute top-2 right-2 text-slate-400 hover:text-red-600"
                        title={`Retirer l'avion « ${p.aircraft} » (la carte disparaît, le profil est conservé)`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex items-center gap-2">
                        <Plane className="h-5 w-5 text-sky-500 shrink-0" />
                        <span className="font-mono font-bold text-sky-700 text-lg truncate">
                          {p.aircraft}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-1">{p.name}</p>
                      <p className="text-[11px] text-slate-400">
                        {p.created_at
                          ? `créé le ${new Date(p.created_at).toLocaleDateString('fr-FR')}`
                          : ''}
                        {' '}· cliquer pour le récap
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Phase 2 — affectation des consignes aux profils existants */}
          {report && (
            <div className="bg-white rounded-xl shadow p-4 sm:p-6">
              <h2 className="text-lg font-semibold mb-1 flex items-center gap-2">
                <Rocket className="h-5 w-5 text-sky-500" /> Affectation des consignes
              </h2>
              <p className="text-xs text-slate-500 mb-4">
                Choisissez pour chaque avion le <strong>profil existant</strong> qui recevra
                l'effectif et la consigne du jour{' '}
                <strong>
                  {selectedDay} — {selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}
                </strong>
                . Aucun profil n'est créé automatiquement : la note [C] est insérée dans le
                Bloc-notes du profil choisi et son effectif est complété. Si le profil n'a pas
                encore d'avion, l'immatriculation lui est affectée.
              </p>
              {skippedBydayshift.length > 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-3">
                  {skippedBydayshift.length} avion(s) à l'effectif de ce shift mais sans consigne
                  ce jour : {skippedBydayshift.join(', ')}
                </p>
              )}
              <div className="space-y-1 mb-4">
                {eligible.map((immat) => (
                  <div
                    key={immat}
                    className="flex flex-wrap items-center gap-2 py-1.5 border-b border-slate-50"
                  >
                    <span className="font-mono font-bold text-sky-700 w-24 shrink-0">
                      {immat}
                    </span>
                    <span className="text-xs text-slate-400 w-28 shrink-0">
                      {effectiveTasks(immat).length} consigne(s)
                    </span>
                    <select
                      value={assignments[immat] || ''}
                      onChange={(e) =>
                        setAssignments((prev) => ({ ...prev, [immat]: e.target.value }))
                      }
                      className={`${selectClass} flex-1 min-w-[200px]`}
                    >
                      <option value="">— Choisir un profil existant —</option>
                      {(allProfiles || []).map((p) => (
                        <option key={p.id} value={p.code}>
                          {p.name}
                          {p.aircraft ? ` (${p.aircraft})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                {allProfiles && allProfiles.length === 0 && (
                  <p className="text-xs text-slate-400 italic">
                    Aucun profil disponible — créez d'abord les profils dans Administration.
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={applyAssignments}
                  disabled={running || activeAssignments.length === 0}
                  className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {running
                    ? 'Application en cours…'
                    : `Appliquer à ${activeAssignments.length} avion(s) (${selectedDay} ${selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)})`}
                </button>
                {running && <span className="text-sm text-slate-500">ne fermez pas l'onglet</span>}
              </div>
              {results.length > 0 && (
                <div className="mt-4 space-y-1">
                  {results.map((r, i) => (
                    <div
                      key={i}
                      className={`text-xs flex items-center gap-2 ${
                        r.summary ? 'font-semibold text-slate-700 mt-2' : r.ok ? 'text-green-700' : 'text-red-700'
                      }`}
                    >
                      {r.summary ? (
                        r.summary
                      ) : r.ok ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <span className="font-mono font-bold">{r.immat}</span>
                          {' — consignes affectées à '}
                          <span className="font-semibold">{r.profile}</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3.5 w-3.5" />
                          <span className="font-mono font-bold">{r.immat}</span> — {r.error}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Choix jour + shift */}
          <div className="bg-white rounded-xl shadow p-4 flex flex-wrap items-center gap-4">
            <label className="text-sm font-medium text-slate-700">
              Jour
              <select
                className={`${selectClass} ml-2`}
                value={selectedDay}
                onChange={(e) => setSelectedDay(e.target.value)}
              >
                {days.map((d) => (
                  <option key={d} value={d}>
                    {d}
                    {report[d].date ? ` (${report[d].date})` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Shift
              <select
                className={`${selectClass} ml-2`}
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
              >
                {['matin', 'soir', 'nuit'].map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </label>
            {sheet?.date && (
              <span className="text-sm text-slate-500">
                {selectedDay} · {sheet.date}
              </span>
            )}
          </div>

          {/* Aperçu jour + shift choisis */}
          {sheet && (
            <div className="space-y-6">
              {/* Effectif du shift sélectionné : un bloc par avion, membres en pastilles */}
              <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5 text-sky-500" /> Effectif {selectedDay} —{' '}
                    {selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}{' '}
                    <span className="font-normal text-slate-400 text-sm">
                      ({effectifShift.count} membre{effectifShift.count > 1 ? 's' : ''})
                    </span>
                  </h2>
                  <div className="flex gap-1.5">
                    {['matin', 'soir', 'nuit'].map((s) => {
                      const active = selectedShift === s
                      return (
                        <button
                          key={s}
                          onClick={() => setSelectedShift(s)}
                          className={`px-3 py-1 rounded-full text-xs font-bold border-2 transition-all ${
                            active ? 'text-white border-transparent' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
                          }`}
                          style={active ? { backgroundColor: SHIFT_COLORS[s] || '#64748b' } : undefined}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      )
                    })}
                  </div>
                </div>
                {effectifShift.aircrafts.length === 0 ? (
                  <p className="text-sm text-slate-400 italic">
                    Aucun membre affecté à un avion sur ce shift.
                  </p>
                ) : (
                  <div className="flex flex-wrap gap-3">
                    {effectifShift.aircrafts.map((a) => (
                      <div
                        key={a}
                        className="border border-slate-200 rounded-lg overflow-hidden flex-1 min-w-[180px] max-w-[320px]"
                      >
                        <div
                          className="px-3 py-1.5 flex items-center justify-between"
                          style={{ backgroundColor: getZoneColor(a) }}
                        >
                          <span className="text-white font-mono font-bold text-sm">{a}</span>
                          <span className="text-white/90 text-xs font-semibold">
                            {effectifShift.byAircraft[a].length}
                          </span>
                        </div>
                        <div className="p-2 flex flex-wrap gap-1">
                          {effectifShift.byAircraft[a].map((m, i) => (
                            <span
                              key={i}
                              className={`px-2 py-0.5 rounded-full text-[11px] border ${
                                m.leader
                                  ? 'bg-sky-100 border-sky-300 text-sky-800 font-bold'
                                  : 'bg-slate-100 border-slate-200 text-slate-700 font-medium'
                              }`}
                              title={m.leader ? 'Leader' : undefined}
                            >
                              {m.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
              <div className="bg-white rounded-xl shadow p-4">
                <h2 className="font-semibold flex items-center gap-2 mb-3">
                  <Users className="h-5 w-5 text-sky-500" /> Effectif {selectedDay}
                </h2>
                <div className="grid gap-3">
                  {['matin', 'soir', 'nuit'].map((s) => {
                    const sh = sheet.effectif.find((x) => x.shift === s)
                    const active = selectedShift === s
                    return (
                      <div
                        key={s}
                        className={`border rounded-lg overflow-hidden ${
                          active ? 'ring-2 ring-sky-400' : 'opacity-70'
                        }`}
                      >
                        <button
                          onClick={() => setSelectedShift(s)}
                          className={`w-full px-3 py-1.5 text-white text-xs font-bold flex items-center justify-between ${
                            active ? '' : 'hover:brightness-110'
                          }`}
                          style={{ backgroundColor: SHIFT_COLORS[s] || '#64748b' }}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)} ({sh?.members.length || 0})
                        </button>
                        {active && (
                          <ul className="max-h-72 overflow-y-auto divide-y divide-slate-50">
                            {[...(sh?.members || [])]
                              .sort((a, b) => (b.leader ? 1 : 0) - (a.leader ? 1 : 0))
                              .map((m, i) => (
                                <li key={i} className="px-3 py-1.5 text-xs flex justify-between gap-2">
                                  <span
                                    className={`truncate ${
                                      m.leader ? 'text-sky-700 font-bold' : ''
                                    }`}
                                    title={m.leader ? 'Leader' : undefined}
                                  >
                                    {m.name}
                                  </span>
                                  <span className="font-mono text-sky-700 shrink-0">
                                    {m.aircrafts.join(', ')}
                                  </span>
                                </li>
                              ))}
                            {(!sh || sh.members.length === 0) && (
                              <li className="px-3 py-2 text-xs text-slate-400 italic">
                                Aucun membre pour ce shift.
                              </li>
                            )}
                          </ul>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="bg-white rounded-xl shadow p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <h2 className="font-semibold flex items-center gap-2">
                    <Plane className="h-5 w-5 text-sky-500" />
                    Charge {selectedDay} — {selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)} (
                    {visibleBlocks.length} avions)
                  </h2>
                  <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={hideNoConsignes}
                      onChange={(e) => setHideNoConsignes(e.target.checked)}
                      className="h-4 w-4 accent-sky-600"
                    />
                    Masquer les avions sans consignes
                    {hiddenBlocksCount > 0 && (
                      <span className="text-slate-400">
                        ({hiddenBlocksCount} masqué{hiddenBlocksCount > 1 ? 's' : ''})
                      </span>
                    )}
                  </label>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="text-left bg-slate-50">
                        <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Type de visite</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Heure</th>
                        <th className="px-3 py-2 font-semibold text-slate-700">
                          Tâches{' '}
                          {selectedShift.charAt(0).toUpperCase() + selectedShift.slice(1)}{' '}
                          <span className="font-normal text-slate-400">(crayon = modifier)</span>
                        </th>
                        <th className="px-3 py-2 font-semibold text-slate-700">Autres shifts</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleBlocks.map((b, i) => {
                        const tasks = effectiveTasks(b.immat)
                        const overridden = Array.isArray(overrides[overrideKey(b.immat)])
                        const others = ['matin', 'soir', 'nuit']
                          .filter((s) => s !== selectedShift)
                          .filter((s) => {
                            const ovKey = `${selectedDay}::${b.immat}::${s}`
                            const ov = overrides[ovKey]
                            return (Array.isArray(ov) ? ov : b.shifts[s] || []).length > 0
                          })
                        const editing = editRow === b.immat
                        return (
                          <tr key={i} className="border-b hover:bg-slate-50 align-top">
                            <td className="px-3 py-2 font-mono font-bold text-sky-700 whitespace-nowrap">
                              {b.immat}
                            </td>
                            <td className="px-3 py-2">{b.typeVisite || '—'}</td>
                            <td className="px-3 py-2">{b.heureEntree || '—'}</td>
                            <td className="px-3 py-2 max-w-[340px]">
                              {editing ? (
                                <div className="flex flex-col gap-1">
                                  <textarea
                                    autoFocus
                                    value={editText}
                                    onChange={(e) => setEditText(e.target.value)}
                                    rows={Math.max(3, Math.min(tasks.length + 1, 12))}
                                    className="border border-slate-300 rounded-md px-2 py-1 text-xs w-full"
                                    placeholder="Une tâche par ligne"
                                  />
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => {
                                        setOverrides((prev) => ({
                                          ...prev,
                                          [overrideKey(b.immat)]: editText
                                            .split('\n')
                                            .map((t) => t.trim())
                                            .filter(Boolean),
                                        }))
                                        setEditRow(null)
                                      }}
                                      className="text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded px-2 py-1"
                                    >
                                      OK
                                    </button>
                                    <button
                                      onClick={() => setEditRow(null)}
                                      className="text-xs text-slate-500 hover:text-slate-800 px-2 py-1"
                                    >
                                      Annuler
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-start gap-1">
                                  <ul className="space-y-0.5 flex-1 min-w-0">
                                    {tasks.length === 0 ? (
                                      <li className="text-xs text-slate-400 italic">aucune tâche</li>
                                    ) : (
                                      tasks.map((t, j) => (
                                        <li key={j} className="text-xs text-slate-600 leading-snug">
                                          · {t}
                                        </li>
                                      ))
                                    )}
                                  </ul>
                                  <div className="flex flex-col gap-1 shrink-0">
                                    {overridden && (
                                      <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1 py-0.5">
                                        modifié
                                      </span>
                                    )}
                                    <button
                                      onClick={() => {
                                        setEditRow(b.immat)
                                        setEditText(tasks.join('\n'))
                                      }}
                                      className="text-slate-400 hover:text-sky-600"
                                      title={`Modifier les consignes de ${b.immat}`}
                                    >
                                      <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                    {overridden && (
                                      <button
                                        onClick={() =>
                                          setOverrides((prev) => {
                                            const next = { ...prev }
                                            delete next[overrideKey(b.immat)]
                                            return next
                                          })
                                        }
                                        className="text-slate-400 hover:text-red-600"
                                        title="Revenir au fichier"
                                      >
                                        <RotateCcw className="h-3 w-3" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex flex-wrap gap-1">
                                {others.map((s) => (
                                  <span
                                    key={s}
                                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white"
                                    style={{ backgroundColor: SHIFT_COLORS[s] || '#64748b' }}
                                  >
                                    {s} : {(() => {
                                      const ovKey = `${selectedDay}::${b.immat}::${s}`
                                      const ov = overrides[ovKey]
                                      return (Array.isArray(ov) ? ov : b.shifts[s] || []).length
                                    })()}
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                      {sheet.blocks.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-slate-400 text-sm">
                            Aucun bloc de charge détecté ce jour.
                          </td>
                        </tr>
                      )}
                      {sheet.blocks.length > 0 && visibleBlocks.length === 0 && (
                        <tr>
                          <td colSpan={5} className="px-3 py-6 text-center text-slate-400 text-sm">
                            Aucun avion avec consignes sur ce shift — décochez « Masquer les avions
                            sans consignes » pour tout afficher.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            </div>
          )}
        </>
      )}

        </>
      ) : (
        <div className="space-y-6">
          <div className="bg-sky-50 border border-sky-200 rounded-lg p-4">
            <h3 className="font-semibold text-sky-800 mb-2">Filtres d'import actifs (comme Import Victory)</h3>
            <div className="text-sm text-sky-700 space-y-1">
              <p>• <strong>Skills</strong> : toutes les lignes dont un des skills commence par CABB (ex. B1B2/CABB1B2)</p>
              <p>• <strong>MTX Status</strong> : uniquement ACTV, PAUSE et IN WORK</p>
              <p>• <strong>Task Type</strong> : tous les blocs (JIC, Found Fault, MPC, ADHOC, EO)</p>
            </div>
          </div>

          {chargeError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              <AlertTriangle className="h-5 w-5" /> {chargeError}
            </div>
          )}

          <div
            className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center bg-white hover:border-sky-400 transition-colors cursor-pointer"
            onClick={() => chargeFileInputRef.current.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const file = e.dataTransfer.files[0]
              if (file) handleChargeFile(file)
            }}
          >
            <input
              ref={chargeFileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                if (e.target.files[0]) handleChargeFile(e.target.files[0])
                e.target.value = ''
              }}
            />
            <Upload className="h-10 w-10 mx-auto text-slate-400" />
            <p className="mt-3 font-medium text-slate-700">
              Déposez ici le Workpackage Report : les tâches filtrées seront envoyées au profil choisi.
            </p>
            <p className="text-sm text-slate-500 mt-1">Formats : .xlsx, .xls, .csv</p>
            {chargeFileName && (
              <p className="mt-3 inline-flex items-center gap-2 bg-sky-50 text-sky-700 px-3 py-1 rounded-full text-sm">
                <FileSpreadsheet className="h-4 w-4" /> {chargeFileName}
              </p>
            )}
          </div>

          {chargeStats && (
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="bg-white rounded-xl shadow p-4 text-center">
                <div className="text-2xl font-bold text-slate-900">{chargeStats.totalLines}</div>
                <div className="text-sm text-slate-500">Lignes totales</div>
              </div>
              <div className="bg-white rounded-xl shadow p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{chargeStats.kept}</div>
                <div className="text-sm text-slate-500">Après filtres</div>
              </div>
              <div className="bg-white rounded-xl shadow p-4 text-center">
                <div className="text-2xl font-bold text-slate-400">{chargeStats.filteredOut}</div>
                <div className="text-sm text-slate-500">Exclues</div>
              </div>
            </div>
          )}

          {chargePreview.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b">
                <div>
                  <h2 className="text-xl font-semibold">
                    Sélection — {chargeSelectedCount} / {chargePreview.length} tâche(s)
                  </h2>
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() =>
                        setChargeSelected(
                          Object.fromEntries(chargePreview.map((t) => [t.id, true]))
                        )
                      }
                      className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-2.5 py-0.5"
                    >
                      Tout cocher
                    </button>
                    <button
                      onClick={() => setChargeSelected({})}
                      className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-0.5"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={chargeProfileCode}
                    onChange={(e) => setChargeProfileCode(e.target.value)}
                    className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
                  >
                    <option value="">— Choisir le profil destinataire —</option>
                    {(allProfiles || []).map((p) => (
                      <option key={p.id} value={p.code}>
                        {p.name}
                        {p.aircraft ? ` (${p.aircraft})` : ''}
                      </option>
                    ))}
                  </select>
                  <select
                    value={chargeAircraft}
                    onChange={(e) => setChargeAircraft(e.target.value)}
                    className="border border-slate-300 rounded-md px-3 py-1.5 text-sm bg-white"
                    title="Avion associé au profil : la carte apparaîtra dans « Avions assignés »"
                  >
                    <option value="">— Avion associé (optionnel) —</option>
                    {chargeRegistrations.map((immat) => (
                      <option key={immat} value={immat}>
                        {immat}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={sendCharge}
                    disabled={chargeBusy || !chargeProfileCode}
                    className="bg-sky-600 text-white px-4 py-1.5 rounded-md hover:bg-sky-700 disabled:opacity-50 flex items-center gap-2 text-sm font-semibold"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {chargeBusy ? 'Envoi…' : 'Envoyer la charge au profil'}
                  </button>
                </div>
              </div>
              {chargeMsg && (
                <div className="bg-green-50 border-b border-green-200 text-green-700 px-6 py-3 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5" /> {chargeMsg}
                </div>
              )}
              <div className="max-h-[560px] overflow-y-auto">
                {chargeTree.map(({ block, zones }) => {
                  const blockTasks = zones.flatMap((z) => z.tasks)
                  const blockSelected = blockTasks.filter((t) => chargeSelected[t.id]).length
                  const blockOpen = chargeExpandedBlocks.includes(block)
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
                          onChange={() => toggleChargeTasks(blockTasks)}
                          className="h-4 w-4 accent-sky-600 shrink-0"
                        />
                        <button
                          onClick={() =>
                            setChargeExpandedBlocks((prev) =>
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
                        zones.map(({ zone, tasks }) => {
                          const zoneKey = `${block}::${zone}`
                          const zoneOpen = chargeExpandedZones.includes(zoneKey)
                          const zoneSelected = tasks.filter((t) => chargeSelected[t.id]).length
                          return (
                            <div key={zoneKey}>
                              <div className="flex items-center gap-2 pl-8 pr-3 py-1.5 bg-slate-50 border-t border-slate-100">
                                <input
                                  type="checkbox"
                                  checked={zoneSelected === tasks.length && tasks.length > 0}
                                  ref={(el) => {
                                    if (el)
                                      el.indeterminate =
                                        zoneSelected > 0 && zoneSelected < tasks.length
                                  }}
                                  onChange={() => toggleChargeTasks(tasks)}
                                  className="h-4 w-4 accent-sky-600 shrink-0"
                                />
                                <button
                                  onClick={() =>
                                    setChargeExpandedZones((prev) =>
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
                                    ({zoneSelected}/{tasks.length})
                                  </span>
                                </button>
                              </div>
                              {zoneOpen &&
                                tasks.map((task) => (
                                  <label
                                    key={task.id}
                                    className="flex items-center gap-2 pl-14 pr-3 py-1.5 text-sm hover:bg-slate-50 cursor-pointer border-t border-dashed border-slate-100"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={!!chargeSelected[task.id]}
                                      onChange={() => toggleChargeTask(task.id)}
                                      className="h-4 w-4 accent-sky-600 shrink-0"
                                    />
                                    <span className="w-10 shrink-0 font-bold text-slate-500">
                                      {task.seq || '—'}
                                    </span>
                                    {task.taskBarcode && (
                                      <span className="shrink-0 font-mono text-[10px] font-bold text-slate-500 bg-slate-100 border border-slate-200 rounded px-1 py-0.5">
                                        {task.taskBarcode}
                                      </span>
                                    )}
                                    <span
                                      className="flex-1 min-w-0 truncate text-slate-700"
                                      title={task.description}
                                    >
                                      {task.description}
                                    </span>
                                    <span className="shrink-0 text-xs text-slate-400">
                                      {task.scheduledHours || ''}
                                    </span>
                                    <span className="shrink-0 text-xs text-slate-400">
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

          {chargeProfileCode && chargeTargetTasks && chargeTargetTasks.tasks.length > 0 && (
            <div className="bg-white rounded-xl shadow overflow-hidden">
              <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b">
                <div>
                  <h2 className="text-lg font-semibold">
                    Retirer des lignes de ce profil —{' '}
                    {Object.values(chargeRemoveSel).filter(Boolean).length} /{' '}
                    {chargeTargetTasks.tasks.length} sélectionnée(s)
                  </h2>
                  <div className="flex gap-1.5 mt-1">
                    <button
                      onClick={() =>
                        setChargeRemoveSel(
                          Object.fromEntries(chargeTargetTasks.tasks.map((t) => [t.id, true]))
                        )
                      }
                      className="text-xs font-semibold text-red-600 border border-red-200 hover:bg-red-50 rounded-full px-2.5 py-0.5"
                    >
                      Tout cocher
                    </button>
                    <button
                      onClick={() => setChargeRemoveSel({})}
                      className="text-xs font-semibold text-slate-500 border border-slate-200 hover:bg-slate-50 rounded-full px-2.5 py-0.5"
                    >
                      Tout décocher
                    </button>
                  </div>
                </div>
                <button
                  onClick={removeChargeTasks}
                  disabled={chargeBusy || !Object.values(chargeRemoveSel).some(Boolean)}
                  className="bg-red-600 text-white px-4 py-1.5 rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-semibold"
                  title="Retirer définitivement les lignes cochées de la charge du profil"
                >
                  {chargeBusy ? 'Retrait…' : 'Retirer la sélection'}
                </button>
              </div>
              <div className="max-h-[420px] overflow-y-auto">
            <TaskTreeSelect
              tree={groupTasksTree(chargeTargetTasks.tasks)}
                  selected={chargeRemoveSel}
                  onToggleTask={(id) =>
                    setChargeRemoveSel((prev) => ({ ...prev, [id]: !prev[id] }))
                  }
                  onToggleTasks={(list) =>
                    setChargeRemoveSel((prev) => {
                      const allOn = list.every((t) => prev[t.id])
                      const next = { ...prev }
                      list.forEach((t) => {
                        next[t.id] = !allOn
                      })
                      return next
                    })
                  }
                  expandedBlocks={chargeExpandedBlocks}
                  setExpandedBlocks={setChargeExpandedBlocks}
                  expandedZones={chargeExpandedZones}
                  setExpandedZones={setChargeExpandedZones}
                  idPrefix="retrait"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {viewProfile && (
        <ProfileViewModal
          profile={viewProfile}
          adminCode={activeProfile?.code}
          onClose={() => setViewProfile(null)}
        />
      )}
    </div>
  )
}
