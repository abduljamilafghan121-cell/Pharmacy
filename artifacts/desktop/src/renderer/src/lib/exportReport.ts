import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { PharmacySettings } from '../hooks/usePharmacySettings'

export interface ReportColumn {
  header: string
  key: string
  align?: 'left' | 'right' | 'center'
}

export interface ReportSummary {
  label: string
  value: string
}

export interface ReportExportInput {
  fileName: string
  title: string
  rangeLabel?: string
  pharmacy?: PharmacySettings | undefined
  summary?: ReportSummary[]
  columns: ReportColumn[]
  rows: Record<string, string | number | null>[]
}

const BRAND = [14, 138, 100] // #0E8A64 — dark emerald accent
const BRAND_LIGHT = [47, 191, 143] // #2FBF8F
const TEXT = [31, 41, 55]
const MUTED = [107, 114, 128]
const LINE = [229, 231, 235]

function fmtCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '—'
  return String(v)
}

/**
 * Loads a base64 image data URL into an HTMLImageElement, then re-encodes it
 * as a transparent PNG (preserving aspect ratio) so jsPDF can embed it. Returns
 * null if the image fails to load.
 */
function loadLogo(dataUrl: string): Promise<{ dataUrl: string; aspect: number } | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const c = document.createElement('canvas')
      c.width = img.naturalWidth
      c.height = img.naturalHeight
      const ctx = c.getContext('2d')
      if (!ctx) {
        resolve(null)
        return
      }
      ctx.drawImage(img, 0, 0)
      resolve({ dataUrl: c.toDataURL('image/png'), aspect: c.width / c.height })
    }
    img.onerror = () => resolve(null)
    img.src = dataUrl
  })
}

/**
 * Renders a branded, paginated PDF report with a header (pharmacy logo,
 * pharmacy name, report title, date range) and footer (page numbers, generated
 * timestamp) repeated on every page.
 */
