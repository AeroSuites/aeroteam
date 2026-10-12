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
  ArrowRightLeft,
  Upload,
} from 'lucide-react'

export default function Admin() {
  const { createProfile, activeProfile, updateOwnProfile } = useApp()

  const [newName, setNewName] = useState('')
  const [newIdentifiant, setNewIdentifiant] = useState('')
  const [newCode, setNewCode] = useState('')
  const [newRole, setNewRole] = useState('leader')
  const [makeAdmin, setMakeAdmin] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [success, setSuccess] = useState('')

  const [admins, setAdmins] = useState(null)
  const [addAdminProfileId, setAddAdminProfileId] = useState('')
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

  // Promotion d'un profil en administrateur — par sélection (aucun code à saisir)
  const handleAddAdmin = async () => {
    if (!addAdminProfileId) {
      setAdminMsg('Choose the profile to promote.')
      return
    }
    setAdminBusy(true)
    setAdminMsg('')
    try {
      const res = await profileStore.adminAddAdminById(activeProfile?.code, addAdminProfileId)
      if (res?.error === 'deja_admin') setAdminMsg('This profile is already an administrator.')
      else if (res?.error === 'profil_introuvable') setAdminMsg('Profile not found.')
      else if (res?.error === 'not_admin') setAdminMsg("Your administrator code is no longer valid.")
      else if (res?.ok) {
        const prof = (profiles || []).find((p) => p.id === addAdminProfileId)
        setAdminMsg(`Profile « ${prof?.name || ''} » promoted to administrator.`)
        setAddAdminProfileId('')
        loadAdmins()
      } else setAdminMsg('Failed to add.')
    } catch {
      setAdminMsg('Failed to add (offline?).')
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
        setAdminMsg("Unable to hide the last manager visible at sign-up.")
      else if (res?.error) setAdminMsg('Failed to update.')
      else loadAdmins()
    } catch {
      setAdminMsg('Failed to update (offline?).')
    }
    setAdminBusy(false)
  }

  const handleRemoveAdmin = async (entry) => {
    if (!entry?.id) return
    if (
      !window.confirm(
        `Remove administrator « ${entry.name} »?\n\nNo code is needed: promotion/removal is done by selecting the profile.`
      )
    )
      return
    setAdminMsg('')
    try {
      const res = await profileStore.adminRemoveAdminById(activeProfile?.code, entry.id)
      if (res?.error === 'dernier_admin') setAdminMsg('Unable to remove the last administrator.')
      else if (res?.error === 'not_found') setAdminMsg('Administrator not found.')
      else if (res?.ok) {
        setAdminMsg(`Administrator « ${entry.name} » removed.`)
        loadAdmins()
      }
    } catch {
      setAdminMsg('Failed to remove (offline?).')
    }
  }

  const [profiles, setProfiles] = useState(null)
  const [profilesError, setProfilesError] = useState('')
  const [deleting, setDeleting] = useState(null)
  const [membersMsg, setMembersMsg] = useState('')
  const [membersError, setMembersError] = useState('')

  const [viewProfile, setViewProfile] = useState(null)

  const [pendingProfiles, setPendingProfiles] = useState(null)
  const [pendingBusy, setPendingBusy] = useState(null)
  const [pendingMsg, setPendingMsg] = useState('')
  const [pendingRole, setPendingRole] = useState({})
  const [profilesTick, setProfilesTick] = useState(0)
  const [managersList, setManagersList] = useState([])
  const [transferProfileId, setTransferProfileId] = useState(null)
  const [transferManagerId, setTransferManagerId] = useState('')
  const [transferBusy, setTransferBusy] = useState(false)

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
      setEditError('The name is required.')
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
res = { ok: false, error: 'Failed to update: network error.' }
      }
    }
    if (!res.ok) {
setEditError(res.error || 'Failed to update.')
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

  // Charge les membres permanents d'un profil depuis un fichier (.txt, .csv)
  const handleMembersFile = (e, profile) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    setMembersMsg('')
    setMembersError('')
    const reader = new FileReader()
    reader.onload = async () => {
      const content = String(reader.result || '')
      const names = content
        .split(/\r\n|\r|\n|,|;|\t/)
        .map((n) => n.trim())
        .filter(Boolean)
      e.target.value = ''
      if (!names.length) {
        setMembersError(`Empty file: no member found for « ${profile.name} ».`)
        return
      }
      try {
        const fresh = await profileStore.adminGetProfileData(activeProfile?.code, profile.id)
        if (fresh?.error || !fresh?.profile) {
          setMembersError(`Unable to read profile « ${profile.name} ».`)
          return
        }
        const d = fresh.profile.data || {}
        const current = Array.isArray(d.members) ? d.members : []
        const merged = [...new Set([...current, ...names])]
        const saved = await profileStore.saveProfileData(
          profile.code,
          { ...d, members: merged },
          fresh.profile.rev ?? 0,
          false
        )
        if (saved?.error === 'conflict') {
          setMembersError(
            `Profile « ${profile.name} » was modified in the meantime. Try again.`
          )
          return
        }
        if (saved?.error) {
          setMembersError(`Failed to load members for « ${profile.name} ».`)
          return
        }
        setMembersMsg(
          `${merged.length - current.length} permanent member(s) added to profile « ${profile.name} » (total: ${merged.length}).`
        )
      } catch {
        setMembersError('Failed to load (offline?).')
      }
    }
    reader.readAsText(file)
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
        if (res?.error) setProfilesError("Unable to load the profile list.")
        else setProfiles(res.profiles || [])
      })
      .catch(() => {
        if (!cancelled) setProfilesError('Unable to load the profile list.')
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
        if (res?.error) setPendingMsg('Unable to load access requests.')
        else setPendingProfiles(res.pending || [])
      })
      .catch(() => setPendingMsg('Unable to load access requests.'))
  }, [activeProfile?.code, profilesTick])

  useEffect(() => {
    profileStore
      .listManagers()
      .then((res) => setManagersList(res?.ok ? res.managers || [] : []))
      .catch(() => setManagersList([]))
  }, [])

  const handleTransferProfile = async (profile) => {
    setTransferBusy(true)
    setProfilesError('')
    try {
      const res = await profileStore.adminSetProfileManager(
        activeProfile?.code,
        profile.id,
        transferManagerId || null
      )
      if (res?.error === 'manager_inconnu') setProfilesError('Unknown manager.')
      else if (res?.error === 'not_found')
        setProfilesError('Unable to transfer (profile outside your scope).')
      else if (res?.error) setProfilesError('Failed to transfer.')
      else {
        setTransferProfileId(null)
        setTransferManagerId('')
        setProfilesTick((t) => t + 1)
      }
    } catch {
      setProfilesError('Failed to transfer (offline?).')
    }
    setTransferBusy(false)
  }

  const handleValidatePending = async (profileCode) => {
    setPendingBusy(profileCode)
    setPendingMsg('')
    try {
      const res = await profileStore.adminValidateProfile(
        activeProfile?.code,
        profileCode,
        pendingRole[profileCode] || 'leader'
      )
      if (res?.error) setPendingMsg('Failed to approve.')
      else {
        setPendingProfiles((prev) => (prev || []).filter((p) => p.code !== profileCode))
        setProfilesTick((t) => t + 1)
        window.dispatchEvent(new Event('admin-updated'))
      }
    } catch {
      setPendingMsg('Failed to approve.')
    }
    setPendingBusy(null)
  }

  const handleRefusePending = async (profileCode) => {
    if (!window.confirm('Reject and delete this request? The profile will not be created.'))
      return
    setPendingBusy(profileCode)
    setPendingMsg('')
    try {
      const res = await profileStore.adminRefuseProfile(activeProfile?.code, profileCode)
      if (res?.error) setPendingMsg('Failed to reject.')
      else {
        setPendingProfiles((prev) => (prev || []).filter((p) => p.code !== profileCode))
        window.dispatchEvent(new Event('admin-updated'))
      }
    } catch {
      setPendingMsg('Failed to reject.')
    }
    setPendingBusy(null)
  }

  const handleDeleteProfile = async (profile) => {
    if (!activeProfile?.code) return
    if (
      !window.confirm(
        `Permanently delete profile « ${profile.name} »?\n\nAll its data (tasks, teams, assignments, notes…) will be erased. This action is IRREVERSIBLE.`
      )
    ) {
      return
    }
    setDeleting(profile.id)
    setProfilesError('')
    try {
      const res = await profileStore.adminDeleteProfile(activeProfile.code, profile.id)
if (res?.error === 'not_found') setProfilesError("This profile no longer exists.")
      else if (res?.error === 'not_admin') setProfilesError("The administrator code is no longer valid.")
      else if (res?.ok) {
        setProfiles((prev) => prev.filter((p) => p.id !== profile.id))
      }
    } catch {
      setProfilesError('Failed to delete the profile.')
    }
    setDeleting(null)
  }

  const handleSetType = async (profile, type) => {
    setProfilesError('')
    try {
      const res = await profileStore.adminSetProfileType(
        activeProfile?.code,
        profile.id,
        type
      )
      if (res?.error) setProfilesError('Failed to change the role.')
      else
        setProfiles((prev) =>
          (prev || []).map((p) => (p.id === profile.id ? { ...p, type } : p))
        )
    } catch {
      setProfilesError('Failed to change the role (offline?).')
    }
  }

  const handleCreate = async () => {
    setCreating(true)
    setCreateError('')
    setSuccess('')
    const res = await createProfile({
      identifiant: newIdentifiant,
      code: newCode,
      name: newName,
      type: newRole,
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
        `Profile « ${newName} » created successfully${
          makeAdmin ? ' and promoted to administrator.' : '.'
        } Login username: ${res.identifiant || newIdentifiant || '—'}`
      )
      setNewName('')
      setNewIdentifiant('')
      setNewCode('')
      setNewRole('leader')
      setMakeAdmin(false)
    }
    setCreating(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Administration</h1>
        <p className="text-slate-600 mt-1">Profile creation (administrator only)</p>
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl border-l-4 border-l-amber-400">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-1">
          <UserCog className="h-5 w-5 text-amber-500" /> Access requests
          {pendingProfiles && pendingProfiles.length > 0 && (
            <span className="text-xs font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">
              {pendingProfiles.length}
            </span>
          )}
        </h2>
        <p className="text-xs text-slate-400 mb-3">
          Sign-ups from your staff pending approval. Approve to activate the account
          (the person will then be able to log in), or reject to delete the request.
        </p>
        {pendingMsg && <p className="text-sm text-red-600 mb-2">{pendingMsg}</p>}
        {pendingProfiles === null && <p className="text-sm text-slate-400">Loading…</p>}
        {pendingProfiles && pendingProfiles.length === 0 && (
          <p className="text-sm text-slate-400 italic">No pending requests.</p>
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
                      ? `requested on ${new Date(p.created_at).toLocaleDateString('en-GB')}`
                      : ''}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  <select
                    value={pendingRole[p.code] || 'leader'}
                    onChange={(e) =>
                      setPendingRole((prev) => ({ ...prev, [p.code]: e.target.value }))
                    }
                    disabled={pendingBusy === p.code}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                    title="Role assigned to this profile on approval"
                  >
                    <option value="leader">Leader</option>
                    <option value="agent">Agent</option>
                  </select>
                  <button
                    onClick={() => handleValidatePending(p.code)}
                    disabled={pendingBusy === p.code}
                    className="flex items-center gap-1 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-full px-3 py-1 disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    onClick={() => handleRefusePending(p.code)}
                    disabled={pendingBusy === p.code}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 border border-red-300 hover:bg-red-50 rounded-full px-3 py-1 disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5" /> Reject
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
          <UserPlus className="h-5 w-5 text-sky-500" /> Create a new profile
        </h2>
        <div className="space-y-3">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Profile name (e.g. Leader 1)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm"
          />
          <input
            value={newIdentifiant}
            onChange={(e) => setNewIdentifiant(e.target.value)}
            placeholder="Login username (optional — generated from the name if empty)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <input
            value={newCode}
            onChange={(e) => setNewCode(e.target.value)}
            placeholder="Personal code (e.g. LEADER-123)"
            className="w-full border border-slate-300 rounded-md px-3 py-2 text-sm font-mono"
          />
          <p className="text-xs text-slate-500">
            This code is the profile's access key (together with the username at login).
            Give them to the relevant leaders.
          </p>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            Profile role
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="border border-slate-300 rounded-md px-2 py-1.5 text-sm bg-white"
              title="Leader: organises the workload. Agent: receives their workload from a leader."
            >
              <option value="leader">Leader</option>
              <option value="agent">Agent</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            Make this profile an <strong>administrator</strong>
          </label>
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          {success && <p className="text-sm text-green-600">{success}</p>}
          <button
            onClick={handleCreate}
            disabled={creating || !newName.trim() || !newCode.trim()}
            className="flex items-center justify-center gap-2 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold w-full"
          >
            <Plus className="h-4 w-4" /> {creating ? 'Creating…' : 'Create profile'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
        <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
          <Users className="h-5 w-5 text-sky-500" /> Existing profiles
          {profiles && <span className="text-sm font-normal text-slate-400">({profiles.length})</span>}
        </h2>
        <p className="text-xs text-slate-500 mb-3">
          Login codes are never shown for security.
        </p>
        {profilesError && <p className="text-sm text-red-600 mb-3">{profilesError}</p>}
        {membersMsg && <p className="text-sm text-green-600 mb-3">{membersMsg}</p>}
        {membersError && <p className="text-sm text-red-600 mb-3">{membersError}</p>}
        {profiles === null && !profilesError && (
          <p className="text-sm text-slate-400">Loading…</p>
        )}
        {profiles && profiles.length === 0 && (
          <p className="text-sm text-slate-400">No profiles yet.</p>
        )}
        {profiles && profiles.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left bg-slate-50 border-b">
                  <th className="px-3 py-2 font-semibold text-slate-700">Name</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Aircraft</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Manager</th>
                  <th className="px-3 py-2 font-semibold text-slate-700">Created on</th>
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
                        <td className="px-3 py-2" colSpan={5}>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              placeholder="Profile name"
                              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-sm"
                              autoFocus
                            />
                            <input
                              value={editAircraft}
                              onChange={(e) => setEditAircraft(e.target.value)}
                              placeholder="Aircraft / registration"
                              className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-sm"
                            />
                            {editError && <span className="text-xs text-red-600">{editError}</span>}
                            <button
                              onClick={() => saveEditProfile(profile)}
                              disabled={editSaving}
                              className="flex items-center gap-1 bg-sky-600 text-white px-2.5 py-1 rounded-md text-xs font-semibold hover:bg-sky-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> {editSaving ? 'Saving…' : 'OK'}
                            </button>
                            <button
                              onClick={cancelEditProfile}
                              className="text-slate-500 hover:text-slate-800 p-1"
                              title="Cancel"
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
                            your profile
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{profile.aircraft || '»”'}</td>
                      <td className="px-3 py-2 text-slate-600">
                        {transferProfileId === profile.id ? (
                          <div className="flex flex-wrap items-center gap-1">
                            <select
                              value={transferManagerId}
                              onChange={(e) => setTransferManagerId(e.target.value)}
                              className="border border-slate-300 rounded-md px-2 py-1 text-xs bg-white"
                            >
                              <option value="">— Unassigned —</option>
                              {managersList.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                            <button
                              onClick={() => handleTransferProfile(profile)}
                              disabled={transferBusy}
                              className="text-xs font-semibold text-white bg-sky-600 hover:bg-sky-700 rounded-full px-2.5 py-1 disabled:opacity-50"
                            >
                              OK
                            </button>
                            <button
                              onClick={() => {
                                setTransferProfileId(null)
                                setTransferManagerId('')
                              }}
                              className="text-slate-400 hover:text-slate-700 p-1"
                              title="Cancel"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            {profile.manager_nom ? (
                              <span>{profile.manager_nom}</span>
                            ) : (
                              <span className="text-xs italic text-slate-400">
                                Unassigned
                              </span>
                            )}
                            <button
                              onClick={() => {
                                setTransferProfileId(profile.id)
                                setTransferManagerId(profile.manager_id || '')
                              }}
                              className="text-slate-400 hover:text-sky-600 p-0.5"
                              title="Transfer management of this profile to another manager"
                            >
                              <ArrowRightLeft className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {profile.created_at
                          ? new Date(profile.created_at).toLocaleDateString('en-GB')
                          : '»”'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <select
                          value={profile.type || 'leader'}
                          onChange={(e) => handleSetType(profile, e.target.value)}
                          className={`align-middle border rounded-full px-2 py-0.5 text-[11px] font-semibold mr-1 ${
                            (profile.type || 'leader') === 'agent'
                              ? 'border-emerald-300 text-emerald-700 bg-emerald-50'
                              : 'border-slate-300 text-slate-600 bg-white'
                          }`}
                          title="Profile role (Leader / Agent)"
                        >
                          <option value="leader">Leader</option>
                          <option value="agent">Agent</option>
                        </select>
                        <button
                          onClick={() => setViewProfile(profile)}
                          className="text-slate-400 hover:text-sky-600 p-1"
                          title={`Show the teams of profile « ${profile.name} »`}
                        >
                          <UserCog className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => startEditProfile(profile)}
                          className="text-slate-400 hover:text-sky-600 p-1"
                          title={`Edit profile « ${profile.name} »`}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <label
                          className="inline-flex text-slate-400 hover:text-sky-600 p-1 cursor-pointer"
                          title={`Load permanent members from a file (.txt, .csv) for « ${profile.name} »`}
                        >
                          <Upload className="h-4 w-4" />
                          <input
                            type="file"
                            accept=".txt,.csv"
                            className="hidden"
                            onChange={(e) => handleMembersFile(e, profile)}
                          />
                        </label>
                        {isSelf ? (
                          <span className="text-xs text-slate-300 italic ml-1">not deletable</span>
                        ) : (
                          <button
                            onClick={() => handleDeleteProfile(profile)}
                            disabled={deleting === profile.id}
                            className="text-slate-400 hover:text-red-600 disabled:opacity-50 ml-1"
                            title={`Delete profile « ${profile.name} »`}
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

      {admins && (admins.length > 0 || addAdminProfileId || adminMsg) && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-xl">
          <h2 className="flex items-center gap-2 font-semibold text-slate-800 mb-4">
            <KeyRound className="h-5 w-5 text-sky-500" /> Administrators
            <span className="text-sm font-normal text-slate-400">({admins.length})</span>
          </h2>
          <p className="text-xs text-slate-500 mb-3">
            An administrator is a profile promoted here (verified server-side —{' '}
            <strong>no personal code is requested or displayed</strong>). The last
            administrator cannot be removed. The <strong>Sign-up / Hidden</strong> button{' '}
            chooses the administrators offered as managers during sign-ups (AeroTeam and
            AeroPrimes).
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
                              ? "Visible in the managers list at sign-up — click to hide"
                              : "Hidden at sign-up — click to make visible"
                          }
                        >
                          {entry.listable ? (
                            <Eye className="h-3.5 w-3.5" />
                          ) : (
                            <EyeOff className="h-3.5 w-3.5" />
                          )}
                          {entry.listable ? 'Sign-up' : 'Hidden'}
                        </button>
                      )}
                      <button
                        onClick={() => handleRemoveAdmin(entry)}
                        disabled={adminBusy || admins.length <= 1}
                        className="text-slate-400 hover:text-red-600 disabled:opacity-40"
                        title={
                          admins.length <= 1
                            ? 'Unable to remove the last administrator'
                            : `Remove « ${entry.name} »`
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
          <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <select
              value={addAdminProfileId}
              onChange={(e) => setAddAdminProfileId(e.target.value)}
              className="border border-slate-300 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">— Choose a profile to promote —</option>
              {(profiles || []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.identifiant ? ` · ${p.identifiant}` : ''}
                </option>
              ))}
            </select>
            <button
              onClick={handleAddAdmin}
              disabled={adminBusy || !addAdminProfileId}
              className="flex items-center justify-center gap-1.5 bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50 text-sm font-semibold"
            >
              <UserPlus className="h-4 w-4" /> Promote
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            No code is requested: the profile is promoted by selection (create it first in
            « Create a new profile » if needed).
          </p>
          {adminMsg && <p className="text-sm text-sky-700 mt-2">{adminMsg}</p>}
        </div>
      )}

      <p className="text-xs text-slate-400 flex items-center gap-1.5">
        <ShieldCheck className="h-4 w-4" /> Logged in as administrator: {activeProfile?.name}
      </p>
    </div>
  )
}
