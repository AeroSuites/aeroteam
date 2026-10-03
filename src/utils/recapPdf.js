import { jsPDF } from 'jspdf'
import {
  hexToRgb,
  getZoneColor,
  getCategoryColor,
  getCategoryLabel,
  isAssignedTo,
} from './helpers'

function profileTitle(profile) {
  const air = profile?.aircraft || ''
  const name = profile?.name || ''
  if (air && name.includes(air)) return name
  return air ? `${name}  ·  ${air}` : name
}

export function buildRecapPdf(profile, data) {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 10
  const contentWidth = pageWidth - margin * 2
  const assignedCount = Object.keys(data?.assignments || {}).filter((id) =>
    Array.isArray(data.assignments[id])
      ? data.assignments[id].length > 0
      : data.assignments[id]
  ).length
  const notes = (data?.notes || []).filter((n) =>
    String(n.title || '').startsWith('[C] ')
  )

  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text(profileTitle(profile), margin, 15)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${(data?.tasks || []).length} tâches · ${assignedCount} affectées · ${
      (data?.tasks || []).length - assignedCount
    } non affectées · ${(data?.members || []).length} membres · ${new Date().toLocaleDateString('fr-FR')}`,
    margin,
    21
  )

  let y = 28

  const ensureRoom = (needed) => {
    if (y + needed > pageHeight - 11) {
      doc.addPage()
      y = 12
    }
  }

  // Consignes
  if (notes.length > 0) {
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.text('Consignes', margin, y)
    y += 6
    notes.forEach((n) => {
      ensureRoom(10)
      doc.setFontSize(8.5)
      doc.setFont('helvetica', 'bold')
      doc.text(String(n.title).replace('[C] ', ''), margin, y)
      y += 3.5
      doc.setFont('helvetica', 'normal')
      const lines = doc.splitTextToSize(n.content || '', contentWidth)
      lines.forEach((line) => {
        ensureRoom(3.5)
        doc.text(line, margin, y)
        y += 3.5
      })
      y += 2.5
    })
  } else {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text('Aucune consigne importée.', margin, y)
    y += 8
  }

  // Équipes — cartes sur 2 colonnes, comme le récap à l'écran
  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  ensureRoom(12)
  doc.text(`Équipes du profil (${(data?.teams || []).length})`, margin, y)
  y += 8

  const gap = 6
  const colW = (contentWidth - gap) / 2
  const colX = [margin, margin + colW + gap]
  const chipH = 3.9

  const drawChip = (txt, x, yy, fill, opts = {}) => {
    const fs = opts.fontSize || 6.5
    const padX = opts.padX || 2
    const white = opts.white !== false
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(fs)
    const w = Math.min(doc.getTextWidth(txt) + padX * 2, opts.maxW || 999)
    doc.setFillColor(...fill)
    doc.roundedRect(x, yy, w, chipH, 1.2, 1.2, 'F')
    doc.setTextColor(...(white ? [255, 255, 255] : [51, 65, 85]))
    doc.text(txt, x + padX, yy + chipH - 1.4)
    doc.setTextColor(30, 41, 59)
    return w
  }

  // Prépare une carte d'équipe : liste d'éléments (hauteur + dessin)
  const buildTeamCard = (team) => {
    const teamTasks = (data?.tasks || []).filter((t) =>
      isAssignedTo(data.assignments, t.id, team.id)
    )
    const zoneMap = {}
    teamTasks.forEach((t) => {
      const z = t.workArea || 'Autre'
      const b = t.taskType || 'AUTRE'
      if (!zoneMap[z]) zoneMap[z] = {}
      if (!zoneMap[z][b]) zoneMap[z][b] = []
      zoneMap[z][b].push(t)
    })

    const items = []
    items.push({
      h: 8.5,
      draw: (x, yy) => {
        doc.setFillColor(...hexToRgb(team.color || '#64748b'))
        doc.roundedRect(x + 1.5, yy + 1, colW - 3, 7.5, 1.5, 1.5, 'F')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8.5)
        doc.setTextColor(255, 255, 255)
        const label = `${team.name}`
        const count = `${teamTasks.length} tâche${teamTasks.length > 1 ? 's' : ''}`
        doc.text(doc.splitTextToSize(label, colW - 30)[0], x + 4, yy + 5.6)
        doc.setFontSize(7)
        doc.text(count, x + colW - 4 - doc.getTextWidth(count), yy + 5.6)
        doc.setTextColor(30, 41, 59)
      },
    })

    // Membres (pastilles grises, sur plusieurs lignes)
    const memberChips = (team.members || []).map((m) => String(m))
    if (memberChips.length) {
      const rows = []
      let cur = []
      let curW = 0
      const maxW = colW - 8
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      memberChips.forEach((m) => {
        const w = doc.getTextWidth(m) + 4
        if (curW + w > maxW && cur.length) {
          rows.push(cur)
          cur = []
          curW = 0
        }
        cur.push({ m, w })
        curW += w + 1.5
      })
      if (cur.length) rows.push(cur)
      items.push({
        h: rows.length * (chipH + 1) + 1,
        draw: (x, yy) => {
          rows.forEach((row, ri) => {
            let cx = x + 4
            row.forEach(({ m }) => {
              const w = drawChip(m, cx, yy + 1 + ri * (chipH + 1), [241, 245, 249], {
                white: false,
                fontSize: 6.5,
                maxW: colW - 8,
              })
              cx += w + 1.5
            })
          })
        },
      })
    }

    // Zones -> blocs -> lignes
    Object.entries(zoneMap).forEach(([zone, blocksMap]) => {
      const zoneTasks = Object.values(blocksMap).flat()
      items.push({
        h: chipH + 1.5,
        draw: (x, yy) => {
          const w = drawChip(zone, x + 4, yy + 0.5, hexToRgb(getZoneColor(zone)))
          doc.setFont('helvetica', 'normal')
          doc.setFontSize(6.5)
          doc.setTextColor(100, 116, 139)
          doc.text(String(zoneTasks.length), x + 6 + w, yy + chipH - 1.4)
          doc.setTextColor(30, 41, 59)
        },
      })
      Object.entries(blocksMap).forEach(([blk, list]) => {
        items.push({
          h: chipH + 1.5,
          draw: (x, yy) => {
            const w = drawChip(
              getCategoryLabel(blk),
              x + 4,
              yy + 0.5,
              hexToRgb(getCategoryColor(blk))
            )
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(6.5)
            doc.setTextColor(100, 116, 139)
            doc.text(String(list.length), x + 6 + w, yy + chipH - 1.4)
            doc.setTextColor(30, 41, 59)
          },
        })
        list.forEach((t) => {
          items.push({
            h: 3.7,
            draw: (x, yy) => {
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(6.5)
              doc.setTextColor(71, 85, 105)
              doc.text(String(t.seq || '—'), x + 4, yy + 3)
              doc.setTextColor(30, 41, 59)
              // Description tronquée AVANT le code TRFX (jamais de chevauchement)
              doc.setFont('helvetica', 'normal')
              // Fin de TRFX : après « TRFX900 » (ex. TRFX900ABCD → ABCD)
              const rawBarcode = String(t.taskBarcode || '')
              const trfxMatch = rawBarcode.match(/TRFX900(.*)$/i)
              const tail = trfxMatch
                ? trfxMatch[1] || rawBarcode
                : rawBarcode || String(t.registration || '')
              let immatW = 0
              if (tail) {
                doc.setFont('helvetica', 'bold')
                immatW = doc.getTextWidth(tail) + 3
                doc.setFont('helvetica', 'normal')
              }
              const maxDescW = Math.max(20, colW - 16 - immatW)
              const fullDesc = String(t.description || '')
              let desc = fullDesc
              if (doc.getTextWidth(desc) > maxDescW) {
                while (desc.length > 1 && doc.getTextWidth(desc + '…') > maxDescW) {
                  desc = desc.slice(0, -1)
                }
                desc += '…'
              }
              doc.text(desc, x + 12, yy + 3)
              if (tail) {
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(3, 105, 161)
                doc.text(tail, x + colW - 4 - doc.getTextWidth(tail), yy + 3)
                doc.setTextColor(30, 41, 59)
              }
            },
          })
        })
      })
    })

    const h = items.reduce((a, it) => a + it.h, 0) + 5
    return { h, items }
  }

  // Disposition « maçonnerie » : chaque colonne se remplit indépendamment
  // (pas de grand vide quand une carte est courte à côté d'une longue)
  const colY = [y, y]
  const pageBottom = pageHeight - 11
  ;(data?.teams || []).forEach((team) => {
    const card = buildTeamCard(team)
    // Colonne la moins remplie
    let col = colY[0] <= colY[1] ? 0 : 1
    if (colY[col] + card.h > pageBottom) {
      const other = col === 0 ? 1 : 0
      if (colY[other] + card.h <= pageBottom) {
        col = other
      } else {
        // Les deux colonnes sont pleines : nouvelle page
        doc.addPage()
        colY[0] = 12
        colY[1] = 12
        col = 0
      }
    }
    const x = colX[col]
    const yy0 = colY[col]
    doc.setDrawColor(203, 213, 225)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, yy0, colW, card.h, 2.5, 2.5, 'S')
    let cy = yy0 + 3
    card.items.forEach((it) => {
      it.draw(x, cy)
      cy += it.h
    })
    colY[col] = yy0 + card.h + 5
  })
  y = Math.max(colY[0], colY[1])
  return doc
}

