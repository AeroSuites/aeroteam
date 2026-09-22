export const CATEGORY_COLORS = {
  JIC: '#0ea5e9',
  CORR: '#f59e0b',
  MPC: '#8b5cf6',
  ADHOC: '#ef4444',
  EO: '#14b8a6',
  AUTRE: '#64748b',
}

export const CATEGORIES = Object.keys(CATEGORY_COLORS)

// Libellés d'affichage des types de tâches (blocs)
const CATEGORY_LABELS = {
  CORR: 'Found Fault',
}

export function getCategoryLabel(type) {
  return CATEGORY_LABELS[type] || type || ''
}

export const SHIFT_COLORS = {
  'MERCREDI MATIN': '#10b981',
  'MERCREDI SOIR': '#6366f1',
  'MERCREDI NUIT': '#3b82f6',
  'JEUDI MATIN': '#f97316',
  SUB: '#64748b',
  'VAC 06': '#a855f7',
  AUTRE: '#6b7280',
}

// Couleurs attribuées aux zones de travail
export const ZONE_COLORS = [
  '#0ea5e9',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#f97316',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
  '#06b6d4',
  '#a855f7',
  '#22c55e',
  '#eab308',
  '#f43f5e',
  '#6366f1',
]

export function getZoneColor(zone, _allZones) {
  if (!zone) return ZONE_COLORS[0]
  let hash = 0
  for (let i = 0; i < zone.length; i++) {
    hash = (hash * 31 + zone.charCodeAt(i)) >>> 0
  }
  return ZONE_COLORS[hash % ZONE_COLORS.length]
}

const DAY_NAMES = [
  'DIMANCHE',
  'LUNDI',
  'MARDI',
  'MERCREDI',
  'JEUDI',
  'VENDREDI',
  'SAMEDI',
]

// Jour (LUNDI..DIMANCHE) porté par une note de consignes [C] :
// « [C] MERCREDI Matin » ou « [C] F-GZNO MERCREDI Matin » (immatriculation).
export function consigneDay(title) {
  const words = String(title || '')
    .toUpperCase()
    .split(/[^A-Z]+/)
  return DAY_NAMES.find((d) => words.includes(d)) || ''
}

export function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return [100, 116, 139]
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

// Empreinte stable et non réversible d'une chaîne (ex. code de profil),
// utilisée pour associer un message à son auteur sans exposer le secret
export async function hashCodeKey(text) {
  const s = String(text || '')
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  }
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return (h >>> 0).toString(16)
}

export function currentWeekLabel(date = new Date()) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7))
  const week1 = new Date(d.getFullYear(), 0, 4)
  const week = 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7)
  return `Semaine ${week}`
}

// Affectations multi-équipes : assignments[taskId] = [teamId, ...]
export function assignmentTeams(assignments, taskId) {
  const v = assignments?.[taskId]
  if (Array.isArray(v)) return v
  return v ? [v] : []
}

export function isAssignedTo(assignments, taskId, teamId) {
  return assignmentTeams(assignments, taskId).includes(teamId)
}

export function assignedTaskCount(assignments) {
  return Object.values(assignments || {}).filter((v) =>
    Array.isArray(v) ? v.length > 0 : !!v
  ).length
}

// Filtres configurables pour l'import
export const IMPORT_FILTERS = {
  // Colonne Skills (F) : garder toute ligne dont AU MOINS UN des skills
// commence par CABB (ex. "B1B2/CABB1B2" doit être conservé)
  skills: {
    enabled: true,
    match: (value) => {
      const parts = String(value || '')
        .toUpperCase()
        .split('/')
        .map((p) => p.trim())
      return parts.some((p) => p.startsWith('CABB'))
    },
  },
  // Colonne MTX_Status (G) : garder ACTV, PAUSE et IN WORK
  mtxStatus: {
    enabled: true,
    allowed: ['ACTV', 'PAUSE', 'IN WORK'],
    match: (value) => {
      const v = String(value || '').toUpperCase().trim()
      return v === 'ACTV' || v === 'PAUSE' || v === 'IN WORK'
    },
  },
  // Colonne Task_Type (H) : garder tous les blocs
  taskType: {
    enabled: false,
    match: () => true,
  },
}

export function getCategoryColor(category) {
  const key = CATEGORIES.find(
    (c) => category && category.toUpperCase().includes(c)
  )
  return key ? CATEGORY_COLORS[key] : CATEGORY_COLORS.AUTRE
}

