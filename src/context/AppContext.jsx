import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import * as profileStore from '../lib/profileStore'
import { taskActions } from './tasks'
import { teamActions } from './teams'
import { prepActions } from './preparation'
import { pocketActions } from './pockets'
import { noteActions } from './notes'

const AppContext = createContext(null)

const ACTIVE_CODE_KEY = 'maintenance-app-active-code'
const ACTIVE_IDENT_KEY = 'maintenance-app-active-ident'
const ACTIVE_AT_KEY = 'maintenance-app-active-at'
const SESSION_MAX_HOURS = 12

function loadActiveCode() {
  try {
    const code = localStorage.getItem(ACTIVE_CODE_KEY) || ''
    const at = localStorage.getItem(ACTIVE_AT_KEY)
    if (!code || !at) return ''
    const hours = (Date.now() - Number(at)) / (1000 * 60 * 60)
    if (hours > SESSION_MAX_HOURS) {
      localStorage.removeItem(ACTIVE_CODE_KEY)
      localStorage.removeItem(ACTIVE_AT_KEY)
      return ''
    }
    return code
  } catch {
    return ''
  }
}

function loadActiveIdent() {
  try {
    const ident = localStorage.getItem(ACTIVE_IDENT_KEY) || ''
    const at = localStorage.getItem(ACTIVE_AT_KEY)
    if (!ident || !at) return ''
    const hours = (Date.now() - Number(at)) / (1000 * 60 * 60)
    if (hours > SESSION_MAX_HOURS) return ''
    return ident
  } catch {
    return ''
  }
}

function dedupeTasks(tasks) {
  const seen = new Set()
  const out = []
  tasks.forEach((t) => {
    if (t.seq !== undefined && t.seq !== '') {
      if (seen.has(t.seq)) return
      seen.add(t.seq)
    }
    out.push(t)
  })
  return out
}

const DEFAULT_EMPTY = {
  tasks: [],
  teams: [],
  assignments: {},
  members: [],
  dayMembers: [],
  prepTasks: [],
  notes: [],
  pockets: [],
  primeRequests: [],
}

