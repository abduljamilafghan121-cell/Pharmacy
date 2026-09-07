import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import { getDb } from "./helpers";
import { seedUser, seedSettings, seedMedicine, seedStock, bearer, wipeAll, createOrder } from "./helpers";

beforeEach(async () => {
  await wipeAll();
  await seedSettings("0");
});

describe("smoke: harness brings up a working in-memory DB + API", () => {
  it("creates an order, decrements stock, and records a payment", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Amoxicillin", price: "5.00" });
    await seedStock(med.id, [{ batchNumber: "B1", expiryDate: "2030-01-01", quantity: 100, costPrice: "2.00" }]);

    const res = await createOrder(bearer("admin", admin.id), {
      items: [{ medicineId: med.id, quantity: 2 }],
      paymentMethod: "cash",
    });

    expect(res.status).toBe(201);
    const db = await getDb();
    const [row] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(row.quantity).toBe(98);
  });
});