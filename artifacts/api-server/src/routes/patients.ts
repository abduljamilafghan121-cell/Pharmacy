import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import { CreatePatientBody, GetPatientParams, UpdatePatientParams, UpdatePatientBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/patients", requireAuth, async (req, res): Promise<void> => {
  try {
    const search = req.query["search"] as string | undefined;
    const rows = search
      ? await db.select().from(patientsTable).where(ilike(patientsTable.name, `%${search}%`)).orderBy(patientsTable.name)
      : await db.select().from(patientsTable).orderBy(patientsTable.name);
    res.json(rows);
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

export default router;
