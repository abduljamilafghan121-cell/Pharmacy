import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { eq, and, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { signToken, requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";
import { sendPasswordResetEmail } from "../lib/mailer";
import { logAudit } from "../lib/audit";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  logger.info({ body: { ...req.body, password: "[REDACTED]" } }, "register: request received");

  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ error: parsed.error.flatten() }, "register: validation failed");
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { name, email, password, phone } = parsed.data;
  logger.info({ email }, "register: validation passed, checking for existing user");

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      logger.warn({ email }, "register: public registration blocked after initial setup");
      res.status(403).json({ error: "Public registration is closed. Ask an administrator to create your account." });
      return;
    }

    logger.info({ email }, "register: hashing password");
    const passwordHash = await bcrypt.hash(password, 10);

    logger.info({ email }, "register: inserting user");
    const [user] = await db
      .insert(usersTable)
      .values({ name, email, passwordHash, phone: phone ?? null, role: "admin" })
      .returning();

    logger.info({ userId: user.id, email }, "register: user created successfully");
    const token = signToken({ userId: user.id, role: user.role });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    logger.error({ err, email }, "register: unexpected error");
    res.status(500).json({ error: "Registration failed", detail: getDbErrorMessage(err) });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  const { email, password } = parsed.data;

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user) {
      res.status(401).json({ error: "No account found with that email address." });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Incorrect password. Please try again." });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: "This account has been deactivated. Contact your administrator." });
      return;
    }

    const token = signToken({ userId: user.id, role: user.role });
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    logger.error({ err, email }, "login: unexpected error");
    res.status(500).json({ error: "Login failed. Please try again.", detail: getDbErrorMessage(err) });
  }
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
    if (!user) {
      res.status(404).json({ error: "User account not found." });
      return;
    }
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    logger.error({ err }, "auth/me: unexpected error");
    res.status(500).json({ error: "Failed to load account. Please try again." });
  }
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { name, phone } = req.body as { name?: string; phone?: string };
  if (!name && phone === undefined) {
    res.status(400).json({ error: "Provide at least one field to update (name or phone)." });
    return;
  }
  try {
    const updates: Record<string, string | null> = {};
    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "Name must be a non-empty string." });
        return;
      }
      updates.name = name.trim();
    }
    if (phone !== undefined) {
      updates.phone = phone?.trim() || null;
    }
    const [user] = await db
      .update(usersTable)
      .set(updates)
      .where(eq(usersTable.id, req.auth!.userId))
      .returning();
    res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt });
  } catch (err) {
    logger.error({ err }, "auth/me PATCH: failed to update profile");
    res.status(500).json({ error: "Failed to update profile.", detail: getDbErrorMessage(err) });
  }
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: "currentPassword and newPassword are required." });
    return;
  }
  if (typeof newPassword !== "string" || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
    if (!user) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: "Current password is incorrect." });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, user.id));
    res.json({ message: "Password changed successfully." });
  } catch (err) {
    logger.error({ err }, "auth/change-password: failed");
    res.status(500).json({ error: "Failed to change password.", detail: getDbErrorMessage(err) });
  }
});

router.get("/users", requireAuth, requireRole("admin"), async (_req, res): Promise<void> => {
  try {
    const users = await db
      .select({
        id: usersTable.id,
        name: usersTable.name,
        email: usersTable.email,
        phone: usersTable.phone,
        role: usersTable.role,
        isActive: usersTable.isActive,
        createdAt: usersTable.createdAt,
      })
      .from(usersTable)
      .orderBy(usersTable.createdAt);
    res.json(users);
  } catch (err) {
    logger.error({ err }, "users: failed to list staff");
    res.status(500).json({ error: "Failed to load staff accounts.", detail: getDbErrorMessage(err) });
  }
});

