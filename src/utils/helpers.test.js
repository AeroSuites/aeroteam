import { describe, it, expect, vi } from 'vitest'
import {
  makeId,
  dedupeAndMerge,
  normalizeHeader,
  detectColumns,
  parseExcelRows,
  getCategoryColor,
  getCategoryLabel,
  getFirstName,
  groupTasksByCategory,
  getZoneColor,
  hashCodeKey,
  taskContentKey,
  filterNewPrepTasks,
  priorityToken,
  consigneDay,
  logicalToday,
} from './helpers'

describe('taskContentKey / filterNewPrepTasks', () => {
  it('ignore les lignes déjà présentes (même id ou même contenu importé)', () => {
    const existing = [
      { id: 'a1', seq: '10', description: 'Tâche A', taskType: 'JIC', workArea: 'ZL1' },
      { id: 'b1', seq: '11', description: 'Tâche B', taskType: 'CORR', workArea: 'ZL2' },
    ]
    const incoming = [
      { id: 'a1', seq: '10', description: 'Tâche A', taskType: 'JIC', workArea: 'ZL1' },
      { id: 'c9', seq: '10', description: 'tâche a', taskType: 'JIC', workArea: 'ZL1' },
      { id: 'd1', seq: '12', description: 'Tâche C', taskType: 'MPC', workArea: 'ZL3' },
    ]
    const fresh = filterNewPrepTasks(existing, incoming)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].description).toBe('Tâche C')
    expect(taskContentKey(existing[0])).toBe(taskContentKey(incoming[1]))
  })
})

describe('makeId', () => {
  it('préfixe les identifiants', () => {
    expect(makeId('task')).toMatch(/^task-/)
    expect(makeId()).not.toMatch(/^task-/)
    expect(makeId()).toHaveLength(36)
  })

  it('produit des identifiants uniques', () => {
    const ids = new Set(Array.from({ length: 1000 }, (_, i) => makeId('x' + i)))
    expect(ids.size).toBe(1000)
  })

  it('retombe sur un id de secours si crypto.randomUUID est indisponible', () => {
    const original = crypto.randomUUID
    vi.stubGlobal('crypto', { randomUUID: undefined })
    const id = makeId('task')
    vi.unstubAllGlobals()
    expect(typeof original).toBe('function')
    expect(id).toMatch(/^task-/)
    expect(id.length).toBeGreaterThan(5)
  })
})

describe('dedupeAndMerge', () => {
  it('ajoute les nouvelles tâches et ignore les doublons par id', () => {
    const prev = [{ id: 'a', seq: '1', description: 'existant' }]
    const result = dedupeAndMerge(prev, [
      { id: 'a', seq: '99', description: 'doublon id' },
      { id: 'b', seq: '2', description: 'nouveau' },
    ])
    expect(result.map((t) => t.id)).toEqual(['a', 'b'])
    expect(result[0].description).toBe('existant')
  })

  it('ignore les doublons par seq déjà présents dans la liste', () => {
    const result = dedupeAndMerge(
      [{ id: 'old-1', seq: '5', description: 'déjà présent' }],
      [
        { seq: '5', description: 'doublon seq' },
        { seq: '', description: 'sans seq' },
      ]
    )
    expect(result.map((t) => t.description)).toEqual(['déjà présent', 'sans seq'])
  })

  it('génère un id manquant', () => {
    const result = dedupeAndMerge([], [{ seq: '1', description: 'x' }])
    expect(result[0].id).toMatch(/^task-/)
  })
})

describe('normalizeHeader', () => {
  it('minuscules, sans accents, sans espaces', () => {
    expect(normalizeHeader('Task_Name')).toBe('task_name')
    expect(normalizeHeader('Équipage')).toBe('equipage')
    expect(normalizeHeader('  N°  ')).toBe('n°')
  })
})

