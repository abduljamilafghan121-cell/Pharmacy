import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";
import { formatDate } from "@/lib/utils";

// The label is hand-built as an HTML string and written into a popup window,
// so every interpolated value must be escaped or a crafted field (e.g. a
// medicine name containing markup) could inject HTML/scripts into the print
// document. Mirrors the desktop printing.ts helper.
function esc(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface LabelData {
  patientName?: string | null;
  medicineName: string;
  batchNumber?: string | null;
  expiryDate?: string | null;
  sig?: string | null;          // dosing instructions
  dispensedDate?: string;       // ISO date string; defaults to today
  qty?: number;
  unitName?: string | null;
}

/** Opens a new browser window containing just the dispensing label and auto-prints it. */
export function printDispensingLabel(data: LabelData, pharmacyName: string, pharmacyAddress?: string | null) {
  const dispensedDate = data.dispensedDate ?? new Date().toISOString();
  const batchLine = [
    data.batchNumber ? `Batch: ${esc(data.batchNumber)}` : null,
    data.expiryDate ? `Exp: ${formatDate(data.expiryDate)}` : null,
  ].filter(Boolean).join("  ·  ");

  const qtyLine = data.qty != null
    ? `Qty: ${data.qty}${data.unitName ? ` ${esc(data.unitName)}` : ""}`
    : null;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Dispensing Label</title>
  <style>
    @page {
      size: 90mm 50mm;
      margin: 0;
    }
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
      font-size: 8pt;
      font-weight: bold;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      border-bottom: 0.5pt solid #000;
      padding-bottom: 1.5mm;
      margin-bottom: 1.5mm;
    }
    .pharmacy-addr { font-weight: normal; font-size: 7pt; color: #444; }
    .medicine { font-size: 11pt; font-weight: bold; margin-bottom: 0.5mm; }
    .patient { font-size: 8.5pt; margin-bottom: 0.5mm; }
    .patient span { font-weight: bold; }
    .sig {
      font-size: 9pt;
      font-weight: bold;
      border: 0.5pt solid #000;
      border-radius: 1mm;
      padding: 0.8mm 1.5mm;
      margin: 1.5mm 0;
      background: #f5f5f5;
    }
    .meta { font-size: 7.5pt; color: #333; margin-top: 1mm; }
    .date { font-size: 7pt; color: #555; margin-top: 0.5mm; text-align: right; }
  </style>
</head>
<body>
  <div class="pharmacy">
    ${esc(pharmacyName)}
    ${pharmacyAddress ? `<span class="pharmacy-addr"> — ${esc(pharmacyAddress)}</span>` : ""}
  </div>
  <div class="medicine">${esc(data.medicineName)}</div>
  ${data.patientName ? `<div class="patient">Patient: <span>${esc(data.patientName)}</span></div>` : ""}
  ${data.sig ? `<div class="sig">${esc(data.sig)}</div>` : ""}
  <div class="meta">
    ${qtyLine ?? ""}${qtyLine && batchLine ? "  ·  " : ""}${batchLine}
  </div>
  <div class="date">Dispensed: ${formatDate(dispensedDate)}</div>
</body>
</html>`;

  const w = window.open("", "_blank", "width=450,height=320");
  if (!w) {
    alert("Pop-up blocked — please allow pop-ups for this site to print labels.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    w.focus();
    w.print();
    // Close after a brief delay to allow the print dialog to open
    setTimeout(() => w.close(), 500);
  };
}

/**
 * An invisible component used to trigger label printing declaratively.
 * Place it anywhere in the tree; call `printDispensingLabel` directly
 * for imperative usage (the more common case from an order detail page).
 */
export function DispensingLabelPrinter({ data, onReady }: { data: LabelData; onReady?: () => void }) {
  const { data: pharmacy } = usePharmacySettings();

  const trigger = () => {
    printDispensingLabel(data, pharmacy?.name ?? "Pharmacy", pharmacy?.address);
    onReady?.();
  };

  return (
    <button type="button" onClick={trigger} className="hidden" id="label-print-trigger" />
  );
}
