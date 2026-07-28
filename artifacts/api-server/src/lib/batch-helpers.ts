import { eq, and, gt, or, isNull, gte, lt, sql, asc } from "drizzle-orm";
import { db, medicinesTable, medicineBatchesTable } from "@workspace/db";

// Drizzle's transaction callback param type is awkward to name directly;
// this covers both `db` and a `tx` from db.transaction(...).
type DbOrTx = typeof db;

export class InsufficientStockError extends Error {
  constructor(public medicineName: string) {
    super(`Insufficient stock for ${medicineName}`);
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

// A batch is sellable if it has stock left AND (no expiry set, or its
// expiry hasn't passed yet). Already-expired batches are deliberately
// excluded here — they still exist as rows (visible in the batch list,
// flagged "Expired") but are never counted as available stock and can
// never be drawn from by a sale.
function sellableBatchCondition(medicineId: number) {
  return and(
    eq(medicineBatchesTable.medicineId, medicineId),
    gt(medicineBatchesTable.quantity, 0),
    or(isNull(medicineBatchesTable.expiryDate), gte(medicineBatchesTable.expiryDate, today())),
  );
}

/**
 * Recomputes a medicine's cached quantity/batchNumber/expiryDate from its
 * batch rows. Call this after ANY change to that medicine's batches.
 * Only SELLABLE batches (stock > 0, not expired) count toward the total or
 * can become the "representative" batch — so low-stock alerts, search
 * results, and the expiry check in NewSale all reflect real, sellable
 * stock rather than being propped up by forgotten expired inventory.
 */
export async function refreshMedicineAggregate(tx: DbOrTx, medicineId: number): Promise<void> {
  const batches = await tx
    .select()
    .from(medicineBatchesTable)
    .where(sellableBatchCondition(medicineId));

  const totalQuantity = batches.reduce((sum, b) => sum + b.quantity, 0);

  const sorted = [...batches].sort((a, b) => {
    if (!a.expiryDate && !b.expiryDate) return 0;
    if (!a.expiryDate) return 1;
    if (!b.expiryDate) return -1;
    return a.expiryDate < b.expiryDate ? -1 : a.expiryDate > b.expiryDate ? 1 : 0;
  });
  const representative = sorted[0];

  await tx
    .update(medicinesTable)
    .set({
      quantity: totalQuantity,
      batchNumber: representative?.batchNumber ?? null,
      expiryDate: representative?.expiryDate ?? null,
    })
    .where(eq(medicinesTable.id, medicineId));
}

/**
 * Deducts `baseUnitsNeeded` base units from a medicine's SELLABLE batches
 * in FEFO order (earliest expiry first, no-expiry batches last, expired
 * batches excluded entirely), spanning multiple batches if needed. Returns
 * exactly which batches were drawn from and how much, so the caller can
 * record it (e.g. for later cancellation/restore). Throws
 * InsufficientStockError if sellable batches don't have enough combined —
 * even if expired stock is technically still sitting on the shelf.
 *
 * Must be called inside a transaction — uses row locks via the WHERE-guarded
 * UPDATE to stay race-safe under concurrent sales.
 */
export async function allocateFefo(
  tx: DbOrTx,
  medicineId: number,
  medicineName: string,
  baseUnitsNeeded: number
): Promise<{ batchId: number; quantity: number }[]> {
  const batches = await tx
    .select()
    .from(medicineBatchesTable)
    .where(sellableBatchCondition(medicineId))
    .orderBy(sql`${medicineBatchesTable.expiryDate} ASC NULLS LAST`, asc(medicineBatchesTable.id));

  const allocations: { batchId: number; quantity: number }[] = [];
  let remaining = baseUnitsNeeded;

  for (const batch of batches) {
    if (remaining <= 0) break;
    const take = Math.min(batch.quantity, remaining);
    if (take <= 0) continue;

    // Atomic, race-safe decrement — the WHERE guard means a concurrent sale
    // touching the same batch can't push it negative, and re-checks it's
    // still unexpired at the moment of the actual update.
    const [updated] = await tx
      .update(medicineBatchesTable)
      .set({ quantity: sql`${medicineBatchesTable.quantity} - ${take}` })
      .where(
        and(
          eq(medicineBatchesTable.id, batch.id),
          gt(medicineBatchesTable.quantity, take - 1),
          or(isNull(medicineBatchesTable.expiryDate), gte(medicineBatchesTable.expiryDate, today())),
        )
      )
      .returning({ id: medicineBatchesTable.id });

    if (!updated) continue; // lost the race on this batch — move to the next one

    allocations.push({ batchId: batch.id, quantity: take });
    remaining -= take;
  }

  if (remaining > 0) {
    throw new InsufficientStockError(medicineName);
  }

  await refreshMedicineAggregate(tx, medicineId);
  return allocations;
}

/**
 * Reverses a set of batch allocations (e.g. when cancelling a dispensed
 * order) — adds the quantity back to each specific batch it came from,
 * rather than lumping it back into the medicine's total. If that batch has
 * since expired, the stock still goes back correctly (it just won't be
 * sellable again — same as real returned expired stock wouldn't be).
 */
export async function restoreAllocations(
  tx: DbOrTx,
  medicineId: number,
  allocations: { medicineBatchId: number; quantity: number }[]
): Promise<void> {
  for (const alloc of allocations) {
    await tx
      .update(medicineBatchesTable)
      .set({ quantity: sql`${medicineBatchesTable.quantity} + ${alloc.quantity}` })
      .where(eq(medicineBatchesTable.id, alloc.medicineBatchId));
  }
  await refreshMedicineAggregate(tx, medicineId);
}

/** True if a medicine has any batch rows at all with expired stock still sitting unsold. */
export async function hasExpiredUnsoldStock(tx: DbOrTx, medicineId: number): Promise<boolean> {
  const [row] = await tx
    .select({ id: medicineBatchesTable.id })
    .from(medicineBatchesTable)
    .where(and(eq(medicineBatchesTable.medicineId, medicineId), gt(medicineBatchesTable.quantity, 0), lt(medicineBatchesTable.expiryDate, today())))
    .limit(1);
  return !!row;
}
