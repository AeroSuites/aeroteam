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

  // Notes consignes : seule la note du jour × shift visé est remplacée
  const NOTE_TITLE = scope
    ? `${NOTE_PREFIX}${String(scope.day || '').toUpperCase()} ${cap(shift)}`
    : null
  const keptNotes = (data.notes || []).filter((n) => {
    if (!scope) return !String(n.title || '').startsWith(NOTE_PREFIX)
    return String(n.title || '') !== NOTE_TITLE
  })
  const consigneNotes = []
  Object.entries(aircraftInfo.days || {}).forEach(([day, d]) => {
    Object.entries(d.consignes || {}).forEach(([s, tasks]) => {
      if (!Array.isArray(tasks) || tasks.length === 0) return
      consigneNotes.push({
        id: makeId('note'),
        title: `${NOTE_PREFIX}${day.toUpperCase()} ${cap(s)}`,
        content: tasks.map((t) => `- ${t}`).join('\n'),
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