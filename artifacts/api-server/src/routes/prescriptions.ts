import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prescriptionsTable, patientsTable } from "@workspace/db";
import {
  CreatePrescriptionBody, VerifyPrescriptionBody, RejectPrescriptionBody,
  GetPrescriptionParams, VerifyPrescriptionParams, RejectPrescriptionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

const PRESCRIPTION_SELECT = {
  id: prescriptionsTable.id,
  patientId: prescriptionsTable.patientId,
  patientName: prescriptionsTable.patientName,
  doctorName: prescriptionsTable.doctorName,
  status: prescriptionsTable.status,
  verifiedBy: prescriptionsTable.verifiedBy,
  notes: prescriptionsTable.notes,
  createdAt: prescriptionsTable.createdAt,
};

router.get("/prescriptions", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db.select(PRESCRIPTION_SELECT).from(prescriptionsTable).orderBy(prescriptionsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load prescriptions.", detail: getDbErrorMessage(err) });
  }
});

router.post("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    let resolvedPatientName = parsed.data.patientName ?? null;
    if (parsed.data.patientId && !resolvedPatientName) {
      const [patient] = await db.select().from(patientsTable).where(eq(patientsTable.id, parsed.data.patientId));
      resolvedPatientName = patient?.name ?? null;
    }
    const [row] = await db.insert(prescriptionsTable).values({
      patientId: parsed.data.patientId ?? null,
      patientName: resolvedPatientName,
      doctorName: parsed.data.doctorName ?? null,
      notes: parsed.data.notes ?? null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to save prescription.", detail: getDbErrorMessage(err) });
  }
});

router.get("/prescriptions/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [row] = await db.select(PRESCRIPTION_SELECT).from(prescriptionsTable).where(eq(prescriptionsTable.id, params.data.id));
    if (!row) { res.status(404).json({ error: "Prescription not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to load prescription.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/prescriptions/:id/verify", requireAuth, async (req, res): Promise<void> => {
  const params = VerifyPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = VerifyPrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [row] = await db
      .update(prescriptionsTable)
      .set({ status: "verified", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
      .where(eq(prescriptionsTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Prescription not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to verify prescription.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/prescriptions/:id/reject", requireAuth, async (req, res): Promise<void> => {
  const params = RejectPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = RejectPrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [row] = await db
      .update(prescriptionsTable)
      .set({ status: "rejected", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
      .where(eq(prescriptionsTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Prescription not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to reject prescription.", detail: getDbErrorMessage(err) });
  }
});

export default router;
