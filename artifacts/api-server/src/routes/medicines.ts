import { Router, type IRouter } from "express";
import { eq, ilike, or, and, sql, gte } from "drizzle-orm";
import { db, medicinesTable, categoriesTable, medicineUnitsTable, ordersTable, orderItemsTable } from "@workspace/db";
import {
  CreateMedicineBody, UpdateMedicineBody,
  GetMedicineParams, UpdateMedicineParams, DeleteMedicineParams,
  ListMedicinesQueryParams,
} from "@workspace/api-zod";
import { z } from "zod";

// Extend generated bodies with new schema fields not yet in openapi.yaml
const CONTROLLED_SCHEDULE = z.enum(["II", "III", "IV", "V"]).optional().nullable();
const CreateMedicineBodyExt = CreateMedicineBody.extend({
  controlledSchedule: CONTROLLED_SCHEDULE,
  drugClass: z.string().optional().nullable(),
});
const UpdateMedicineBodyExt = UpdateMedicineBody.extend({
  controlledSchedule: CONTROLLED_SCHEDULE,
  drugClass: z.string().optional().nullable(),
});
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const MEDICINE_SELECT = {
  id: medicinesTable.id, name: medicinesTable.name, genericName: medicinesTable.genericName,
  barcode: medicinesTable.barcode,
  categoryId: medicinesTable.categoryId, categoryName: categoriesTable.name,
  supplierId: medicinesTable.supplierId, manufacturer: medicinesTable.manufacturer,
  batchNumber: medicinesTable.batchNumber, expiryDate: medicinesTable.expiryDate,
  quantity: medicinesTable.quantity, price: medicinesTable.price,
  prescriptionRequired: medicinesTable.prescriptionRequired,
  controlledSchedule: medicinesTable.controlledSchedule,
  drugClass: medicinesTable.drugClass,
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

async function fetchMedicineWithUnits(id: number) {
  const [row] = await db.select(MEDICINE_SELECT).from(medicinesTable)
    .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
    .where(eq(medicinesTable.id, id));
  if (!row) return null;
  const units = await fetchUnitsForMedicine(id);
  return { ...row, units };
}

router.get("/medicines/low-stock", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(sql`${medicinesTable.quantity} <= ${medicinesTable.reorderLevel}`);
    // Attach units
    const withUnits = await Promise.all(rows.map(async (r) => ({
      ...r, units: await fetchUnitsForMedicine(r.id),
    })));
    res.json(withUnits);
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
    const withUnits = await Promise.all(rows.map(async (r) => ({
      ...r, units: await fetchUnitsForMedicine(r.id),
    })));
    res.json(withUnits);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expiring medicines.", detail: getDbErrorMessage(err) });
  }
});

// ── Smart Reorder Suggestions ─────────────────────────────────────────────
// Returns medicines at or below 1.5× their reorder level with 30-day sales
// velocity and a suggested quantity to order.
router.get("/medicines/reorder-suggestions", requireAuth, async (_req, res): Promise<void> => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // 30-day sales grouped by medicine
    const salesData = await db
      .select({
        medicineId: orderItemsTable.medicineId,
        sold30d: sql<number>`COALESCE(SUM(${orderItemsTable.quantity}), 0)::int`,
      })
      .from(orderItemsTable)
      .leftJoin(ordersTable, eq(ordersTable.id, orderItemsTable.orderId))
      .where(
        and(
          sql`${ordersTable.status} != 'cancelled'`,
          gte(ordersTable.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(orderItemsTable.medicineId);

    const salesMap = new Map(salesData.map((s) => [s.medicineId, s.sold30d]));

    // Medicines at or below 1.5× reorder level
    const meds = await db
      .select({
        id: medicinesTable.id,
        name: medicinesTable.name,
        genericName: medicinesTable.genericName,
        quantity: medicinesTable.quantity,
        reorderLevel: medicinesTable.reorderLevel,
        price: medicinesTable.price,
      })
      .from(medicinesTable)
      .where(sql`${medicinesTable.quantity} <= GREATEST(CAST(${medicinesTable.reorderLevel} * 1.5 AS int), ${medicinesTable.reorderLevel} + 5)`)
      .orderBy(medicinesTable.quantity);

    const suggestions = meds.map((med) => {
      const sold30d = salesMap.get(med.id) ?? 0;
      const dailyRate = Math.round((sold30d / 30) * 10) / 10;
      const deficit = Math.max(0, med.reorderLevel - med.quantity);
      const demandFor30Days = Math.ceil((sold30d / 30) * 30);
      const suggestedReorderQty = Math.max(demandFor30Days + deficit, med.reorderLevel, 5);
      const urgency =
        med.quantity === 0 ? "critical" : med.quantity <= med.reorderLevel ? "high" : "medium";

      return {
        medicineId: med.id,
        medicineName: med.name,
        genericName: med.genericName,
        currentStock: med.quantity,
        reorderLevel: med.reorderLevel,
        sold30Days: sold30d,
        dailyRate,
        suggestedReorderQty,
        urgency,
      };
    });

    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: "Failed to compute reorder suggestions.", detail: getDbErrorMessage(err) });
  }
});

