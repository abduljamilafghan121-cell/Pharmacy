import { Router, type IRouter } from "express";
import { eq, and, inArray, sql } from "drizzle-orm";
import { db, medicinesTable, categoriesTable, medicineUnitsTable, medicineBatchesTable } from "@workspace/db";
import {
  CreateMedicineBody, UpdateMedicineBody,
  GetMedicineParams, UpdateMedicineParams, DeleteMedicineParams,
  ListMedicinesQueryParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage, getDeleteErrorMessage } from "../lib/api-errors";
import { refreshMedicineAggregate, allocateFefo, InsufficientStockError } from "../lib/batch-helpers";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// The generated bodies don't know about reorderLevel yet (would need an
// orval/openapi regen) — extend them locally so the field can be set
// without touching generated code.
const CreateMedicineBodyExt = CreateMedicineBody.extend({
  reorderLevel: z.number().int().min(0).optional(),
  barcode: z.string().optional(),
});
const UpdateMedicineBodyExt = UpdateMedicineBody.extend({
  reorderLevel: z.number().int().min(0).optional(),
  barcode: z.string().optional(),
});

const MEDICINE_SELECT = {
  id: medicinesTable.id, name: medicinesTable.name, genericName: medicinesTable.genericName,
  barcode: medicinesTable.barcode,
  categoryId: medicinesTable.categoryId, categoryName: categoriesTable.name,
  supplierId: medicinesTable.supplierId, manufacturer: medicinesTable.manufacturer,
  batchNumber: medicinesTable.batchNumber, expiryDate: medicinesTable.expiryDate,
  quantity: medicinesTable.quantity, reorderLevel: medicinesTable.reorderLevel,
  price: medicinesTable.price,
  prescriptionRequired: medicinesTable.prescriptionRequired,
  description: medicinesTable.description, imageUrl: medicinesTable.imageUrl,
  createdAt: medicinesTable.createdAt,
};

async function fetchUnitsForMedicine(medicineId: number) {
  return db
    .select()
    .from(medicineUnitsTable)
    .where(eq(medicineUnitsTable.medicineId, medicineId))
    .orderBy(medicineUnitsTable.conversionFactorToBase);
}

// Fetches units for many medicines in a single query instead of N+1, then
// groups them in memory and attaches to each row.
async function attachUnits<T extends { id: number }>(rows: T[]): Promise<(T & { units: unknown[] })[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const allUnits = await db
    .select()
    .from(medicineUnitsTable)
    .where(inArray(medicineUnitsTable.medicineId, ids))
    .orderBy(medicineUnitsTable.conversionFactorToBase);
  const byMedicine = new Map<number, unknown[]>();
  for (const u of allUnits) {
    const list = byMedicine.get(u.medicineId) ?? [];
    list.push(u);
    byMedicine.set(u.medicineId, list);
  }
  return rows.map((r) => ({ ...r, units: byMedicine.get(r.id) ?? [] }));
}

async function fetchMedicineWithUnits(id: number) {
  const [row] = await db.select(MEDICINE_SELECT).from(medicinesTable)
    .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
    .where(eq(medicinesTable.id, id));
  if (!row) return null;
  const units = await fetchUnitsForMedicine(id);
  return { ...row, units };
}

// Low-stock now compares against each medicine's own reorderLevel instead
// of a hardcoded "<= 10 base units" that made no sense across item types
// (10 tablets vs. 10 syrup bottles are very different situations).
router.get("/medicines/low-stock", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(sql`${medicinesTable.quantity} <= ${medicinesTable.reorderLevel}`);
    res.json(await attachUnits(rows));
  } catch (err) {
    res.status(500).json({ error: "Failed to load low-stock medicines.", detail: getDbErrorMessage(err) });
  }
});

