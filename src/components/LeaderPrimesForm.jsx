import { useEffect, useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { makeId, getCategoryLabel } from '../utils/helpers'
import { Trash2, Save, Send, AlertTriangle, CheckCircle2, Users } from 'lucide-react'

export default function LeaderPrimesForm() {
  const {
    code,
    teams,
    tasks,
    primeRequests,
    addPrimeRequest,
    removePrimeRequest,
    clearPrimeRequests,
  } = useApp()

  const [managers, setManagers] = useState(null)
  const [managerId, setManagerId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const today = new Date().toISOString().slice(0, 10)
  const [date, setDate] = useState(today)
  const [note, setNote] = useState('')

  const [checked, setChecked] = useState([])
  const [rows, setRows] = useState({})

  useEffect(() => {
    profileStore
      .listManagers()
      .then((res) => setManagers(res?.ok ? res.managers || [] : []))
      .catch(() => setManagers([]))
  }, [])

  // Membres de toutes les équipes créées (uniques)
  const members = useMemo(() => {
    const out = []
    ;(teams || []).forEach((t) => {
      ;(t.members || []).forEach((m) => {
        if (!out.includes(m)) out.push(m)
      })
    })
    return out.sort((a, b) => a.localeCompare(b))
  }, [teams])

  const blocks = useMemo(
    () => [...new Set((tasks || []).map((t) => t.taskType).filter(Boolean))].sort(),
    [tasks]
  )

  const zonesFor = (block) =>
    [...new Set(
      (tasks || [])
        .filter((t) => (t.taskType || 'AUTRE') === block)
        .map((t) => t.workArea || 'Autre')
    )].sort()

  const tasksFor = (block, zone) =>
    (tasks || [])
      .filter((t) => (t.taskType || 'AUTRE') === block && (t.workArea || 'Autre') === zone)
      .sort((a, b) => Number(a.seq) - Number(b.seq))

  const setRow = (member, updates) =>
    setRows((prev) => ({ ...prev, [member]: { ...prev[member], ...updates } }))

  const toggleChecked = (member) =>
    setChecked((prev) =>
      prev.includes(member) ? prev.filter((m) => m !== member) : [...prev, member]
    )

  const addCheckedLines = () => {
    setError('')
    setMsg('')
    if (checked.length === 0) {
      setError('Cochez au moins un bénéficiaire.')
      return
    }
    if (!date) {
      setError("La date d'intervention est obligatoire.")
      return
    }
    const lines = []
    for (const member of checked) {
      const r = rows[member] || {}
      if (!r.block || !r.zone || !r.taskId) {
        setError(`Choisissez la tâche effectuée pour « ${member} ».`)
        return
      }
      const task = (tasks || []).find((t) => t.id === r.taskId)
      if (!task) {
        setError(`Tâche introuvable pour « ${member} ».`)
        return
      }
      const avion = (r.avion || task.registration || '').trim().toUpperCase()
      if (!avion) {
        setError(`Renseignez l'avion pour « ${member} » (la tâche choisie n'en a pas).`)
        return
      }
      const element = `${getCategoryLabel(r.block)} / ${r.zone} — N° ${task.seq || '—'} · ${
        task.description || ''
      }`
      lines.push({
        id: makeId('prd'),
        beneficiaire: member,
        identifiant: '',
        element,
        avion,
        date,
        description: note.trim(),
      })
    }
    lines.forEach((l) => addPrimeRequest(l))
    setChecked([])
    setRows({})
    setMsg(`${lines.length} ligne(s) ajoutée(s) — cliquez « Enregistrer » ou transmettez.`)
  }

  const transmettre = async () => {
    setError('')
    setMsg('')
    if (!managerId) {
      setError('Choisissez le manager destinataire.')
      return
    }
    if (!primeRequests.length) {
      setError('Aucune ligne à transmettre.')
      return
    }
    setBusy(true)
    let sent = 0
    const failed = []
    for (const r of primeRequests) {
      try {
        const res = await profileStore.leaderSubmitPrime(
          code,
          r.beneficiaire,
          r.identifiant,
          r.element,
          r.avion,
          r.date,
          r.description,
          managerId
        )
        if (res?.ok) sent += 1
        else failed.push(r)
      } catch {
        failed.push(r)
      }
    }
    clearPrimeRequests()
    failed.forEach((r) => addPrimeRequest(r))
    if (sent > 0) setMsg(`${sent} déclaration(s) transmise(s) au manager.`)
    if (failed.length > 0)
      setError(
        `${failed.length} ligne(s) n'ont pas pu être transmises — elles restent dans la liste.`
      )
    setBusy(false)
  }

  const inputClass = 'border border-slate-300 rounded-md px-2.5 py-1.5 text-sm bg-white'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-4 sm:p-6 border-l-4 border-l-emerald-500">
        <h2 className="font-semibold text-slate-800 mb-1">
          Déclarer les bénéficiaires de la prime toilettes
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Cochez les membres des équipes, choisissez pour chacun la <strong>tâche effectuée</strong>{' '}
          (bloc → sous-bloc → ligne importée de Victory), puis transmettez au manager. Le{' '}
          <strong>type de prime (T1/T2) reste choisi par le manager</strong> à la validation.
        </p>

        <div className="flex flex-wrap items-end gap-3 mb-5">
          <label className="text-xs font-medium text-slate-600">
            Date d'intervention *
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={`${inputClass} block mt-1`}
            />
          </label>
          <label className="text-xs font-medium text-slate-600 flex-1 min-w-[220px]">
            Note commune (facultatif)
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ex : intervention duo sur le même avion"
              className={`${inputClass} block mt-1 w-full`}
            />
          </label>
        </div>

        <h3 className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <Users className="h-4 w-4 text-sky-500" /> Membres des équipes ({members.length})
        </h3>
        {members.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Aucun membre dans vos équipes — composez d'abord vos équipes dans la page Équipes.
          </p>
        )}
        <div className="space-y-2">
          {members.map((m) => {
            const isChecked = checked.includes(m)
            const r = rows[m] || {}
            const zoneOptions = r.block ? zonesFor(r.block) : []
            const taskOptions = r.block && r.zone ? tasksFor(r.block, r.zone) : []
            return (
              <div
                key={m}
                className={`border rounded-lg px-3 py-2 ${
                  isChecked ? 'border-emerald-300 bg-emerald-50/40' : 'border-slate-200'
                }`}
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleChecked(m)}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  <span className="font-medium text-sm text-slate-800">{m}</span>
                </label>
                {isChecked && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-4">
                    <select
                      value={r.block || ''}
                      onChange={(e) =>
                        setRow(m, { block: e.target.value, zone: '', taskId: '' })
                      }
                      className={inputClass}
                    >
                      <option value="">— Bloc —</option>
                      {blocks.map((b) => (
                        <option key={b} value={b}>
                          {getCategoryLabel(b)}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.zone || ''}
                      onChange={(e) => setRow(m, { zone: e.target.value, taskId: '' })}
                      className={inputClass}
                      disabled={!r.block}
                    >
                      <option value="">— Sous-bloc —</option>
                      {zoneOptions.map((z) => (
                        <option key={z} value={z}>
                          {z}
                        </option>
                      ))}
                    </select>
                    <select
                      value={r.taskId || ''}
                      onChange={(e) => {
                        const task = (tasks || []).find((t) => t.id === e.target.value)
                        setRow(m, {
                          taskId: e.target.value,
                          avion: task?.registration || r.avion || '',
                        })
                      }}
                      className={inputClass}
                      disabled={!r.zone}
                    >
                      <option value="">— Tâche —</option>
                      {taskOptions.map((t) => (
                        <option key={t.id} value={t.id}>
                          N° {t.seq || '—'} · {String(t.description || '').slice(0, 60)}
                        </option>
                      ))}
                    </select>
                    <input
                      value={r.avion || ''}
                      onChange={(e) => setRow(m, { avion: e.target.value })}
                      placeholder="Avion (auto depuis la tâche)"
                      className={`${inputClass} font-mono`}
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {members.length > 0 && (
          <button
            onClick={addCheckedLines}
            className="mt-4 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 text-sm font-semibold"
          >
            Ajouter les bénéficiaires cochés
          </button>
        )}
      </div>

      {(msg || error) && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm ${
            error
              ? 'bg-red-50 border border-red-200 text-red-700'
              : 'bg-emerald-50 border border-emerald-200 text-emerald-700'
          }`}
        >
          {error ? (
            <>
              <AlertTriangle className="h-4 w-4" /> {error}
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4" /> {msg}
            </>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <h3 className="font-semibold text-slate-800 mb-3">
          Lignes à transmettre{' '}
          <span className="text-sm font-normal text-slate-400">({primeRequests.length})</span>
        </h3>
        {primeRequests.length === 0 ? (
          <p className="text-sm text-slate-400 italic">
            Aucune ligne pour le moment — cochez les bénéficiaires ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Bénéficiaire</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Tâche (bloc / zone / ligne)</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Date</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {primeRequests.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.beneficiaire}</td>
                    <td className="px-3 py-2 text-slate-600">{r.element}</td>
                    <td className="px-3 py-2 font-mono font-bold text-sky-700">{r.avion}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.date
                        ? new Date(`${r.date}T12:00:00`).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => removePrimeRequest(r.id)}
                        className="text-slate-400 hover:text-red-600"
                        title="Retirer cette ligne"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={() => {
              setError('')
              setMsg('Lignes enregistrées — synchronisation automatique avec le cloud.')
            }}
            disabled={primeRequests.length === 0}
            className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-md hover:bg-slate-900 disabled:opacity-50 text-sm font-semibold"
            title="Vos lignes sont conservées dans votre profil (aucun envoi à ce stade)"
          >
            <Save className="h-4 w-4" /> Enregistrer
          </button>
          <select
            value={managerId}
            onChange={(e) => setManagerId(e.target.value)}
            className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
          >
            <option value="">
              {managers === null ? 'Chargement des managers…' : '— Choisir le manager —'}
            </option>
            {(managers || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button
            onClick={transmettre}
            disabled={busy || primeRequests.length === 0 || !managerId}
            className="flex items-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
          >
            <Send className="h-4 w-4" /> {busy ? 'Transmission…' : 'Transmettre au manager'}
          </button>
        </div>
      </div>
    </div>
  )
}
