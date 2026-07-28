import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, pharmacySettingsTable, upsertPharmacySettingsSchema } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

const SETTINGS_ID = 1;

// Logos are sent as base64 data URIs — cap well above a typical small PNG/SVG
// logo but well below anything that would bloat the DB row unreasonably.
const MAX_LOGO_BYTES = 2 * 1024 * 1024; // ~2MB

async function getOrCreateSettings() {
  const [existing] = await db.select().from(pharmacySettingsTable).where(eq(pharmacySettingsTable.id, SETTINGS_ID));
  if (existing) return existing;
  const [created] = await db.insert(pharmacySettingsTable).values({ id: SETTINGS_ID }).returning();
  return created;
}

// Public on purpose: this is the pharmacy's own public-facing branding/
// contact info (same as what's printed on receipts customers take home),
// and it's needed on the Login page before anyone has authenticated.
router.get("/settings", async (_req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(settings);
});

// Only admins can update pharmacy branding/contact info.
router.patch("/settings", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = upsertPharmacySettingsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.logoUrl && parsed.data.logoUrl.length > MAX_LOGO_BYTES) {
    res.status(400).json({ error: "Logo image is too large. Please use a smaller file (under ~2MB)." });
    return;
  }

  await getOrCreateSettings(); // ensure row exists before update

  const [updated] = await db
    .update(pharmacySettingsTable)
    .set(parsed.data)
    .where(eq(pharmacySettingsTable.id, SETTINGS_ID))
    .returning();

  res.json(updated);
  logAudit(req.auth!.userId, "settings.update", "pharmacy_settings", SETTINGS_ID, `Updated pharmacy details (${Object.keys(parsed.data).join(", ")}).`);
});

export default router;
