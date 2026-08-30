import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { CreateCategoryBody, UpdateCategoryBody, UpdateCategoryParams, DeleteCategoryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { formatZodError, getDbErrorMessage, getDeleteErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  try {
    const rows = await db.select().from(categoriesTable).orderBy(categoriesTable.name);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load categories.", detail: getDbErrorMessage(err) });
  }
});

router.post("/categories", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const parsed = CreateCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const [row] = await db.insert(categoriesTable).values(parsed.data).returning();
    await logAudit(req.auth!.userId, "create", "category", row.id, `Created category ${row.name}.`);
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to create category.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/categories/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const params = UpdateCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const parsed = UpdateCategoryBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: formatZodError(parsed.error) }); return; }
  try {
    const [row] = await db.update(categoriesTable).set(parsed.data).where(eq(categoriesTable.id, params.data.id)).returning();
    if (!row) { res.status(404).json({ error: "Category not found." }); return; }
    await logAudit(req.auth!.userId, "update", "category", row.id, `Updated category ${row.name}.`);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: "Failed to update category.", detail: getDbErrorMessage(err) });
  }
});

router.delete("/categories/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = DeleteCategoryParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  try {
    const [existing] = await db.select({ id: categoriesTable.id, name: categoriesTable.name }).from(categoriesTable).where(eq(categoriesTable.id, params.data.id));
    await db.delete(categoriesTable).where(eq(categoriesTable.id, params.data.id));
    if (existing) {
      await logAudit(req.auth!.userId, "delete", "category", existing.id, `Deleted category ${existing.name}.`);
    }
    res.sendStatus(204);
  } catch (err) {
    res.status(409).json({ error: getDeleteErrorMessage(err, "category") });
  }
});

export default router;
