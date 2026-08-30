import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { eq, and, gt } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { signToken, requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { logAudit } from "../lib/audit";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";
import { sendPasswordResetEmail } from "../lib/mailer";

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
    await logAudit(user.id, "register", "user", user.id, `Registered user ${user.name} (${user.role}).`);
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

    const token = signToken({ userId: user.id, role: user.role });
    await logAudit(user.id, "login", "user", user.id, `${user.name} logged in.`);
    res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    logger.error({ err, email }, "login: unexpected error");
    res.status(500).json({ error: "Login failed. Please try again.", detail: getDbErrorMessage(err) });
  }
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  try {
    const [user] = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, req.auth!.userId));
    if (user) {
      await logAudit(user.id, "logout", "user", user.id, `${user.name} logged out.`);
    }
    res.status(204).end();
  } catch (err) {
    logger.error({ err }, "logout: unexpected error");
    res.status(204).end();
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
    await logAudit(req.auth!.userId, "update", "user", user.id, `Updated own profile${name ? ` (name → ${name.trim()})` : ""}.`);
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
    await logAudit(user.id, "change_password", "user", user.id, `${user.name} changed their own password.`);
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
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    });
    await logAudit(req.auth!.userId, "create", "user", user.id, `Created staff account ${user.name} (${user.role}).`);
    res.status(201).json(user);
  } catch (err) {
    logger.error({ err, email }, "users: failed to create staff account");
    res.status(500).json({ error: "Failed to create staff account.", detail: getDbErrorMessage(err) });
  }
});

// Edit a staff account (role, name, phone, active status)
const EditUserParams = z.object({ id: z.coerce.number().int().positive() });
const EditUserBody = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().optional().nullable(),
  role: z.enum(["admin", "pharmacist", "cashier", "viewer"]).optional(),
  isActive: z.boolean().optional(),
});

router.patch("/users/:id", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = EditUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const body = EditUserBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: formatZodError(body.error) }); return; }

  try {
    const updates: Record<string, unknown> = {};
    if (body.data.name !== undefined) updates.name = body.data.name;
    if (body.data.phone !== undefined) updates.phone = body.data.phone;
    if (body.data.role !== undefined) updates.role = body.data.role;
    if (body.data.isActive !== undefined) updates.isActive = body.data.isActive;

    if (Object.keys(updates).length === 0) {
      res.status(400).json({ error: "No fields to update." });
      return;
    }

    const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, params.data.id))
      .returning({ id: usersTable.id, name: usersTable.name, email: usersTable.email, phone: usersTable.phone, role: usersTable.role, isActive: usersTable.isActive, createdAt: usersTable.createdAt });
    if (!user) { res.status(404).json({ error: "User not found." }); return; }
    await logAudit(req.auth!.userId, "update", "user", user.id, `Updated staff account ${user.name} (role: ${user.role}, active: ${user.isActive}).`);
    res.json(user);
  } catch (err) {
    logger.error({ err }, "users: failed to update staff account");
    res.status(500).json({ error: "Failed to update account.", detail: getDbErrorMessage(err) });
  }
});

// ── Self-service forgot / reset password ─────────────────────────────────────

const ForgotPasswordBody = z.object({ email: z.string().email() });

router.post("/auth/forgot-password", async (req, res): Promise<void> => {
  const parsed = ForgotPasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }
  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, isActive: usersTable.isActive })
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email));

    // Always respond the same way regardless of whether the email exists —
    // this avoids leaking which email addresses are registered.
    if (!user || !user.isActive) {
      res.json({ message: "If an account exists for that email, a reset link has been sent." });
      return;
    }

    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await db.update(usersTable)
      .set({ resetTokenHash: tokenHash, resetTokenExpiresAt: expiresAt })
      .where(eq(usersTable.id, user.id));

    await logAudit(user.id, "reset_password", "user", user.id, `A password reset link was requested for ${user.email}.`);

    // Construct the reset URL from APP_URL — set this to your Vercel deployment
    // URL (e.g. https://pharmacore.vercel.app) in your environment variables.
    // Token format "<userId>.<rawToken>" lets the reset route look up the user
    // directly without a full-table scan.
    const appBase = process.env["APP_URL"];
    if (!appBase) {
      logger.error("forgot-password: APP_URL is not set — cannot generate reset link");
      res.status(500).json({ error: "Failed to process request." });
      return;
    }
    const resetLink = `${appBase}/reset-password?token=${user.id}.${rawToken}`;

    logger.info({ userId: user.id }, "forgot-password: reset token issued, sending email");

    // Send the reset email. If the mailer throws (e.g. bad credentials, SMTP
    // timeout) we log the failure but still return the standard success message
    // — the token is already stored so the user can retry the request.
    try {
      await sendPasswordResetEmail(user.email, resetLink);
    } catch (mailErr) {
      logger.error({ err: mailErr, userId: user.id }, "forgot-password: email delivery failed");
    }

    // Always return the same message regardless of outcome — prevents leaking
    // whether an email was sent or which address is registered.
    res.json({ message: "If an account exists for that email, a reset link has been sent." });
  } catch (err) {
    logger.error({ err }, "forgot-password: failed");
    res.status(500).json({ error: "Failed to process request.", detail: getDbErrorMessage(err) });
  }
});

