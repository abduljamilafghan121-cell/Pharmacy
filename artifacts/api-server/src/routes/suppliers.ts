import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, suppliersTable } from "@workspace/db";
import { CreateSupplierBody, UpdateSupplierBody, GetSupplierParams, UpdateSupplierParams, DeleteSupplierParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

const router: IRouter = Router();

router.get("/suppliers", requireAuth, requireRole("admin", "pharmacist"), async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load suppliers.", detail: getDbErrorMessage(err) });
  }
});

router.post("/suppliers", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateSupplierBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const [row] = await db.insert(suppliersTable).values(parsed.data).returning();
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to add supplier.", detail: getDbErrorMessage(err) });
  }
});

router.get("/suppliers/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = GetSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [row] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, params.data.id));
    if (!row) { res.status(404).json({ error: "Supplier not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to load supplier.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/suppliers/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = UpdateSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = UpdateSupplierBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [row] = await db.update(suppliersTable).set(parsed.data).where(eq(suppliersTable.id, params.data.id)).returning();
    if (!row) { res.status(404).json({ error: "Supplier not found." }); return; }
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update supplier.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/suppliers/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteSupplierParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    await db.delete(suppliersTable).where(eq(suppliersTable.id, params.data.id));
    res.sendStatus(204);
  } catch (err) {
    res.status(500).json({ error: "Failed to delete supplier.", detail: getDbErrorMessage(err) });
  }
});

export default router;
