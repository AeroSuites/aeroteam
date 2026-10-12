import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { Plane, LogOut, ClipboardList, ChevronDown } from 'lucide-react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { PRIMES_ENABLED } from '../utils/helpers'

const navItems = [
  { to: '/', label: 'Dashboard', end: true, ordre: 4 },
  { to: '/import', label: 'Import Victory', ordre: 1 },
  { to: '/taches', label: 'Tasks', ordre: 2 },
  { to: '/equipes', label: 'Teams & Assignment', ordre: 3 },
  { to: '/export', label: 'Export/Reset' },
  { to: '/preparation', label: 'Next shift prep' },
  {
    to: '/notes',
    label: 'Notepad & Messages',
    submenu: true,
    messages: true,
    children: [
      { to: '/notes', label: 'Notepad' },
      { to: '/messagerie', label: 'Messages', messages: true },
    ],
  },
  {
    to: '/consignes',
    label: 'Instructions',
    submenu: true,
    children: [
      { to: '/consignes', label: 'Instructions' },
      { to: '/import-consignes', label: 'Import instructions', adminOnly: true },
    ],
  },
]

// Navigation réduite des profils agents (charge reçue d'un leader)
const agentNavItems = [
  { to: '/ma-charge', label: 'My workload', end: true },
  { to: '/notes', label: 'Notepad' },
  { to: '/consignes', label: 'Instructions' },
  { to: '/messagerie', label: 'Messages', messages: true },
]

