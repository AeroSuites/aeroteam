// Charte Air France — « Encrier coloriel » :
// bleus identitaires #051039 / #003165 / #14438B / #0045B6 (+ déclinaisons),
// blancs/gris, et rouge #FF0000 en touche.
export const CATEGORY_COLORS = {
  JIC: '#003165',
  CORR: '#ff0000',
  MPC: '#0045b6',
  ADHOC: '#14438b',
  EO: '#00659d',
  AUTRE: '#767676',
}

// Couleurs d'équipe (charte Air France)
export const TEAM_COLORS = [
  '#003165',
  '#14438b',
  '#0045b6',
  '#27395d',
  '#315882',
  '#00659d',
]

export const CATEGORIES = Object.keys(CATEGORY_COLORS)

// Libellés d'affichage des types de tâches (blocs)
const CATEGORY_LABELS = {
  CORR: 'Found Fault',
}

export function getCategoryLabel(type) {
  return CATEGORY_LABELS[type] || type || ''
}

export const SHIFT_COLORS = {
  'MERCREDI MATIN': '#003165',
  'MERCREDI SOIR': '#14438b',
  'MERCREDI NUIT': '#051039',
  'JEUDI MATIN': '#0045b6',
  SUB: '#767676',
  'VAC 06': '#00659d',
  AUTRE: '#767676',
}

// Couleurs attribuées aux zones de travail (charte Air France — bleus)
export const ZONE_COLORS = [
  '#051039',
  '#003165',
  '#14438b',
  '#0045b6',
  '#27395d',
  '#315882',
  '#00659d',
  '#0070c4',
  '#62728e',
  '#3d82bd',
  '#0e95d3',
  '#8497b1',
]

export function getZoneColor(zone, _allZones) {
  if (!zone) return ZONE_COLORS[0]
  let hash = 0
  for (let i = 0; i < zone.length; i++) {
    hash = (hash * 31 + zone.charCodeAt(i)) >>> 0
  }
  return ZONE_COLORS[hash % ZONE_COLORS.length]
}

// Correspondance Windows-1252 (les caractères 0x80–0x9F ne sont pas identiques
// à Latin-1 : € “ ” – — … etc.)
const CP1252_TO_BYTE = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
}

// Répare un texte doublement encodé (UTF-8 relu en Windows-1252) :
// « Ã© » → « é », « â€™ » → « ’ », « â€“ » → « – », etc.
// Ne touche à rien si le texte ne contient pas de séquence typique.
export function fixMojibake(value) {
  const s = String(value ?? '')
  if (!/[ÃÂâ][\u0080-\uFFFF]/.test(s)) {
    return s
  }
  try {
    const bytes = []
    for (const ch of s) {
      const code = ch.codePointAt(0)
      if (code <= 0xff) bytes.push(code)
      else if (CP1252_TO_BYTE[code] !== undefined) bytes.push(CP1252_TO_BYTE[code])
      else return s
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  } catch {
    return s
  }
}

// Nettoie un texte du Workpackage : balises <br> → saut de ligne, entités HTML,
// retours chariot en double (\r\r\n) → lignes propres, caractères de contrôle.
export function cleanTaskText(text) {
  return fixMojibake(String(text ?? ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/<[^>]*>/g, '')
    .replace(/\r\r\n/g, '\n')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex -- nettoyage volontaire des caractères de contrôle
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Ligne prioritaire : mention « MEL », « EXMP » ou « NSRE » suivie d'une
// référence. Les simples libellés de fiche (« MEL / EXMP : », « NSRE RDY/IPR : »)
// sont ignorés. Renvoie « MEL », « EXMP », « NSRE » ou '' si non prioritaire.
// Tous les jetons de priorité d'un texte : MEL / EXMP / NSRE / TLI / IDT.
// Le mot peut être suivi directement d'une référence (ex. « EXMP25x54 »)
// mais pas d'une lettre (pour ne pas confondre avec un autre mot).
// IDT et TLI comptent même sans référence (souvent notés « *** IDT *** »).
export function priorityTokens(text) {
  const s = String(text || '')
  const re = /(^|[^A-Z0-9_])(EXMP|MEL|NSRE|TLI|IDT)(?![A-Z])/gi
  const out = []
  let m
  while ((m = re.exec(s))) {
    const tok = m[2].toUpperCase()
    const after = s
      .slice(m.index + m[0].length)
      .replace(/^\s*\/\s*(?:EXMP|MEL|NSRE|TLI|IDT)(?![A-Z])/i, '')
      .replace(/^\s*RDY\s*\/\s*IPR/i, '')
      .replace(/^[\s:·\-–*]*/, '')
    if (/[a-z0-9]/i.test(after) || tok === 'IDT' || tok === 'TLI') {
      if (!out.includes(tok)) out.push(tok)
    }
  }
  return out
}

export function priorityToken(text) {
  return priorityTokens(text)[0] || ''
}

// Préfixe de priorité pour les exports (PDF/Excel) : « [MEL] », « [EXMP] » ou ''
export function priorityPrefix(task) {
  const tok = priorityToken(
    `${task?.description || ''} ${task?.taskBarcode || ''}`
  )
  return tok ? `[${tok}] ` : ''
}

// Vacation de nuit (22 h → 6 h) : entre 0 h et 6 h du matin, la journée
// « en cours » est encore celle de la veille — les consignes de la veille
// restent donc affichées jusqu'à 6 h (sauf effacement manuel).
export const NIGHT_CUTOFF_HOUR = 6

export function logicalToday(date = new Date()) {
  const d = new Date(date)
  if (d.getHours() < NIGHT_CUTOFF_HOUR) d.setDate(d.getDate() - 1)
  return d
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

// Concordance de noms (prénom / nom) : accents, casse et parenthèses ignorés
export function normalizeNameTokens(s) {
  return String(s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
}

export function namesMatch(a, b) {
  const ta = normalizeNameTokens(a)
  const tb = normalizeNameTokens(b)
  if (!ta.length || !tb.length) return false
  const setA = new Set(ta)
  const setB = new Set(tb)
  return ta.every((t) => setB.has(t)) || tb.every((t) => setA.has(t))
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
  registration: [
    'aircraft_registration',
    'registration',
    'immatriculation',
    'immat',
    'appareil',
    'avion',
  ],
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
  taskDescription: ['task_description', 'taskdesc', 'description_tache'],
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

// Nettoie une valeur courte (n° de ligne, TRFX…) : retire espaces insécables,
// caractères de contrôle et symboles parasites
export function cleanShortValue(v) {
  const s = String(v ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F\u00A0\u200B-\u200F\u2028\u2029\uFEFF]/g, ' ')
    .replace(/[^\dA-Za-z°\-./_ ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return s
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
      seq: get('seq') !== undefined ? cleanShortValue(get('seq')) || undefined : undefined,
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
      taskDescription: get('taskDescription')
        ? cleanTaskText(String(get('taskDescription')))
        : undefined,
      taskSteps: get('taskSteps') ? cleanTaskText(String(get('taskSteps'))) : undefined,
      // Alias compatibilité
      ref: get('seq') !== undefined ? cleanShortValue(get('seq')) || undefined : undefined,
      zone: get('workArea') ? String(get('workArea')) : undefined,
      avion: get('registration') ? String(get('registration')) : undefined,
      category: get('taskType') ? String(get('taskType')) : undefined,
    }

    result.push(task)
  })

  return result
}
