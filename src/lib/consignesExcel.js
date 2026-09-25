// Lecteur du fichier CONSIGNES S37 : effectif par jour/shift + blocs charge par avion.
// Détection 100 % par contenu (libellés), jamais par positions fixes.

import * as XLSX from 'xlsx'

const DAY_SHEET_NAMES = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI']
const SHIFT_RE = /^\s*(matin|soir|nuit)\s*$/i

function cell(rows, r, c) {
  const v = rows[r] ? rows[r][c] : undefined
  if (v === undefined || v === null) return ''
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') return String(v)
  return String(v).trim()
}

function norm(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’'`]/g, '')
    .replace(/\s+/g, '')
}

export function toDateString(v) {
  if (v instanceof Date) {
    const s = v.toISOString().slice(0, 10)
    return s === '1970-01-01' && v.getTime() < 1000000000 ? '' : s
  }
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    // Numéro de série Excel (jours depuis le 30/12/1899)
    return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10)
  }
  return String(v == null ? '' : v)
}

export function findSheetDate(rows) {
  for (let r = 0; r < Math.min(rows.length, 8); r++) {
    for (let c = 0; c < 8; c++) {
      if (norm(cell(rows, r, c)) === 'date') {
        const v = toDateString(rows[r] ? rows[r][c + 1] : undefined)
        if (v) return v
      }
    }
  }
  return ''
}

// Couleur bleue (case ou police) : sert à repérer les LEADERS dans l'effectif.
// Accepte les bleus clairs type #AFEEEE (turquoise pâle) comme les bleus vifs.
export function isBlueColor(rgb) {
  const m = String(rgb || '').match(/([0-9A-Fa-f]{6})$/)
  if (!m) return false
  const v = m[1]
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  return b > 150 && b - r > 30
}

// Couleurs indexées (ancienne palette Excel) considérées comme bleues
const BLUE_INDEXED = new Set([4, 12, 18, 24, 30, 31, 32, 39, 40, 44, 46, 48])

function colorIsBlue(c) {
  if (!c) return false
  if (c.rgb) return isBlueColor(c.rgb)
  if (typeof c.indexed === 'number') return BLUE_INDEXED.has(c.indexed)
  return false
}

// Style de la cellule (ws) : bleu si le fond (ou la police) est bleu.
// Selon la version de SheetJS, le fond est dans s.fill.fgColor ou directement s.fgColor.
function cellIsBlue(ws, range, r, c) {
  if (!ws) return false
  const addr = XLSX.utils.encode_cell({ r: r + (range?.s?.r || 0), c: c + (range?.s?.c || 0) })
  const cell = ws[addr]
  const s = cell && cell.s
  if (!s) return false
  const fill = s.fill || s
  const solid = !fill.patternType || fill.patternType === 'solid'
  if (solid && colorIsBlue(fill.fgColor)) return true
  if (!fill.fgColor && colorIsBlue(fill.bgColor)) return true
  const fontRgb = s.font && s.font.color && s.font.color.rgb
  return Boolean(fontRgb && isBlueColor(fontRgb))
}

export function parseEffectif(rows, ws) {
  const range = ws && ws['!ref'] ? XLSX.utils.decode_range(ws['!ref']) : null
  // Cherche la ligne des libellés de shifts ("Matin" / "Soir" / "Nuit")
  const shifts = []
  for (let r = 1; r < Math.min(rows.length, 8); r++) {
    for (let c = 0; c < 40; c++) {
      const raw = cell(rows, r, c)
      if (!SHIFT_RE.test(raw)) continue
      const shiftName = raw.trim().toLowerCase()
      const memberCol =
        r + 1 < rows.length
          ? Math.min(
              41,
              (rows[r + 1] || []).findIndex((v, idx) => idx >= c && norm(v) === 'nom')
            )
          : -1
      if (memberCol === -1 || memberCol >= 41) continue
      const affectCols = []
      for (let ac = memberCol + 1; ac < 41; ac++) {
        const h = norm(cell(rows, r + 1, ac))
        if (h === 'affectation') affectCols.push(ac)
        else if (h === 'remarque' || h === 'hangar') break
      }
      const members = []
      for (let dr = r + 2; dr < Math.min(r + 70, rows.length); dr++) {
        const name = cell(rows, dr, memberCol)
        if (!name) break
        const aircrafts = [...new Set(affectCols.map((ac) => cell(rows, dr, ac)).filter((v) => /^F-[\w-]+$/i.test(v)))]
        if (!aircrafts.length) continue // ABSENT / MANAGER / TSP etc.
        members.push({
          name,
          aircrafts,
          leader: cellIsBlue(ws, range, dr, memberCol),
        })
      }
      shifts.push({ shift: shiftName, members })
      // Les autres shifts sont ailleurs dans la ligne : on continue la boucle
    }
  }
  return shifts
}

