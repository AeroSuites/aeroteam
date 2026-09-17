import { describe, it, expect } from 'vitest'
import { buildProfileData, aircraftProfileLabel } from './profileBuilder'

const aircraftInfo = {
  immat: 'F-GSQB',
  totalTasks: 5,
  days: {
    MERCREDI: {
      soir: ['DIAS (BRUNO)', 'AYAD (FARID)'],
      consignes: { soir: ['LEADER AIDE SPE 02', 'WASTE'] },
    },
  },
}

describe('buildProfileData (jour × shift)', () => {
  it('n’ajoute aucune équipe : l’effectif va dans les membres du jour, les permanents restent intacts', () => {
    const existing = {
      tasks: [{ id: 't1', description: 'tâche existante' }],
      teams: [{ id: 'leader-1', name: 'Équipe du leader', members: ['X (Y)'], color: '#111111', locked: false }],
      assignments: { t1: 'leader-1' },
      members: ['X (Y)'],
      dayMembers: [],
      prepTasks: [],
      notes: [],
      pockets: [],
    }
    const data = buildProfileData(existing, aircraftInfo, { day: 'MERCREDI', shift: 'soir' })
    // Équipes intactes, aucune équipe Matin/Soir/Nuit créée
    expect(data.teams).toEqual(existing.teams)
    expect(data.teams.some((t) => t.name === 'Soir')).toBe(false)
    // Membres permanents : inchangés
    expect(data.members).toEqual(['X (Y)'])
    // Membres du jour : effectif du shift
    expect(data.dayMembers).toEqual(['DIAS (BRUNO)', 'AYAD (FARID)'])
    // Affectations et tâches conservées
    expect(data.assignments.t1).toBe('leader-1')
    expect(data.tasks).toHaveLength(1)
  })

  it('insère la consigne du jour × shift et remplace l’ancienne note [C] correspondante', () => {
    const existing = {
      tasks: [],
      teams: [],
      assignments: {},
      members: [],
      dayMembers: [],
      prepTasks: [],
      notes: [
        { id: 'n1', title: '[C] MERCREDI Soir', content: 'ancienne liste' },
        { id: 'n2', title: '[C] LUNDI Matin', content: 'autre jour' },
      ],
      pockets: [],
    }
    const data = buildProfileData(existing, aircraftInfo, { day: 'MERCREDI', shift: 'soir' })
    const soir = data.notes.find((n) => n.title === '[C] F-GSQB MERCREDI Soir')
    expect(soir.content).toContain('- LEADER AIDE SPE 02')
    expect(soir.content).toContain('- WASTE')
    // L'ancienne note du même jour/shift (format sans immat) est remplacée
    expect(data.notes.some((n) => n.content === 'ancienne liste')).toBe(false)
    expect(data.notes.some((n) => n.title === '[C] LUNDI Matin')).toBe(true)
  })

  it('conserve la consigne du même jour/shift d’un autre avion (leader multi-avions)', () => {
    const existing = {
      tasks: [],
      teams: [],
      assignments: {},
      members: [],
      dayMembers: [],
      prepTasks: [],
      notes: [
        { id: 'n1', title: '[C] F-GSPA MERCREDI Soir', content: 'consignes avion A' },
      ],
      pockets: [],
    }
    const data = buildProfileData(existing, aircraftInfo, { day: 'MERCREDI', shift: 'soir' })
    expect(data.notes.some((n) => n.title === '[C] F-GSPA MERCREDI Soir')).toBe(true)
    expect(data.notes.some((n) => n.title === '[C] F-GSQB MERCREDI Soir')).toBe(true)
  })

  it('ajoute l’en-tête avion (entrée / OSM Config Position / sortie) aux consignes', () => {
    const existing = {
      tasks: [],
      teams: [],
      assignments: {},
      members: [],
      dayMembers: [],
      prepTasks: [],
      notes: [],
      pockets: [],
    }
    const info = {
      immat: 'F-GSQB',
      totalTasks: 1,
      days: {
        MERCREDI: {
          soir: ['DIAS (BRUNO)'],
          consignes: { soir: ['Tâche A'] },
          infos: {
            typeVisite: 'A 04',
            dateEntree: '2026-09-06',
            heureEntree: '20H',
            osm: '63994878',
            config: 'Y148',
            position: 'H1-1B',
            dateSortie: '2026-09-07',
            heureSortie: '12H',
          },
        },
      },
    }
    const data = buildProfileData(existing, info, { day: 'MERCREDI', shift: 'soir' })
    const note = data.notes.find((n) => n.title === '[C] F-GSQB MERCREDI Soir')
    expect(note.content).toContain("Date d'entrée : 06/09/2026 20H")
    expect(note.content).toContain('OSM : 63994878 · Config : Y148 · Position : H1-1B')
    expect(note.content).toContain("Date de sortie : 07/09/2026 12H")
    expect(note.content).toContain('- Tâche A')
  })
})

describe('aircraftProfileLabel', () => {
  it('nomme le profil pour un avion', () => {
    expect(aircraftProfileLabel('F-GSQB')).toBe('Équipe F-GSQB')
  })
})