router.get("/medicines/expiring", requireAuth, async (_req, res): Promise<void> => {
  try {
    const ninety = new Date();
    ninety.setDate(ninety.getDate() + 30);
    const cutoff = ninety.toISOString().split("T")[0];
    const today = new Date().toISOString().split("T")[0];
    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(
        and(
          sql`${medicinesTable.expiryDate} IS NOT NULL`,
          sql`${medicinesTable.expiryDate} >= ${today}`,
          sql`${medicinesTable.expiryDate} <= ${cutoff}`,
        )
      );
    res.json(await attachUnits(rows));
  } catch (err) {
    res.status(500).json({ error: "Failed to load expiring medicines.", detail: getDbErrorMessage(err) });
  }
});

// Requires auth now — this previously leaked the full inventory (prices,
// stock levels, supplier IDs) to anyone with the URL, logged in or not.
router.get("/medicines", requireAuth, async (req, res): Promise<void> => {
  const params = ListMedicinesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  try {
    const { search, categoryId, prescriptionRequired } = params.data;
    const conditions = [];
    if (search) conditions.push(sql`(${medicinesTable.name} ILIKE ${`%${search}%`} OR ${medicinesTable.barcode} ILIKE ${`%${search}%`})`);
    if (categoryId != null) conditions.push(eq(medicinesTable.categoryId, categoryId));
    if (prescriptionRequired != null) conditions.push(eq(medicinesTable.prescriptionRequired, prescriptionRequired));

    // Basic pagination — default page size keeps payloads reasonable as the
    // catalog grows; callers can raise it explicitly.
    const limit = Math.min(Math.max(Number(req.query["limit"]) || 500, 1), 1000);
    const offset = Math.max(Number(req.query["offset"]) || 0, 0);

    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(medicinesTable.name)
      .limit(limit)
      .offset(offset);
    res.json(await attachUnits(rows));
  } catch (err) {
    res.status(500).json({ error: "Failed to load medicines.", detail: getDbErrorMessage(err) });
  }
});

// Exact-match lookup by barcode — this is what makes a USB/handheld barcode
// scanner actually work: scanners just "type" the code + Enter into
// whatever's focused, so the frontend can call this on Enter and add the
// match straight to the cart without the pharmacist typing anything.
router.get("/medicines/by-barcode/:barcode", requireAuth, async (req, res): Promise<void> => {
  const barcode = req.params.barcode;
  if (!barcode) { res.status(400).json({ error: "Barcode is required." }); return; }
  try {
    const [row] = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(eq(medicinesTable.barcode, barcode));
    if (!row) { res.status(404).json({ error: "No medicine found for that barcode." }); return; }
    const units = await fetchUnitsForMedicine(row.id);
    res.json({ ...row, units });
  } catch (err) {
    res.status(500).json({ error: "Failed to look up barcode.", detail: getDbErrorMessage(err) });
  }
});

