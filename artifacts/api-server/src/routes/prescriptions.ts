import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prescriptionsTable, usersTable } from "@workspace/db";
import {
  CreatePrescriptionBody, VerifyPrescriptionBody, RejectPrescriptionBody,
  GetPrescriptionParams, VerifyPrescriptionParams, RejectPrescriptionParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const { role, userId } = req.auth!;
  const rows = await db
    .select({
      id: prescriptionsTable.id,
      customerId: prescriptionsTable.customerId,
      customerName: usersTable.name,
      imageUrl: prescriptionsTable.imageUrl,
      status: prescriptionsTable.status,
      verifiedBy: prescriptionsTable.verifiedBy,
      notes: prescriptionsTable.notes,
      createdAt: prescriptionsTable.createdAt,
    })
    .from(prescriptionsTable)
    .leftJoin(usersTable, eq(prescriptionsTable.customerId, usersTable.id))
    .where(role === "customer" ? eq(prescriptionsTable.customerId, userId) : undefined)
    .orderBy(prescriptionsTable.createdAt);
  res.json(rows);
});

router.post("/prescriptions", requireAuth, requireRole("customer"), async (req, res): Promise<void> => {
  const parsed = CreatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(prescriptionsTable).values({
    customerId: req.auth!.userId,
    imageUrl: parsed.data.imageUrl ?? null,
    notes: parsed.data.notes ?? null,
  }).returning();
  res.status(201).json({ ...row, customerName: null });
});

router.get("/prescriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .select({
      id: prescriptionsTable.id,
      customerId: prescriptionsTable.customerId,
      customerName: usersTable.name,
      imageUrl: prescriptionsTable.imageUrl,
      status: prescriptionsTable.status,
      verifiedBy: prescriptionsTable.verifiedBy,
      notes: prescriptionsTable.notes,
      createdAt: prescriptionsTable.createdAt,
    })
    .from(prescriptionsTable)
    .leftJoin(usersTable, eq(prescriptionsTable.customerId, usersTable.id))
    .where(eq(prescriptionsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Prescription not found" }); return; }
  res.json(row);
});

router.patch("/prescriptions/:id/verify", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = VerifyPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = VerifyPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(prescriptionsTable)
    .set({ status: "verified", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
    .where(eq(prescriptionsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Prescription not found" }); return; }
  res.json({ ...row, customerName: null });
});

router.patch("/prescriptions/:id/reject", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = RejectPrescriptionParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RejectPrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(prescriptionsTable)
    .set({ status: "rejected", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
    .where(eq(prescriptionsTable.id, params.data.id))
    .returning();
  if (!row) { res.status(404).json({ error: "Prescription not found" }); return; }
  res.json({ ...row, customerName: null });
});

export default router;
