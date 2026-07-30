import { Router, type IRouter } from "express";
import { eq, and, sql } from "drizzle-orm";
import { db, insurancePreAuthsTable, medicinesTable, patientsTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { z } from "zod";

const router: IRouter = Router();

const CreatePABody = z.object({
  medicineId: z.number().int().positive(),
  patientId: z.number().int().positive().optional(),
  prescriptionId: z.number().int().positive().optional(),
  insurerName: z.string().min(1).max(200),
  policyNumber: z.string().max(100).optional(),
  diagnosisCode: z.string().max(50).optional(),
  notes: z.string().max(1000).optional(),
});

const UpdatePABody = z.object({
  status: z.enum(["pending", "approved", "denied", "expired"]).optional(),
  referenceNumber: z.string().max(100).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

const PAIdParam = z.object({ id: z.coerce.number().int().positive() });

async function fetchPA(id: number) {
  const [row] = await db
    .select({
      id: insurancePreAuthsTable.id,
      patientId: insurancePreAuthsTable.patientId,
      patientName: patientsTable.name,
      medicineId: insurancePreAuthsTable.medicineId,
      medicineName: medicinesTable.name,
      prescriptionId: insurancePreAuthsTable.prescriptionId,
      insurerName: insurancePreAuthsTable.insurerName,
      policyNumber: insurancePreAuthsTable.policyNumber,
      diagnosisCode: insurancePreAuthsTable.diagnosisCode,
      requestedBy: insurancePreAuthsTable.requestedBy,
      requestedByName: usersTable.name,
      status: insurancePreAuthsTable.status,
      referenceNumber: insurancePreAuthsTable.referenceNumber,
      notes: insurancePreAuthsTable.notes,
      submittedAt: insurancePreAuthsTable.submittedAt,
      resolvedAt: insurancePreAuthsTable.resolvedAt,
    })
    .from(insurancePreAuthsTable)
    .leftJoin(medicinesTable, eq(insurancePreAuthsTable.medicineId, medicinesTable.id))
    .leftJoin(patientsTable, eq(insurancePreAuthsTable.patientId, patientsTable.id))
    .leftJoin(usersTable, eq(insurancePreAuthsTable.requestedBy, usersTable.id))
    .where(eq(insurancePreAuthsTable.id, id));
  return row ?? null;
}

// List PAs (optionally filtered by status)
router.get("/pre-authorizations", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  try {
    const { status } = req.query as { status?: string };
    const conditions = status ? [eq(insurancePreAuthsTable.status, status as any)] : [];

    const rows = await db
      .select({
        id: insurancePreAuthsTable.id,
        patientId: insurancePreAuthsTable.patientId,
        patientName: patientsTable.name,
        medicineId: insurancePreAuthsTable.medicineId,
        medicineName: medicinesTable.name,
        insurerName: insurancePreAuthsTable.insurerName,
        policyNumber: insurancePreAuthsTable.policyNumber,
        diagnosisCode: insurancePreAuthsTable.diagnosisCode,
        requestedBy: insurancePreAuthsTable.requestedBy,
        requestedByName: usersTable.name,
        status: insurancePreAuthsTable.status,
        referenceNumber: insurancePreAuthsTable.referenceNumber,
        notes: insurancePreAuthsTable.notes,
        submittedAt: insurancePreAuthsTable.submittedAt,
        resolvedAt: insurancePreAuthsTable.resolvedAt,
      })
      .from(insurancePreAuthsTable)
      .leftJoin(medicinesTable, eq(insurancePreAuthsTable.medicineId, medicinesTable.id))
      .leftJoin(patientsTable, eq(insurancePreAuthsTable.patientId, patientsTable.id))
      .leftJoin(usersTable, eq(insurancePreAuthsTable.requestedBy, usersTable.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(sql`${insurancePreAuthsTable.submittedAt} DESC`);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load pre-authorizations.", detail: getDbErrorMessage(err) });
  }
});

// Create PA request
router.post("/pre-authorizations", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreatePABody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const [row] = await db
      .insert(insurancePreAuthsTable)
      .values({
        ...parsed.data,
        requestedBy: req.auth!.userId,
      })
      .returning();
    const full = await fetchPA(row.id);
    res.status(201).json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to create pre-authorization.", detail: getDbErrorMessage(err) });
  }
});

// Update PA status / reference number
router.patch("/pre-authorizations/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = PAIdParam.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: params.error.message }); return; }
  const parsed = UpdatePABody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const setValues: Record<string, any> = { ...parsed.data };
    if (parsed.data.status && parsed.data.status !== "pending") {
      setValues.resolvedAt = new Date();
    }
    const [updated] = await db
      .update(insurancePreAuthsTable)
      .set(setValues)
      .where(eq(insurancePreAuthsTable.id, params.data.id))
      .returning();
    if (!updated) { res.status(404).json({ error: "Pre-authorization not found." }); return; }
    const full = await fetchPA(updated.id);
    res.json(full);
  } catch (err) {
    res.status(500).json({ error: "Failed to update pre-authorization.", detail: getDbErrorMessage(err) });
  }
});

export default router;
