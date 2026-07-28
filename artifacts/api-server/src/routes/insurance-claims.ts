import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, insuranceClaimsTable, ordersTable, usersTable } from "@workspace/db";
import { z } from "zod";
import { requireAuth, requireRole } from "../middlewares/auth";
import { getDbErrorMessage } from "../lib/api-errors";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const CLAIM_SELECT = {
  id: insuranceClaimsTable.id,
  orderId: insuranceClaimsTable.orderId,
  providerName: insuranceClaimsTable.providerName,
  policyNumber: insuranceClaimsTable.policyNumber,
  claimAmount: insuranceClaimsTable.claimAmount,
  status: insuranceClaimsTable.status,
  submittedBy: insuranceClaimsTable.submittedBy,
  submittedByName: usersTable.name,
  submittedAt: insuranceClaimsTable.submittedAt,
  resolvedAt: insuranceClaimsTable.resolvedAt,
  notes: insuranceClaimsTable.notes,
};

router.get("/insurance-claims", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  try {
    const status = req.query["status"] as string | undefined;
    const rows = await db
      .select(CLAIM_SELECT)
      .from(insuranceClaimsTable)
      .leftJoin(usersTable, eq(insuranceClaimsTable.submittedBy, usersTable.id))
      .where(status ? eq(insuranceClaimsTable.status, status as any) : undefined)
      .orderBy(desc(insuranceClaimsTable.submittedAt));
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: "Failed to load insurance claims.", detail: getDbErrorMessage(err) });
  }
});

router.get("/insurance-claims/:id", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id." }); return; }
  try {
    const [claim] = await db
      .select(CLAIM_SELECT)
      .from(insuranceClaimsTable)
      .leftJoin(usersTable, eq(insuranceClaimsTable.submittedBy, usersTable.id))
      .where(eq(insuranceClaimsTable.id, id));
    if (!claim) { res.status(404).json({ error: "Claim not found." }); return; }
    res.json(claim);
  } catch (err) {
    res.status(500).json({ error: "Failed to load claim.", detail: getDbErrorMessage(err) });
  }
});

const CreateClaimBody = z.object({
  orderId: z.number().int().positive(),
  providerName: z.string().min(1),
  policyNumber: z.string().optional(),
  claimAmount: z.number().positive(),
  notes: z.string().optional(),
});

router.post("/insurance-claims", requireAuth, requireRole("admin", "pharmacist", "cashier"), async (req, res): Promise<void> => {
  const parsed = CreateClaimBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  try {
    const [order] = await db.select({ id: ordersTable.id, total: ordersTable.total }).from(ordersTable).where(eq(ordersTable.id, parsed.data.orderId));
    if (!order) { res.status(404).json({ error: "Sale not found." }); return; }

    const [claim] = await db.insert(insuranceClaimsTable).values({
      orderId: parsed.data.orderId,
      providerName: parsed.data.providerName,
      policyNumber: parsed.data.policyNumber ?? null,
      claimAmount: parsed.data.claimAmount.toFixed(2),
      submittedBy: req.auth!.userId,
      notes: parsed.data.notes ?? null,
    }).returning();

    res.status(201).json(claim);
    logAudit(req.auth!.userId, "insurance_claim.submit", "insurance_claim", claim.id,
      `Filed a claim with ${parsed.data.providerName} for ${parsed.data.claimAmount.toFixed(2)} against sale #${parsed.data.orderId}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to submit claim.", detail: getDbErrorMessage(err) });
  }
});

const UpdateClaimBody = z.object({
  status: z.enum(["submitted", "approved", "rejected", "paid"]),
  notes: z.string().optional(),
});

router.patch("/insurance-claims/:id", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) { res.status(400).json({ error: "Invalid id." }); return; }
  const parsed = UpdateClaimBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }

  try {
    const [existing] = await db.select().from(insuranceClaimsTable).where(eq(insuranceClaimsTable.id, id));
    if (!existing) { res.status(404).json({ error: "Claim not found." }); return; }

    const isTerminal = parsed.data.status === "approved" || parsed.data.status === "rejected" || parsed.data.status === "paid";
    const [updated] = await db.update(insuranceClaimsTable).set({
      status: parsed.data.status,
      notes: parsed.data.notes ?? existing.notes,
      resolvedAt: isTerminal ? new Date() : existing.resolvedAt,
    }).where(eq(insuranceClaimsTable.id, id)).returning();

    res.json(updated);
    logAudit(req.auth!.userId, "insurance_claim.update_status", "insurance_claim", id,
      `Updated claim #${id} (${existing.providerName}) from ${existing.status} to ${parsed.data.status}.`);
  } catch (err) {
    res.status(500).json({ error: "Failed to update claim.", detail: getDbErrorMessage(err) });
  }
});

export default router;