router.post("/medicines", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateMedicineBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const { quantity, batchNumber, expiryDate, ...rest } = parsed.data;
    const expiryStr = expiryDate ? expiryDate.toISOString().slice(0, 10) : null;

    const full = await db.transaction(async (tx) => {
      // The medicine row starts at 0/null — its real quantity/batch/expiry
      // are derived from batch rows (see refreshMedicineAggregate below),
      // so every medicine has consistent, traceable stock from day one.
      const [row] = await tx.insert(medicinesTable).values({
        ...rest,
        quantity: 0,
        batchNumber: null,
        expiryDate: null,
      }).returning();

      if (quantity > 0) {
        await tx.insert(medicineBatchesTable).values({
          medicineId: row.id,
          batchNumber: batchNumber ?? null,
          expiryDate: expiryStr,
          quantity,
        });
      }
      await refreshMedicineAggregate(tx, row.id);

      const [full] = await tx.select(MEDICINE_SELECT).from(medicinesTable)
        .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
        .where(eq(medicinesTable.id, row.id));
      return { ...full, units: [] };
    });

    res.status(201).json(full);
    logAudit(req.auth!.userId, "medicine.create", "medicine", full.id, `Created medicine "${full.name}" with ${quantity} units${batchNumber ? ` (batch ${batchNumber})` : ""}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to create medicine.", detail: getDbErrorMessage(err) });
  }
});

// Requires auth now (see note on the list endpoint above).
router.get("/medicines/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetMedicineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  try {
    const full = await fetchMedicineWithUnits(params.data.id);
    if (!full) { res.status(404).json({ error: "Medicine not found." }); return; }
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to load medicine.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/medicines/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = UpdateMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = UpdateMedicineBodyExt.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    // batchNumber/expiryDate are now DERIVED from batch rows (see
    // refreshMedicineAggregate) — they're only meaningful here alongside a
    // quantity change, where they describe the batch being added.
    const { expiryDate, quantity: newQuantity, batchNumber, ...medicineFields } = parsed.data;
    const expiryStr = expiryDate ? expiryDate.toISOString().slice(0, 10) : null;

    const result = await db.transaction(async (tx) => {
      const [current] = await tx.select().from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
      if (!current) return null;

      if (Object.keys(medicineFields).length > 0) {
        await tx.update(medicinesTable).set(medicineFields).where(eq(medicinesTable.id, params.data.id));
      }

      if (newQuantity != null && newQuantity !== current.quantity) {
        const delta = newQuantity - current.quantity;
        if (delta > 0) {
          // Manual stock increase — recorded as its own traceable batch
          // (e.g. correcting an undercount, or stock found during audit).
          await tx.insert(medicineBatchesTable).values({
            medicineId: params.data.id,
            batchNumber: batchNumber ?? "Manual adjustment",
            expiryDate: expiryStr,
            quantity: delta,
          });
        } else {
          // Manual stock decrease — pulls from the oldest-expiring batches
          // first, same as a sale would (e.g. spoilage, breakage, loss).
          await allocateFefo(tx, params.data.id, current.name, -delta);
        }
      }

      await refreshMedicineAggregate(tx, params.data.id);

      const [full] = await tx.select(MEDICINE_SELECT).from(medicinesTable)
        .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
        .where(eq(medicinesTable.id, params.data.id));
      return { full, previousQuantity: current.quantity, previousName: current.name };
    });

    if (!result) { res.status(404).json({ error: "Medicine not found." }); return; }
    const { full, previousQuantity, previousName } = result;
    const units = await fetchUnitsForMedicine(params.data.id);
    res.json({ ...full, units });

    if (newQuantity != null && newQuantity !== previousQuantity) {
      const delta = newQuantity - previousQuantity;
      logAudit(req.auth!.userId, "medicine.stock_adjust", "medicine", params.data.id,
        `Manually ${delta > 0 ? "increased" : "decreased"} stock for "${previousName}" by ${Math.abs(delta)} units (${previousQuantity} → ${newQuantity}).`);
    } else if (Object.keys(medicineFields).length > 0) {
      logAudit(req.auth!.userId, "medicine.update", "medicine", params.data.id, `Updated details for "${previousName}".`);
    }
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      res.status(409).json({ error: `Can't reduce stock below what's actually available for ${err.medicineName}.` });
      return;
    }
    res.status(500).json({ error: "Failed to update medicine.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/medicines/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = DeleteMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [existing] = await db.select({ name: medicinesTable.name }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    await db.delete(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    res.sendStatus(204);
    if (existing) logAudit(req.auth!.userId, "medicine.delete", "medicine", params.data.id, `Deleted medicine "${existing.name}".`);
  } catch (err) {
    res.status(409).json({ error: getDeleteErrorMessage(err, "medicine") });
  }
});

// ── Medicine Batches ──────────────────────────────────────────────────────────

router.get("/medicines/:id/batches", requireAuth, async (req, res): Promise<void> => {
  const params = MedicineUnitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  try {
    const [med] = await db.select({ id: medicinesTable.id }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }
    // Ordered FEFO-first (earliest expiry first, no-expiry batches last) —
    // this is the order stock actually gets sold from.
    const batches = await db
      .select()
      .from(medicineBatchesTable)
      .where(eq(medicineBatchesTable.medicineId, params.data.id))
      .orderBy(sql`${medicineBatchesTable.expiryDate} ASC NULLS LAST`, medicineBatchesTable.id);
    res.json(batches);
  } catch (err) {
    res.status(500).json({ error: "Failed to load batches.", detail: getDbErrorMessage(err) });
  }
});

const WriteOffBody = z.object({ reason: z.string().min(1) });

router.post("/medicines/:id/batches/:batchId/write-off", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = MedicineUnitDeleteParams.safeParse({ id: req.params.id, unitId: req.params.batchId });
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = WriteOffBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A reason is required to write off stock." }); return; }

  try {
    const [batch] = await db.select().from(medicineBatchesTable).where(eq(medicineBatchesTable.id, params.data.unitId));
    if (!batch || batch.medicineId !== params.data.id) { res.status(404).json({ error: "Batch not found." }); return; }
    if (batch.quantity <= 0) { res.status(400).json({ error: "This batch has no remaining stock to write off." }); return; }
    if (batch.writeOffAt) { res.status(409).json({ error: "This batch has already been written off." }); return; }

    const writtenOffQty = batch.quantity;
    await db.transaction(async (tx) => {
      await tx.update(medicineBatchesTable)
        .set({ quantity: 0, writeOffReason: parsed.data.reason, writeOffAt: new Date(), writeOffBy: req.auth!.userId })
        .where(eq(medicineBatchesTable.id, batch.id));
      await refreshMedicineAggregate(tx, params.data.id);
    });

    const [medicine] = await db.select({ name: medicinesTable.name }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    res.json({ message: "Batch written off.", quantityWrittenOff: writtenOffQty });
    logAudit(req.auth!.userId, "medicine.batch_writeoff", "medicine", params.data.id,
      `Wrote off ${writtenOffQty} units of "${medicine?.name ?? "medicine"}" (batch ${batch.batchNumber ?? batch.id}) — reason: ${parsed.data.reason}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to write off batch.", detail: getDbErrorMessage(err) });
  }
});

