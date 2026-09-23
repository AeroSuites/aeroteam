import { useEffect, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { priorityToken } from '../utils/helpers'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

const currentShiftNow = () => {
  const h = new Date().getHours()
  if (h >= 5 && h < 13) return 'matin'
  if (h >= 13 && h < 21) return 'soir'
  return 'nuit'
}

// Panneau partagé : consignes des avions (jour × shift) avec cases à cocher.
// Utilisé dans Consignes, Affectation et Équipes — les coches sont INDÉPENDANTES
// selon l'onglet d'origine (scope).
export default function ConsignesAvions({ scope = 'affectation' }) {
  const { activeProfile } = useApp()
  const CHECKS_KEY = `consignes-checks-${scope}-v1`
  // Affectation conserve l'ancien format de clés (compatibilité des coches existantes)
  const keyPrefix = scope === 'affectation' ? '' : `${scope}|`
  const [conDay, setConDay] = useState(() => DAY_NAMES[new Date().getDay()])
  const [conShift, setConShift] = useState(currentShiftNow)
  const [conList, setConList] = useState(null)
  const [conError, setConError] = useState('')
  const [conLoading, setConLoading] = useState(false)

  // Coches des lignes de consignes (partagées via Supabase, cache local de secours)
  const [conChecks, setConChecks] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECKS_KEY)) || {}
    } catch {
      return {}
    }
  })

  const saveLocalChecks = (next) => {
    try {
      localStorage.setItem(CHECKS_KEY, JSON.stringify(next))
    } catch {
      // stockage indisponible : les coches restent valables pour la session
    }
  }

  const loadChecks = async () => {
    try {
      const checks = await profileStore.getConsigneChecks()
      setConChecks(checks || {})
      saveLocalChecks(checks || {})
    } catch {
      // migration pas encore exécutée : on garde le cache local
    }
  }

  const loadConsignes = async (day = conDay, shift = conShift) => {
    setConLoading(true)
    setConError('')
    try {
      const list = await profileStore.getAircraftConsignes(day, shift)
      setConList(Array.isArray(list) ? list : [])
    } catch (err) {
      setConError(err?.message || 'Erreur de chargement des consignes')
      setConList([])
    }
    setConLoading(false)
  }

  useEffect(() => {
    loadConsignes()
    loadChecks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleConsigneCheck = (key) => {
    const nowChecked = !conChecks[key]
    setConChecks((prev) => {
      const next = { ...prev }
      if (nowChecked) next[key] = true
      else delete next[key]
      saveLocalChecks(next)
      return next
    })
    profileStore.setConsigneCheck(key, nowChecked, activeProfile?.name || '').catch(() => {})
  }

  const clearChecks = () => {
    setConChecks({})
    saveLocalChecks({})
    profileStore.clearConsigneChecks().catch(() => {})
  }

  return (
    <div className="bg-white rounded-xl shadow p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-amber-500" /> Consignes des avions
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={conDay}
            onChange={(e) => {
              setConDay(e.target.value)
              loadConsignes(e.target.value, conShift)
            }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
          >
            {DAY_NAMES.map((d) => (
              <option key={d} value={d}>
                {d.charAt(0) + d.slice(1).toLowerCase()}
              </option>
            ))}
          </select>
          <select
            value={conShift}
            onChange={(e) => {
              setConShift(e.target.value)
              loadConsignes(conDay, e.target.value)
            }}
            className="border border-slate-300 rounded-md px-2 py-1.5 text-xs bg-white"
          >
            {['matin', 'soir', 'nuit'].map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <button
            onClick={() => loadConsignes()}
            disabled={conLoading}
            className="text-xs font-semibold text-sky-600 border border-sky-200 hover:bg-sky-50 rounded-full px-3 py-1 disabled:opacity-50"
          >
            {conLoading ? 'Chargement…' : 'Actualiser'}
          </button>
          {Object.keys(conChecks).length > 0 && (
            <button
              onClick={clearChecks}
              className="text-xs text-slate-500 hover:text-red-600 border border-slate-200 rounded-full px-3 py-1"
              title="Décocher toutes les consignes cochées"
            >
              Décocher tout
            </button>
          )}
        </div>
      </div>
      {conError && <p className="text-xs text-red-600 mt-2">{conError}</p>}
      {conList === null ? (
        <p className="text-xs text-slate-400 mt-3">Chargement…</p>
      ) : conList.length === 0 ? (
        <p className="text-xs text-slate-400 mt-3 italic">
          Aucune consigne transmise pour{' '}
          {conDay.charAt(0) + conDay.slice(1).toLowerCase()} {conShift}.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 mt-3">
          {conList.map((c, i) => (
            <div key={i} className="border border-amber-200 bg-amber-50/40 rounded-lg p-3">
              <p className="text-xs font-bold text-amber-800">
                {String(c.title || '').replace('[C] ', '')}
              </p>
              <p className="text-[10px] text-slate-400">
                {c.profile_name}
                {c.aircraft ? ` · ${c.aircraft}` : ''}
              </p>
              <div className="mt-1 space-y-0.5">
                {String(c.content || '-')
                  .split('\n')
                  .map((line, li) => {
                    const isTask = line.trim().startsWith('- ')
                    const tok = priorityToken(line)
                    const badge = tok ? (
                      <span
                        className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200 whitespace-nowrap"
                        title="Ligne prioritaire (MEL / EXMP)"
                      >
                        {tok}
                      </span>
                    ) : null
                    if (!isTask) {
                      return (
                        <p
                          key={li}
                          className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap"
                        >
                          {line || '\u00A0'}
                          {badge}
                        </p>
                      )
                    }
                    const checkKey = `${keyPrefix}${c.profile_id || c.profile_name}|${c.title}|${line.trim()}`
                    const checked = !!conChecks[checkKey]
                    return (
                      <label
                        key={li}
                        className="flex items-start gap-2 cursor-pointer rounded px-1 -mx-1 hover:bg-amber-100/60"
                        title={checked ? 'Décocher' : 'Cocher cette consigne'}
                      >
                        <span
                          className={`text-xs leading-relaxed flex-1 ${
                            checked ? 'line-through text-slate-400' : 'text-slate-700'
                          }`}
                        >
                          {line}
                          {badge}
                        </span>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleConsigneCheck(checkKey)}
                          className="mt-0.5 h-3.5 w-3.5 accent-emerald-600 shrink-0"
                        />
                      </label>
                    )
                  })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
