import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { makeId } from '../utils/helpers'
import { Plus, Trash2, Save, Send, AlertTriangle, CheckCircle2 } from 'lucide-react'

const CATEGORIES = {
  V034: 'Toilette T1 (V034)',
  V035: 'Toilette T2 (V035)',
}

export default function LeaderPrimesForm() {
  const {
    code,
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

  const [benef, setBenef] = useState('')
  const [ident, setIdent] = useState('')
  const [type, setType] = useState('V034')
  const [avion, setAvion] = useState('')
  const [date, setDate] = useState('')
  const [desc, setDesc] = useState('')

  useEffect(() => {
    profileStore
      .listManagers()
      .then((res) => setManagers(res?.ok ? res.managers || [] : []))
      .catch(() => setManagers([]))
  }, [])

  const addLine = () => {
    setError('')
    setMsg('')
    if (!benef.trim()) {
      setError('Le nom du bénéficiaire est obligatoire.')
      return
    }
    if (!avion.trim()) {
      setError("L'avion / immatriculation est obligatoire.")
      return
    }
    if (!date) {
      setError("La date d'intervention est obligatoire.")
      return
    }
    addPrimeRequest({
      id: makeId('prd'),
      beneficiaire: benef.trim(),
      identifiant: ident.trim().toLowerCase(),
      type,
      avion: avion.trim().toUpperCase(),
      date,
      description: desc.trim(),
    })
    setBenef('')
    setIdent('')
    setAvion('')
    setDate('')
    setDesc('')
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
          r.type,
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

  const inputClass = 'border border-slate-300 rounded-md px-3 py-2 text-sm bg-white'

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow p-4 sm:p-6 border-l-4 border-l-emerald-500">
        <h2 className="font-semibold text-slate-800 mb-1">
          Déclarer les bénéficiaires de la prime toilettes
        </h2>
        <p className="text-xs text-slate-500 mb-4">
          Ajoutez les agents bénéficiaires (type d'intervention, date, avion…), enregistrez vos
          lignes, puis transmettez-les au manager choisi. Le manager validera comme d'habitude
          (il reçoit un email et la notification dans son espace Primes).
        </p>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <input
            value={benef}
            onChange={(e) => setBenef(e.target.value)}
            placeholder="Bénéficiaire (nom complet) *"
            className={inputClass}
          />
          <input
            value={ident}
            onChange={(e) => setIdent(e.target.value)}
            placeholder="Identifiant du bénéficiaire (facultatif)"
            className={`${inputClass} font-mono`}
          />
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className={inputClass}
            title="Type d'intervention"
          >
            <option value="V034">Toilette T1 (V034)</option>
            <option value="V035">Toilette T2 (V035)</option>
          </select>
          <input
            value={avion}
            onChange={(e) => setAvion(e.target.value)}
            placeholder="Avion / immatriculation (ex : F-GKXT) *"
            className={`${inputClass} font-mono`}
          />
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass}
            title="Date de l'intervention"
          />
          <input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Description (facultatif)"
            className={inputClass}
          />
        </div>
        <button
          onClick={addLine}
          className="mt-3 flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-md hover:bg-emerald-700 text-sm font-semibold"
        >
          <Plus className="h-4 w-4" /> Ajouter la ligne
        </button>
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
            Aucune ligne pour le moment — ajoutez les bénéficiaires ci-dessus.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="text-left bg-slate-50">
                  <th className="px-3 py-2 font-semibold text-slate-700">Bénéficiaire</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Identifiant</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Type</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Date</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Description</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {primeRequests.map((r) => (
                  <tr key={r.id} className="border-b hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium">{r.beneficiaire}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-500">
                      {r.identifiant || '—'}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          r.type === 'V034'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-teal-100 text-teal-800'
                        }`}
                      >
                        {CATEGORIES[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-mono font-bold text-sky-700">{r.avion}</td>
                    <td className="px-3 py-2 text-slate-600">
                      {r.date
                        ? new Date(`${r.date}T12:00:00`).toLocaleDateString('fr-FR')
                        : '—'}
                    </td>
                    <td className="px-3 py-2 max-w-[220px]">
                      <span className="truncate block" title={r.description}>
                        {r.description || '—'}
                      </span>
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
