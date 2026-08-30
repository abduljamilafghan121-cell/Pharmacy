import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, prescriptionsTable, patientsTable } from "@workspace/db";
import {
  CreatePrescriptionBody, VerifyPrescriptionBody, RejectPrescriptionBody,
  GetPrescriptionParams, VerifyPrescriptionParams, RejectPrescriptionParams,
} from "@workspace/api-zod";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// attachmentUrl and maxRefills aren't in the generated body yet — extend locally,
// same pattern used for reorderLevel on medicines.
const CreatePrescriptionBodyExt = CreatePrescriptionBody.extend({
  attachmentUrl: z.string().optional(),
  maxRefills: z.number().int().min(0).optional(),
});
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024; // ~5MB, images/scanned PDFs

const PRESCRIPTION_SELECT = {
  id: prescriptionsTable.id,
  patientId: prescriptionsTable.patientId,
  patientName: prescriptionsTable.patientName,
  doctorName: prescriptionsTable.doctorName,
  attachmentUrl: prescriptionsTable.attachmentUrl,
  status: prescriptionsTable.status,
  verifiedBy: prescriptionsTable.verifiedBy,
  notes: prescriptionsTable.notes,
  maxRefills: prescriptionsTable.maxRefills,
  refillsUsed: prescriptionsTable.refillsUsed,
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

router.post("/prescriptions", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const parsed = CreatePrescriptionBodyExt.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  if (parsed.data.attachmentUrl && parsed.data.attachmentUrl.length > MAX_ATTACHMENT_BYTES) {
    res.status(400).json({ error: "Attachment is too large. Please use a smaller image or PDF (under ~5MB)." });
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
      attachmentUrl: parsed.data.attachmentUrl ?? null,
      notes: parsed.data.notes ?? null,
      maxRefills: parsed.data.maxRefills ?? 0,
    }).returning();
    await logAudit(req.auth!.userId, "create", "prescription", row.id, `Created prescription #${row.id}${row.patientName ? ` for ${row.patientName}` : ""}.`);
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

const AttachmentBody = z.object({ attachmentUrl: z.string().min(1) });

router.patch("/prescriptions/:id/attachment", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const params = GetPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = AttachmentBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  if (parsed.data.attachmentUrl.length > MAX_ATTACHMENT_BYTES) {
    res.status(400).json({ error: "Attachment is too large. Please use a smaller image or PDF (under ~5MB)." });
    return;
  }
  try {
    const [row] = await db
      .update(prescriptionsTable)
      .set({ attachmentUrl: parsed.data.attachmentUrl })
      .where(eq(prescriptionsTable.id, params.data.id))
      .returning();
    if (!row) { res.status(404).json({ error: "Prescription not found." }); return; }
    await logAudit(req.auth!.userId, "update", "prescription", row.id, `Updated prescription #${row.id} attachment.`);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to save attachment.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/prescriptions/:id/verify", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = VerifyPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = VerifyPrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [existing] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Prescription not found." }); return; }
    if (existing.status !== "pending") {
      res.status(409).json({ error: `This prescription has already been ${existing.status}.` });
      return;
    }
    const [row] = await db
      .update(prescriptionsTable)
      .set({ status: "verified", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
      .where(eq(prescriptionsTable.id, params.data.id))
      .returning();
    res.json(row);
    logAudit(req.auth!.userId, "prescription.verify", "prescription", row.id, `Verified prescription #${row.id}${row.patientName ? ` for ${row.patientName}` : ""}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to verify prescription.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/prescriptions/:id/reject", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = RejectPrescriptionParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = RejectPrescriptionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [existing] = await db.select().from(prescriptionsTable).where(eq(prescriptionsTable.id, params.data.id));
    if (!existing) { res.status(404).json({ error: "Prescription not found." }); return; }
    if (existing.status !== "pending") {
      res.status(409).json({ error: `This prescription has already been ${existing.status}.` });
      return;
    }
    const [row] = await db
      .update(prescriptionsTable)
      .set({ status: "rejected", verifiedBy: req.auth!.userId, notes: parsed.data.notes ?? null })
      .where(eq(prescriptionsTable.id, params.data.id))
      .returning();
    res.json(row);
    logAudit(req.auth!.userId, "prescription.reject", "prescription", row.id, `Rejected prescription #${row.id}${row.patientName ? ` for ${row.patientName}` : ""}${parsed.data.notes ? ` — reason: ${parsed.data.notes}` : ""}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to reject prescription.", detail: getDbErrorMessage(err) });
  }
});

export default router;
