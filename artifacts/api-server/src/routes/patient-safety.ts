/**
 * Patient Safety Routes
 * ─────────────────────
 * Covers all five safety-critical features:
 *   1. Patient allergy flags        — GET/POST/DELETE /patients/:id/allergies
 *   2. Patient conditions           — GET/POST/DELETE /patients/:id/conditions
 *   3. Drug interaction check       — POST /medicines/check-interactions
 *   4. Drug interaction CRUD        — GET/POST/DELETE /drug-interactions
 *   5. Controlled substance log     — GET /controlled-substance-logs
 *   6. Drug contraindications CRUD  — GET/POST/DELETE /medicines/:id/contraindications
 *   7. Drug contraindication check  — POST /medicines/check-contraindications
 *   (Refill tracking lives in prescriptions.ts + enforced in orders.ts)
 */
import { Router, type IRouter } from "express";
import { eq, and, inArray, or } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  patientsTable,
  patientAllergiesTable,
  patientConditionsTable,
  drugInteractionsTable,
  drugContraindicationsTable,
  controlledSubstanceLogsTable,
  medicinesTable,
  usersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

// ── Helpers ────────────────────────────────────────────────────────────────

function positiveInt(raw: unknown): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Compute age in whole years from a date-string (YYYY-MM-DD) as of today. */
function ageFromDob(dob: string): number {
  const birth = new Date(`${dob}T00:00:00`);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ── Allergies ──────────────────────────────────────────────────────────────

const AllergyBody = z.object({
  allergen: z.string().min(1, "Allergen name is required"),
  severity: z.enum(["mild", "moderate", "severe"]).default("moderate"),
  reaction: z.string().optional(),
});

router.get("/patients/:id/allergies", requireAuth, async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid patient id" }); return; }
  try {
    const rows = await db.select().from(patientAllergiesTable)
      .where(eq(patientAllergiesTable.patientId, id))
      .orderBy(patientAllergiesTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post("/patients/:id/allergies", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid patient id" }); return; }
  const parsed = AllergyBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation error" }); return; }
  try {
    const [patient] = await db.select({ id: patientsTable.id }).from(patientsTable).where(eq(patientsTable.id, id));
    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    const [row] = await db.insert(patientAllergiesTable).values({
      patientId: id,
      allergen: parsed.data.allergen,
      severity: parsed.data.severity,
      reaction: parsed.data.reaction ?? null,
    }).returning();
    await logAudit(req.auth!.userId, "CREATE", "patient", id, `Added allergy "${row.allergen}" (${row.severity}) for patient #${id}.`);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.delete("/patients/:id/allergies/:allergyId", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  const allergyId = positiveInt(req.params["allergyId"]);
  if (!id || !allergyId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [row] = await db.delete(patientAllergiesTable)
      .where(and(eq(patientAllergiesTable.id, allergyId), eq(patientAllergiesTable.patientId, id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Allergy record not found" }); return; }
    await logAudit(req.auth!.userId, "DELETE", "patient", id, `Removed allergy "${row.allergen}" from patient #${id}.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Conditions ─────────────────────────────────────────────────────────────

const ConditionBody = z.object({
  condition: z.string().min(1, "Condition name is required"),
  notes: z.string().optional(),
});

router.get("/patients/:id/conditions", requireAuth, async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid patient id" }); return; }
  try {
    const rows = await db.select().from(patientConditionsTable)
      .where(eq(patientConditionsTable.patientId, id))
      .orderBy(patientConditionsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post("/patients/:id/conditions", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid patient id" }); return; }
  const parsed = ConditionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation error" }); return; }
  try {
    const [patient] = await db.select({ id: patientsTable.id }).from(patientsTable).where(eq(patientsTable.id, id));
    if (!patient) { res.status(404).json({ error: "Patient not found" }); return; }
    const [row] = await db.insert(patientConditionsTable).values({
      patientId: id,
      condition: parsed.data.condition,
      notes: parsed.data.notes ?? null,
    }).returning();
    await logAudit(req.auth!.userId, "CREATE", "patient", id, `Added condition "${row.condition}" for patient #${id}.`);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.delete("/patients/:id/conditions/:conditionId", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  const conditionId = positiveInt(req.params["conditionId"]);
  if (!id || !conditionId) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [row] = await db.delete(patientConditionsTable)
      .where(and(eq(patientConditionsTable.id, conditionId), eq(patientConditionsTable.patientId, id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Condition record not found" }); return; }
    await logAudit(req.auth!.userId, "DELETE", "patient", id, `Removed condition "${row.condition}" from patient #${id}.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Drug Interaction CRUD ──────────────────────────────────────────────────

const InteractionBody = z.object({
  medicine1Id: z.number().int().positive(),
  medicine2Id: z.number().int().positive(),
  severity: z.enum(["minor", "moderate", "major", "contraindicated"]),
  description: z.string().min(1),
});

router.get("/drug-interactions", requireAuth, async (_req, res): Promise<void> => {
  try {
    const rows = await db
      .select({
        id: drugInteractionsTable.id,
        medicine1Id: drugInteractionsTable.medicine1Id,
        medicine2Id: drugInteractionsTable.medicine2Id,
        severity: drugInteractionsTable.severity,
        description: drugInteractionsTable.description,
        createdAt: drugInteractionsTable.createdAt,
      })
      .from(drugInteractionsTable)
      .orderBy(drugInteractionsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post("/drug-interactions", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = InteractionBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation error" }); return; }
  if (parsed.data.medicine1Id === parsed.data.medicine2Id) {
    res.status(400).json({ error: "A medicine cannot interact with itself" });
    return;
  }
  try {
    const [row] = await db.insert(drugInteractionsTable).values(parsed.data).returning();
    await logAudit(req.auth!.userId, "CREATE", "medicine", row.id, `Created drug interaction (${row.severity}) between medicine #${row.medicine1Id} and #${row.medicine2Id}.`);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.delete("/drug-interactions/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [row] = await db.delete(drugInteractionsTable).where(eq(drugInteractionsTable.id, id)).returning();
    if (!row) { res.status(404).json({ error: "Interaction not found" }); return; }
    await logAudit(req.auth!.userId, "DELETE", "medicine", id, `Deleted drug interaction #${id} (medicine #${row.medicine1Id} vs #${row.medicine2Id}).`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Drug Interaction CHECK (called before completing a sale) ───────────────

/**
 * POST /medicines/check-interactions
 * Body: { medicineIds: number[] }
 * Returns all known interactions between any pair in the list.
 */
router.post("/medicines/check-interactions", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({ medicineIds: z.array(z.number().int().positive()).min(2) }).safeParse(req.body);
  if (!parsed.success) { res.json({ interactions: [] }); return; }

  const ids = parsed.data.medicineIds;
  try {
    const interactions = await db
      .select({
        id: drugInteractionsTable.id,
        medicine1Id: drugInteractionsTable.medicine1Id,
        medicine2Id: drugInteractionsTable.medicine2Id,
        severity: drugInteractionsTable.severity,
        description: drugInteractionsTable.description,
      })
      .from(drugInteractionsTable)
      .where(
        or(
          and(inArray(drugInteractionsTable.medicine1Id, ids), inArray(drugInteractionsTable.medicine2Id, ids)),
        )!
      );

    // Enrich with medicine names
    const meds = await db.select({ id: medicinesTable.id, name: medicinesTable.name })
      .from(medicinesTable).where(inArray(medicinesTable.id, ids));
    const nameMap = Object.fromEntries(meds.map(m => [m.id, m.name]));

    const enriched = interactions.map(i => ({
      ...i,
      medicine1Name: nameMap[i.medicine1Id] ?? `Medicine #${i.medicine1Id}`,
      medicine2Name: nameMap[i.medicine2Id] ?? `Medicine #${i.medicine2Id}`,
    }));

    res.json({ interactions: enriched });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Drug Contraindications CRUD ────────────────────────────────────────────

const ContraindicationBody = z.object({
  contraindicationType: z.enum(["condition", "min_age", "max_age", "gender"]),
  value: z.string().min(1, "Value is required"),
  severity: z.enum(["warn", "block"]).default("warn"),
  description: z.string().min(1, "Description is required"),
});

router.get("/medicines/:id/contraindications", requireAuth, async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid medicine id" }); return; }
  try {
    const rows = await db.select().from(drugContraindicationsTable)
      .where(eq(drugContraindicationsTable.medicineId, id))
      .orderBy(drugContraindicationsTable.createdAt);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.post("/medicines/:id/contraindications", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  if (!id) { res.status(400).json({ error: "Invalid medicine id" }); return; }
  const parsed = ContraindicationBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Validation error" }); return; }
  try {
    const [med] = await db.select({ id: medicinesTable.id }).from(medicinesTable).where(eq(medicinesTable.id, id));
    if (!med) { res.status(404).json({ error: "Medicine not found" }); return; }
    const [row] = await db.insert(drugContraindicationsTable).values({
      medicineId: id,
      contraindicationType: parsed.data.contraindicationType,
      value: parsed.data.value,
      severity: parsed.data.severity,
      description: parsed.data.description,
    }).returning();
    await logAudit(req.auth!.userId, "CREATE", "medicine", id, `Added a ${row.contraindicationType} contraindication (${row.value}) for medicine #${id}.`);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

router.delete("/medicines/:id/contraindications/:cid", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = positiveInt(req.params["id"]);
  const cid = positiveInt(req.params["cid"]);
  if (!id || !cid) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [row] = await db.delete(drugContraindicationsTable)
      .where(and(eq(drugContraindicationsTable.id, cid), eq(drugContraindicationsTable.medicineId, id)))
      .returning();
    if (!row) { res.status(404).json({ error: "Contraindication not found" }); return; }
    await logAudit(req.auth!.userId, "DELETE", "medicine", id, `Removed a ${row.contraindicationType} contraindication (${row.value}) from medicine #${id}.`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Drug Contraindication CHECK (called at point of sale) ──────────────────

/**
 * POST /medicines/check-contraindications
 * Body: { medicineIds: number[], patientId: number }
 * Returns any contraindications that apply to the patient for the given medicines.
 */
router.post("/medicines/check-contraindications", requireAuth, async (req, res): Promise<void> => {
  const parsed = z.object({
    medicineIds: z.array(z.number().int().positive()).min(1),
    patientId: z.number().int().positive(),
  }).safeParse(req.body);

  if (!parsed.success) { res.json({ contraindications: [] }); return; }

  const { medicineIds, patientId } = parsed.data;

  try {
    // Fetch patient demographics and conditions in parallel
    const [patientRows, conditions, contraindicationRows, meds] = await Promise.all([
      db.select({ dateOfBirth: patientsTable.dateOfBirth, gender: patientsTable.gender })
        .from(patientsTable).where(eq(patientsTable.id, patientId)),
      db.select({ condition: patientConditionsTable.condition })
        .from(patientConditionsTable).where(eq(patientConditionsTable.patientId, patientId)),
      db.select().from(drugContraindicationsTable)
        .where(inArray(drugContraindicationsTable.medicineId, medicineIds)),
      db.select({ id: medicinesTable.id, name: medicinesTable.name })
        .from(medicinesTable).where(inArray(medicinesTable.id, medicineIds)),
    ]);

    if (contraindicationRows.length === 0) { res.json({ contraindications: [] }); return; }

    const patient = patientRows[0];
    const patientAge = patient?.dateOfBirth ? ageFromDob(patient.dateOfBirth) : null;
    const patientGender = patient?.gender?.toLowerCase() ?? null;
    const patientConditionNames = conditions.map(c => c.condition.toLowerCase());
    const medNameMap = Object.fromEntries(meds.map(m => [m.id, m.name]));

    const hits: Array<{
      id: number;
      medicineId: number;
      medicineName: string;
      contraindicationType: string;
      value: string;
      severity: string;
      description: string;
    }> = [];

    for (const ci of contraindicationRows) {
      let matched = false;

      switch (ci.contraindicationType) {
        case "condition":
          // Match if any patient condition contains the contraindication value (or vice versa)
          matched = patientConditionNames.some(
            pc => pc.includes(ci.value.toLowerCase()) || ci.value.toLowerCase().includes(pc)
          );
          break;
        case "min_age":
          if (patientAge !== null) matched = patientAge < parseInt(ci.value, 10);
          break;
        case "max_age":
          if (patientAge !== null) matched = patientAge > parseInt(ci.value, 10);
          break;
        case "gender":
          if (patientGender) matched = patientGender === ci.value.toLowerCase();
          break;
      }

      if (matched) {
        hits.push({
          id: ci.id,
          medicineId: ci.medicineId,
          medicineName: medNameMap[ci.medicineId] ?? `Medicine #${ci.medicineId}`,
          contraindicationType: ci.contraindicationType,
          value: ci.value,
          severity: ci.severity,
          description: ci.description,
        });
      }
    }

    res.json({ contraindications: hits });
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

// ── Controlled Substance Logs ──────────────────────────────────────────────

router.get("/controlled-substance-logs", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  try {
    const limit = Math.min(Math.max(Number(req.query["limit"]) || 100, 1), 500);
    const offset = Math.max(Number(req.query["offset"]) || 0, 0);

    const rows = await db
      .select({
        id: controlledSubstanceLogsTable.id,
        orderId: controlledSubstanceLogsTable.orderId,
        medicineId: controlledSubstanceLogsTable.medicineId,
        medicineName: medicinesTable.name,
        patientId: controlledSubstanceLogsTable.patientId,
        patientName: controlledSubstanceLogsTable.patientName,
        prescriptionId: controlledSubstanceLogsTable.prescriptionId,
        quantityDispensed: controlledSubstanceLogsTable.quantityDispensed,
        scheduleAtDispensing: controlledSubstanceLogsTable.scheduleAtDispensing,
        dispensedByName: usersTable.name,
        notes: controlledSubstanceLogsTable.notes,
        createdAt: controlledSubstanceLogsTable.createdAt,
      })
      .from(controlledSubstanceLogsTable)
      .leftJoin(medicinesTable, eq(controlledSubstanceLogsTable.medicineId, medicinesTable.id))
      .leftJoin(usersTable, eq(controlledSubstanceLogsTable.dispensedBy, usersTable.id))
      .orderBy(controlledSubstanceLogsTable.createdAt)
      .limit(limit)
      .offset(offset);

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: getDbErrorMessage(err) });
  }
});

export default router;