export function AppProvider({ children }) {
  const [code, setCode] = useState(loadActiveCode)
  const [identifiant, setIdentifiant] = useState(loadActiveIdent)
  const [activeProfile, setActiveProfile] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [tasks, setTasks] = useState([])
  const [teams, setTeams] = useState([])
  const [assignments, setAssignments] = useState({})
  const [members, setMembers] = useState([])
  const [dayMembers, setDayMembers] = useState([])
  const [primeRequests, setPrimeRequests] = useState([])
  const [prepTasks, setPrepTasks] = useState([])
  const [pockets, setPockets] = useState([])
  const [notes, setNotes] = useState([])
  const [loaded, setLoaded] = useState(false)

  const saveTimer = useRef(null)
  const pendingPayload = useRef(null)
  const codeRef = useRef('')
  const identRef = useRef('')
  const revRef = useRef(0)
  const lastSavedJsonRef = useRef('')

  const CACHE_PREFIX = 'maintenance-app-cache-'
  const cacheKeyFor = (code) => `${CACHE_PREFIX}${code}`

  useEffect(() => {
    codeRef.current = code
  }, [code])

  useEffect(() => {
    identRef.current = identifiant
  }, [identifiant])

  const isConnected = !!code && !!identifiant && !!activeProfile
  const [saveState, setSaveState] = useState('saved')
  const [isAdmin, setIsAdmin] = useState(null)

  // Applique un profil servi par Supabase (ou du cache) aux états locaux
  const applyProfileData = useCallback((profile) => {
    const toArray = (v) => (Array.isArray(v) ? v : [])
    const toObject = (v) =>
      v && typeof v === 'object' && !Array.isArray(v) ? v : {}
    const data = profile.data || DEFAULT_EMPTY
    const rawAssignments = toObject(data.assignments)
    const normalizedAssignments = {}
    Object.keys(rawAssignments).forEach((k) => {
      const v = rawAssignments[k]
      normalizedAssignments[k] = Array.isArray(v) ? v : v ? [v] : []
    })
    const cleaned = {
      tasks: toArray(data.tasks),
      teams: toArray(data.teams),
      assignments: normalizedAssignments,
      members: toArray(data.members),
      dayMembers: toArray(data.dayMembers),
      prepTasks: toArray(data.prepTasks),
      notes: toArray(data.notes),
      pockets: toArray(data.pockets),
      primeRequests: toArray(data.primeRequests),
    }
    cleaned.tasks = dedupeTasks(cleaned.tasks)
    setTasks(cleaned.tasks)
    setTeams(cleaned.teams)
    setAssignments(cleaned.assignments)
    setMembers(cleaned.members)
    setDayMembers(cleaned.dayMembers)
    setPrepTasks(cleaned.prepTasks)
    setPockets(cleaned.pockets)
    setNotes(cleaned.notes)
    setPrimeRequests(cleaned.primeRequests)
    revRef.current = profile.rev ?? 0
    lastSavedJsonRef.current = JSON.stringify(cleaned)
    setActiveProfile({
      id: profile.id,
      code: profile.code ?? codeRef.current,
      identifiant: profile.identifiant ?? identRef.current,
      name: profile.name,
      aircraft: profile.aircraft,
    })
    try {
      localStorage.setItem(
        cacheKeyFor(codeRef.current),
        JSON.stringify({
          profile: {
            id: profile.id,
            identifiant: profile.identifiant ?? identRef.current,
            name: profile.name,
            aircraft: profile.aircraft,
          },
          data,
          rev: profile.rev ?? 0,
        })
      )
    } catch {
      // stockage indisponible : pas bloquant
    }
  }, [])

  const totalPayload = useCallback(
    () => ({
      tasks,
      teams,
      assignments,
      members,
      dayMembers,
      prepTasks,
      notes,
      pockets,
      primeRequests,
    }),
    [tasks, teams, assignments, members, dayMembers, prepTasks, notes, pockets, primeRequests]
  )

  const performSave = useCallback(
    async (payload, force) => {
      setSaveState('saving')
      try {
        const res = await profileStore.saveProfileData(codeRef.current, payload, revRef.current, force)
        if (res?.error === 'conflict') {
          pendingPayload.current = null
          setSaveState('conflict')
          return
        }
        if (res?.error === 'not_found') {
          pendingPayload.current = payload
          setSaveState('offline')
          return
        }
        revRef.current = res?.rev ?? revRef.current
        pendingPayload.current = null
        lastSavedJsonRef.current = JSON.stringify(payload)
        try {
          localStorage.setItem(
            cacheKeyFor(codeRef.current),
            JSON.stringify({
              profile: {
                id: activeProfile?.id,
                name: activeProfile?.name,
                aircraft: activeProfile?.aircraft,
              },
              data: payload,
              rev: revRef.current,
            })
          )
        } catch {
          // stockage indisponible : pas bloquant
        }
        setSaveState('saved')
      } catch {
        pendingPayload.current = payload
        setSaveState('offline')
      }
    },
    [activeProfile]
  )

  // Synchronisation entre appareils : si un autre appareil a sauvegardé,
  // on adopte sa version (sauf si des modifications locales sont en cours)
  const pollProfile = useCallback(async () => {
    if (pendingPayload.current) return
    const payloadJson = JSON.stringify(totalPayload())
    try {
      const profile = await profileStore.getProfile(identRef.current, codeRef.current)
      if (!profile || profile.error === 'not_found') return
      if (profile.rev === revRef.current) return
      if (payloadJson !== lastSavedJsonRef.current) {
        // Le serveur a changé pendant qu'on avait des modifications locales
        // non sauvegardées : conflit détecté, l'utilisateur décide
        setSaveState('conflict')
        return
      }
      if (saveState === 'offline' || saveState === 'conflict') setSaveState('saved')
      applyProfileData(profile)
    } catch {
      // hors ligne temporaire : silencieux, la prochaine passe s'en charge
    }
  }, [totalPayload, applyProfileData, saveState])

  // Veille de synchronisation (toutes les 15 s) tant qu'un profil est chargé
  useEffect(() => {
    if (!isConnected || !loaded) return
    const timer = setInterval(() => pollProfile(), 15000)
    return () => clearInterval(timer)
  }, [isConnected, loaded, pollProfile])

  // Veille de reprise : tant qu'un payload est en attente et qu'on
  // n'est ni hors ligne effectif ni en conflit, on retente toutes les 30 s
  useEffect(() => {
    if (!isConnected || !loaded) return
    const timer = setInterval(() => {
      const payload = pendingPayload.current
      if (payload && saveState === 'offline') {
        performSave(payload, false)
      }
    }, 30000)
    return () => clearInterval(timer)
  }, [isConnected, loaded, saveState, performSave])

  // Charger le profil + ses données depuis Supabase quand le code change
  useEffect(() => {
    if (!code || !identifiant) {
      // eslint-disable-next-line react/set-state-in-effect -- réinitialisation volontaire à la déconnexion
      setActiveProfile(null)
      setTasks([])
      setTeams([])
      setAssignments({})
      setMembers([])
      setDayMembers([])
      setPrimeRequests([])
      setPrepTasks([])
      setPockets([])
      setNotes([])
      setLoaded(false)
      setSaveState('saved')
      revRef.current = 0
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    profileStore
      .getProfile(identifiant, code)
      .then((profile) => {
        if (cancelled) return
        if (profile?.locked) {
          // Verrouillage anti force brute : on refuse l'accès sans utiliser le cache
          setError('Trop de tentatives de connexion : réessayez dans 15 minutes.')
          setLoaded(false)
          setIsAdmin(false)
          return
        }
        if (profile?.pending) {
          setError('Votre compte est en attente de validation par un administrateur. Réessayez plus tard.')
          setLoaded(false)
          setIsAdmin(false)
          return
        }
        if (!profile) {
          // Le couple identifiant + code n'existe pas : on déconnecte
          localStorage.removeItem(ACTIVE_CODE_KEY)
          localStorage.removeItem(ACTIVE_IDENT_KEY)
          localStorage.removeItem(ACTIVE_AT_KEY)
          setCode('')
          setIdentifiant('')
          setActiveProfile(null)
          setLoaded(false)
          return
        }
        applyProfileData(profile)
        // Session déjà active (rechargement de page) : on re-vérifie le statut admin
        profileStore
          .checkAdmin(code)
          .then((admin) => {
            if (!cancelled) setIsAdmin(admin?.ok === true && !admin?.locked)
          })
          .catch(() => {
            if (!cancelled) setIsAdmin(false)
          })
        setLoaded(true)
      })
      .catch((err) => {
        if (cancelled) return
        // Repli hors ligne : on utilise la dernière version connue de ce profil
        let cached = null
        try {
          cached = JSON.parse(localStorage.getItem(cacheKeyFor(code)) || 'null')
        } catch {
          cached = null
        }
        if (cached?.data) {
          applyProfileData({
            id: cached.profile?.id,
            name: cached.profile?.name,
            aircraft: cached.profile?.aircraft,
            rev: cached.rev ?? 0,
            data: cached.data,
          })
          setIsAdmin(false)
          setLoaded(true)
          setSaveState('offline')
        } else {
          setError('Impossible de se connecter : ' + (err.message || 'erreur réseau'))
          setIsAdmin(false)
          setLoaded(false)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [code, identifiant, applyProfileData])

  // Sauvegarde des données dans Supabase (debounce) une fois chargées
  useEffect(() => {
    if (!isConnected || !loaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      const payload = totalPayload()
      if (JSON.stringify(payload) === lastSavedJsonRef.current) return
      performSave(payload, false)
    }, 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
    }
  }, [isConnected, loaded, code, tasks, teams, assignments, members, prepTasks, notes, pockets, performSave, totalPayload])

  const resolveConflict = useCallback(
    async (mode) => {
      if (mode === 'reload') {
        try {
          const profile = await profileStore.getProfile(identRef.current, codeRef.current)
          if (!profile || profile.error === 'not_found') {
            setSaveState('offline')
            return
          }
          applyProfileData(profile)
          pendingPayload.current = null
          setSaveState('saved')
        } catch {
          setSaveState('offline')
        }
      } else {
        const payload = totalPayload()
        await performSave(payload, true)
      }
    },
    [applyProfileData, totalPayload, performSave]
  )

  const connectProfile = useCallback(async (profileIdentifiant, profileCode) => {
    const ident = String(profileIdentifiant || '').trim().toLowerCase()
    const c = String(profileCode || '').trim()
    if (!ident || !c) return { ok: false, error: 'Saisissez votre identifiant et votre code.' }
    const exists = await profileStore.profileExists(ident, c)
    if (exists?.locked) return { ok: false, error: 'Trop de tentatives de connexion : réessayez dans 15 minutes.' }
    if (exists?.pending) return { ok: false, error: 'Ce compte est en attente de validation par un administrateur.' }
    if (!exists?.ok) return { ok: false, error: 'Identifiant ou code incorrect.' }
    localStorage.setItem(ACTIVE_CODE_KEY, c)
    localStorage.setItem(ACTIVE_IDENT_KEY, ident)
    localStorage.setItem(ACTIVE_AT_KEY, String(Date.now()))
    setIdentifiant(ident)
    setCode(c)
    try {
      const admin = await profileStore.checkAdmin(c)
      setIsAdmin(admin?.ok === true && !admin?.locked)
    } catch {
      setIsAdmin(false)
    }
    return { ok: true }
  }, [])

  const createProfile = useCallback(
    async ({ identifiant: profileIdentifiant, code: profileCode, name, aircraft }) => {
      const ident = String(profileIdentifiant || '').trim().toLowerCase()
      const c = String(profileCode || '').trim()
      if (!c) return { ok: false, error: 'Le code est obligatoire.' }
      if (!name || !String(name).trim()) return { ok: false, error: 'Le nom du profil est obligatoire.' }
      try {
        const res = await profileStore.createProfile(
          ident,
          c,
          String(name).trim(),
          String(aircraft || '').trim()
        )
        const finalIdent = res?.identifiant || ident
        localStorage.setItem(ACTIVE_CODE_KEY, c)
        localStorage.setItem(ACTIVE_IDENT_KEY, finalIdent)
        localStorage.setItem(ACTIVE_AT_KEY, String(Date.now()))
        setIdentifiant(finalIdent)
        setCode(c)
        return { ok: true, identifiant: finalIdent }
      } catch (err) {
        if (err.message === 'code_exists') {
          return { ok: false, error: 'Ce code est déjà utilisé. Choisissez un autre code.' }
        }
        if (err.message === 'code_too_short') {
          return { ok: false, error: 'Le code doit contenir au moins 8 caractères.' }
        }
        if (err.message === 'identifiant_indisponible') {
          return { ok: false, error: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.' }
        }
        return { ok: false, error: 'Échec de la création : ' + (err.message || 'erreur réseau') }
      }
    },
    []
  )

  const requestProfile = useCallback(async (profileIdentifiant, profileCode, name, managerId) => {
    try {
      const res = await profileStore.requestProfile(
        String(profileIdentifiant || '').trim().toLowerCase(),
        String(profileCode || '').trim(),
        String(name || '').trim(),
        managerId || null
      )
      if (
        res?.error === 'code_exists' ||
        res?.error === 'code_reserve' ||
        res?.error === 'code_indisponible'
      )
        return { ok: false, error: 'Ce code est déjà utilisé. Choisissez-en un autre.' }
      if (res?.error === 'identifiant_indisponible')
        return { ok: false, error: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.' }
      if (res?.error === 'identifiant_court')
        return { ok: false, error: "L'identifiant doit contenir au moins 3 caractères." }
      if (res?.error === 'trop_de_tentatives')
        return {
          ok: false,
          error: "Trop de tentatives d'inscription. Réessayez dans 15 minutes.",
        }
      if (res?.error === 'code_too_short')
        return { ok: false, error: 'Le code doit contenir au moins 8 caractères.' }
      if (res?.error === 'nom_requis')
        return { ok: false, error: 'Le nom est obligatoire.' }
      if (res?.error === 'manager_requis')
        return { ok: false, error: 'Sélectionnez votre manager dans la liste.' }
      if (res?.ok) return { ok: true }
      return { ok: false, error: "Échec de l'envoi de la demande : " + (res?.error || 'erreur') }
    } catch (err) {
      return { ok: false, error: "Échec de l'envoi de la demande : " + (err.message || 'erreur réseau') }
    }
  }, [])

  const changeAdminCode = useCallback(async (oldCode, newCode) => {
    try {
      const res = await profileStore.setAdminCode(oldCode, newCode)
      if (res?.error === 'bad_old') return { ok: false, error: "L'ancien code administrateur est incorrect." }
      if (res?.error === 'code_too_short') return { ok: false, error: 'Le nouveau code doit contenir au moins 8 caractères.' }
      if (res?.error === 'locked') return { ok: false, error: 'Trop de tentatives : réessayez dans 15 minutes.' }
      if (res?.ok !== true) return { ok: false, error: 'Échec du changement de code.' }
      return { ok: true }
    } catch (err) {
      return { ok: false, error: 'Échec du changement de code : ' + (err.message || 'erreur réseau') }
    }
  }, [])

  const updateOwnProfile = useCallback(async ({ name, aircraft }) => {
    try {
      const res = await profileStore.updateProfileMeta(codeRef.current, name, aircraft)
      if (res?.error === 'not_found') return { ok: false, error: 'Profil introuvable.' }
      setActiveProfile((prev) => (prev ? { ...prev, name, aircraft } : prev))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: 'Échec de la mise à jour : ' + (err.message || 'erreur réseau') }
    }
  }, [])

  const disconnect = useCallback(() => {
    localStorage.removeItem(ACTIVE_CODE_KEY)
    localStorage.removeItem(ACTIVE_IDENT_KEY)
    localStorage.removeItem(ACTIVE_AT_KEY)
    setCode('')
    setIdentifiant('')
    setActiveProfile(null)
    setTasks([])
    setTeams([])
    setAssignments({})
    setMembers([])
    setDayMembers([])
    setPrimeRequests([])
    setPrepTasks([])
    setPockets([])
    setNotes([])
    setLoaded(false)
    setIsAdmin(false)
    if (saveTimer.current) clearTimeout(saveTimer.current)
    pendingPayload.current = null
    revRef.current = 0
    lastSavedJsonRef.current = ''
    setSaveState('saved')
  }, [])

  const deleteProfile = useCallback(
    async (profileCode) => {
      const target = profileCode || code
      if (!target) return { ok: false }
      try {
        await profileStore.deleteProfile(target)
        localStorage.removeItem(cacheKeyFor(target))
        if (isConnected && target === code) {
          disconnect()
        }
        return { ok: true }
      } catch (err) {
        return { ok: false, error: err.message }
      }
    },
    [code, isConnected, disconnect]
  )

  const { addTasks, assignTask, unassignTask, removeTask, removeTasksByBlock, removeTasksByZone, removeTasksByIds, updateTask } = taskActions({
    tasks,
    setTasks,
    setAssignments,
  })
  const { addTeam, updateTeam, removeTeam, addMember, addMembers, addDayMember, addDayMembers, removeMember } = teamActions({
    setTeams,
    setAssignments,
    setMembers,
    setDayMembers,
  })
  const clearDayMembers = useCallback(() => {
    setTeams((ts) =>
      ts.map((t) => ({
        ...t,
        members: t.members.filter((m) => !dayMembers.includes(m)),
      }))
    )
    setDayMembers([])
  }, [dayMembers])
  const { addPrepTasks, removePrepTask, removePrepTasksByBlock, removePrepTasksByZone, updatePrepTask, clearPrepTasks } = prepActions({
    setPrepTasks,
    setPockets,
  })
  const { addPocket, renamePocket, addTasksToPocket, removeTasksFromPocket, removePocket } =
    pocketActions({ setPockets })
  const { addNote, updateNote, removeNote } = noteActions({ setNotes })

  const addPrimeRequest = useCallback((req) => {
    setPrimeRequests((prev) => [...prev, req])
  }, [])

  const updatePrimeRequest = useCallback((id, updates) => {
    setPrimeRequests((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)))
  }, [])

  const removePrimeRequest = useCallback((id) => {
    setPrimeRequests((prev) => prev.filter((r) => r.id !== id))
  }, [])

  const clearPrimeRequests = useCallback(() => setPrimeRequests([]), [])

  const resetData = useCallback(() => {
    setTasks([])
    setTeams([])
    setAssignments({})
    setPrepTasks([])
    setPockets([])
    setDayMembers([])
    // Seules les consignes [C] sont effacées : les notes du Bloc-notes sont conservées
    setNotes((prev) => prev.filter((n) => !String(n.title || '').startsWith('[C] ')))
  }, [])

const value = {
    tasks, teams, assignments, members, dayMembers, prepTasks, notes, pockets,
    primeRequests,
    activeProfile, code, isAdmin,
    loading, error, saveState, resolveConflict,
    connectProfile, createProfile, requestProfile, disconnect, deleteProfile,
    changeAdminCode, updateOwnProfile,
    addTasks, addTeam, updateTeam, removeTeam, assignTask, unassignTask,
      removeTask, removeTasksByBlock, removeTasksByZone, removeTasksByIds, updateTask, addMember, addMembers, addDayMember, addDayMembers,
    clearDayMembers, removeMember, resetData,
      addPrepTasks, removePrepTask, removePrepTasksByBlock, removePrepTasksByZone, updatePrepTask, clearPrepTasks,
    addPocket, renamePocket, addTasksToPocket, removeTasksFromPocket, removePocket,
    addNote, updateNote, removeNote,
    addPrimeRequest, updatePrimeRequest, removePrimeRequest, clearPrimeRequests,
  }

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp doit être utilisé dans AppProvider')
  return ctx
}
