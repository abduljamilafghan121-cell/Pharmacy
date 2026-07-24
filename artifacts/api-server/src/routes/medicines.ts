import { Router, type IRouter } from "express";
import { eq, ilike, and, lte, sql } from "drizzle-orm";
import { db, medicinesTable, categoriesTable } from "@workspace/db";
import {
  CreateMedicineBody, UpdateMedicineBody,
  GetMedicineParams, UpdateMedicineParams, DeleteMedicineParams,
  ListMedicinesQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

const MEDICINE_SELECT = {
  id: medicinesTable.id, name: medicinesTable.name, genericName: medicinesTable.genericName,
  categoryId: medicinesTable.categoryId, categoryName: categoriesTable.name,
  supplierId: medicinesTable.supplierId, manufacturer: medicinesTable.manufacturer,
  batchNumber: medicinesTable.batchNumber, expiryDate: medicinesTable.expiryDate,
  quantity: medicinesTable.quantity, price: medicinesTable.price,
  prescriptionRequired: medicinesTable.prescriptionRequired,
  description: medicinesTable.description, imageUrl: medicinesTable.imageUrl,
  createdAt: medicinesTable.createdAt,
};

router.get("/medicines/low-stock", async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(lte(medicinesTable.quantity, 10));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load low-stock medicines.", detail: getDbErrorMessage(err) });
  }
});

router.get("/medicines/expiring", async (_req, res): Promise<void> => {
  try {
    const ninety = new Date();
    ninety.setDate(ninety.getDate() + 90);
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
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load expiring medicines.", detail: getDbErrorMessage(err) });
  }
});

router.get("/medicines", async (req, res): Promise<void> => {
  const params = ListMedicinesQueryParams.safeParse(req.query);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  try {
    const { search, categoryId, prescriptionRequired } = params.data;
    const conditions = [];
    if (search) conditions.push(ilike(medicinesTable.name, `%${search}%`));
    if (categoryId != null) conditions.push(eq(medicinesTable.categoryId, categoryId));
    if (prescriptionRequired != null) conditions.push(eq(medicinesTable.prescriptionRequired, prescriptionRequired));
    const rows = await db
      .select(MEDICINE_SELECT)
      .from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(medicinesTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load medicines.", detail: getDbErrorMessage(err) });
  }
});

router.post("/medicines", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateMedicineBody.safeParse(req.body);
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
    const [full] = await db.select(MEDICINE_SELECT).from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(eq(medicinesTable.id, row.id));
    res.status(201).json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to create medicine.", detail: getDbErrorMessage(err) });
  }
});

router.get("/medicines/:id", async (req, res): Promise<void> => {
  const params = GetMedicineParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: formatZodError(params.error) });
    return;
  }
  try {
    const [row] = await db.select(MEDICINE_SELECT).from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(eq(medicinesTable.id, params.data.id));
    if (!row) { res.status(404).json({ error: "Medicine not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to load medicine.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/medicines/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = UpdateMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = UpdateMedicineBody.safeParse(req.body);
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
    const [full] = await db.select(MEDICINE_SELECT).from(medicinesTable)
      .leftJoin(categoriesTable, eq(medicinesTable.categoryId, categoriesTable.id))
      .where(eq(medicinesTable.id, updated.id));
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to update medicine.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/medicines/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = DeleteMedicineParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    await db.delete(medicinesTable).where(eq(medicinesTable.id, params.data.id));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete medicine.", detail: getDbErrorMessage(err) });
  }
});

export default router;
