import { describe, it, expect, beforeEach } from "vitest";
import { eq } from "drizzle-orm";
import * as schema from "@workspace/db/schema";
import { api, getDb, bearer, wipeAll, seedSettings, seedUser, seedMedicine, seedSupplier, seedStock, seedMedicineUnit, createPurchaseOrder, receivePurchaseOrder } from "./helpers";

beforeEach(async () => {
  await wipeAll();
  await seedSettings("0");
});

describe("purchase order lifecycle", () => {
  it("creates a purchase order with base units and computes the total", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Paracetamol", price: "5.00" });
    const supplier = await seedSupplier();

    const res = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "2.50" }],
    });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("pending");
    expect(Number(res.body.total)).toBe(25);
    expect(res.body.supplierName).toBe("Test Supplier");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].medicineName).toBe("Paracetamol");
    expect(res.body.items[0].unitName).toBeNull();
    expect(res.body.items[0].conversionFactorToBase).toBe(1);
    expect(Number(res.body.items[0].unitPrice)).toBe(2.5);

    const db = await getDb();
    const [po] = await db.select().from(schema.purchaseOrdersTable).where(eq(schema.purchaseOrdersTable.id, res.body.id));
    expect(po.status).toBe("pending");
    expect(Number(po.total)).toBe(25);
  });

  it("creates a purchase order in a secondary unit and stores the conversion factor", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Augmentin", price: "5.00" });
    const supplier = await seedSupplier();
    const box = await seedMedicineUnit(med.id, "Box", 10, { sellPrice: "45.00" });

    const res = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 3, unitId: box.id, unitPrice: "45.00" }],
    });

    expect(res.status).toBe(201);
    expect(Number(res.body.total)).toBe(135);
    expect(res.body.items[0].unitName).toBe("Box");
    expect(res.body.items[0].conversionFactorToBase).toBe(10);
  });

  it("rejects a purchase order with no items", async () => {
    const admin = await seedUser("admin");
    const supplier = await seedSupplier();

    const res = await api
      .post("/api/purchase-orders")
      .set("Authorization", bearer("admin", admin.id))
      .send({ supplierId: supplier.id, items: [] });

    expect(res.status).toBe(400);
  });

  it("lists purchase orders with supplier names and item counts", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Aspirin", price: "3.00" });
    const supplier = await seedSupplier("Acme Pharma");

    for (const qty of [5, 7]) {
      const r = await createPurchaseOrder(bearer("admin", admin.id), {
        supplierId: supplier.id,
        items: [{ medicineId: med.id, quantity: qty, unitPrice: "1.00" }],
      });
      expect(r.status).toBe(201);
    }

    const res = await api.get("/api/purchase-orders").set("Authorization", bearer("admin", admin.id));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    for (const po of res.body) {
      expect(po.supplierName).toBe("Acme Pharma");
      expect(po.itemCount).toBe(1);
    }
  });

  it("returns purchase order details and 404 for unknown orders", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Ibuprofen", price: "3.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 4, unitPrice: "1.50" }],
    });
    expect(created.status).toBe(201);

    const got = await api.get(`/api/purchase-orders/${created.body.id}`).set("Authorization", bearer("admin", admin.id));
    expect(got.status).toBe(200);
    expect(got.body.items[0].quantity).toBe(4);

    const missing = await api.get("/api/purchase-orders/999999").set("Authorization", bearer("admin", admin.id));
    expect(missing.status).toBe(404);
  });

  it("records supplier price history newest first", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Ciprofloxacin", price: "4.00" });
    const supplier = await seedSupplier("MedSource");

    const po1 = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "1.00" }],
    });
    const po2 = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "2.00" }],
    });
    expect(po1.status).toBe(201);
    expect(po2.status).toBe(201);

    const res = await api.get(`/api/purchase-orders/price-history?medicineId=${med.id}`).set("Authorization", bearer("admin", admin.id));
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(Number(res.body[0].unitPrice)).toBe(2);
    expect(res.body[0].supplierName).toBe("MedSource");
    expect(res.body[0].status).toBe("pending");
    expect(res.body[1]).toBeDefined();
    expect(Number(res.body[1].unitPrice)).toBe(1);

    const missing = await api.get("/api/purchase-orders/price-history").set("Authorization", bearer("admin", admin.id));
    expect(missing.status).toBe(400);
  });

  it("receives a purchase order, creating a new batch and updating stock", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Amoxicillin", price: "5.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "2.50" }],
    });
    expect(created.status).toBe(201);

    const res = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id, [
      { medicineId: med.id, batchNumber: "NEW-01", expiryDate: "2031-01-01" },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("received");

    const db = await getDb();
    const [medRow] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(medRow.quantity).toBe(10);

    const [batch] = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batch.batchNumber).toBe("NEW-01");
    expect(batch.expiryDate).toBe("2031-01-01");
    expect(batch.quantity).toBe(10);
    expect(Number(batch.costPrice)).toBe(2.5);
    expect(batch.supplierId).toBe(supplier.id);
    expect(batch.purchaseOrderId).toBe(created.body.id);

    const [po] = await db.select().from(schema.purchaseOrdersTable).where(eq(schema.purchaseOrdersTable.id, created.body.id));
    expect(po.status).toBe("received");
  });

  it("receives without overrides, creating an anonymous batch", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Diazepam", price: "2.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 6, unitPrice: "0.80" }],
    });
    expect(created.status).toBe(201);

    const res = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(res.status).toBe(200);

    const db = await getDb();
    const [medRow] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(medRow.quantity).toBe(6);

    const [batch] = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batch.quantity).toBe(6);
    expect(batch.batchNumber).toBeNull();
  });

  it("scales received stock by the unit conversion factor", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Omeprazole", price: "10.00" });
    const supplier = await seedSupplier();
    const box = await seedMedicineUnit(med.id, "Box", 10, { sellPrice: "45.00" });

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 5, unitId: box.id, unitPrice: "45.00" }],
    });
    expect(created.status).toBe(201);

    const res = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(res.status).toBe(200);

    const db = await getDb();
    const [medRow] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(medRow.quantity).toBe(50);

    const [batch] = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batch.quantity).toBe(50);
    expect(Number(batch.costPrice)).toBe(4.5);
  });

  it("merges into an existing batch with the same lot number and blends cost", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Ranitidine", price: "4.00" });
    await seedStock(med.id, [{ batchNumber: "LOT-9", expiryDate: "2030-01-01", quantity: 10, costPrice: "1.00" }]);
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "3.00" }],
    });
    expect(created.status).toBe(201);

    const res = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id, [
      { medicineId: med.id, batchNumber: "LOT-9" },
    ]);
    expect(res.status).toBe(200);

    const db = await getDb();
    const batches = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity).toBe(20);
    expect(Number(batches[0].costPrice)).toBe(2);

    const [medRow] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(medRow.quantity).toBe(20);
  });

  it("tops up an explicitly selected batch by id", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Tramadol", price: "4.00" });
    await seedStock(med.id, [{ batchNumber: "B2", expiryDate: "2030-01-01", quantity: 5, costPrice: "2.00" }]);
    const supplier = await seedSupplier();

    const db = await getDb();
    const [existing] = await db.select({ id: schema.medicineBatchesTable.id }).from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 5, unitPrice: "4.00" }],
    });
    expect(created.status).toBe(201);

    const res = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id, [
      { medicineId: med.id, batchId: existing.id },
    ]);
    expect(res.status).toBe(200);

    const batches = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batches).toHaveLength(1);
    expect(batches[0].quantity).toBe(10);
    expect(Number(batches[0].costPrice)).toBe(3);
  });

  it("rejects re-receiving an already received order and 404s unknown ones", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Metformin", price: "3.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 5, unitPrice: "1.00" }],
    });
    expect(created.status).toBe(201);

    const first = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(first.status).toBe(200);

    const second = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(second.status).toBe(409);
    expect(second.body.error).toContain("already received");

    const missing = await receivePurchaseOrder(bearer("admin", admin.id), 999999);
    expect(missing.status).toBe(404);
  });

  it("reversing a received order restores stock and returns it to pending", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Losartan", price: "3.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "1.00" }],
    });
    expect(created.status).toBe(201);

    const received = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(received.status).toBe(200);

    const rev = await api
      .post(`/api/purchase-orders/${created.body.id}/reverse`)
      .set("Authorization", bearer("admin", admin.id));
    expect(rev.status).toBe(200);
    expect(rev.body.status).toBe("pending");
    expect(rev.body.batchesAdjusted).toBe(1);

    const db = await getDb();
    const [medRow] = await db.select().from(schema.medicinesTable).where(eq(schema.medicinesTable.id, med.id));
    expect(medRow.quantity).toBe(0);

    const batches = await db.select().from(schema.medicineBatchesTable).where(eq(schema.medicineBatchesTable.medicineId, med.id));
    expect(batches).toHaveLength(0);

    const [po] = await db.select().from(schema.purchaseOrdersTable).where(eq(schema.purchaseOrdersTable.id, created.body.id));
    expect(po.status).toBe("pending");
  });

  it("blocks reversal when received stock has since been sold", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Warfarin", price: "4.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 10, unitPrice: "1.00" }],
    });
    expect(created.status).toBe(201);
    const received = await receivePurchaseOrder(bearer("admin", admin.id), created.body.id);
    expect(received.status).toBe(200);

    const sale = await api
      .post("/api/orders")
      .set("Authorization", bearer("admin", admin.id))
      .send({ items: [{ medicineId: med.id, quantity: 3 }], paymentMethod: "cash" });
    expect(sale.status).toBe(201);

    const rev = await api
      .post(`/api/purchase-orders/${created.body.id}/reverse`)
      .set("Authorization", bearer("admin", admin.id));
    expect(rev.status).toBe(409);
    expect(rev.body.error).toContain("Not enough stock");

    const db = await getDb();
    const [po] = await db.select().from(schema.purchaseOrdersTable).where(eq(schema.purchaseOrdersTable.id, created.body.id));
    expect(po.status).toBe("received");
  });

  it("rejects reversing a purchase order that has not been received", async () => {
    const admin = await seedUser("admin");
    const med = await seedMedicine({ name: "Clonazepam", price: "2.00" });
    const supplier = await seedSupplier();

    const created = await createPurchaseOrder(bearer("admin", admin.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 5, unitPrice: "1.00" }],
    });
    expect(created.status).toBe(201);

    const rev = await api
      .post(`/api/purchase-orders/${created.body.id}/reverse`)
      .set("Authorization", bearer("admin", admin.id));
    expect(rev.status).toBe(409);
    expect(rev.body.error).toContain("Only received purchase orders");
  });

  it("enforces role guards across purchase order routes", async () => {
    const admin = await seedUser("admin");
    const pharmacist = await seedUser("pharmacist");
    const cashier = await seedUser("cashier");
    const viewer = await seedUser("viewer");
    const med = await seedMedicine({ name: "Sertraline", price: "4.00" });
    const supplier = await seedSupplier();

    expect((await api.post("/api/purchase-orders").send({ supplierId: supplier.id, items: [{ medicineId: med.id, quantity: 1, unitPrice: "1.00" }] })).status).toBe(401);

    const cashierCreate = await api
      .post("/api/purchase-orders")
      .set("Authorization", bearer("cashier", cashier.id))
      .send({ supplierId: supplier.id, items: [{ medicineId: med.id, quantity: 1, unitPrice: "1.00" }] });
    expect(cashierCreate.status).toBe(403);

    const viewerList = await api.get("/api/purchase-orders").set("Authorization", bearer("viewer", viewer.id));
    expect(viewerList.status).toBe(403);

    const pharmacistCreate = await createPurchaseOrder(bearer("pharmacist", pharmacist.id), {
      supplierId: supplier.id,
      items: [{ medicineId: med.id, quantity: 2, unitPrice: "1.00" }],
    });
    expect(pharmacistCreate.status).toBe(201);

    const pharmacistReceive = await receivePurchaseOrder(bearer("pharmacist", pharmacist.id), pharmacistCreate.body.id);
    expect(pharmacistReceive.status).toBe(200);

    const viewerReverse = await api
      .post(`/api/purchase-orders/${pharmacistCreate.body.id}/reverse`)
      .set("Authorization", bearer("viewer", viewer.id));
    expect(viewerReverse.status).toBe(403);

    const pharmacistReverse = await api
      .post(`/api/purchase-orders/${pharmacistCreate.body.id}/reverse`)
      .set("Authorization", bearer("pharmacist", pharmacist.id));
    expect(pharmacistReverse.status).toBe(403);

    const adminReverse = await api
      .post(`/api/purchase-orders/${pharmacistCreate.body.id}/reverse`)
      .set("Authorization", bearer("admin", admin.id));
    expect(adminReverse.status).toBe(200);
  });
});