export function getShiftColor(shift) {
  const key = Object.keys(SHIFT_COLORS).find(
    (s) => shift && shift.toUpperCase().includes(s)
  )
  return key ? SHIFT_COLORS[key] : SHIFT_COLORS.AUTRE
}

// Extrait le prénom d'un nom complet du type "Mr Farid Ayad" -> "Farid",
// "Mme Lea Damagnez" -> "Lea". Sans civilité, renvoie le premier mot.
export function getFirstName(fullName) {
  const name = String(fullName || '').trim()
  if (!name) return ''
  const parts = name.split(/\s+/)
  if (/^(mr|mme|m\.|mme\.|mrs|ms)\.?$/i.test(parts[0])) {
    return parts[1] || ''
  }
  return parts[0]
}

export function groupTasksByCategory(tasks) {
  return tasks.reduce((acc, task) => {
    const cat = task.taskType || task.category || 'AUTRE'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(task)
    return acc
  }, {})
}

export function groupTasksByField(tasks, field) {
  return tasks.reduce((acc, task) => {
    const key = (task[field] || 'AUTRE').toString().toUpperCase()
    if (!acc[key]) acc[key] = []
    acc[key].push(task)
    return acc
  }, {})
}

export function makeId(prefix = '') {
  const uid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return prefix ? `${prefix}-${uid}` : uid
}

export function dedupeAndMerge(prev, newTasks) {
  const existingSeqs = new Set(prev.map((t) => t.seq).filter((s) => s !== undefined && s !== ''))
  const existingIds = new Set(prev.map((t) => t.id))
  const fresh = newTasks
    .filter((t) => !existingIds.has(t.id))
    .filter((t) => {
      if (t.seq === undefined || t.seq === '') return true
      return !existingSeqs.has(t.seq)
    })
    .map((t) => ({
      ...t,
      id: t.id || makeId('task'),
    }))
  return [...prev, ...fresh]
}

// Clé de contenu d'une ligne (n° + description + bloc + zone) pour repérer les doublons
export function taskContentKey(t) {
  return [
    t.seq ?? '',
    String(t.description || '').trim().toLowerCase(),
    t.taskType || '',
    t.workArea || '',
  ].join('|')
}

// Lignes entrantes qui ne sont PAS déjà présentes (par id et par contenu)
export function filterNewPrepTasks(existing, incoming) {
  const ids = new Set(existing.map((t) => t.id))
  const keys = new Set(existing.map(taskContentKey))
  return incoming.filter((t) => !ids.has(t.id) && !keys.has(taskContentKey(t)))
}

