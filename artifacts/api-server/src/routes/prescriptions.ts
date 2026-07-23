import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prescriptionsTable, patientsTable } from "@workspace/db";
import {
  CreatePrescriptionBody, VerifyPrescriptionBody, RejectPrescriptionBody,
  GetPrescriptionParams, VerifyPrescriptionParams, RejectPrescriptionParams,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select({
      id: prescriptionsTable.id,
      patientId: prescriptionsTable.patientId,
      patientName: prescriptionsTable.patientName,
      doctorName: prescriptionsTable.doctorName,
      status: prescriptionsTable.status,
      verifiedBy: prescriptionsTable.verifiedBy,
      notes: prescriptionsTable.notes,
      createdAt: prescriptionsTable.createdAt,
    })
    .from(prescriptionsTable)
    .orderBy(prescriptionsTable.createdAt);
  res.json(rows);
});

router.post("/prescriptions", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePrescriptionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  let resolvedPatientName = parsed.data.patientName ?? null;

  // If patientId provided but no name, resolve from patients table
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
      patientId: prescriptionsTable.patientId,
      patientName: prescriptionsTable.patientName,
      doctorName: prescriptionsTable.doctorName,
      status: prescriptionsTable.status,
      verifiedBy: prescriptionsTable.verifiedBy,
      notes: prescriptionsTable.notes,
      createdAt: prescriptionsTable.createdAt,
    })
    .from(prescriptionsTable)
    .where(eq(prescriptionsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Prescription not found" }); return; }
  res.json(row);
});

router.patch("/prescriptions/:id/verify", requireAuth, async (req, res): Promise<void> => {
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
  res.json(row);
});

router.patch("/prescriptions/:id/reject", requireAuth, async (req, res): Promise<void> => {
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
  res.json(row);
});

export default router;
