import type { PharmacySettings } from '../hooks/usePharmacySettings'

// Ported from artifacts/web's PrintableReceipt.tsx / PrintableLabel.tsx.
// Web renders a hidden DOM node and uses print CSS; in Electron the cleaner
// equivalent is a popup window containing just the document, auto-printed.

function formatDate(dateStr: string | Date): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
}

function openPrintWindow(html: string, title: string, w = 420, h = 600): void {
  const win = window.open('', '_blank', `width=${w},height=${h}`)
  if (!win) {
    window.alert('Pop-up blocked — please allow pop-ups to print.')
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.onload = () => {
    win.focus()
    win.print()
    setTimeout(() => win.close(), 500)
  }
  // Fallback for cases where onload already fired before we attached
  setTimeout(() => {
    try {
      if (!win.closed) {
        win.focus()
        win.print()
      }
    } catch {
      /* window already closed */
    }
  }, 400)
}

// ── Dispensing label (90mm × 50mm) ──────────────────────────────────────────

export interface LabelData {
  patientName?: string | null
  medicineName: string
  batchNumber?: string | null
  expiryDate?: string | null
  sig?: string | null
  dispensedDate?: string
  qty?: number
  unitName?: string | null
}

export function printDispensingLabel(
  data: LabelData,
  pharmacyName: string,
  pharmacyAddress?: string | null
): void {
  const dispensedDate = data.dispensedDate ?? new Date().toISOString()
  const batchLine = [
    data.batchNumber ? `Batch: ${data.batchNumber}` : null,
    data.expiryDate ? `Exp: ${formatDate(data.expiryDate)}` : null
  ]
    .filter(Boolean)
    .join('  ·  ')

  const qtyLine =
    data.qty != null ? `Qty: ${data.qty}${data.unitName ? ` ${data.unitName}` : ''}` : null

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dispensing Label</title>
  <style>
    @page { size: 90mm 50mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 9pt;
      padding: 4mm 5mm;
      width: 90mm;
      height: 50mm;
      overflow: hidden;
    }
    .pharmacy {
      font-size: 8pt; font-weight: bold; text-transform: uppercase;
      letter-spacing: 0.04em; border-bottom: 0.5pt solid #000;
      padding-bottom: 1.5mm; margin-bottom: 1.5mm;
    }
    .pharmacy-addr { font-weight: normal; font-size: 7pt; color: #444; }
    .medicine { font-size: 11pt; font-weight: bold; margin-bottom: 0.5mm; }
    .patient { font-size: 8.5pt; margin-bottom: 0.5mm; }
    .patient span { font-weight: bold; }
    .sig {
      font-size: 9pt; font-weight: bold; border: 0.5pt solid #000;
      border-radius: 1mm; padding: 0.8mm 1.5mm; margin: 1.5mm 0; background: #f5f5f5;
    }
    .meta { font-size: 7.5pt; color: #333; margin-top: 1mm; }
    .date { font-size: 7pt; color: #555; margin-top: 0.5mm; text-align: right; }
  </style>
</head>
<body>
  <div class="pharmacy">
    ${pharmacyName}
    ${pharmacyAddress ? `<span class="pharmacy-addr"> — ${pharmacyAddress}</span>` : ''}
  </div>
  <div class="medicine">${data.medicineName}</div>
  ${data.patientName ? `<div class="patient">Patient: <span>${data.patientName}</span></div>` : ''}
  ${data.sig ? `<div class="sig">${data.sig}</div>` : ''}
  <div class="meta">${qtyLine ?? ''}${qtyLine && batchLine ? '  ·  ' : ''}${batchLine}</div>
  <div class="date">Dispensed: ${formatDate(dispensedDate)}</div>
</body>
</html>`

  openPrintWindow(html, 'Dispensing Label', 450, 320)
}

// ── Thermal receipt (80mm) ──────────────────────────────────────────────────

interface ReceiptItem {
  id: number
  medicineName?: string | null
  quantity: number
  unitName?: string | null
  conversionFactorToBase?: number
  price: string
  prescriptionRequired?: boolean | null
  sig?: string | null
}

interface ReceiptOrder {
  id: number
  createdAt: string | Date
  patientName?: string | null
  servedByName?: string | null
  subtotal?: string
  discountAmount?: string
  taxAmount?: string
  total: string
  paymentStatus: string
  notes?: string | null
  items?: ReceiptItem[]
}

function money(amount: number, settings?: PharmacySettings): string {
  const symbol = settings?.currencySymbol ?? '$'
  const formatted = amount.toFixed(2)
  return settings?.currencyPosition === 'suffix' ? `${formatted} ${symbol}` : `${symbol}${formatted}`
}

function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function printReceipt(order: ReceiptOrder, pharmacy: PharmacySettings | undefined): void {
  const items = order.items ?? []
  const hasRxItem = items.some((i) => i.prescriptionRequired)
  const createdAt =
    typeof order.createdAt === 'string' ? order.createdAt : order.createdAt.toISOString()

  const itemRows = items
    .map((item) => {
      const factor = item.conversionFactorToBase ?? 1
      const baseUnits = item.quantity * factor
      const lineTotal = parseFloat(item.price)
      const perBase = baseUnits > 0 ? lineTotal / baseUnits : lineTotal
      const unitLabel =
        item.unitName && factor > 1
          ? `${item.quantity} ${item.unitName}${item.quantity > 1 ? 's' : ''} (${baseUnits} units) · ${money(perBase, pharmacy)}/unit`
          : `Qty ${item.quantity} × ${money(perBase, pharmacy)}`
      return `<tr class="align-top">
        <td class="py-1.5 pr-2">
          <div class="font-semibold">${esc(item.medicineName ?? 'Item')}</div>
          <div class="sub">${esc(unitLabel)}</div>
          ${item.sig ? `<div class="sig">↳ ${esc(item.sig)}</div>` : ''}
        </td>
        <td class="py-1.5 text-right whitespace-nowrap">${money(lineTotal, pharmacy)}</td>
      </tr>`
    })
    .join('\n')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Receipt #SR-${order.id.toString().padStart(5, '0')}</title>
  <style>
    @page { size: 80mm auto; margin: 3mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 11px; line-height: 1.35; color: #000; width: 74mm; margin: 0 auto; }
    .logo { display: block; margin: 0 auto 8px; height: 38px; max-width: 110px; object-fit: contain; }
    .cross { position: relative; width: 22px; height: 22px; margin: 0 auto 8px; }
    .cross .h { position: absolute; left: 0; right: 0; top: 33%; height: 34%; background: #000; }
    .cross .v { position: absolute; top: 0; bottom: 0; left: 33%; width: 34%; background: #000; }
    .center { text-align: center; }
    .name { font-size: 15px; font-weight: bold; letter-spacing: 0.04em; }
    .addr { font-size: 9.5px; color: #444; margin-top: 3px; line-height: 1.4; }
    .rule { border-top: 1px dashed #666; margin: 10px 0; }
    .row { display: flex; justify-content: space-between; font-size: 10px; }
    .muted { color: #555; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th { text-align: left; font-size: 9px; text-transform: uppercase; letter-spacing: 0.04em; color: #555; border-bottom: 1px solid #000; padding-bottom: 4px; font-weight: 700; }
    th:last-child, td:last-child { text-align: right; white-space: nowrap; }
    td { padding: 5px 0; vertical-align: top; }
    .sub { font-size: 9.5px; color: #555; margin-top: 2px; }
    .sig { font-size: 9px; font-style: italic; color: #333; margin-top: 2px; }
    .totals { margin-top: 8px; font-size: 11.5px; }
    .totals .row { padding: 2px 0; }
    .grand { border-top: 1px solid #000; margin-top: 4px; padding-top: 6px; font-weight: bold; font-size: 14px; }
    .rxnote { margin-top: 10px; background: #eee; font-size: 9.5px; font-weight: bold; padding: 5px 7px; }
    .notes { margin-top: 8px; font-size: 10px; color: #222; }
    .footer { text-align: center; font-size: 9.5px; color: #555; margin-top: 14px; line-height: 1.5; }
  </style>
</head>
<body>
  ${pharmacy?.logoUrl ? `<img class="logo" src="${pharmacy.logoUrl}" alt="" />` : '<div class="cross"><div class="h"></div><div class="v"></div></div>'}
  <div class="center">
    <div class="name">${esc((pharmacy?.name ?? 'My Pharmacy').toUpperCase())}</div>
    <div class="addr">
      ${esc(pharmacy?.address ?? '')}${pharmacy?.address && (pharmacy?.phone || pharmacy?.licenseNumber) ? '<br />' : ''}
      ${esc(pharmacy?.phone ?? '')}${pharmacy?.phone && pharmacy?.licenseNumber ? ' · ' : ''}
      ${pharmacy?.licenseNumber ? `Lic. No. ${esc(pharmacy.licenseNumber)}` : ''}
    </div>
  </div>
  <div class="rule"></div>
  <div class="row"><span>Receipt #SR-${order.id.toString().padStart(5, '0')}</span><span>${formatDate(createdAt)}</span></div>
  <div class="row" style="margin-bottom: 6px;"><span>Served by: ${esc(order.servedByName ?? '—')}</span><span>${esc(order.patientName ?? 'Walk-in')}</span></div>
  <table>
    <thead><tr><th>Item</th><th>Amt</th></tr></thead>
    <tbody>${itemRows}</tbody>
  </table>
  <div class="totals">
    <div class="row"><span>Subtotal</span><span>${money(order.subtotal != null ? parseFloat(order.subtotal) : parseFloat(order.total), pharmacy)}</span></div>
    ${order.discountAmount && parseFloat(order.discountAmount) > 0 ? `<div class="row muted"><span>Discount</span><span>-${money(parseFloat(order.discountAmount), pharmacy)}</span></div>` : ''}
    ${order.taxAmount && parseFloat(order.taxAmount) > 0 ? `<div class="row muted"><span>Tax</span><span>${money(parseFloat(order.taxAmount), pharmacy)}</span></div>` : ''}
    <div class="grand row"><span>TOTAL</span><span>${money(parseFloat(order.total), pharmacy)}</span></div>
    <div class="row muted" style="font-size: 10.5px;"><span>Payment status</span><span style="text-transform: uppercase;">${esc(order.paymentStatus)}</span></div>
  </div>
  ${hasRxItem ? '<div class="rxnote">⚠ ONE OR MORE ITEMS DISPENSED AGAINST A VERIFIED PRESCRIPTION</div>' : ''}
  ${order.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(order.notes)}</div>` : ''}
  <div class="footer">Medicines once sold are non-returnable except as required by law.<br />Thank you — get well soon.</div>
</body>
</html>`

  openPrintWindow(html, `Receipt #SR-${order.id.toString().padStart(5, '0')}`)
}
