import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseConsignesWorkbook,
  summarizeAircrafts,
  findSheetDate,
  parseEffectif,
  parseBlocks,
  toDateString,
  isBlueColor,
} from './consignesExcel'

function buildFixtureSheet() {
  const rows = []
  rows[0] = []
  rows[0][1] = 'Date'
  rows[0][2] = '2026-09-08'
  // Shift headers
  rows[1] = []
  rows[1][4] = 'Matin'
  rows[1][13] = 'Soir'
  rows[1][22] = 'Nuit'
  // Header row
  rows[2] = []
  rows[2][4] = 'Nom'
  rows[2][5] = 'Affectation'
  rows[2][6] = 'Affectation'
  rows[2][7] = 'Remarque'
  rows[2][13] = 'Nom'
  rows[2][14] = 'Affectation'
  rows[2][22] = 'Nom'
  rows[2][23] = 'Affectation'
  // Effectif Matin
  rows[3] = []
  rows[3][4] = 'AYAD (FARID)'
  rows[3][5] = 'F-GSQB'
  rows[3][6] = 'F-GSPK'
  rows[4] = []
  rows[4][4] = 'DUPONT (JEAN)'
  rows[4][5] = 'ABSENT'
  rows[5] = []
  rows[5][4] = 'MARTIN (PAUL)'
  rows[5][5] = 'MANAGER'
  // Effectif Soir
  rows[3][13] = 'DIAS (BRUNO)'
  rows[3][14] = 'F-GSQB'
  rows[4][13] = 'LACHAUD (ARTHUR)'
  rows[4][14] = 'F-GKXU'
  // Effectif Nuit
  rows[3][22] = 'NICOLAS (ALEXANDRE)'
  rows[3][23] = 'F-GSQB'
  // Bloc de charge F-GSQB
  const base = 10
  rows[base] = []
  rows[base][8] = 'Type\nde visite'
  rows[base][9] = 'A 04'
  rows[base][6] = "Date\nd'entrée"
  rows[base][7] = 46271
  rows[base][14] = 'OSM'
  rows[base][15] = 'Config'
  rows[base][22] = 'Position'
  rows[base][23] = 'Date\nde sortie'
  rows[base][24] = 46272
  rows[base + 1] = []
  rows[base + 1][8] = 'Immat'
  rows[base + 1][9] = 'F-GSQB'
  rows[base + 1][6] = "Heure\nd'entrée"
  rows[base + 1][7] = '20H'
  rows[base + 1][14] = 63994878
  rows[base + 1][15] = 'Y148'
  rows[base + 1][22] = 'H1-1B'
  rows[base + 1][23] = 'Heure\nde sortie'
  rows[base + 1][24] = '12H'
  rows[base + 2] = []
  rows[base + 2][8] = 'Consignes générales'
  rows[base + 3] = []
  rows[base + 3][8] = 'Consignes Matin'
  rows[base + 3][9] = '7'
  rows[base + 4] = []
  rows[base + 4][8] = 'A faire/ Non réalisé…'
  rows[base + 5] = []
  rows[base + 5][8] = 'LEADER + ACL + IDT'
  rows[base + 6] = []
  rows[base + 6][8] = 'CAB SECU + PRELIM'
  rows[base + 3][17] = 'Consignes Soir'
  rows[base + 3][18] = '4'
  rows[base + 4][17] = 'A faire/ Non réalisé…'
  rows[base + 5][17] = 'LEADER INSP LAVATORIES'
  rows[base + 6][17] = 'MEL L203 GWIV'
  rows[base + 3][22] = 'Consignes Nuit'
  rows[base + 3][23] = '2'
  rows[base + 4][22] = 'A faire/ Non réalisé…'
  rows[base + 5][22] = 'WASTE'
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'LUNDI')
  return { wb, rows }
}

describe('findSheetDate', () => {
  it('lit la date de la feuille', () => {
    const { rows } = buildFixtureSheet()
    expect(findSheetDate(rows)).toBe('2026-09-08')
  })

  it('convertit les numéros de série Excel en date', () => {
    expect(toDateString(46274)).toBe('2026-09-09')
    expect(toDateString('2026-09-08')).toBe('2026-09-08')
    expect(toDateString(undefined)).toBe('')
  })
})

