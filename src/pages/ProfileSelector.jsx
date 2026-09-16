import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import { Plane, LogIn, KeyRound, UserPlus } from 'lucide-react'

export default function ProfileSelector() {
  const { connectProfile, requestProfile, error } = useApp()

  const [mode, setMode] = useState('login')
  const [loginIdent, setLoginIdent] = useState('')
  const [code, setCode] = useState('')
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState('')

  const [regIdent, setRegIdent] = useState('')
  const [regName, setRegName] = useState('')
  const [regCode, setRegCode] = useState('')
  const [regCode2, setRegCode2] = useState('')
  const [managers, setManagers] = useState(null)
  const [managerId, setManagerId] = useState('')
  const [regBusy, setRegBusy] = useState(false)
  const [regError, setRegError] = useState('')
  const [regOk, setRegOk] = useState(false)

  useEffect(() => {
    profileStore
      .listManagers()
      .then((res) => setManagers(res?.ok ? res.managers || [] : []))
      .catch(() => setManagers([]))
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    setConnectError('')
    const res = await connectProfile(loginIdent, code)
    if (!res.ok) setConnectError(res.error)
    setConnecting(false)
  }

  const handleRegister = async () => {
    setRegError('')
    setRegOk(false)
    if (!regIdent.trim() || regIdent.trim().length < 3) {
      setRegError("L'identifiant doit contenir au moins 3 caractères.")
      return
    }
    if (!regName.trim()) {
      setRegError('Le nom est obligatoire.')
      return
    }
    if (!managerId) {
      setRegError('Sélectionnez votre manager dans la liste.')
      return
    }
    if (!regCode || regCode.length < 8) {
      setRegError('Le code doit contenir au moins 8 caractères.')
      return
    }
    if (regCode !== regCode2) {
      setRegError('Les deux codes ne correspondent pas.')
      return
    }
    setRegBusy(true)
    const res = await requestProfile(regIdent, regCode, regName, managerId)
    setRegBusy(false)
    if (!res.ok) {
      setRegError(res.error)
      return
    }
    setRegOk(true)
    setRegIdent('')
    setRegName('')
    setRegCode('')
    setRegCode2('')
    setManagerId('')
  }

  return (
    <div className="login-screen min-h-screen flex items-center justify-center p-4">
      <div className="login-grid" />
      <div className="relative z-10 bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl w-full max-w-lg p-6">
        <div className="flex items-center gap-3 mb-2">
          <Plane className="h-8 w-8 text-sky-500" />
          <h1 className="text-2xl font-bold text-slate-900">AeroTeam</h1>
        </div>

        {mode === 'login' ? (
          <>
            <p className="text-slate-500 mb-6">
              Entrez votre <strong className="text-slate-700">identifiant</strong> et votre{' '}
              <strong className="text-slate-700">code personnel</strong> pour retrouver votre
              profil et vos données, sur n'importe quel appareil.
            </p>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-sky-500" /> Se connecter à mon profil
              </h2>
              <input
                value={loginIdent}
                onChange={(e) => setLoginIdent(e.target.value)}
                  placeholder="Votre identifiant de connexion"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                autoFocus
              />
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConnect()}
                type="password"
                placeholder="Votre code personnel"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
              />
              {connectError && <p className="text-sm text-red-600">{connectError}</p>}
              {!connectError && error && <p className="text-sm text-red-600">{error}</p>}
              <button
                onClick={handleConnect}
                disabled={connecting || !code.trim() || !loginIdent.trim()}
                className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <LogIn className="h-4 w-4" /> {connecting ? 'Connexion…' : 'Se connecter'}
              </button>
            </div>

            <p className="text-center text-sm text-slate-500 mt-4">
              Pas encore de compte ?{' '}
              <button
                onClick={() => {
                  setMode('register')
                  setConnectError('')
                }}
                className="text-sky-600 hover:underline font-semibold"
              >
                Créer mon compte
              </button>
            </p>
          </>
        ) : (
          <>
            <p className="text-slate-500 mb-6">
              Créez votre profil : <strong className="text-slate-700">identifiant + nom + code personnel</strong>
              . Un administrateur devra valider votre demande avant votre première connexion.
            </p>

            <div className="border border-slate-200 rounded-xl p-4 space-y-3">
              <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-sky-500" /> Demande de création de profil
              </h2>
              <input
                value={regIdent}
                onChange={(e) => setRegIdent(e.target.value)}
                placeholder="Ce sera votre identifiant de connexion (3 caractères minimum)"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
                autoFocus
              />
              <input
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder="Nom complet"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
              />
              <select
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
              >
                <option value="">
                  {managers === null ? 'Chargement des managers…' : '— Choisir mon manager —'}
                </option>
                {(managers || []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              {managers && managers.length === 0 && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Aucun manager disponible pour le moment. Contactez votre responsable avant de
                  créer un compte.
                </p>
              )}
              <input
                value={regCode}
                onChange={(e) => setRegCode(e.target.value)}
                type="password"
                placeholder="Code personnel (8 caractères minimum)"
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
              />
              <input
                value={regCode2}
                onChange={(e) => setRegCode2(e.target.value)}
                type="password"
                placeholder="Confirmer le code"
                onKeyDown={(e) => e.key === 'Enter' && handleRegister()}
                className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
              />
              {regOk && (
                <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">
                  Demande envoyée ! Votre manager doit valider votre compte — vous pourrez vous
                  connecter une fois validé.
                </p>
              )}
              {regError && <p className="text-sm text-red-600">{regError}</p>}
              <button
                onClick={handleRegister}
                disabled={regBusy || !managers || managers.length === 0}
                className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <UserPlus className="h-4 w-4" /> {regBusy ? 'Envoi…' : 'Envoyer ma demande'}
              </button>
            </div>

            <p className="text-center text-sm text-slate-500 mt-4">
              <button
                onClick={() => setMode('login')}
                className="text-sky-600 hover:underline font-semibold"
              >
                J'ai déjà un compte — me connecter
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