describe('detectColumns', () => {
  it('détecte les colonnes typiques du Workpackage Report (noms soulignés)', () => {
    const headers = [
      'Seq._Nr.',
      'Task_Name',
      'Skills',
      'MTX_Status',
      'Task_Type',
      'Work_Area',
      'Phase',
      'Shift',
      'Scheduled_Start_Date',
      'Scheduled_End_Date',
      'Scheduled_Hours',
      'Aircraft_Registration',
      'Work_Package_Barcode',
    ]
    const detected = detectColumns(headers)
    expect(detected.description).toBe(1)
    expect(detected.seq).toBe(0)
    expect(detected.skills).toBe(2)
    expect(detected.mtxStatus).toBe(3)
    expect(detected.taskType).toBe(4)
    expect(detected.workArea).toBe(5)
    expect(detected.scheduledHours).toBe(10)
    expect(detected.registration).toBe(11)
    expect(detected.workBarcode).toBe(12)
  })
})

describe('filterRow / parseExcelRows', () => {
  const columns = detectColumns([
    'Seq._Nr.',
    'Task_Name',
    'Skills',
    'MTX_Status',
    'Task_Type',
    'Work_Area',
    'Scheduled_Hours',
    'Aircraft_Registration',
  ])

  it('garde les lignes dont un des skills multi commence par CABB', () => {
    const kept = parseExcelRows(
      [
        ['1', 'Tâche A', 'B1B2/CABB1B2', 'ACTV', 'JIC', 'WING L', '2', 'F-GKXT'],
        ['2', 'Tâche B', 'CABB1', 'ACTV', 'JIC', 'WING L', '1', 'F-GKXT'],
        ['3', 'Tâche C', 'B1/CTRLB1B2', 'ACTV', 'JIC', 'ENG', '3', 'F-GKXT'],
        ['4', 'Tâche D', 'CABB3/ELEC', 'PAUSE', 'EO', 'LEG', '1.5', 'F-GKXT'],
        ['5', 'Tâche E', 'ELEC', 'ACTV', 'JIC', 'ENG', '2', 'F-GKXT'],
      ],
      columns
    )
    expect(kept.map((t) => t.seq)).toEqual(['1', '2', '4'])
  })

  it('garde les lignes CABB* avec statut ACTV, PAUSE ou IN WORK', () => {
    const kept = parseExcelRows(
      [
        ['1', 'Tâche A', 'CABB1', 'ACTV', 'JIC', 'WING L', '2', 'F-GKXT'],
        ['2', 'Tâche B', 'ELEC', 'ACTV', 'JIC', 'WING L', '1', 'F-GKXT'],
        ['3', 'Tâche C', 'CABB2', 'CLSD', 'MPC', 'ENG', '3', 'F-GKXT'],
        ['4', 'Tâche D', 'CABB3', 'PAUSE', 'EO', 'LEG', '1.5', 'F-GKXT'],
        ['5', 'Tâche E', 'CABB4', 'IN WORK', 'JIC', 'ENG', '2', 'F-GKXT'],
      ],
      columns
    )
    expect(kept.map((t) => t.seq)).toEqual(['1', '4', '5'])
  })

  it('ignore les lignes sans description ni barcode', () => {
    const kept = parseExcelRows([['5', '', 'CABB1', 'ACTV', 'JIC', 'WING L', '2', 'F-GKXT']], columns)
    expect(kept).toHaveLength(0)
  })

  it('utilise le barcode de tâche comme description de secours', () => {
    const kept = parseExcelRows(
      [['6', '', 'CABB1', 'ACTV', 'JIC', 'WING L', '2', 'F-GKXT', 'WP-1234']],
      { ...columns, taskBarcode: 8 }
    )
    expect(kept).toHaveLength(1)
    expect(kept[0].description).toBe('WP-1234')
  })
})

describe('priorityToken — lignes MEL / EXMP', () => {
  it('détecte les lignes prioritaires avec référence', () => {
    expect(priorityToken('MEL L206')).toBe('MEL')
    expect(priorityToken('L11 MEL VERROU GALLEY G0')).toBe('MEL')
    expect(priorityToken('INSP B/C L49 + EXMP L251')).toBe('EXMP')
    expect(priorityToken('EXMP_AF_33TX LAVATORY 12')).toBe('EXMP')
    expect(priorityToken('MEL / EXMP : L222-223-224')).toBe('MEL')
  })

  it('ignore le simple libellé « MEL / EXMP : » et les autres lignes', () => {
    expect(priorityToken('MEL / EXMP :')).toBe('')
    expect(priorityToken('BMCC : AVEC DEFER / SANS DEFER')).toBe('')
    expect(priorityToken('NSRE RDY/IPR :')).toBe('')
    expect(priorityToken('Remplacement caramélisé')).toBe('')
  })
})