export function parseBlocks(rows) {
  const blocks = []
  const immatRows = []
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < 40; c++) {
      if (cell(rows, r, c) === 'Immat') immatRows.push({ r, c })
    }
  }
  for (let i = 0; i < immatRows.length; i++) {
    const { r, c } = immatRows[i]
    const immat = cell(rows, r, c + 1)
    if (!/^F-[\w-]+$/i.test(immat)) continue
    const endRow = i + 1 < immatRows.length ? immatRows[i + 1].r : rows.length

    // En-tête du bloc : libellés sur la ligne au-dessus et la ligne d'immat
    const info = blockHeaderInfo(rows, r)

    const shifts = {}
    // Délégations : « Consignes X » définies sur plusieurs lignes.
    // Si un libellé a été remplacé dans le fichier (ex. « MODIF SHA » à la place
    // de « Consignes Matin »), la colonne est retrouvée grâce au marqueur
    // « A faire/ Non réalisé / Pourquoi ? » présent au-dessus de chaque liste.
    const labelByCol = {}
    const labelRowByCol = {}
    const aFaireRowByCol = {}
    for (let sr = r + 1; sr < endRow; sr++) {
      for (let sc = 0; sc < 40; sc++) {
        const v = cell(rows, sr, sc)
        if (!v) continue
        const m = v.match(/^consignes\s+(matin|soir|nuit)$/i)
        if (m) {
          labelByCol[sc] = m[1].toLowerCase()
          labelRowByCol[sc] = sr
        } else if (/^a\s*fair/i.test(v) || /^à\s*fair/i.test(v)) {
          if (aFaireRowByCol[sc] === undefined) aFaireRowByCol[sc] = sr
        }
      }
    }
    // Colonnes de liste sans libellé → attribuées aux shifts manquants (matin, soir, nuit)
    const SHIFT_ORDER = ['matin', 'soir', 'nuit']
    const usedShifts = new Set(Object.values(labelByCol))
    const missingShifts = SHIFT_ORDER.filter((s) => !usedShifts.has(s))
    Object.keys(aFaireRowByCol)
      .map(Number)
      .filter((col) => labelByCol[col] === undefined)
      .sort((a, b) => a - b)
      .forEach((col, i) => {
        if (missingShifts[i]) labelByCol[col] = missingShifts[i]
      })

    Object.entries(labelByCol).forEach(([colStr, shiftName]) => {
      const sc = Number(colStr)
      const startRow =
        aFaireRowByCol[sc] !== undefined
          ? aFaireRowByCol[sc] + 1
          : labelRowByCol[sc] !== undefined
            ? labelRowByCol[sc] + 1
            : r + 1
      const tasks = []
      let emptyRun = 0
      for (let tr = startRow; tr < endRow; tr++) {
        const t = cell(rows, tr, sc)
        if (!t) {
          // Tolère les lignes vides (avant et entre les consignes d'une même liste)
          emptyRun += 1
          if (emptyRun > 2) break
          continue
        }
        emptyRun = 0
        if (/^a\s*fair/i.test(t) || /^à\s*fair/i.test(t)) continue
        if (/^consignes\s/i.test(t)) break
        // En-tête du bloc suivant : on s'arrête
        if (
          /^(type|immat|position|osm|config|date|heure)$/i.test(t) ||
          /^consignes\s+g[ée]n[ée]rales/i.test(t)
        )
          break
        tasks.push(t)
      }
      if (tasks.length || !shifts[shiftName]) shifts[shiftName] = tasks
    })
    blocks.push({ immat, ...info, shifts })
  }
  return blocks
}