export function normalizeHeader(header) {
  if (!header) return ''
  return header
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export const HEADER_ALIASES = {
  seq: ['seq._nr.', 'seq', 'n°', 'numero', 'number', 'no', 'ref'],
  description: ['task_name', 'name', 'description', 'libelle', 'intitule'],
  skills: ['skills', 'skill', 'metier'],
  mtxStatus: ['mtx_status', 'status', 'etat'],
  taskType: ['task_type', 'type'],
  workArea: ['work_area', 'area', 'zone'],
  phase: ['phase'],
  shift: ['shift', 'poste'],
  startDate: ['scheduled_start_date', 'start_date', 'debut', 'start'],
  endDate: ['scheduled_end_date', 'end_date', 'fin', 'end'],
  scheduledHours: ['scheduled_hours', 'hours', 'heures', 'duree'],
  actualHours: ['actual_hours'],
  taskCode: ['task_code', 'code'],
  aircraftType: ['aircraft_type', 'aircraft', 'appareil'],
  registration: ['aircraft_registration', 'registration', 'immatriculation', 'immat'],
  partStatus: ['part_status'],
  impact: ['impact'],
  crew: ['crew', 'equipage'],
  material: ['material_availability', 'material'],
  taskSteps: ['task_steps'],
  configSlot: ['config_slot'],
  taskBarcode: ['task_barcode'],
  workBarcode: ['work_package_barcode', 'workpackage'],
  pauseReason: ['pause_reason'],
  pauseNotes: ['pause_notes'],
  technicalZones: ['technical_zones', 'technical_zones'],
  collected: ['collected'],
}

export function detectColumns(headers) {
  const normalized = headers.map(normalizeHeader)
  const detected = {}

  Object.entries(HEADER_ALIASES).forEach(([field, aliases]) => {
    const idx = normalized.findIndex((h) => aliases.includes(h))
    if (idx !== -1) detected[field] = idx
  })

  return detected
}

// Filtre les lignes selon les règles d'import
export function filterRow(row, columns) {
  const get = (field) => {
    const idx = columns[field]
    return idx !== undefined ? row[idx] : undefined
  }

  // Filtre Skill (colonne F)
  if (IMPORT_FILTERS.skills.enabled) {
    const skill = get('skills')
    if (!IMPORT_FILTERS.skills.match(skill)) return false
  }

  // Filtre MTX Status (colonne G)
  if (IMPORT_FILTERS.mtxStatus.enabled) {
    const status = get('mtxStatus')
    if (!IMPORT_FILTERS.mtxStatus.match(status)) return false
  }

  // Filtre Task Type (colonne H)
  if (IMPORT_FILTERS.taskType.enabled) {
    const type = get('taskType')
    if (!IMPORT_FILTERS.taskType.match(type)) return false
  }

  return true
}

// Colonne « shift » des fichiers Victory : « vac 01 », « vac 02 »… = priorités.
// Renvoie le numéro de priorité (1, 2, …) ou null si la cellule est vide/autre.
export function taskPriority(task) {
  const m = String(task?.shift || '').match(/vac\s*0*(\d+)/i)
  return m ? Number(m[1]) : null
}

// Priorité la plus haute d'un ensemble de tâches (Infinity si aucune)
export function groupPriority(list) {
  let min = Number.POSITIVE_INFINITY
  ;(list || []).forEach((t) => {
    const p = taskPriority(t)
    if (p !== null && p < min) min = p
  })
  return min
}

// Tri stable : les tâches prioritaires (vac 01, vac 02…) passent devant,
// les autres gardent leur ordre actuel.
export function sortByPriority(list) {
  return [...(list || [])].sort((a, b) => {
    const pa = taskPriority(a)
    const pb = taskPriority(b)
    const va = pa === null ? Number.POSITIVE_INFINITY : pa
    const vb = pb === null ? Number.POSITIVE_INFINITY : pb
    return va - vb
  })
}

export function parseExcelRows(rows, columns) {
  const result = []

  rows.forEach((row, _idx) => {
    const get = (field) => {
      const idx = columns[field]
      return idx !== undefined ? row[idx] : undefined
    }

    // Applique les filtres
    if (!filterRow(row, columns)) return

    const description = get('description')
      ? String(get('description'))
      : String(get('taskBarcode') || '')

    if (!description) return

    const task = {
      id: makeId('task'),
      seq: get('seq') !== undefined ? String(get('seq')) : undefined,
      description,
      skills: get('skills') ? String(get('skills')) : undefined,
      mtxStatus: get('mtxStatus') ? String(get('mtxStatus')) : undefined,
      taskType: get('taskType') ? String(get('taskType')) : undefined,
      workArea: get('workArea') ? String(get('workArea')) : undefined,
      phase: get('phase') ? String(get('phase')) : undefined,
      shift: get('shift') ? String(get('shift')) : undefined,
      startDate: get('startDate') !== undefined ? String(get('startDate')) : undefined,
      endDate: get('endDate') !== undefined ? String(get('endDate')) : undefined,
      scheduledHours: get('scheduledHours') !== undefined ? String(get('scheduledHours')) : undefined,
      actualHours: get('actualHours') !== undefined ? String(get('actualHours')) : undefined,
      taskCode: get('taskCode') !== undefined ? String(get('taskCode')) : undefined,
      taskBarcode: get('taskBarcode') !== undefined ? String(get('taskBarcode')) : undefined,
      workBarcode: get('workBarcode') !== undefined ? String(get('workBarcode')) : undefined,
      aircraftType: get('aircraftType') ? String(get('aircraftType')) : undefined,
      registration: get('registration') ? String(get('registration')) : undefined,
      partStatus: get('partStatus') ? String(get('partStatus')) : undefined,
      impact: get('impact') ? String(get('impact')) : undefined,
      // Alias compatibilité
      ref: get('seq') !== undefined ? String(get('seq')) : undefined,
      zone: get('workArea') ? String(get('workArea')) : undefined,
      avion: get('registration') ? String(get('registration')) : undefined,
      category: get('taskType') ? String(get('taskType')) : undefined,
    }

    result.push(task)
  })

  // Priorités (colonne shift : « vac 01 », « vac 02 »…) : tri par ordre croissant.
  // Sans priorité : l'ordre du fichier est conservé (tri stable).
  const prio = (t) => {
    const p = taskPriority(t)
    return p === null ? Number.POSITIVE_INFINITY : p
  }
  return [...result].sort((a, b) => prio(a) - prio(b))
}
