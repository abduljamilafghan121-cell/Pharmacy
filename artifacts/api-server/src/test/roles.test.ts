import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import { getDb } from "./helpers";
import {
  api, bearer, wipeAll, seedSettings, seedUser, seedMedicine, seedStock, createOrder,
} from "./helpers";

beforeEach(async () => {
  await wipeAll();
  await seedSettings("0");
});

describe("viewer is read-only across write routes", () => {
  it("blocks viewer from creating orders but lets cashier check out", async () => {
    const viewer = await seedUser("viewer");
    const cashier = await seedUser("cashier");
    const med = await seedMedicine({ name: "Metformin", price: "3.00" });
    await seedStock(med.id, [{ batchNumber: "B1", expiryDate: "2030-01-01", quantity: 100, costPrice: "1.00" }]);

    const denied = await createOrder(bearer("viewer", viewer.id), {
      items: [{ medicineId: med.id, quantity: 1 }],
      paymentMethod: "cash",
    });
    expect(denied.status).toBe(403);

    const allowed = await createOrder(bearer("cashier", cashier.id), {
      items: [{ medicineId: med.id, quantity: 1 }],
      paymentMethod: "cash",
    });
    expect(allowed.status).toBe(201);
  });

  it("blocks viewer from cancelling an order", async () => {
    const admin = await seedUser("admin");
    const viewer = await seedUser("viewer");
    const med = await seedMedicine({ name: "Lisinopril", price: "4.00" });
    await seedStock(med.id, [{ batchNumber: "B3", expiryDate: "2030-01-01", quantity: 100, costPrice: "1.00" }]);

    const created = await createOrder(bearer("admin", admin.id), {
      items: [{ medicineId: med.id, quantity: 1 }],
      paymentMethod: "cash",
    });
    expect(created.status).toBe(201);

    const cancel = await api
      .patch(`/api/orders/${created.body.id}/status`)
      .set("Authorization", bearer("viewer", viewer.id))
      .send({ status: "cancelled", refundNote: "viewer should not be able to cancel" });
    expect(cancel.status).toBe(403);
  });

  it("blocks viewer from refunding an order item", async () => {
    const admin = await seedUser("admin");
    const viewer = await seedUser("viewer");
    const med = await seedMedicine({ name: "Atorvastatin", price: "6.00" });
    await seedStock(med.id, [{ batchNumber: "B4", expiryDate: "2030-01-01", quantity: 100, costPrice: "2.00" }]);

    const created = await createOrder(bearer("admin", admin.id), {
      items: [{ medicineId: med.id, quantity: 2 }],
      paymentMethod: "cash",
    });
    expect(created.status).toBe(201);
    const itemId = created.body.items[0].id;

    const ret = await api
      .post(`/api/orders/${created.body.id}/items/${itemId}/return`)
      .set("Authorization", bearer("viewer", viewer.id))
      .send({ quantity: 1, reason: "viewer should not be able to refund" });
    expect(ret.status).toBe(403);
  });

  it("blocks viewer from recording a payment", async () => {
    const viewer = await seedUser("viewer");
    const res = await api
      .post("/api/payments")
      .set("Authorization", bearer("viewer", viewer.id))
      .send({ orderId: 1, method: "cash", amount: "5.00" });
    expect(res.status).toBe(403);
  });

  it("blocks viewer from creating, counting, or finalizing stocktakes", async () => {
    const admin = await seedUser("admin");
    const viewer = await seedUser("viewer");
    const med = await seedMedicine({ name: "Amlodipine", price: "5.00" });
    await seedStock(med.id, [{ batchNumber: "B5", expiryDate: "2030-01-01", quantity: 100, costPrice: "1.00" }]);

    const viewerCreate = await api.post("/api/stocktakes").set("Authorization", bearer("viewer", viewer.id)).send({});
    expect(viewerCreate.status).toBe(403);

    const adminCreate = await api.post("/api/stocktakes").set("Authorization", bearer("admin", admin.id)).send({ reference: "ST-test" });
    expect(adminCreate.status).toBe(201);
    const stocktakeId = adminCreate.body.id;

    const db = await getDb();
    const [item] = await db.select().from(schema.stocktakeItemsTable).where(eq(schema.stocktakeItemsTable.stocktakeId, stocktakeId));
    expect(item).toBeDefined();

    const count = await api
      .patch(`/api/stocktakes/${stocktakeId}/items/${item.id}`)
      .set("Authorization", bearer("viewer", viewer.id))
      .send({ countedQuantity: 50 });
    expect(count.status).toBe(403);

    const finalize = await api
      .post(`/api/stocktakes/${stocktakeId}/finalize`)
      .set("Authorization", bearer("viewer", viewer.id))
      .send({});
    expect(finalize.status).toBe(403);
  });

  it("lets viewer read stocktakes", async () => {
    const admin = await seedUser("admin");
    const viewer = await seedUser("viewer");
    const list = await api.get("/api/stocktakes").set("Authorization", bearer("viewer", viewer.id));
    expect(list.status).toBe(200);
  });
});

describe("role changes take effect immediately on an existing token", () => {
  it("loses and regains admin powers via DB role without re-login", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Demote Me", price: "2.00" });
    await seedStock(med.id, [{ batchNumber: "B6", expiryDate: "2030-01-01", quantity: 100, costPrice: "0.50" }]);
    const adminToken = bearer("admin", admin.id);

    expect((await createOrder(adminToken, { items: [{ medicineId: med.id, quantity: 1 }], paymentMethod: "cash" })).status).toBe(201);

    const db = await getDb();
    await db.update(schema.usersTable).set({ role: "viewer" }).where(eq(schema.usersTable.id, admin.id));

    const denied = await createOrder(adminToken, { items: [{ medicineId: med.id, quantity: 1 }], paymentMethod: "cash" });
    expect(denied.status).toBe(403);

    const canStillRead = await api.get("/api/orders").set("Authorization", adminToken);
    expect(canStillRead.status).toBe(200);

    await db.update(schema.usersTable).set({ role: "admin" }).where(eq(schema.usersTable.id, admin.id));

    const restored = await createOrder(adminToken, { items: [{ medicineId: med.id, quantity: 1 }], paymentMethod: "cash" });
    expect(restored.status).toBe(201);
  });
});

describe("public registration is only for the first admin", () => {
  it("creates the first admin on an empty system", async () => {
    const res = await api.post("/api/auth/register").send({
      name: "First Admin",
      email: "first@test.local",
      password: "secret123",
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("admin");
  });

  it("is closed once any account exists", async () => {
    await seedUser("admin");
    const res = await api.post("/api/auth/register").send({
      name: "Intruder",
      email: "intruder@test.local",
      password: "secret123",
    });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/registration is closed/i);
  });

  it("rejects a duplicate email as a conflict", async () => {
    const first = await api.post("/api/auth/register").send({
      name: "A",
      email: "dup@test.local",
      password: "secret123",
    });
    expect(first.status).toBe(201);

    const dup = await api.post("/api/auth/register").send({
      name: "B",
      email: "dup@test.local",
      password: "secret123",
    });
    expect(dup.status).toBe(409);
  });
});

describe("category listing requires authentication", () => {
  it("returns 401 without a token and 200 for a viewer", async () => {
    expect((await api.get("/api/categories")).status).toBe(401);

    const viewer = await seedUser("viewer");
    const res = await api.get("/api/categories").set("Authorization", bearer("viewer", viewer.id));
    expect(res.status).toBe(200);
  });
});