// Lit les cases d'en-tête d'un bloc avion :
// « Type de visite », « Date/Heure d'entrée », « OSM », « Config »,
// « Position », « Date/Heure de sortie » (libellés détectés par contenu,
// valeurs à droite du libellé — ou en dessous pour OSM/Config/Position).
export function blockHeaderInfo(rows, r) {
  const info = {
    typeVisite: '',
    dateEntree: '',
    heureEntree: '',
    osm: '',
    config: '',
    position: '',
    dateSortie: '',
    heureSortie: '',
  }
  for (const hr of [r - 1, r]) {
    if (hr < 0 || hr >= rows.length) continue
    for (let c = 0; c < 40; c++) {
      const n = norm(cell(rows, hr, c))
      if (!n) continue
      if (n === 'typedevisite') info.typeVisite = info.typeVisite || cell(rows, hr, c + 1)
      else if (n === 'datedentree') info.dateEntree = info.dateEntree || toDateString(rows[hr] ? rows[hr][c + 1] : undefined)
      else if (n === 'heuredentree') info.heureEntree = info.heureEntree || cell(rows, hr, c + 1)
      else if (n === 'datedesortie') info.dateSortie = info.dateSortie || toDateString(rows[hr] ? rows[hr][c + 1] : undefined)
      else if (n === 'heuredesortie') info.heureSortie = info.heureSortie || cell(rows, hr, c + 1)
      else if (n === 'osm') info.osm = info.osm || cell(rows, hr + 1, c)
      else if (n === 'config') info.config = info.config || cell(rows, hr + 1, c)
      else if (n === 'position') info.position = info.position || cell(rows, hr + 1, c)
    }
  }
  return info
}

export function parseConsignesSheet(ws) {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true })
  return {
    date: findSheetDate(rows),
    effectif: parseEffectif(rows, ws),
    blocks: parseBlocks(rows),
  }
}

export function parseConsignesWorkbook(workbook) {
  const results = {}
  workbook.SheetNames.forEach((name) => {
    if (!DAY_SHEET_NAMES.includes(name.toUpperCase())) return
    try {
      results[name] = parseConsignesSheet(workbook.Sheets[name])
    } catch {
      results[name] = { date: '', effectif: [], blocks: [], error: 'Feuille illisible' }
    }
  })
  return results
}

// Résumé agrégé par avion pour la création des profils
export function summarizeAircrafts(results) {
  const byAircraft = {}
  Object.entries(results).forEach(([day, sheet]) => {
    sheet.effectif.forEach(({ shift, members }) => {
      members.forEach((m) => {
        m.aircrafts.forEach((immat) => {
          if (!byAircraft[immat]) byAircraft[immat] = { days: {} }
          if (!byAircraft[immat].days[day]) byAircraft[immat].days[day] = {}
          if (!byAircraft[immat].days[day][shift]) byAircraft[immat].days[day][shift] = []
          byAircraft[immat].days[day][shift].push(m.name)
        })
      })
    })
    sheet.blocks.forEach((b) => {
      if (!byAircraft[b.immat]) byAircraft[b.immat] = { days: {} }
      if (!byAircraft[b.immat].days[day]) byAircraft[b.immat].days[day] = {}
      byAircraft[b.immat].days[day].infos = {
        typeVisite: b.typeVisite || '',
        dateEntree: b.dateEntree || '',
        heureEntree: b.heureEntree || '',
        osm: b.osm || '',
        config: b.config || '',
        position: b.position || '',
        dateSortie: b.dateSortie || '',
        heureSortie: b.heureSortie || '',
      }
      if (!byAircraft[b.immat].days[day].consignes) byAircraft[b.immat].days[day].consignes = {}
      Object.entries(b.shifts).forEach(([shift, tasks]) => {
        byAircraft[b.immat].days[day].consignes[shift] = tasks
      })
    })
  })
  const list = Object.entries(byAircraft).map(([immat, info]) => ({
    immat,
    days: info.days,
    totalTasks: Object.values(info.days).reduce(
      (acc, d) =>
        acc +
        Object.values(d.consignes || {}).reduce((a, tasks) => a + tasks.length, 0),
      0
    ),
  }))
  return list.sort((a, b) => a.immat.localeCompare(b.immat))
}