router.get("/medicines", requireAuth, async (req, res): Promise<void> => {
  const params = ListMedicinesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  try {
    const { search, categoryId, prescriptionRequired } = params.data;
    const pageRaw = req.query["page"];
    const limitRaw = req.query["limit"];
    const paginate = pageRaw != null || limitRaw != null;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 200);
    const page = Math.max(parseInt(String(pageRaw ?? "1"), 10) || 1, 1);
    const offset = (page - 1) * limit;

    const conditions = [];
    if (search) {
      // Search by name, generic name, or barcode (barcode allows exact scan-to-search)
      conditions.push(
        or(
          ilike(medicinesTable.name, `%${search}%`),
          ilike(medicinesTable.genericName, `%${search}%`),
          eq(medicinesTable.barcode, search),
        )!
      );
    }
    if (categoryId != null) conditions.push(eq(medicinesTable.categoryId, categoryId));
    if (prescriptionRequired != null) conditions.push(eq(medicinesTable.prescriptionRequired, prescriptionRequired));
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const baseQuery = db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(whereClause)
      .orderBy(medicinesTable.name);

    if (paginate) {
      const [rows, countResult] = await Promise.all([
        baseQuery.limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(medicinesTable).where(whereClause),
      ]);
      const withUnits = await Promise.all(rows.map(async (r) => ({
        ...r, units: await fetchUnitsForMedicine(r.id),
      })));
      res.json({ data: withUnits, total: countResult[0]?.count ?? 0, page, limit });
    } else {
      const rows = await baseQuery;
      const withUnits = await Promise.all(rows.map(async (r) => ({
        ...r, units: await fetchUnitsForMedicine(r.id),
      })));
      res.json(withUnits);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to load medicines.", detail: getDbErrorMessage(err) });
  }
});

router.post("/medicines", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateMedicineBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const values = {
      ...parsed.data,
      expiryDate: parsed.data.expiryDate ? parsed.data.expiryDate.toISOString().slice(0, 10) : null,
    };
    const [row] = await db.insert(medicinesTable).values(values).returning();
    const full = await fetchMedicineWithUnits(row.id);
    await logAudit(req.auth!.userId, "CREATE", "medicine", row.id, `Created medicine "${row.name}"`);
    res.status(201).json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to create medicine.", detail: getDbErrorMessage(err) });
  }
});

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
    const { expiryDate, ...medicineFields } = parsed.data;
    const values = {
      ...medicineFields,
      ...(expiryDate !== undefined
        ? { expiryDate: expiryDate ? expiryDate.toISOString().slice(0, 10) : null }
        : {}),
    };
    const [updated] = await db.update(medicinesTable).set(values).where(eq(medicinesTable.id, params.data.id)).returning();
    if (!updated) { res.status(404).json({ error: "Medicine not found." }); return; }
    const full = await fetchMedicineWithUnits(updated.id);
    await logAudit(req.auth!.userId, "UPDATE", "medicine", updated.id, `Updated medicine "${updated.name}"`);
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to update medicine.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/medicines/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = DeleteMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [med] = await db.select({ name: medicinesTable.name }).from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }
    await db.delete(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    await logAudit(req.auth!.userId, "DELETE", "medicine", params.data.id, `Deleted medicine "${med.name}"`);
    res.sendStatus(204);
  } catch (err) {
    const msg = getDbErrorMessage(err);
    // Foreign-key violation — medicine is referenced by sales history
    if (msg.includes("foreign key") || msg.includes("violates")) {
      res.status(409).json({ error: "Cannot delete this medicine because it has sales or purchase history. Deactivate it instead." });
      return;
    }
    res.status(500).json({ error: "Failed to delete medicine.", detail: msg });
  }
});

// ── Expired-stock write-off (T3.12) ──────────────────────────────────────────

const WriteOffParams = z.object({ id: z.coerce.number().int().positive() });
const WriteOffBody = z.object({
  quantity: z.number().int().min(1),
  reason: z.string().min(1).max(500),
});

router.post("/medicines/:id/write-off", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = WriteOffParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const body = WriteOffBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: formatZodError(body.error) }); return; }
  try {
    const [med] = await db.select({ id: medicinesTable.id, name: medicinesTable.name, quantity: medicinesTable.quantity })
      .from(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }
    if (body.data.quantity > med.quantity) {
      res.status(400).json({ error: `Cannot write off ${body.data.quantity} units — only ${med.quantity} in stock.` });
      return;
    }
    const [updated] = await db.update(medicinesTable)
      .set({ quantity: sql`${medicinesTable.quantity} - ${body.data.quantity}` })
      .where(eq(medicinesTable.id, params.data.id))
      .returning();
    await logAudit(req.auth!.userId, "WRITE_OFF", "medicine", updated.id, `Wrote off ${body.data.quantity} unit(s) of "${updated.name}": ${body.data.reason}`);
    res.json({ id: updated.id, name: updated.name, quantity: updated.quantity, written_off: body.data.quantity, reason: body.data.reason });
  } catch (err) {
    res.status(500).json({ error: "Failed to write off stock.", detail: getDbErrorMessage(err) });
  }
});

// ── Generic Substitution Suggestions ─────────────────────────────────────────
// Returns in-stock alternatives with the same generic name at a lower price.
router.get("/medicines/:id/generics", requireAuth, async (req, res): Promise<void> => {
  const params = GetMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [med] = await db
      .select({ id: medicinesTable.id, genericName: medicinesTable.genericName, price: medicinesTable.price })
      .from(medicinesTable)
      .where(eq(medicinesTable.id, params.data.id));
    if (!med) { res.status(404).json({ error: "Medicine not found." }); return; }
    if (!med.genericName) { res.json([]); return; }

    const alts = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(
        and(
          sql`LOWER(${medicinesTable.genericName}) = LOWER(${med.genericName})`,
          sql`${medicinesTable.id} != ${med.id}`,
          sql`${medicinesTable.quantity} > 0`,
          sql`${medicinesTable.price}::numeric < ${med.price}::numeric`,
        ),
      )
      .orderBy(medicinesTable.price);

    const withUnits = await Promise.all(alts.map(async (r) => ({
      ...r, units: await fetchUnitsForMedicine(r.id),
    })));
    res.json(withUnits);
  } catch (err) {
    res.status(500).json({ error: "Failed to load generic alternatives.", detail: getDbErrorMessage(err) });
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
