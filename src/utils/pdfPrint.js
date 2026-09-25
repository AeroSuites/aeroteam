// Export PDF → JPEG (fiable) : rend chaque page via pdf.js puis assemble
// les pages en une image unique téléchargeable.
import * as pdfjsLib from 'pdfjs-dist'
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc

export async function downloadPdfAsJpeg(doc, filename) {
  try {
    const blob = doc.output('blob')
    const buf = await blob.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: buf }).promise
    const canvases = []
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      const vp1 = page.getViewport({ scale: 1 })
      const scale = Math.min(2, 2800 / vp1.width)
      const vp = page.getViewport({ scale })
      const canvas = document.createElement('canvas')
      canvas.width = Math.floor(vp.width)
      canvas.height = Math.floor(vp.height)
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
      canvases.push(canvas)
    }
    const width = Math.max(...canvases.map((c) => c.width))
    const height = canvases.reduce((acc, c) => acc + c.height, 0)
    const out = document.createElement('canvas')
    out.width = width
    out.height = height
    const ctx = out.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    let y = 0
    canvases.forEach((c) => {
      ctx.drawImage(c, 0, y)
      y += c.height
    })
    const a = document.createElement('a')
    a.href = out.toDataURL('image/jpeg', 0.92)
    a.download = (filename || 'document.pdf').replace(/\.pdf$/i, '') + '.jpg'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  } catch {
    alert("Export JPEG indisponible dans ce navigateur — utilisez l'export PDF.")
  }
}

// Dessine une case à cocher vide dans la 1ère colonne d'une ligne autoTable
// (case à cocher en début de ligne pour l'impression).
export function drawCheckboxCell(doc, data) {
  if (data.section !== 'body' || data.column.index !== 0) return
  const size = 3.2
  doc.setDrawColor(0, 0, 0)
  doc.setLineWidth(0.25)
  doc.rect(
    data.cell.x + (data.cell.width - size) / 2,
    data.cell.y + (data.cell.height - size) / 2,
    size,
    size
  )
}

// Imprime un PDF généré (jsPDF) via le visionneur du navigateur,
// au lieu d'une capture d'écran de la page.
export function openPdfPrint(doc) {
  const blob = doc.output('blob')
  const url = URL.createObjectURL(blob)
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  iframe.onload = () => {
    try {
      iframe.contentWindow.focus()
      iframe.contentWindow.print()
    } catch {
      window.open(url, '_blank')
      setTimeout(() => URL.revokeObjectURL(url), 60000)
    }
  }
  iframe.src = url
  document.body.appendChild(iframe)
  setTimeout(() => {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
    URL.revokeObjectURL(url)
  }, 120000)
}