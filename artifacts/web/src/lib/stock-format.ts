import type { MedicineUnit } from "@workspace/api-client-react";

/**
 * Format a raw base-unit stock quantity into a human-readable string using
 * the medicine's defined packaging units.
 *
 * Example: 325 tablets with units [box=100, strip=10, tablet=1]
 *   → "3 boxes, 2 strips, 5 tablets"
 *
 * Falls back to a plain number if no units are defined.
 */
export function formatStockDisplay(
  quantity: number,
  units: MedicineUnit[] | undefined | null,
): string {
  if (!units || units.length === 0) return `${quantity}`;

  // Sort largest packaging first
  const sorted = [...units].sort(
    (a, b) => b.conversionFactorToBase - a.conversionFactorToBase,
  );

  let remaining = quantity;
  const parts: string[] = [];

  for (const unit of sorted) {
    if (remaining <= 0) break;
    const count = Math.floor(remaining / unit.conversionFactorToBase);
    if (count > 0) {
      parts.push(`${count} ${unit.unitName}${count !== 1 ? "s" : ""}`);
      remaining -= count * unit.conversionFactorToBase;
    }
  }

  if (parts.length === 0) {
    const base = sorted[sorted.length - 1];
    return `0 ${base?.unitName ?? "units"}`;
  }

  return parts.join(", ");
}

/**
 * Get the base unit for a medicine (the one with isBaseUnit=true, or fallback
 * to the unit with conversionFactorToBase=1, or the smallest available).
 */
export function getBaseUnit(units: MedicineUnit[]): MedicineUnit | undefined {
  return (
    units.find((u) => u.isBaseUnit) ??
    units.find((u) => u.conversionFactorToBase === 1) ??
    [...units].sort((a, b) => a.conversionFactorToBase - b.conversionFactorToBase)[0]
  );
}

/**
 * Calculate the price for a given unit (price is stored per base unit).
 * e.g. $0.50/tablet → strip (10 tablets) = $5.00
 */
export function priceForUnit(basePriceStr: string, conversionFactor: number): number {
  const base = parseFloat(basePriceStr);
  if (!Number.isFinite(base) || !Number.isFinite(conversionFactor)) return 0;
  return base * conversionFactor;
}