router.post("/users", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  const { name, email, password, phone, role = "pharmacist" } = parsed.data;
  try {
    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      res.status(409).json({ error: "An account with this email already exists." });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const [user] = await db.insert(usersTable).values({
      name,
      email,
      passwordHash,
      phone: phone ?? null,
      role,
    }).returning({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      phone: usersTable.phone,
      role: usersTable.role,
      createdAt: usersTable.createdAt,
    });
    res.status(201).json(user);
    logAudit(req.auth!.userId, "user.create", "user", user.id, `Created ${role} account for ${name} (${email}).`);
  } catch (err) {
    logger.error({ err, email }, "users: failed to create staff account");
    res.status(500).json({ error: "Failed to create staff account.", detail: getDbErrorMessage(err) });
  }
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }
  const { name, phone, role, isActive } = req.body as {
    name?: string; phone?: string | null; role?: "admin" | "pharmacist"; isActive?: boolean;
  };

  try {
    const [target] = await db.select().from(usersTable).where(eq(usersTable.id, id));
    if (!target) { res.status(404).json({ error: "Staff account not found." }); return; }

    // Safety guards against locking yourself (or everyone) out:
    const isSelf = req.auth!.userId === id;
    const isDemotingOrDeactivatingAdmin =
      target.role === "admin" && ((role && role !== "admin") || isActive === false);

    if (isSelf && isActive === false) {
      res.status(400).json({ error: "You can't deactivate your own account." });
      return;
    }
    if (isSelf && role && role !== "admin") {
      res.status(400).json({ error: "You can't remove your own admin access." });
      return;
    }
    if (isDemotingOrDeactivatingAdmin) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(and(eq(usersTable.role, "admin"), eq(usersTable.isActive, true)));
      if (count <= 1) {
        res.status(400).json({ error: "This is the only active administrator — promote or activate another admin first." });
        return;
      }
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) { res.status(400).json({ error: "Name can't be empty." }); return; }
      updates.name = name.trim();
    }
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.isActive = isActive;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "Provide at least one field to update." });
      return;
    }

    const [updated] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning({
      id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone,
      role: usersTable.role, isActive: usersTable.isActive, createdAt: usersTable.createdAt,
    });
    res.json(updated);

    if (isActive === false) {
      logAudit(req.auth!.userId, "user.deactivate", "user", id, `Deactivated staff account for ${target.name} (${target.email}).`);
    } else if (isActive === true) {
      logAudit(req.auth!.userId, "user.reactivate", "user", id, `Reactivated staff account for ${target.name} (${target.email}).`);
    } else {
      const changed = Object.keys(updates).join(", ");
      logAudit(req.auth!.userId, "user.update", "user", id, `Updated ${target.name}'s account (${changed}).`);
    }
  } catch (err) {
    logger.error({ err, id }, "users: failed to update staff account");
    res.status(500).json({ error: "Failed to update staff account.", detail: getDbErrorMessage(err) });
  }
});

router.post("/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: "Invalid user id." });
    return;
  }
  const { newPassword } = req.body as { newPassword?: string };
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }
  try {
    const [target] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, id));
    if (!target) { res.status(404).json({ error: "Staff account not found." }); return; }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, id));
    res.json({ message: "Password reset successfully." });
    logAudit(req.auth!.userId, "user.password_reset_by_admin", "user", id, `Reset password for ${target.name} (${target.email}).`);
  } catch (err) {
    logger.error({ err, id }, "users: failed to reset password");
    res.status(500).json({ error: "Failed to reset password.", detail: getDbErrorMessage(err) });
  }
});

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const { email } = req.body as { email?: string };
  const normalizedEmail = email?.trim().toLowerCase();

  // Always respond the same way whether or not the email exists — otherwise
  // this endpoint becomes a way to check which emails have accounts.
  const genericResponse = { message: "If an account exists for that email, a reset link has been sent." };

  if (!normalizedEmail) {
    res.status(400).json({ error: "Email is required." });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (!user || !user.isActive) {
      res.json(genericResponse);
      return;
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

    await db.update(usersTable)
      .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt })
      .where(eq(usersTable.id, user.id));

    const appOrigin = (req.headers["origin"] as string) || `${req.protocol}://${req.headers["host"]}`;
    const resetLink = `${appOrigin}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail(user.email, resetLink);

    // No real email provider is wired up yet (see lib/mailer.ts) — surface
    // the link directly outside production so the flow is testable without
    // one. This must never happen in production, since it would let anyone
    // reset any account just by knowing their email.
    const devPayload = process.env["NODE_ENV"] !== "production" ? { resetLink } : {};
    res.json({ ...genericResponse, ...devPayload });
  } catch (err) {
    logger.error({ err }, "forgot-password: failed");
    res.status(500).json({ error: "Something went wrong. Please try again.", detail: getDbErrorMessage(err) });
  }
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token) {
    res.status(400).json({ error: "Reset token is required." });
    return;
  }
  if (!newPassword || newPassword.length < 6) {
    res.status(400).json({ error: "New password must be at least 6 characters." });
    return;
  }

  try {
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const [user] = await db.select().from(usersTable).where(eq(usersTable.resetTokenHash, tokenHash));

    if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      res.status(400).json({ error: "This reset link is invalid or has expired. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await db.update(usersTable)
      .set({ passwordHash, resetTokenHash: null, resetTokenExpiresAt: null })
      .where(eq(usersTable.id, user.id));

    res.json({ message: "Password reset successfully. You can now log in." });
  } catch (err) {
    logger.error({ err }, "reset-password: failed");
    res.status(500).json({ error: "Something went wrong. Please try again.", detail: getDbErrorMessage(err) });
  }
});

export default router;
