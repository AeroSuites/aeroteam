import { useMemo, useState } from 'react'
import { useApp } from '../context/AppContext'
import ConsignesAvions from '../components/ConsignesAvions'
import { UserPlus, Users, Trash2, Plus, X, BookUser, Upload, Lock, LockOpen, Pencil, Star } from 'lucide-react'
import { consigneDay, logicalToday } from '../utils/helpers'

const DAY_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']

export default function Equipes() {
  const {
    teams, members, dayMembers, dayLeaders, assignments, notes,
    addTeam, updateTeam, removeTeam,
    addMembers, addDayMembers, clearDayMembers, removeMember,
  } = useApp()
  const [tab, setTab] = useState('permanent')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [selected, setSelected] = useState([])
  const [memberInput, setMemberInput] = useState('')
  const [memberSearch, setMemberSearch] = useState('')

  const activeMembers = tab === 'permanent' ? members : dayMembers

  // Consignes du jour (lignes « - … » des notes [C] de la journée logique en cours)
  // Si aucune consigne aujourd'hui, on prend le dernier jour de consignes trouvé.
  const { dayConsignes, consignesDay } = useMemo(() => {
    const today = DAY_NAMES[logicalToday().getDay()]
    const byDay = {}
    ;(notes || [])
      .filter((n) => String(n.title || '').startsWith('[C] '))
      .forEach((n) => {
        const day = consigneDay(n.title) || '—'
        if (!byDay[day]) byDay[day] = []
        String(n.content || '')
          .split('\n')
          .forEach((line) => {
            const t = line.trim()
            if (!t.startsWith('- ')) return
            const item = t.slice(2).trim()
            if (item && !byDay[day].includes(item)) byDay[day].push(item)
          })
      })
    if (byDay[today]?.length) return { dayConsignes: byDay[today], consignesDay: today }
    const days = Object.keys(byDay).filter((d) => byDay[d].length)
    if (days.length) {
      days.sort((a, b) => DAY_NAMES.indexOf(a) - DAY_NAMES.indexOf(b))
      const last = days[days.length - 1]
      return { dayConsignes: byDay[last], consignesDay: last }
    }
    return { dayConsignes: [], consignesDay: '' }
  }, [notes])

  // Consignes sans équipe du même nom → équipes vides à proposer
  const proposedTeams = useMemo(
    () =>
      dayConsignes.filter(
        (c) =>
          !teams.some(
            (t) => String(t.name || '').trim().toLowerCase() === c.toLowerCase()
          )
      ),
    [dayConsignes, teams]
  )

  const createTeamsFromConsignes = () => {
    proposedTeams.forEach((name, i) => {
      addTeam({
        name: name.slice(0, 60),
        members: [],
        color: defaultColors[(teams.length + i) % defaultColors.length],
      })
    })
  }

  const taskCountByTeam = (teamId) =>
    Object.values(assignments).filter((id) => id === teamId).length

  // Membres de l'onglet actif non encore affectés à une équipe
  const availableMembers = activeMembers.filter(
    (m) => !teams.some((t) => t.members.includes(m))
  )

  // Recherche par nom (insensible à la casse et aux accents)
  const normSearch = (s) =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
  const searchKey = normSearch(memberSearch.trim())
  const visibleMembers = searchKey
    ? availableMembers.filter((m) => normSearch(m).includes(searchKey))
    : availableMembers

  const toggleSelected = (name) => {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    )
  }

  const handleCreate = () => {
    if (!newName.trim()) return
    addTeam({ name: newName.trim(), members: [...selected], color: defaultColors[teams.length % defaultColors.length] })
    setNewName('')
    setSelected([])
    setMemberSearch('')
    setShowAdd(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleBulkAdd = () => {
    const names = memberInput
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean)
    if (names.length === 0) return
    if (tab === 'permanent') addMembers(names)
    else addDayMembers(names)
    setMemberInput('')
  }

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const content = String(reader.result || '')
      const names = content
        .split(/\r\n|\r|\n|,|;|\t/)
        .map((n) => n.trim())
        .filter(Boolean)
      if (names.length) {
        if (tab === 'permanent') addMembers(names)
        else addDayMembers(names)
      }
      e.target.value = ''
    }
    reader.readAsText(file)
  }

  // Membres (permanents + du jour) pas encore affectés à cette équipe
  const availableForTeam = (team) =>
    [...new Set([...members, ...dayMembers])].filter((m) => !team.members.includes(m))

  const addToTeam = (teamId, name) => {
    const team = teams.find((t) => t.id === teamId)
    updateTeam(teamId, { members: [...team.members, name] })
  }

  const removeFromTeam = (teamId, memberName) => {
    const team = teams.find((t) => t.id === teamId)
    updateTeam(teamId, { members: team.members.filter((m) => m !== memberName) })
  }

  const handleClearDayMembers = () => {
    if (
      !window.confirm(
        'Effacer tous les membres assignés à l’avion du jour ? (les membres permanents et les équipes existantes sont conservés)'
      )
    )
      return
    clearDayMembers()
  }

  const switchTab = (next) => {
    setTab(next)
    setSelected([])
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Gestion des équipes</h1>
          <p className="text-slate-600 mt-1">
            {teams.length} équipe(s) — créez vos équipes depuis l'onglet « Membres permanents »
            ou « Assignés à l'avion du jour ».
          </p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 flex items-center gap-2"
        >
          {showAdd ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
          {showAdd ? 'Annuler' : 'Nouvelle équipe'}
        </button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 max-w-md">
          <h2 className="text-lg font-semibold mb-1">
            Créer une équipe{' '}
            <span className="text-xs font-normal text-slate-400">
              — depuis l'onglet « {tab === 'permanent' ? 'Membres permanents' : "Assignés à l'avion du jour"} »
            </span>
          </h2>
          <label className="block text-sm font-medium text-slate-700 mb-1 mt-3">Nom de l'équipe</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Ex: Équipe mécanique matin"
            className="w-full border border-slate-300 rounded-md px-3 py-2 mb-4"
          />
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Membres (cochez les noms de l'onglet actif)
          </label>
          {availableMembers.length > 0 && (
            <input
              value={memberSearch}
              onChange={(e) => setMemberSearch(e.target.value)}
              placeholder={`Rechercher un nom parmi ${availableMembers.length}…`}
              className="w-full border border-slate-300 rounded-md px-3 py-2 mb-2 text-sm"
            />
          )}
          {availableMembers.length === 0 && (
            <p className="text-sm text-amber-600 mb-3">
              Aucun membre disponible dans cet onglet. Ajoutez-en dans le panneau ci-dessus, ou
              retirez d'abord les membres déjà affectés.
            </p>
          )}
          <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-md p-2 space-y-1 mb-2">
            {availableMembers.length > 0 && visibleMembers.length === 0 && (
              <p className="text-sm text-slate-400 italic px-2 py-1">
                Aucun nom ne correspond à « {memberSearch.trim()} ».
              </p>
            )}
            {visibleMembers.map((m) => {
              const checked = selected.includes(m)
              return (
                <label key={m} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSelected(m)}
                    className="h-4 w-4 accent-sky-600"
                  />
                  {m}
                </label>
              )
            })}
          </div>
          {selected.length > 0 && (
            <p className="text-xs text-slate-500 mb-2">
              Sélection : {selected.join(', ')}
            </p>
          )}
          <button
            onClick={handleCreate}
            disabled={!newName.trim()}
            className="w-full bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 disabled:opacity-50"
          >
            {selected.length > 0
              ? `Créer l'équipe (${selected.length} membre${selected.length > 1 ? 's' : ''})`
              : "Créer l'équipe (vide — membres à ajouter plus tard)"}
          </button>
        </div>
      )}

      {/* Consignes des avions (jour × shift) — visibles aussi depuis les équipes */}
      <ConsignesAvions scope="equipes" />

      {/* Gestion des membres : deux onglets */}
      <div className="bg-white rounded-xl shadow p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <BookUser className="h-5 w-5 text-sky-500" /> Membres
          </h2>
          <div className="inline-flex p-1 rounded-lg bg-slate-100">
            <button
              onClick={() => switchTab('permanent')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'permanent'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Membres permanents ({members.length})
            </button>
            <button
              onClick={() => switchTab('jour')}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                tab === 'jour'
                  ? 'bg-white text-slate-900 shadow'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Assignés à l'avion du jour ({dayMembers.length})
            </button>
          </div>
        </div>

        <p className="text-sm text-slate-500 mb-4">
          {tab === 'permanent'
            ? 'Liste permanente des techniciens : jamais effacée par la réinitialisation, elle sert à composer les équipes stables.'
            : 'Effectif assigné à l’avion du jour : effaçable à tout moment (et lors de la réinitialisation), sert à composer les équipes du jour.'}
        </p>

        <div className="flex flex-wrap gap-4">
          <div className="flex gap-2 flex-1 min-w-[260px]">
            <input
              value={memberInput}
              onChange={(e) => setMemberInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleBulkAdd()
                }
              }}
              placeholder={
                tab === 'permanent'
                  ? 'Ajouter des membres permanents (séparés par des virgules)'
                  : 'Ajouter des membres du jour (séparés par des virgules)'
              }
              className="flex-1 border border-slate-300 rounded-md px-3 py-2 text-sm"
            />
            <button
              onClick={handleBulkAdd}
              className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm"
            >
              Ajouter
            </button>
            <label
              className="inline-flex items-center gap-1.5 bg-slate-200 text-slate-700 px-4 py-2 rounded-md hover:bg-slate-300 text-sm cursor-pointer"
              title="Charger une liste de membres depuis un fichier (.txt, .csv)"
            >
              <Upload className="h-4 w-4" />
              Charger un fichier
              <input
                type="file"
                accept=".txt,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
          {tab === 'jour' && dayMembers.length > 0 && (
            <button
              onClick={handleClearDayMembers}
              className="text-red-600 border border-red-300 hover:bg-red-50 px-4 py-2 rounded-md text-sm font-semibold"
            >
              Effacer les membres du jour
            </button>
          )}
          <div className="flex flex-wrap gap-1.5 content-start">
            {activeMembers.length === 0 && (
              <span className="text-sm text-slate-400 italic">
                {tab === 'permanent'
                  ? 'Aucun membre permanent.'
                  : 'Aucun membre du jour (ils arrivent avec les consignes importées).'}
              </span>
            )}
            {activeMembers.map((m) => {
              const isLeader = tab === 'jour' && (dayLeaders || []).includes(m)
              return (
                <span
                  key={m}
                  className={`inline-flex items-center gap-1.5 rounded-full pl-3 pr-1.5 py-1 text-sm border ${
                    isLeader
                      ? 'bg-sky-600 border-sky-700 text-white font-bold'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                  title={isLeader ? 'Leader' : undefined}
                >
                  {isLeader && <Star className="h-3 w-3 fill-white" />}
                  {m}
                  <button
                    onClick={() => removeMember(m)}
                    className={isLeader ? 'text-white/70 hover:text-white' : 'text-slate-400 hover:text-red-600'}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              )
            })}
          </div>
        </div>
      </div>


      {/* Proposition : équipes vides d'après les consignes du jour */}
      {tab === 'jour' && (
        <div className="bg-white rounded-xl shadow p-4 sm:p-6 border-l-4 border-l-sky-500">
          <h2 className="font-semibold flex items-center gap-2 mb-1">
            <Users className="h-5 w-5 text-sky-500" /> Équipes d'après les consignes du jour
            {consignesDay && (
              <span className="text-sm font-normal text-slate-400">({consignesDay})</span>
            )}
            {proposedTeams.length > 0 && (
              <span className="text-sm font-normal text-slate-400">· {proposedTeams.length}</span>
            )}
          </h2>
          {proposedTeams.length === 0 ? (
            <p className="text-sm text-slate-500">
              {dayConsignes.length === 0
                ? "Aucune consigne trouvée dans ce profil. Les consignes arrivent avec le fichier (Import consignes → envoi au profil)."
                : 'Toutes les consignes du jour ont déjà une équipe du même nom.'}
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-3">
                {proposedTeams.length} consigne(s) sans équipe du même nom : créez une équipe vide
                par consigne, puis ajoutez les membres (bouton « + Ajouter à cette équipe »).
              </p>
              <div className="flex flex-wrap gap-1.5 mb-3">
                {proposedTeams.map((c) => (
                  <span
                    key={c}
                    className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-[11px] text-slate-700"
                  >
                    {c}
                  </span>
                ))}
              </div>
              <button
                onClick={createTeamsFromConsignes}
                className="bg-sky-600 text-white px-4 py-2 rounded-md hover:bg-sky-700 text-sm font-semibold"
              >
                Créer {proposedTeams.length} équipe{proposedTeams.length > 1 ? 's' : ''} vide
                {proposedTeams.length > 1 ? 's' : ''}
              </button>
            </>
          )}
        </div>
      )}

      {teams.length === 0 && !showAdd && (
        <div className="bg-white rounded-xl shadow p-10 text-center text-slate-500">
          <Users className="h-12 w-12 mx-auto text-slate-300 mb-3" />
          Aucune équipe pour l'instant. Créez votre première équipe.
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {teams.map((team, idx) => (
          <div key={team.id} className="bg-white rounded-xl shadow overflow-hidden">
            <div
              className="px-5 py-3 flex items-center justify-between"
              style={{ backgroundColor: defaultColors[idx % defaultColors.length] }}
            >
              <div className="flex items-center gap-2 text-white">
                <UserPlus className="h-5 w-5" />
                <h3 className="font-bold flex items-center gap-1.5">
                  {team.locked && <Lock className="h-3.5 w-3.5 text-amber-300" />}
                  {team.name}
                  {team.locked && <span className="text-[10px] font-semibold text-amber-200">verrouillée</span>}
                </h3>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => {
                    const next = window.prompt("Nouveau nom de l'équipe :", team.name)
                    if (next === null) return
                    const name = String(next).trim()
                    if (!name) return
                    updateTeam(team.id, { name })
                  }}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title="Renommer l'équipe"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => updateTeam(team.id, { locked: !team.locked })}
                  className="text-white/80 hover:text-white p-1.5 rounded"
                  title={
                    team.locked
                      ? 'Déverrouiller cette équipe (elle pourra recevoir des tâches à la répartition automatique)'
                      : 'Verrouiller cette équipe (elle ne recevra plus de tâches à la répartition automatique)'
                  }
                >
                  {team.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
                </button>
                <button
                  onClick={() => removeTeam(team.id)}
                  className="text-white/80 hover:text-white"
                  title="Supprimer l'équipe"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-slate-600">
                  <span className="font-semibold">{team.members.length}</span> membre(s)
                </span>
                <span className="text-sm text-slate-600">
                  <span className="font-semibold">{taskCountByTeam(team.id)}</span> tâche(s) assignée(s)
                </span>
              </div>

              <ul className="space-y-1 mb-4">
                {team.members.length === 0 && (
                  <li className="text-sm text-slate-400 italic">Aucun membre</li>
                )}
                {team.members.map((member, i) => (
                  <li
                    key={i}
                    className="flex items-center justify-between bg-slate-50 rounded-md px-3 py-1.5 text-sm"
                  >
                    <span>{member}</span>
                    <button
                      onClick={() => removeFromTeam(team.id, member)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>

              {availableForTeam(team).length > 0 && (
                <div>
                  <p className="text-xs text-slate-500 mb-1">Ajouter depuis les membres :</p>
                  <div className="flex flex-wrap gap-1.5">
                    {availableForTeam(team).map((m) => (
                      <button
                        key={m}
                        onClick={() => addToTeam(team.id, m)}
                        className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-xs hover:bg-sky-100 hover:text-sky-700"
                      >
                        + {m}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

const defaultColors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#14b8a6']
