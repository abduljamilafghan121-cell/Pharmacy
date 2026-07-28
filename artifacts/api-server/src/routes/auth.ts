import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { signToken, requireAuth, requireRole } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { formatZodError, getDbErrorMessage } from "../lib/api-errors";

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
      isActive: usersTable.isActive,
      createdAt: usersTable.createdAt,
    });
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
    res.json(user);
  } catch (err) {
    logger.error({ err }, "users: failed to update staff account");
    res.status(500).json({ error: "Failed to update account.", detail: getDbErrorMessage(err) });
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
    res.json({ message: `Password for ${user.name} has been reset.` });
  } catch (err) {
    logger.error({ err }, "users: failed to reset password");
    res.status(500).json({ error: "Failed to reset password.", detail: getDbErrorMessage(err) });
  }
});

export default router;
