import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Plane, LogOut, ClipboardList, ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'

const navItems = [
  { to: '/', label: 'Tableau de bord', end: true, ordre: 5 },
  { to: '/import', label: 'Import Victory', ordre: 1 },
  { to: '/taches', label: 'Tâches', ordre: 4 },
  { to: '/equipes', label: 'Équipes', ordre: 2 },
  { to: '/affectation', label: 'Affectation', ordre: 3 },
  { to: '/export', label: 'Export' },
  { to: '/preparation', label: 'Préparation vac suivante' },
  { to: '/notes', label: 'Bloc-notes' },
  { to: '/consignes', label: 'Consignes' },
]

export default function Layout({ children }) {
  const { activeProfile, disconnect, isAdmin, saveState, resolveConflict, notes } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const adminMenuRef = useRef(null)

  const [primesPending, setPrimesPending] = useState(0)
  const [adminPending, setAdminPending] = useState(0)

  useEffect(() => {
    if (!isAdmin || !activeProfile?.code) return
    let alive = true
    const load = () => {
      profileStore
        .adminPendingPrimesCount(activeProfile.code)
        .then((res) => {
          if (alive && res?.ok) setPrimesPending(Number(res.count || 0))
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 60000)
    const onUpdate = () => load()
    window.addEventListener('primes-updated', onUpdate)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('primes-updated', onUpdate)
    }
  }, [isAdmin, activeProfile?.code])

  useEffect(() => {
    if (!isAdmin || !activeProfile?.code) return
    let alive = true
    const load = () => {
      profileStore
        .adminListPendingProfiles(activeProfile.code)
        .then((res) => {
          if (alive && res?.ok) setAdminPending((res.pending || []).length)
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 60000)
    const onUpdate = () => load()
    window.addEventListener('admin-updated', onUpdate)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('admin-updated', onUpdate)
    }
  }, [isAdmin, activeProfile?.code])

  const consignesCount = (notes || []).filter((n) =>
    String(n.title || '').startsWith('[C] ')
  ).length

  const items = navItems

  // Ferme le menu Administration au clic extérieur
  useEffect(() => {
    if (!adminMenuOpen) return
    const onDown = (e) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setAdminMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [adminMenuOpen])

  // Ferme le menu quand on change de page
  useEffect(() => {
    setAdminMenuOpen(false)
  }, [location.pathname])

  const adminRouteActive =
    location.pathname === '/admin' ||
    location.pathname === '/primes' ||
    location.pathname === '/import-consignes'

  const switchProfile = () => {
    if (window.confirm(`Quitter le profil « ${activeProfile?.name} » ? (les données sont sauvegardées dans le cloud)`)) {
      disconnect()
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-slate-900 text-white shadow-lg">
        <div className="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Plane className="h-7 w-7 text-sky-400" />
            <span className="text-xl font-bold">AeroTeam</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {consignesCount > 0 && (
              <NavLink
                to="/"
                end
                className="flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-xs font-bold bg-amber-500/10 border border-amber-400/40 rounded-full px-3 py-1.5"
                title={`${consignesCount} consigne(s) de l'avion — voir le tableau de bord`}
              >
                <ClipboardList className="h-4 w-4" /> {consignesCount}
              </NavLink>
            )}
            <div className="text-right leading-tight">
              <p className="text-[10px] sm:text-xs text-slate-400">Profil</p>
              <p className="text-xs sm:text-sm font-semibold text-sky-300 max-w-[30vw] sm:max-w-[200px] truncate">{activeProfile?.name}</p>
              {activeProfile?.aircraft && (
                <p className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[30vw] sm:max-w-[200px]">✈ {activeProfile.aircraft}</p>
              )}
              {saveState === 'saving' && (
                <p className="text-[10px] sm:text-xs text-amber-300 animate-pulse">Sauvegarde…</p>
              )}
              {saveState === 'offline' && (
                <p
                  className="text-[10px] sm:text-xs text-red-400 font-semibold"
                  title="La sauvegarde a échoué : nouvelle tentative automatique toutes les 30 secondes. Vérifiez la connexion et restez sur cette page."
                >
                  Hors ligne ⚠
                </p>
              )}
            </div>
            <button
              onClick={switchProfile}
              className="text-slate-300 hover:text-white hover:bg-slate-800 p-2 rounded-md"
              title="Changer de profil"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
        {saveState === 'conflict' && (
          <div className="mx-auto max-w-7xl px-4 py-2 flex flex-wrap items-center justify-between gap-3 bg-amber-500 text-white text-sm">
            <span className="font-semibold">
              ⚠ Conflit de sauvegarde : vos modifications locales et celles enregistrées par un autre appareil divergent.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => resolveConflict('reload')}
                className="bg-white text-amber-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-50"
              >
                Recharger depuis le serveur
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Écraser les données du serveur avec celles de cet appareil ? Cette action est irréversible.')) {
                    resolveConflict('overwrite')
                  }
                }}
                className="bg-amber-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-800"
              >
                Écraser avec mes données
              </button>
            </div>
          </div>
        )}
        <div className="mx-auto max-w-7xl px-2 pb-2 flex flex-wrap items-center gap-1">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `relative px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap font-medium transition-colors shrink-0 ${
                  isActive
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
            >
              {item.ordre && (
                <span className="inline-flex items-center justify-center h-4 w-4 mr-1.5 rounded-full bg-amber-400 text-[10px] font-bold text-slate-900 align-middle" title={`Étape ${item.ordre} — ordre d'utilisation`}>
                  {item.ordre}
                </span>
              )}
              {item.label}
            </NavLink>
          ))}

          {isAdmin && (
            <div className="relative shrink-0" ref={adminMenuRef}>
              <button
                onClick={() => setAdminMenuOpen((o) => !o)}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap font-medium transition-colors ${
                  adminRouteActive || adminMenuOpen
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title="Administration, Primes et Import consignes"
              >
                Administration
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    adminMenuOpen ? 'rotate-180' : ''
                  }`}
                />
                {(primesPending > 0 || adminPending > 0) && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold shadow">
                    {primesPending + adminPending}
                  </span>
                )}
              </button>
              {adminMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-1 min-w-[230px]">
                  <NavLink
                    to="/admin"
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                        isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                      }`
                    }
                  >
                    <span>Administration</span>
                    {adminPending > 0 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-white text-[10px] font-bold">
                        {adminPending}
                      </span>
                    )}
                  </NavLink>
                  <NavLink
                    to="/primes"
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                        isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                      }`
                    }
                  >
                    <span>Primes</span>
                    {primesPending > 0 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-emerald-500 text-white text-[10px] font-bold">
                        {primesPending}
                      </span>
                    )}
                  </NavLink>
                  <NavLink
                    to="/import-consignes"
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                        isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                      }`
                    }
                  >
                    <span>Import consignes</span>
                  </NavLink>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