export async function exportReportAsPdf(input: ReportExportInput): Promise<void> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 40
  const headerHeight = 74

  const pharmacyName = input.pharmacy?.name?.trim() || 'PharmaCore'
  const rangeLabel = input.rangeLabel || ''
  const generated = new Date()

  // Load the pharmacy logo (a base64 data URL) into a transparent PNG so it
  // can be embedded in the header. Falls back to the brand mark if absent.
  const logoDataUrl = input.pharmacy?.logoUrl?.startsWith('data:image') ? input.pharmacy.logoUrl : null
  let logo: { dataUrl: string; aspect: number } | null = null
  if (logoDataUrl) {
    logo = await loadLogo(logoDataUrl)
  }

  // ── Header drawn on every page ──────────────────────────────────────────
  const drawHeader = (): void => {
    // Accent bar at the very top
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
    doc.rect(0, 0, pageWidth, 4, 'F')

    const logoBoxY = 13
    const logoBoxH = 34

    // Left edge of the name/title block — shifts right to clear the logo
    let contentX = margin
    if (logo) {
      // Draw the real pharmacy logo, preserving aspect ratio
      let w = logoBoxH * logo.aspect
      if (w > 96) w = 96
      const h = w / logo.aspect
      const x = margin
      const y = logoBoxY + (logoBoxH - h) / 2
      doc.addImage(logo.dataUrl, 'PNG', x, y, w, h)
      contentX = x + w + 12
    } else {
      // Fallback brand mark (no logo uploaded)
      doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
      doc.circle(margin + 10, 32, 14, 'F')
      doc.setFillColor(255, 255, 255)
      doc.circle(margin + 10, 32, 5, 'F')
      contentX = margin + 32
    }

    // Pharmacy name
    doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(pharmacyName, contentX, 38)

    // Report title + subtitle (aligned under the pharmacy name)
    doc.setTextColor(TEXT[0], TEXT[1], TEXT[2])
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.text(input.title, contentX, 54)

    // Date range on the right
    if (rangeLabel) {
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.text(rangeLabel, pageWidth - margin, 38, { align: 'right' })
    }

    // Separator line
    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(1)
    doc.line(margin, headerHeight - 8, pageWidth - margin, headerHeight - 8)
  }

  // ── Footer drawn on every page ──────────────────────────────────────────
  const drawFooter = (data: { pageNumber: number }): void => {
    const { pageNumber } = data
    doc.setDrawColor(LINE[0], LINE[1], LINE[2])
    doc.setLineWidth(1)
    doc.line(margin, pageHeight - 44, pageWidth - margin, pageHeight - 44)

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text(`${pharmacyName} — ${input.title}`, margin, pageHeight - 28)
    doc.text(
      `Generated ${generated.toLocaleString()} · Page ${pageNumber} of ${doc.getNumberOfPages()}`,
      pageWidth - margin,
      pageHeight - 28,
      { align: 'right' }
    )
  }

  autoTable(doc, {
    startY: headerHeight + 8,
    margin: { top: headerHeight + 8, left: margin, right: margin, bottom: 54 },
    head: [input.columns.map((c) => c.header)],
    body: input.rows.map((r) => input.columns.map((c) => fmtCell(r[c.key]))),
    styles: {
      font: 'helvetica',
      fontSize: 8.5,
      textColor: TEXT,
      lineColor: LINE,
      lineWidth: 0.4,
      cellPadding: 5,
    },
    headStyles: {
      fillColor: BRAND,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8.5,
      halign: 'center',
    },
    alternateRowStyles: { fillColor: [243, 247, 245] },
    columnStyles: Object.fromEntries(
      input.columns.map((c, i) => [i, { halign: c.align ?? 'left' }])
    ),
    didDrawPage: (data) => {
      drawHeader()
      drawFooter({ pageNumber: data.pageNumber })
    },
  } as Parameters<typeof autoTable>[1])

  // Summary panel below the table (only on the last page block flow)
  if (input.summary && input.summary.length > 0) {
    const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY ?? 0
    const summaryY = Math.max(finalY + 24, headerHeight + 8)
    doc.setFillColor(BRAND[0], BRAND[1], BRAND[2])
    doc.roundedRect(margin, summaryY, pageWidth - margin * 2, 4, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
    doc.text('SUMMARY', margin, summaryY + 24)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)

    const totalWidth = pageWidth - margin * 2
    const boxCount = input.summary.length
    const gap = 12
    const boxWidth = (totalWidth - gap * (boxCount - 1)) / boxCount
    let x = margin
    input.summary.forEach((item) => {
      doc.setFillColor(248, 250, 252)
      doc.setDrawColor(LINE[0], LINE[1], LINE[2])
      doc.roundedRect(x, summaryY + 32, boxWidth, 44, 4, 4, 'FD')
      doc.setTextColor(MUTED[0], MUTED[1], MUTED[2])
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(item.label, x + 10, summaryY + 48)
      doc.setTextColor(BRAND[0], BRAND[1], BRAND[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text(item.value, x + 10, summaryY + 66)
      x += boxWidth + gap
    })

    // Ensure the summary isn't split and footer stays at bottom
    if (summaryY + 32 + 60 > pageHeight - 54) {
      doc.addPage()
    }
  }

  doc.save(`${input.fileName}.pdf`)
}

/**
 * Generates a CSV string from columns + rows (UTF-8 with BOM so Excel opens
 * currency characters correctly).
 */
export function buildCsv(
  columns: ReportColumn[],
  rows: Record<string, string | number | null>[]
): string {
  const escape = (v: string | number | null): string => {
    const s = v === null || v === undefined ? '' : String(v)
    return `"${s.replace(/"/g, '""')}"`
  }
  const header = columns.map((c) => escape(c.header)).join(',')
  const body = rows.map((r) => columns.map((c) => escape(r[c.key])).join(',')).join('\n')
  return `\uFEFF${header}\n${body}`
}

export function downloadBlob(fileName: string, content: BlobPart, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
