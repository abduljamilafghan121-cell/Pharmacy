import { Router, type IRouter } from "express";
import { eq, ilike, sql } from "drizzle-orm";
import { db, patientsTable, patientAllergiesTable, ordersTable, orderItemsTable, medicinesTable, usersTable } from "@workspace/db";
import { CreatePatientBody, GetPatientParams, UpdatePatientParams, UpdatePatientBody } from "@workspace/api-zod";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/patients", requireAuth, async (req, res): Promise<void> => {
  try {
    const search = req.query["search"] as string | undefined;
    const pageRaw = req.query["page"];
    const limitRaw = req.query["limit"];
    const paginate = pageRaw != null || limitRaw != null;
    const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "50"), 10) || 50, 1), 200);
    const page = Math.max(parseInt(String(pageRaw ?? "1"), 10) || 1, 1);
    const offset = (page - 1) * limit;
    const whereClause = search ? ilike(patientsTable.name, `%${search}%`) : undefined;

    // Subquery for allergy count — included in every patient row so the list
    // can show an allergy badge without a separate per-patient request.
    const allergyCountSq = sql<number>`(
      SELECT COUNT(*)::int FROM ${patientAllergiesTable}
      WHERE ${patientAllergiesTable.patientId} = ${patientsTable.id}
    )`.as("allergy_count");

    const selectFields = {
      id: patientsTable.id,
      name: patientsTable.name,
      phone: patientsTable.phone,
      dateOfBirth: patientsTable.dateOfBirth,
      gender: patientsTable.gender,
      notes: patientsTable.notes,
      createdAt: patientsTable.createdAt,
      allergyCount: allergyCountSq,
    };

    if (paginate) {
      const [rows, countResult] = await Promise.all([
        db.select(selectFields).from(patientsTable).where(whereClause).orderBy(patientsTable.name).limit(limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(patientsTable).where(whereClause),
      ]);
      res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
    } else {
      const rows = await db.select(selectFields).from(patientsTable).where(whereClause).orderBy(patientsTable.name);
      res.json(rows);
    }
  } catch (err) {
    res.status(500).json({ error: "Failed to load patients.", detail: getDbErrorMessage(err) });
  }
});

router.post("/patients", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const [row] = await db.insert(patientsTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to register patient.", detail: getDbErrorMessage(err) });
  }
});

router.get("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [row] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
    if (!row) { res.status(404).json({ error: "Patient not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to load patient.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/patients/:id", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [row] = await db.update(patientsTable).set(parsed.data).where(eq(patientsTable.id, params.data.id)).returning();
    if (!row) { res.status(404).json({ error: "Patient not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update patient.", detail: getDbErrorMessage(err) });
  }
});

// ── Dispensing history ────────────────────────────────────────────────────
const DispensingHistoryParams = z.object({ id: z.coerce.number().int().positive() });

router.get("/patients/:id/dispensing-history", requireAuth, async (req, res): Promise<void> => {
  const params = DispensingHistoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }

  const limitRaw = req.query["limit"];
  const pageRaw  = req.query["page"];
  const limit = Math.min(Math.max(parseInt(String(limitRaw ?? "20"), 10) || 20, 1), 500);
  const page  = Math.max(parseInt(String(pageRaw  ?? "1"),  10) || 1, 1);
  const offset = (page - 1) * limit;

  try {
    const [patient] = await db.select({ id: patientsTable.id }).from(patientsTable)
      .where(eq(patientsTable.id, params.data.id));
    if (!patient) { res.status(404).json({ error: "Patient not found." }); return; }

    const baseQuery = db
      .select({
        orderId:          ordersTable.id,
        orderDate:        ordersTable.createdAt,
        orderStatus:      ordersTable.status,
        orderTotal:       ordersTable.total,
        servedByName:     usersTable.name,
        itemId:           orderItemsTable.id,
        medicineId:       orderItemsTable.medicineId,
        medicineName:     medicinesTable.name,
        medicineGenericName: medicinesTable.genericName,
        quantity:         orderItemsTable.quantity,
        unitName:         orderItemsTable.unitName,
        price:            orderItemsTable.price,
        returnedQuantity: orderItemsTable.returnedQuantity,
      })
      .from(ordersTable)
      .leftJoin(usersTable,      eq(ordersTable.servedBy,          usersTable.id))
      .innerJoin(orderItemsTable, eq(orderItemsTable.orderId,       ordersTable.id))
      .leftJoin(medicinesTable,  eq(orderItemsTable.medicineId,    medicinesTable.id))
      .where(eq(ordersTable.patientId, params.data.id))
      .orderBy(sql`${ordersTable.createdAt} DESC`);

    const [rows, countResult] = await Promise.all([
      baseQuery.limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(ordersTable)
        .innerJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
        .where(eq(ordersTable.patientId, params.data.id)),
    ]);

    res.json({ data: rows, total: countResult[0]?.count ?? 0, page, limit });
  } catch (err) {
    res.status(500).json({ error: "Failed to load dispensing history.", detail: getDbErrorMessage(err) });
  }
});

export default router;
