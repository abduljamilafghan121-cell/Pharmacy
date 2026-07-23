import { Router, type IRouter } from "express";
import { eq, ilike } from "drizzle-orm";
import { db, patientsTable } from "@workspace/db";
import { CreatePatientBody, GetPatientParams, UpdatePatientParams, UpdatePatientBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/patients", requireAuth, async (req, res): Promise<void> => {
  const search = req.query["search"] as string | undefined;
  const rows = search
    ? await db.select().from(patientsTable).where(ilike(patientsTable.name, `%${search}%`)).orderBy(patientsTable.name)
    : await db.select().from(patientsTable).orderBy(patientsTable.name);
  res.json(rows);
});

router.post("/patients", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.insert(patientsTable).values(parsed.data).returning();
  res.status(201).json(row);
});

router.get("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db.select().from(patientsTable).where(eq(patientsTable.id, params.data.id));
  if (!row) { res.status(404).json({ error: "Patient not found" }); return; }
  res.json(row);
});

router.patch("/patients/:id", requireAuth, async (req, res): Promise<void> => {
  const params = UpdatePatientParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePatientBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db.update(patientsTable).set(parsed.data).where(eq(patientsTable.id, params.data.id)).returning();
  if (!row) { res.status(404).json({ error: "Patient not found" }); return; }
  res.json(row);
});

export default router;