describe('parseEffectif', () => {
  it('détecte Matin/Soir/Nuit, double affectation, ignore ABSENT/MANAGER', () => {
    const { rows } = buildFixtureSheet()
    const effectif = parseEffectif(rows)
    const matin = effectif.find((s) => s.shift === 'matin')
    expect(matin).toBeDefined()
    expect(matin.members).toHaveLength(1)
    expect(matin.members[0].name).toBe('AYAD (FARID)')
    expect(matin.members[0].aircrafts).toEqual(['F-GSQB', 'F-GSPK'])
    const soir = effectif.find((s) => s.shift === 'soir')
    expect(soir.members.map((m) => m.name)).toEqual(['DIAS (BRUNO)', 'LACHAUD (ARTHUR)'])
    const nuit = effectif.find((s) => s.shift === 'nuit')
    expect(nuit.members).toHaveLength(1)
  })

  it('marque comme leader le membre dont le nom est sur fond bleu', () => {
    const rows = []
    rows[1] = []
    rows[1][0] = 'Matin'
    rows[2] = []
    rows[2][0] = 'Nom'
    rows[2][1] = 'Affectation'
    rows[3] = []
    rows[3][0] = 'AYAD (FARID)'
    rows[3][1] = 'F-GSQB'
    rows[4] = []
    rows[4][0] = 'DIAS (BRUNO)'
    rows[4][1] = 'F-GSQB'
    const ws = {
      '!ref': 'A1:B5',
      A4: { v: 'AYAD (FARID)', s: { fill: { fgColor: { rgb: 'FF0000FF' } } } },
    }
    const eff = parseEffectif(rows, ws)
    const members = eff.find((s) => s.shift === 'matin').members
    expect(members.find((m) => m.name === 'AYAD (FARID)').leader).toBe(true)
    expect(members.find((m) => m.name === 'DIAS (BRUNO)').leader).toBe(false)
    expect(isBlueColor('FF0000FF')).toBe(true)
    expect(isBlueColor('FFFF0000')).toBe(false)
  })
})

describe('parseBlocks', () => {
  it('extrait l’avion et les listes de tâches par shift', () => {
    const { rows } = buildFixtureSheet()
    const blocks = parseBlocks(rows)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].immat).toBe('F-GSQB')
    expect(blocks[0].typeVisite).toBe('A 04')
    expect(blocks[0].shifts.matin).toEqual(['LEADER + ACL + IDT', 'CAB SECU + PRELIM'])
    expect(blocks[0].shifts.soir).toEqual(['LEADER INSP LAVATORIES', 'MEL L203 GWIV'])
    expect(blocks[0].shifts.nuit).toEqual(['WASTE'])
  })

  it('extrait les cases d’en-tête (entrée/sortie, OSM Config Position)', () => {
    const { rows } = buildFixtureSheet()
    const blocks = parseBlocks(rows)
    expect(blocks[0].dateEntree).toBe('2026-09-06')
    expect(blocks[0].heureEntree).toBe('20H')
    expect(blocks[0].osm).toBe('63994878')
    expect(blocks[0].config).toBe('Y148')
    expect(blocks[0].position).toBe('H1-1B')
    expect(blocks[0].dateSortie).toBe('2026-09-07')
    expect(blocks[0].heureSortie).toBe('12H')
  })

  it('retrouve une colonne de consignes dont le libellé a été remplacé (ex. « MODIF SHA »)', () => {
    const rows = []
    rows[0] = []
    rows[0][4] = 'Immat'
    rows[0][5] = 'F-TEST'
    rows[2] = []
    rows[2][4] = 'MODIF SHA'
    rows[2][5] = 3
    rows[2][13] = 'Consignes Soir'
    rows[2][14] = 2
    rows[3] = []
    rows[3][4] = 'A faire/ Non réalisé / Pourquoi ?'
    rows[3][13] = 'A faire/ Non réalisé / Pourquoi ?'
    rows[4] = []
    rows[4][4] = 'LEADER'
    rows[4][13] = 'LEADER SOLDE DOSSIER'
    rows[5] = []
    rows[5][4] = 'SPE02 + F/F'
    rows[5][13] = 'FDV'
    rows[6] = []
    rows[6][4] = 'WASTE + CRUSHED ICE'

    const blocks = parseBlocks(rows)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].shifts.matin).toEqual(['LEADER', 'SPE02 + F/F', 'WASTE + CRUSHED ICE'])
    expect(blocks[0].shifts.soir).toEqual(['LEADER SOLDE DOSSIER', 'FDV'])
  })
})

describe('parseConsignesWorkbook + summarizeAircrafts', () => {
  it('agrège effectif et consignes par avion', () => {
    const { wb } = buildFixtureSheet()
    const results = parseConsignesWorkbook(wb)
    expect(results.LUNDI.date).toBe('2026-09-08')
    const aircrafts = summarizeAircrafts(results)
    expect(aircrafts).toHaveLength(3)
    const gsqb = aircrafts.find((a) => a.immat === 'F-GSQB')
    expect(gsqb).toBeDefined()
    expect(gsqb.totalTasks).toBe(5)
    expect(gsqb.days.LUNDI.matin).toEqual(['AYAD (FARID)'])
    expect(gsqb.days.LUNDI.soir).toEqual(['DIAS (BRUNO)'])
    expect(gsqb.days.LUNDI.nuit).toEqual(['NICOLAS (ALEXANDRE)'])
    expect(gsqb.days.LUNDI.consignes.matin).toEqual(['LEADER + ACL + IDT', 'CAB SECU + PRELIM'])
    expect(gsqb.days.LUNDI.consignes.nuit).toEqual(['WASTE'])
    expect(gsqb.days.LUNDI.infos.osm).toBe('63994878')
    expect(gsqb.days.LUNDI.infos.position).toBe('H1-1B')
  })
})