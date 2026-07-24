import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterUserBody, LoginUserBody } from "@workspace/api-zod";
import { signToken, requireAuth } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  logger.info({ body: { ...req.body, password: "[REDACTED]" } }, "register: request received");

  const parsed = RegisterUserBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ error: parsed.error.flatten() }, "register: validation failed");
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, email, password, phone } = parsed.data;
  logger.info({ email }, "register: validation passed, checking for existing user");

  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      logger.warn({ email }, "register: email already registered");
      res.status(409).json({ error: "Email already registered" });
      return;
    }

    logger.info({ email }, "register: hashing password");
    const passwordHash = await bcrypt.hash(password, 10);

    logger.info({ email }, "register: inserting user");
    const [user] = await db.insert(usersTable).values({ name, email, passwordHash, phone: phone ?? null, role: parsed.data.role ?? "pharmacist" }).returning();

    logger.info({ userId: user.id, email }, "register: user created successfully");
    const token = signToken({ userId: user.id, role: user.role });
    res.status(201).json({
      token,
      user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    logger.error({ err, email }, "register: unexpected error");
    res.status(500).json({ error: "Registration failed", detail: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken({ userId: user.id, role: user.role });
  res.json({
    token,
    user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt },
  });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.auth!.userId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role, createdAt: user.createdAt });
});

export default router;
