// Construction/fusion des données de profil avion à partir de l'analyse
// du fichier consignes. Règles :
// - l'effectif du jour × shift visé est ajouté aux MEMBRES DU JOUR
//   (dayMembers, effaçables par le reset quotidien) ;
// - les MEMBRES PERMANENTS (members) ne sont jamais touchés ;
// - les équipes, tâches et affectations existantes sont conservées ;
// - les consignes sont insérées sous forme de notes préfixées [C], la note
//   du jour × shift visé étant remplacée à chaque ré-import.

import { makeId } from '../utils/helpers'

const NOTE_PREFIX = '[C] '

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1)

const frDate = (iso) => {
  if (!iso) return ''
  const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso)
}

// En-tête d'information avion ajouté aux consignes transmises au profil
function infosHeader(infos) {
  if (!infos) return []
  const header = []
  const entre = [frDate(infos.dateEntree), infos.heureEntree].filter(Boolean).join(' ')
  const sortie = [frDate(infos.dateSortie), infos.heureSortie].filter(Boolean).join(' ')
  if (infos.typeVisite) header.push(`Type de visite : ${infos.typeVisite}`)
  if (entre) header.push(`Date d'entrée : ${entre}`)
  if (infos.osm || infos.config || infos.position) {
    header.push(
      `OSM : ${infos.osm || '—'} · Config : ${infos.config || '—'} · Position : ${
        infos.position || '—'
      }`
    )
  }
  if (sortie) header.push(`Date de sortie : ${sortie}`)
  if (header.length > 0) header.push('')
  return header
}

function shiftMembers(days, shift) {
  const out = []
  Object.values(days || {}).forEach((d) => {
    const arr = d[shift]
    if (Array.isArray(arr)) out.push(...arr)
  })
  return out
}

export function buildProfileData(existing, aircraftInfo, scope) {
  const data = existing || {
    tasks: [],
    teams: [],
    assignments: {},
    members: [],
    dayMembers: [],
    prepTasks: [],
    notes: [],
    pockets: [],
  }

  // Membres du jour : union (existants + effectif du jour × shift visé)
  const shift = scope ? scope.shift : 'matin'
  const scopeMembers = shiftMembers(aircraftInfo.days, shift)
  const dayMembers = [...new Set([...(data.dayMembers || []), ...scopeMembers])]

  // Notes consignes : seule la note du jour × shift visé (pour CET avion) est remplacée
  const immat = aircraftInfo?.immat ? String(aircraftInfo.immat).trim() : ''
  const NOTE_TITLE = scope
    ? `${NOTE_PREFIX}${immat ? `${immat} ` : ''}${String(scope.day || '').toUpperCase()} ${cap(shift)}`
    : null
  // Ancien format sans immatriculation (nettoyé au passage lors d'un import ciblé)
  const LEGACY_TITLE = scope
    ? `${NOTE_PREFIX}${String(scope.day || '').toUpperCase()} ${cap(shift)}`
    : null
  const keptNotes = (data.notes || []).filter((n) => {
    if (!scope) return !String(n.title || '').startsWith(NOTE_PREFIX)
    const title = String(n.title || '')
    return title !== NOTE_TITLE && title !== LEGACY_TITLE
  })
  const consigneNotes = []
  Object.entries(aircraftInfo.days || {}).forEach(([day, d]) => {
    const header = infosHeader(d.infos)
    Object.entries(d.consignes || {}).forEach(([s, tasks]) => {
      if (!Array.isArray(tasks) || tasks.length === 0) return
      consigneNotes.push({
        id: makeId('note'),
        title: `${NOTE_PREFIX}${immat ? `${immat} ` : ''}${day.toUpperCase()} ${cap(s)}`,
        content: [...header, ...tasks.map((t) => `- ${t}`)].join('\n'),
        createdAt: Date.now(),
      })
    })
  })

  return {
    tasks: data.tasks || [],
    teams: data.teams || [],
    assignments: data.assignments || {},
    members: data.members || [],
    dayMembers,
    prepTasks: data.prepTasks || [],
    notes: [...consigneNotes, ...keptNotes],
    pockets: data.pockets || [],
  }
}

export function aircraftProfileLabel(immat) {
  return `Équipe ${immat}`
}