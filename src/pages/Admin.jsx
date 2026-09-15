import { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import * as profileStore from '../lib/profileStore'
import ProfileViewModal from '../components/ProfileViewModal'
import {
  ShieldCheck,
  UserPlus,
  Plus,
  KeyRound,
  Trash2,
  Users,
  Pencil,
  Check,
  X,
  UserCog,
  Eye,
  EyeOff,
} from 'lucide-react'

export default function Admin() {
  const { createProfile, activeProfile, updateOwnProfile } = useApp()

  const [newName, setNewName] = useState('')
  const [newIdentifiant, setNewIdentifiant] = useState('')
  const [newAircraft, setNewAircraft] = useState('')
  const [newCode, setNewCode] = useState('')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [success, setSuccess] = useState('')

  const [admins, setAdmins] = useState(null)
  const [addAdminName, setAddAdminName] = useState('')
  const [addAdminCode, setAddAdminCode] = useState('')
  const [adminMsg, setAdminMsg] = useState('')
  const [adminBusy, setAdminBusy] = useState(false)

  const loadAdmins = () => {
    if (!activeProfile?.code) return
    profileStore
      .adminListAdmins(activeProfile.code)
      .then((res) => {
        if (res?.error) return
        setAdmins(res.admins || [])
      })
      .catch(() => {})
  }

  const handleAddAdmin = async () => {
    const name = addAdminName.trim()
    const code = addAdminCode.trim()
    if (!name || !code) {
      setAdminMsg('Le nom et le code sont obligatoires.')
      return
    }
    setAdminBusy(true)
    setAdminMsg('')
    try {
      const exists = await profileStore.adminProfileLookup(activeProfile?.code, code)
      if (exists?.error === 'not_found') {
        setAdminMsg('Aucun profil existant avec ce code — créez d’abord le profil normal.')
        setAdminBusy(false)
        return
      }
      if (exists?.error) {
        setAdminMsg("Votre code administrateur n'est plus valide.")
        setAdminBusy(false)
        return
      }
      const res = await profileStore.adminAddAdmin(activeProfile?.code, code, name)
      if (res?.error === 'deja_admin') setAdminMsg('Ce code est déjà administrateur.')
      else if (res?.error === 'not_admin') setAdminMsg("Votre code administrateur n'est plus valide.")
      else if (res?.ok) {
        setAdminMsg(`Administrateur « ${name} » ajouté.`)
        setAddAdminName('')
        setAddAdminCode('')
        loadAdmins()
      } else setAdminMsg('Échec de l’ajout.')
    } catch {
      setAdminMsg('Échec de l’ajout (hors ligne ?).')
    }
    setAdminBusy(false)
  }

  const handleToggleListable = async (entry) => {
    setAdminBusy(true)
    setAdminMsg('')
    try {
      const res = await profileStore.adminSetAdminListable(
        activeProfile?.code,
        entry.id,
        !entry.listable
      )
      if (res?.error === 'dernier_visible')
        setAdminMsg("Impossible de masquer le dernier manager visible à l'inscription.")
      else if (res?.error) setAdminMsg('Échec de la modification.')
      else loadAdmins()
    } catch {
      setAdminMsg('Échec de la modification (hors ligne ?).')
    }
    setAdminBusy(false)
  }

  const handleRemoveAdmin = async (name) => {
    const code = window.prompt(
      `Retirer l'administrateur « ${name} » ?\nSaisissez le code de cet administrateur pour confirmer.`
    )
    if (!code) return
    setAdminMsg('')
    try {
      const res = await profileStore.adminRemoveAdmin(activeProfile?.code, code)
      if (res?.error === 'dernier_admin') setAdminMsg('Impossible de retirer le dernier administrateur.')
      else if (res?.error === 'not_found') setAdminMsg('Code incorrect pour cet administrateur.')
      else if (res?.ok) {
        setAdminMsg(`Administrateur « ${name} » retiré.`)
        loadAdmins()
      }
    } catch {
      setAdminMsg('Échec du retrait (hors ligne ?).')
    }
  }

  const [profiles, setProfiles] = useState(null)
  const [profilesError, setProfilesError] = useState('')
  const [deleting, setDeleting] = useState(null)

  const [viewProfile, setViewProfile] = useState(null)

  const [pendingProfiles, setPendingProfiles] = useState(null)
  const [pendingBusy, setPendingBusy] = useState(null)
  const [pendingMsg, setPendingMsg] = useState('')
  const [profilesTick, setProfilesTick] = useState(0)

  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editAircraft, setEditAircraft] = useState('')
  const [editError, setEditError] = useState('')
  const [editSaving, setEditSaving] = useState(false)

  const startEditProfile = (profile) => {
    setEditingId(profile.id)
    setEditName(profile.name)
    setEditAircraft(profile.aircraft || '')
    setEditError('')
  }

  const cancelEditProfile = () => {
    setEditingId(null)
    setEditError('')
  }

  const saveEditProfile = async (profile) => {
    const name = editName.trim()
    if (!name) {
      setEditError('Le nom est obligatoire.')
      return
    }
    setEditSaving(true)
    setEditError('')
    const isSelf = profile.id === activeProfile?.id
    let res
    if (isSelf) {
      res = await updateOwnProfile({ name, aircraft: editAircraft.trim() })
    } else {
      try {
        res = await profileStore.adminUpdateProfile(
          activeProfile?.code,
          profile.id,
          name,
          editAircraft.trim()
        )
      } catch {
res = { ok: false, error: 'Échec de la mise à jour : erreur réseau.' }
      }
    }
    if (!res.ok) {
setEditError(res.error || 'Échec de la mise à jour.')
    } else {
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === profile.id ? { ...p, name, aircraft: editAircraft.trim() || p.aircraft } : p
        )
      )
      setEditingId(null)
    }
    setEditSaving(false)
  }

  useEffect(() => {
    if (!activeProfile?.code) return
    let cancelled = false
    // eslint-disable-next-line react/set-state-in-effect -- chargement initial de la liste des profils
    setProfilesError('')
    loadAdmins()
    profileStore
      .listProfiles(activeProfile.code)
      .then((res) => {
        if (cancelled) return
        if (res?.error) setProfilesError("Impossible de charger la liste des profils.")
        else setProfiles(res.profiles || [])
      })
      .catch(() => {
        if (!cancelled) setProfilesError('Impossible de charger la liste des profils.')
      })
    return () => {
      cancelled = true
    }
  }, [activeProfile?.code, profilesTick]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeProfile?.code) return
    profileStore
      .adminListPendingProfiles(activeProfile.code)
      .then((res) => {
        if (res?.error) setPendingMsg('Impossible de charger les demandes.')
        else setPendingProfiles(res.pending || [])
      })
      .catch(() => setPendingMsg('Impossible de charger les demandes.'))
  }, [activeProfile?.code, profilesTick])

  const handleValidatePending = async (profileCode) => {
    setPendingBusy(profileCode)
    setPendingMsg('')
    try {
      const res = await profileStore.adminValidateProfile(activeProfile?.code, profileCode)
      if (res?.error) setPendingMsg('Échec de la validation.')
      else {
        setPendingProfiles((prev) => (prev || []).filter((p) => p.code !== profileCode))
        setProfilesTick((t) => t + 1)
      }
    } catch {
      setPendingMsg('Échec de la validation.')
    }
    setPendingBusy(null)
  }

  const handleRefusePending = async (profileCode) => {
    if (!window.confirm('Refuser et supprimer cette demande ? Le profil ne sera pas créé.'))
      return
    setPendingBusy(profileCode)
    setPendingMsg('')
    try {
      const res = await profileStore.adminRefuseProfile(activeProfile?.code, profileCode)
      if (res?.error) setPendingMsg('Échec du refus.')
      else setPendingProfiles((prev) => (prev || []).filter((p) => p.code !== profileCode))
    } catch {
      setPendingMsg('Échec du refus.')
    }
    setPendingBusy(null)
  }

  const handleDeleteProfile = async (profile) => {
    if (!activeProfile?.code) return
    if (
      !window.confirm(
        `Supprimer définitivement le profil « ${profile.name} » ?\n\nToutes ses données (tâches, équipes, affectations, notes…) seront effacées. Cette action est IRREVERSIBLE.`
      )
    ) {
      return
    }
    setDeleting(profile.id)
    setProfilesError('')
    try {
      const res = await profileStore.adminDeleteProfile(activeProfile.code, profile.id)
if (res?.error === 'not_found') setProfilesError("Ce profil n'existe déjà plus.")
      else if (res?.error === 'not_admin') setProfilesError("Le code administrateur n'est plus valide.")
      else if (res?.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profile.id))
      }
    } catch {
      setProfilesError('Échec de la suppression du profil.')
    }
    setDeleting(null)
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError('')
    setSuccess('')
    const res = await createProfile({
      identifiant: newIdentifiant,
      code: newCode,
      name: newName,
      aircraft: newAircraft,
    })
    if (!res.ok) setCreateError(res.error)
    else {
      if (makeAdmin) {
        try {
          const addRes = await profileStore.adminAddAdmin(
            activeProfile?.code,
            newCode,
            newName
          )
          if (addRes?.ok) loadAdmins()
        } catch {
          // le profil est créé même si l'ajout admin échoue
        }
      }
      setSuccess(
        `Profil « ${newName} » créé avec succès${
          makeAdmin ? ' et promu administrateur.' : '.'
        } Identifiant de connexion : ${res.identifiant || newIdentifiant || '—'}`
      )
      setNewName('')
      setNewIdentifiant('')
      setNewAircraft('')
      setNewCode('')
      setMakeAdmin(false)
    }
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Administration</h1>
        <p className="text-slate-600 mt-1">Création des profils (réservé à l'administrateur)</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl border-l-4 border-l-amber-400">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
          <UserCog className="h-5 w-5 text-amber-500" /> Demandes d'accès
          {pendingProfiles && pendingProfiles.length > 0 && (
            <span className="text-xs font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
              {pendingProfiles.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Inscriptions de votre effectif en attente de validation. Validez pour activer le compte
          (la personne pourra alors se connecter), ou refusez pour supprimer la demande.
        </p>
        {pendingMsg && <p className="text-sm text-red-600 mb-2">{pendingMsg}</p>}
        {pendingProfiles === null && <p className="text-sm text-slate-400">Chargement…</p>}
        {pendingProfiles && pendingProfiles.length === 0 && (
          <p className="text-sm text-slate-400 italic">Aucune demande en attente.</p>
        )}
        {pendingProfiles && pendingProfiles.length > 0 && (
          <ul className="divide-y divide-slate-100">
            {pendingProfiles.map((p) => (
              <li
                key={p.id}
                className="py-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div>
                  <span className="font-medium text-slate-800">{p.name}</span>
                  <span className="block text-[11px] text-slate-400">
                    {p.created_at
                      ? `demandé le ${new Date(p.created_at).toLocaleDateString('fr-FR')}`
                      : ''}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <button
                    onClick={() => handleValidatePending(p.code)}
                    disabled={pendingBusy === p.code}
                    className="flex items-center gap-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-full px-3 py-1 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Valider
                  </button>
                  <button
                    onClick={() => handleRefusePending(p.code)}
                    disabled={pendingBusy === p.code}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-300 hover:bg-red-50 rounded-full px-3 py-1 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Refuser
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
          <UserPlus className="h-5 w-5 text-sky-500" /> Créer un nouveau profil
        </h2>
        <div className="space-y-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du profil (ex: Leader 1)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newIdentifiant}
            onChange={(e) => setNewIdentifiant(e.target.value)}
            placeholder="Identifiant de connexion (optionnel — généré depuis le nom si vide)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <input
            value={newAircraft}
            onChange={(e) => setNewAircraft(e.target.value)}
            placeholder="Avion / immatriculation (ex: F-GKXT)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Code personnel (ex: LEADER-123)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-slate-500">
            Ce code est la clé d'accès du profil (avec l'identifiant à la connexion).
            Remettez-les aux leaders concernés.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            Faire de ce profil un <strong>administrateur</strong>
          </label>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !newCode.trim()}
            className="flex items-center justify-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold w-full"
          >
            <Plus className="h-4 w-4" /> {creating ? 'Création…' : 'Créer le profil'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
          <Users className="h-5 w-5 text-sky-500" /> Profils existants
          {profiles && <span className="text-sm font-normal text-slate-400">({profiles.length})</span>}
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Les codes de connexion ne sont jamais affichés par sécurité.
        </p>
        {profilesError && <p className="text-sm text-red-600 mb-3">{profilesError}</p>}
        {profiles === null && !profilesError && (
          <p className="text-sm text-slate-400">Chargement…</p>
        )}
        {profiles && profiles.length === 0 && (
          <p className="text-sm text-slate-400">Aucun profil pour le moment.</p>
        )}
        {profiles && profiles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-slate-50 border-b">
                  <th className="px-3 py-2 font-semibold text-slate-700">Nom</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Avion</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Créé le</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((profile) => {
                  const isSelf = profile.id === activeProfile?.id
                  const isEditing = editingId === profile.id
                  if (isEditing) {
                    return (
                      <tr key={profile.id} className="border-b bg-sky-50/50">
                        <td className="px-3 py-2" colSpan={4}>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Nom du profil"
                              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-sm"
                              autoFocus
                            />
                            <input
                              value={editAircraft}
                              onChange={(e) => setEditAircraft(e.target.value)}
                              placeholder="Avion / immatriculation"
                              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-sm"
                            />
                            {editError && <span className="text-xs text-red-600">{editError}</span>}
                            <button
                              onClick={() => saveEditProfile(profile)}
                              disabled={editSaving}
                              className="flex items-center gap-1 bg-sky-600 text-white px-2.5 py-1 rounded-md text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> {editSaving ? 'Enregistrement…' : 'OK'}
                            </button>
                            <button
                              onClick={cancelEditProfile}
                              className="text-slate-500 hover:text-slate-800 p-1"
                              title="Annuler"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  }
                  return (
                    <tr key={profile.id} className="border-b hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium">
                        {profile.name}
                        {profile.identifiant && (
                          <span className="block text-[11px] text-slate-400 font-mono">
                            {profile.identifiant}
                          </span>
                        )}
                        {isSelf && (
                          <span className="ml-2 text-[10px] font-semibold text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                            votre profil
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{profile.aircraft || '»”'}</td>
                      <td className="px-3 py-2 text-slate-500">
                        {profile.created_at
                          ? new Date(profile.created_at).toLocaleDateString('fr-FR')
                          : '»”'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          onClick={() => openProfileView(profile)}
                          className="text-slate-400 hover:text-sky-600 p-1"
                          title={`Voir les équipes du profil « ${profile.name} »`}
                        >
                          <UserCog className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => startEditProfile(profile)}
                          className="text-slate-400 hover:text-sky-600 p-1"
                          title={`Modifier le profil « ${profile.name} »`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        {isSelf ? (
                          <span className="text-xs text-slate-300 italic ml-1">non supprimable</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteProfile(profile)}
                            disabled={deleting === profile.id}
                            className="text-slate-400 hover:text-red-600 disabled:opacity-50 ml-1"
                            title={`Supprimer le profil « ${profile.name} »`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {viewProfile && (
        <ProfileViewModal
          profile={viewProfile}
          adminCode={activeProfile?.code}
          onClose={() => setViewProfile(null)}
        />
      )}

      {admins && (admins.length > 0 || addAdminName || addAdminCode || adminMsg) && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
            <KeyRound className="h-5 w-5 text-sky-500" /> Administrateurs
            <span className="text-sm font-normal text-slate-400">({admins.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            Un administrateur est un profil dont le code est inscrit ici (vérifié côté serveur, le
            code n'est jamais affiché). Le dernier administrateur ne peut pas être retiré. Le
            bouton <strong>Inscription / Masqué</strong> choisit les administrateurs proposés comme
            managers lors des inscriptions (AeroTeam et AeroPrimes).
          </p>
          {admins.length > 0 && (
            <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg mb-3">
              {admins.map((a) => {
                const entry = typeof a === 'string' ? { name: a, id: null, listable: true } : a
                return (
                  <li
                    key={entry.id || entry.name}
                    className="flex items-center justify-between gap-2 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-slate-800">{entry.name}</span>
                    <div className="flex items-center gap-1.5">
                      {entry.id && (
                        <button
                          onClick={() => handleToggleListable(entry)}
                          disabled={adminBusy}
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold border disabled:opacity-50 ${
                            entry.listable
                              ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                              : 'border-slate-300 text-slate-500 hover:bg-slate-50'
                          }`}
                          title={
                            entry.listable
                              ? "Visible dans la liste des managers à l'inscription — cliquer pour masquer"
                              : "Masqué à l'inscription — cliquer pour rendre visible"
                          }
                        >
                          {entry.listable ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                          {entry.listable ? 'Inscription' : 'Masqué'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveAdmin(entry.name)}
                        disabled={adminBusy || admins.length <= 1}
                        className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                        title={
                          admins.length <= 1
                            ? 'Impossible de retirer le dernier administrateur'
                            : `Retirer « ${entry.name} »`
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <input
              value={addAdminName}
              onChange={(e) => setAddAdminName(e.target.value)}
              placeholder="Nom (ex : Manager)"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <input
              value={addAdminCode}
              onChange={(e) => setAddAdminCode(e.target.value)}
              placeholder="Code du profil existant"
              className="border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
            />
            <button
              onClick={handleAddAdmin}
              disabled={adminBusy}
              className="flex items-center justify-center gap-1.5 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
            >
              <UserPlus className="h-4 w-4" /> Ajouter
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            Le code doit correspondre à un profil existant (créez-le d'abord dans « Créer un
            nouveau profil » si besoin).
          </p>
          {adminMsg && <p className="text-sm text-sky-700 mt-2">{adminMsg}</p>}
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4" /> Connecté en tant qu'administrateur : {activeProfile?.name}
      </p>
    </div>
  )
}