describe('logicalToday — vacation de nuit', () => {
  it('avant 6 h la journée logique est la veille, après 6 h c’est le jour même', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-22T00:30:00'))
    expect(logicalToday().getDate()).toBe(21)
    vi.setSystemTime(new Date('2026-09-22T05:59:00'))
    expect(logicalToday().getDate()).toBe(21)
    vi.setSystemTime(new Date('2026-09-22T06:00:00'))
    expect(logicalToday().getDate()).toBe(22)
    vi.setSystemTime(new Date('2026-09-22T23:30:00'))
    expect(logicalToday().getDate()).toBe(22)
    vi.useRealTimers()
  })
})

describe('consigneDay', () => {  it('trouve le jour avec ou sans immatriculation dans le titre', () => {
    expect(consigneDay('[C] MERCREDI Matin')).toBe('MERCREDI')
    expect(consigneDay('[C] F-GZNO MERCREDI Matin')).toBe('MERCREDI')
    expect(consigneDay('[C] F-GSPA LUNDI Soir')).toBe('LUNDI')
    expect(consigneDay('[C] DIMANCHE Nuit')).toBe('DIMANCHE')
    expect(consigneDay('Note libre')).toBe('')
  })
})

describe('catégories', () => {
  it('colore les blocs connus et retombe sur AUTRE', () => {
    expect(getCategoryColor('JIC')).toBe('#0ea5e9')
    expect(getCategoryColor('INCONNU')).toBe('#64748b')
  })

  it('traduit le label Found Fault', () => {
    expect(getCategoryLabel('CORR')).toBe('Found Fault')
    expect(getCategoryLabel('JIC')).toBe('JIC')
  })
})

describe('getFirstName', () => {
  it('extrait le prénom derrière la civilité', () => {
    expect(getFirstName('Mr Farid Ayad')).toBe('Farid')
    expect(getFirstName('Mme Lea Damagnez')).toBe('Lea')
    expect(getFirstName('Jean Dupont')).toBe('Jean')
    expect(getFirstName('')).toBe('')
  })
})

describe('hashCodeKey', () => {
  it('produit une empreinte déterministe et non réversible', async () => {
    const a = await hashCodeKey('CODE-123')
    const b = await hashCodeKey('CODE-123')
    const c = await hashCodeKey('CODE-124')
    expect(a).toBe(b)
    expect(a).not.toBe(c)
    expect(a).not.toContain('CODE-123')
    expect(a).toMatch(/^[0-9a-f]{16,64}$/)
  })
})

describe('getZoneColor', () => {
  it('donne une couleur stable par zone (indépendante de la liste)', () => {
    expect(getZoneColor('WING L', ['WING L', 'ENG'])).toBe(getZoneColor('WING L', []))
    expect(getZoneColor('WING L')).toBeDefined()
    expect(getZoneColor('')).toBeDefined()
    // Même nom = même couleur dans tous les cas
    expect(getZoneColor('FUSELAGE', ['WING L', 'FUSELAGE'])).toBe(
      getZoneColor('FUSELAGE', ['FUSELAGE', 'WING L'])
    )
  })
})

describe('groupTasksByCategory', () => {
  it('groupe par type de tâche', () => {
    const tasks = [
      { id: '1', taskType: 'JIC' },
      { id: '2', taskType: 'JIC' },
      { id: '3', taskType: 'EO' },
      { id: '4' },
    ]
    const groups = groupTasksByCategory(tasks)
    expect(groups.JIC).toHaveLength(2)
    expect(groups.EO).toHaveLength(1)
    expect(groups.AUTRE).toHaveLength(1)
  })
})