export default function Layout({ children }) {
  const { activeProfile, disconnect, isAdmin, saveState, resolveConflict, notes } = useApp()
  const navigate = useNavigate()
  const location = useLocation()
  const [adminMenuOpen, setAdminMenuOpen] = useState(false)
  const adminMenuRef = useRef(null)
  const [openSubmenu, setOpenSubmenu] = useState(null)
  const itemsBarRef = useRef(null)

  const [primesPending, setPrimesPending] = useState(0)
  const [adminPending, setAdminPending] = useState(0)
  const [msgUnread, setMsgUnread] = useState(0)

  // Messages non lus (pastille messagerie)
  useEffect(() => {
    if (!activeProfile?.code) return
    let alive = true
    const load = () => {
      profileStore
        .msgUnreadCount(activeProfile.code)
        .then((res) => {
          if (alive && res?.ok) setMsgUnread(Number(res.count || 0))
        })
        .catch(() => {})
    }
    load()
    const timer = setInterval(load, 30000)
    window.addEventListener('messages-updated', load)
    return () => {
      alive = false
      clearInterval(timer)
      window.removeEventListener('messages-updated', load)
    }
  }, [activeProfile?.code])

  useEffect(() => {
    if (!PRIMES_ENABLED || !isAdmin || !activeProfile?.code) return
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

  const items = activeProfile?.type === 'agent' ? agentNavItems : navItems

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

  const adminRouteActive =
    location.pathname === '/admin' || location.pathname === '/primes'

  // Ferme les sous-menus au clic extérieur
  useEffect(() => {
    if (!openSubmenu) return
    const onDown = (e) => {
      if (itemsBarRef.current && !itemsBarRef.current.contains(e.target)) {
        setOpenSubmenu(null)
      }
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openSubmenu])

  const switchProfile = () => {
    if (window.confirm(`Sign out of profile "${activeProfile?.name}"? (data is saved in the cloud)`)) {
      disconnect()
      navigate('/')
    }
  }

  return (
    <div className="min-h-screen bg-slate-100">
      <nav className="bg-gradient-to-br from-[#051039] via-[#003165] to-[#14438b] text-white border-b-4 border-[#ff0000] shadow-lg">
        <div className="relative mx-auto max-w-[1700px] px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Plane className="h-7 w-7 text-sky-300" />
            {typeof __APP_VERSION__ !== 'undefined' && (
              <p className="text-[10px] text-slate-400 font-mono hidden sm:block">
                version {__APP_VERSION__}
              </p>
            )}
          </div>
          <h1 className="hidden sm:block absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-2xl lg:text-3xl font-extrabold tracking-[0.25em] text-white pointer-events-none">
            AEROTEAM
          </h1>
          <h1 className="sm:hidden flex-1 text-center text-lg font-extrabold tracking-[0.15em] text-white">
            AEROTEAM
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {consignesCount > 0 && (
              <NavLink
                to="/"
                end
                className="flex items-center gap-1.5 text-white hover:bg-white/10 text-xs font-bold bg-white/10 border border-white/40 rounded-full px-3 py-1.5"
                title={`${consignesCount} aircraft instruction(s) — see the dashboard`}
              >
                <ClipboardList className="h-4 w-4" /> {consignesCount}
              </NavLink>
            )}
            <div className="text-right leading-tight">
              <p className="text-[10px] sm:text-xs text-slate-400">Profile</p>
              <p className="text-xs sm:text-sm font-semibold text-sky-300 max-w-[30vw] sm:max-w-[200px] truncate">{activeProfile?.name}</p>
              {activeProfile?.aircraft && (
                <p className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[30vw] sm:max-w-[200px]">✈ {activeProfile.aircraft}</p>
              )}
              {saveState === 'saving' && (
                <p className="text-[10px] sm:text-xs text-[#92c5ed] animate-pulse">Saving…</p>
              )}
              {saveState === 'offline' && (
                <p
                  className="text-[10px] sm:text-xs text-[#ff0000] font-semibold"
                  title="Save failed: automatic retry every 30 seconds. Check your connection and stay on this page."
                >
                  Offline ⚠
                </p>
              )}
            </div>
            <button
              onClick={switchProfile}
              className="text-slate-300 hover:text-white hover:bg-slate-800 p-2 rounded-md"
              title="Switch profile"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
        {saveState === 'conflict' && (
          <div className="mx-auto max-w-[1700px] px-4 py-2 flex flex-wrap items-center justify-between gap-3 bg-amber-500 text-white text-sm">
            <span className="font-semibold">
              ⚠ Save conflict: your local changes and those saved by another device diverge.
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => resolveConflict('reload')}
                className="bg-white text-amber-700 px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-50"
              >
                Reload from server
              </button>
              <button
                onClick={() => {
                  if (window.confirm('Overwrite the server data with those of this device? This action is irreversible.')) {
                    resolveConflict('overwrite')
                  }
                }}
                className="bg-amber-700 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-amber-800"
              >
                Overwrite with my data
              </button>
            </div>
          </div>
        )}
        <div ref={itemsBarRef} className="mx-auto max-w-[1700px] px-2 pb-2 flex flex-wrap items-center gap-1">
          {items.map((item) => {
            const children = (item.children || []).filter((c) => !c.adminOnly || isAdmin)
            if (!item.submenu || children.length < 2) {
              return (
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
                    <span className="inline-flex items-center justify-center h-4 w-4 mr-1.5 rounded-full bg-white text-[10px] font-bold text-[#051039] align-middle" title={`Step ${item.ordre} — order of use`}>
                      {item.ordre}
                    </span>
                  )}
                  {item.label}
                  {item.messages && msgUnread > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold align-middle">
                      {msgUnread}
                    </span>
                  )}
                </NavLink>
              )
            }
            const open = openSubmenu === item.to
            const routeActive = children.some((c) => location.pathname === c.to)
            return (
              <div
                key={item.to}
                className="relative shrink-0"
                onMouseEnter={() => setOpenSubmenu(item.to)}
                onMouseLeave={() => setOpenSubmenu((o) => (o === item.to ? null : o))}
              >
                <button
                  onClick={() => setOpenSubmenu((o) => (o === item.to ? null : item.to))}
                  className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap font-medium transition-colors ${
                    routeActive || open
                      ? 'bg-sky-500 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                  title={children.map((c) => c.label).join(' / ')}
                >
                  {item.label}
                  {item.messages && msgUnread > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold align-middle">
                      {msgUnread}
                    </span>
                  )}
                  <ChevronDown
                    className={`h-3.5 w-3.5 transition-transform ${
                      open ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {open && (
                  <div className="absolute left-0 top-full z-50 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-1 min-w-[190px]">
                    {children.map((child) => (
                      <NavLink
                        key={child.to}
                        to={child.to}
                        onClick={() => setOpenSubmenu(null)}
                        className={({ isActive }) =>
                          `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                            isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                          }`
                        }
                      >
                        <span>{child.label}</span>
                        {child.messages && msgUnread > 0 && (
                          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold">
                            {msgUnread}
                          </span>
                        )}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          {isAdmin && (
            <div className="relative shrink-0" ref={adminMenuRef}>
              <button
                onClick={() => setAdminMenuOpen((o) => !o)}
                className={`relative flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[13px] whitespace-nowrap font-medium transition-colors ${
                  adminRouteActive || adminMenuOpen
                    ? 'bg-sky-500 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
                title="Administration and Bonuses"
              >
                Administration
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform ${
                    adminMenuOpen ? 'rotate-180' : ''
                  }`}
                />
                {(adminPending > 0 || (PRIMES_ENABLED && primesPending > 0)) && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold shadow">
                    {adminPending + (PRIMES_ENABLED ? primesPending : 0)}
                  </span>
                )}
              </button>
              {adminMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-slate-800 rounded-lg shadow-xl border border-slate-700 py-1 min-w-[230px]">
                  <NavLink
                    to="/admin"
                    onClick={() => setAdminMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                        isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                      }`
                    }
                  >
                    <span>Administration</span>
                    {adminPending > 0 && (
                      <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold">
                        {adminPending}
                      </span>
                    )}
                  </NavLink>
                  {PRIMES_ENABLED && (
                    <NavLink
                      to="/primes"
                      onClick={() => setAdminMenuOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between gap-2 px-3 py-2 text-sm ${
                          isActive ? 'bg-sky-600 text-white' : 'text-slate-200 hover:bg-slate-700'
                        }`
                      }
                    >
                      <span>Bonuses</span>
                      {primesPending > 0 && (
                        <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[#ff0000] text-white text-[10px] font-bold">
                          {primesPending}
                        </span>
                      )}
                    </NavLink>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </nav>
      <main className="mx-auto max-w-[1700px] px-4 py-6">{children}</main>
    </div>
  )
}
