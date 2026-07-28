import { formatCurrency, formatDate } from "@/lib/utils";
import { usePharmacySettings } from "@/hooks/use-pharmacy-settings";

interface ReceiptItem {
  id: number;
  medicineName?: string | null;
  quantity: number;
  unitName?: string | null;
  conversionFactorToBase?: number;
  price: string;
  prescriptionRequired?: boolean | null;
}

interface ReceiptOrder {
  id: number;
  createdAt: string | Date;
  patientName?: string | null;
  servedByName?: string | null;
  subtotal?: string;
  discountAmount?: string;
  taxAmount?: string;
  total: string;
  paymentStatus: string;
  notes?: string | null;
  items?: ReceiptItem[];
}

// One base-unit price -> per-line total; derive the unit price shown under each item.
function unitPriceLabel(item: ReceiptItem) {
  const factor = item.conversionFactorToBase ?? 1;
  const baseUnits = item.quantity * factor;
  const lineTotal = parseFloat(item.price);
  const perBase = baseUnits > 0 ? lineTotal / baseUnits : lineTotal;
  if (item.unitName && factor > 1) {
    return `${item.quantity} ${item.unitName}${item.quantity > 1 ? "s" : ""} (${baseUnits} units) · ${formatCurrency(perBase)}/unit`;
  }
  return `Qty ${item.quantity} × ${formatCurrency(perBase)}`;
}

export function PrintableReceipt({ order }: { order: ReceiptOrder }) {
  const { data: pharmacy } = usePharmacySettings();
  const items = order.items ?? [];
  const hasRxItem = items.some((i) => i.prescriptionRequired);
  const createdAt = typeof order.createdAt === "string" ? order.createdAt : order.createdAt.toISOString();

  return (
    <div id="printable-receipt" className="hidden print:block">
      <div className="mx-auto w-[320px] font-mono text-[11px] leading-snug text-black">
        {/* Logo, or a plain cross mark if no logo has been uploaded */}
        {pharmacy?.logoUrl ? (
          <img src={pharmacy.logoUrl} alt="" className="mx-auto mb-2 h-10 max-w-[120px] object-contain" />
        ) : (
          <div className="mx-auto mb-2 h-6 w-6 relative">
            <div className="absolute inset-x-0 top-[33%] h-[34%] bg-black" />
            <div className="absolute inset-y-0 left-[33%] w-[34%] bg-black" />
          </div>
        )}

        <div className="text-center mb-3">
          <div className="text-[15px] font-bold tracking-wide">{(pharmacy?.name ?? "My Pharmacy").toUpperCase()}</div>
          <div className="text-[9.5px] text-gray-600 mt-1 leading-relaxed">
            {pharmacy?.address}
            {pharmacy?.address && (pharmacy?.phone || pharmacy?.licenseNumber) && <br />}
            {pharmacy?.phone}
            {pharmacy?.phone && pharmacy?.licenseNumber && " · "}
            {pharmacy?.licenseNumber && `Lic. No. ${pharmacy.licenseNumber}`}
          </div>
        </div>

        <div className="border-t border-dashed border-black/40 my-3" />

        <div className="flex justify-between text-[10px] mb-0.5">
          <span>Receipt #SR-{order.id.toString().padStart(5, "0")}</span>
          <span>{formatDate(createdAt)}</span>
        </div>
        <div className="flex justify-between text-[10px] mb-2">
          <span>Served by: {order.servedByName ?? "—"}</span>
          <span>{order.patientName ?? "Walk-in"}</span>
        </div>

        <table className="w-full text-[11px] border-collapse mt-1">
          <thead>
            <tr className="border-b border-black">
              <th className="text-left text-[9px] uppercase tracking-wide text-gray-600 font-semibold pb-1.5">Item</th>
              <th className="text-right text-[9px] uppercase tracking-wide text-gray-600 font-semibold pb-1.5">Amt</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="py-1.5 pr-2">
                  <div className="font-semibold">{item.medicineName ?? "Item"}</div>
                  <div className="text-[9.5px] text-gray-600 mt-0.5">{unitPriceLabel(item)}</div>
                </td>
                <td className="py-1.5 text-right whitespace-nowrap">{formatCurrency(item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-2 text-[11.5px]">
          <div className="flex justify-between py-0.5">
            <span>Subtotal</span>
            <span>{formatCurrency(order.subtotal ?? order.total)}</span>
          </div>
          {!!order.discountAmount && parseFloat(order.discountAmount) > 0 && (
            <div className="flex justify-between py-0.5 text-gray-600">
              <span>Discount</span>
              <span>-{formatCurrency(order.discountAmount)}</span>
            </div>
          )}
          {!!order.taxAmount && parseFloat(order.taxAmount) > 0 && (
            <div className="flex justify-between py-0.5 text-gray-600">
              <span>Tax</span>
              <span>{formatCurrency(order.taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between py-2 mt-1 border-t border-black font-bold text-[14px]">
            <span>TOTAL</span>
            <span>{formatCurrency(order.total)}</span>
          </div>
          <div className="flex justify-between py-0.5 text-[10.5px] text-gray-600">
            <span>Payment status</span>
            <span className="uppercase">{order.paymentStatus}</span>
          </div>
        </div>

        {hasRxItem && (
          <div className="mt-3 bg-gray-100 text-[9.5px] font-semibold px-2 py-1.5 rounded-sm">
            ⚠ ONE OR MORE ITEMS DISPENSED AGAINST A VERIFIED PRESCRIPTION
          </div>
        )}

        {order.notes && (
          <div className="mt-2 text-[10px] text-gray-700">
            <span className="font-semibold">Notes: </span>
            {order.notes}
          </div>
        )}

        <div className="text-center text-[9.5px] text-gray-600 mt-4 mb-2 leading-relaxed">
          Medicines once sold are non-returnable except as required by law.
          <br />
          Thank you — get well soon.
        </div>
      </div>
    </div>
  );
}