const ResetPasswordTokenBody = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(6),
});

router.post("/auth/reset-password", async (req, res): Promise<void> => {
  const parsed = ResetPasswordTokenBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: formatZodError(parsed.error) });
    return;
  }

  // Token format: "<userId>.<rawToken>"
  const dotIndex = parsed.data.token.indexOf(".");
  if (dotIndex === -1) {
    res.status(400).json({ error: "Invalid or expired reset link." });
    return;
  }
  const userId = parseInt(parsed.data.token.slice(0, dotIndex), 10);
  const rawToken = parsed.data.token.slice(dotIndex + 1);
  if (!userId || !rawToken) {
    res.status(400).json({ error: "Invalid or expired reset link." });
    return;
  }

  try {
    const [user] = await db
      .select({ id: usersTable.id, resetTokenHash: usersTable.resetTokenHash, resetTokenExpiresAt: usersTable.resetTokenExpiresAt })
      .from(usersTable)
      .where(and(eq(usersTable.id, userId), gt(usersTable.resetTokenExpiresAt, new Date())));

    if (!user || !user.resetTokenHash) {
      res.status(400).json({ error: "This reset link has expired or already been used. Please request a new one." });
      return;
    }

    const valid = await bcrypt.compare(rawToken, user.resetTokenHash);
    if (!valid) {
      res.status(400).json({ error: "This reset link has expired or already been used. Please request a new one." });
      return;
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.update(usersTable)
      .set({ passwordHash, resetTokenHash: null, resetTokenExpiresAt: null })
      .where(eq(usersTable.id, user.id));

    logger.info({ userId: user.id }, "reset-password: password updated");
    await logAudit(user.id, "reset_password", "user", user.id, "Password reset via emailed link was completed.");
    res.json({ message: "Password has been reset. You can now log in with your new password." });
  } catch (err) {
    logger.error({ err }, "reset-password: failed");
    res.status(500).json({ error: "Failed to reset password.", detail: getDbErrorMessage(err) });
  }
});

// Admin resets another user's password
const ResetPasswordBody = z.object({ newPassword: z.string().min(6) });

router.post("/users/:id/reset-password", requireAuth, requireRole("admin"), async (req, res): Promise<void> => {
  const params = EditUserParams.safeParse(req.params);
  if (!params.success) { res.status(400).json({ error: formatZodError(params.error) }); return; }
  const body = ResetPasswordBody.safeParse(req.body);
  if (!body.success) { res.status(400).json({ error: formatZodError(body.error) }); return; }

  try {
    const passwordHash = await bcrypt.hash(body.data.newPassword, 10);
    const [user] = await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, params.data.id))
      .returning({ id: usersTable.id, name: usersTable.name });
    if (!user) { res.status(404).json({ error: "User not found." }); return; }
    logger.info({ userId: params.data.id, by: req.auth!.userId }, "admin reset password for user");
    await logAudit(req.auth!.userId, "reset_password", "user", params.data.id, `Admin reset password for ${user.name}.`);
    res.json({ message: `Password for ${user.name} has been reset.` });
  } catch (err) {
    logger.error({ err }, "users: failed to reset password");
    res.status(500).json({ error: "Failed to reset password.", detail: getDbErrorMessage(err) });
  }
});

export default router;