// ── Medicine Units ────────────────────────────────────────────────────────────

const MedicineUnitParams = z.object({ id: z.coerce.number().int().positive() });
const MedicineUnitDeleteParams = z.object({
  id: z.coerce.number().int().positive(),
  unitId: z.coerce.number().int().positive(),
});
const MedicineUnitInput = z.object({
  unitName: z.string().min(1),
  conversionFactorToBase: z.number().int().min(1),
  isBaseUnit: z.boolean(),
});

router.get("/medicines/:id/units", requireAuth, async (req, res): Promise<void> => {
  const params = MedicineUnitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  try {
    const [med] = await db.select({ id: medicinesTable.id }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }
    const units = await fetchUnitsForMedicine(params.data.id);
    res.json(units);
  } catch (err) {
    res.status(500).json({ error: "Failed to load units.", detail: getDbErrorMessage(err) });
  }
});

router.post("/medicines/:id/units", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = MedicineUnitParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = MedicineUnitInput.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [med] = await db.select({ id: medicinesTable.id }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }

    // If this unit is being set as base unit, clear previous base unit flag
    if (parsed.data.isBaseUnit) {
      await db.update(medicineUnitsTable)
        .set({ isBaseUnit: false })
        .where(eq(medicineUnitsTable.medicineId, params.data.id));
    }

    const [unit] = await db.insert(medicineUnitsTable).values({
      medicineId: params.data.id,
      unitName: parsed.data.unitName,
      conversionFactorToBase: parsed.data.conversionFactorToBase,
      isBaseUnit: parsed.data.isBaseUnit,
    }).returning();
    res.status(201).json(unit);
  } catch (err) {
    res.status(500).json({ error: "Failed to create unit.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/medicines/:id/units/:unitId", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = MedicineUnitDeleteParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  try {
    await db.delete(medicineUnitsTable)
      .where(and(eq(medicineUnitsTable.id, params.data.unitId), eq(medicineUnitsTable.medicineId, params.data.id)));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete unit.", detail: getDbErrorMessage(err) });
  }
});

export default router;
