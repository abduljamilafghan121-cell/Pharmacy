import request from "supertest";
import app from "../app";
import { signToken } from "../middlewares/auth";
import { refreshMedicineAggregate, type DbOrTx } from "../lib/batch-helpers";
import { isTable } from "drizzle-orm/table";
import type { AnyPgTable } from "drizzle-orm/pg-core";
import { getTestDb, type TestDb } from "./db-mock";
import * as schema from "@workspace/db/schema";

export { request };
export const server = app;
export const api = request(app);

let _db: TestDb | null = null;
export async function getDb(): Promise<TestDb> {
  if (!_db) _db = (await getTestDb()).db;
  return _db;
}

export function bearer(role: "admin" | "pharmacist" | "cashier" | "viewer", userId: number): string {
  return `Bearer ${signToken({ userId, role })}`;
}

export async function wipeAll(): Promise<void> {
  const db = await getDb();
  const tables = (Object.values(schema) as unknown[]).filter((v): v is AnyPgTable => isTable(v as never));
  for (const t of tables) {
    await db.delete(t);
  }
}

export async function seedUser(role: "admin" | "pharmacist" | "cashier" | "viewer") {
  const db = await getDb();
  const [user] = await db
    .insert(schema.usersTable)
    .values({ name: `${role} user`, email: `${role}-${Date.now()}@test.local`, passwordHash: "unused", role })
    .returning();
  return user;
}

export async function seedSettings(taxRatePercent = "0") {
  const db = await getDb();
  await db
    .insert(schema.pharmacySettingsTable)
    .values({ id: 1, taxRatePercent, name: "Test Pharmacy" })
    .onConflictDoUpdate({
      target: schema.pharmacySettingsTable.id,
      set: { taxRatePercent, name: "Test Pharmacy" },
    });
}

export type MedicineSeed = {
  name: string;
  price: string;
  categoryId?: number | null;
  supplierId?: number | null;
  prescriptionRequired?: boolean;
  controlledSchedule?: "II" | "III" | "IV" | "V";
  drugClass?: string | null;
  genericName?: string | null;
  barcode?: string | null;
};

export async function seedMedicine(opts: MedicineSeed) {
  const db = await getDb();
  const [med] = await db
    .insert(schema.medicinesTable)
    .values({
      name: opts.name,
      price: opts.price,
      categoryId: opts.categoryId ?? null,
      supplierId: opts.supplierId ?? null,
      prescriptionRequired: opts.prescriptionRequired ?? false,
      controlledSchedule: opts.controlledSchedule ?? null,
      drugClass: opts.drugClass ?? null,
      genericName: opts.genericName ?? null,
      barcode: opts.barcode ?? null,
    })
    .returning();
  return med;
}

export type BatchSeed = {
  batchNumber?: string | null;
  expiryDate?: string | null;
  quantity: number;
  costPrice?: string | null;
};

/** Inserts batches for a medicine and recomputes the medicine's cached stock/expiry aggregate. */
export async function seedStock(medicineId: number, batches: BatchSeed[]) {
  const db = await getDb();
  for (const b of batches) {
    await db.insert(schema.medicineBatchesTable).values({
      medicineId,
      batchNumber: b.batchNumber ?? null,
      expiryDate: b.expiryDate ?? null,
      quantity: b.quantity,
      costPrice: b.costPrice ?? null,
    });
  }
  await refreshMedicineAggregate(db as unknown as DbOrTx, medicineId);
}

export async function seedMedicineUnit(medicineId: number, unitName: string, conversionFactorToBase: number, opts?: { sellPrice?: string | null; isBaseUnit?: boolean }) {
  const db = await getDb();
  const [unit] = await db
    .insert(schema.medicineUnitsTable)
    .values({
      medicineId,
      unitName,
      conversionFactorToBase,
      isBaseUnit: opts?.isBaseUnit ?? false,
      sellPrice: opts?.sellPrice ?? null,
    })
    .returning();
  return unit;
}

export async function seedSupplier(name = "Test Supplier") {
  const db = await getDb();
  const [supplier] = await db.insert(schema.suppliersTable).values({ name }).returning();
  return supplier;
}

export async function seedCategory(name = "Test Category") {
  const db = await getDb();
  const [category] = await db.insert(schema.categoriesTable).values({ name }).returning();
  return category;
}

export async function seedPatient(name = "Test Patient") {
  const db = await getDb();
  const [patient] = await db.insert(schema.patientsTable).values({ name }).returning();
  return patient;
}

export async function seedPrescription(patientId: number | null, status: "pending" | "verified" | "rejected" = "verified", opts?: { maxRefills?: number; refillsUsed?: number }) {
  const db = await getDb();
  const [rx] = await db
    .insert(schema.prescriptionsTable)
    .values({
      patientId,
      status,
      maxRefills: opts?.maxRefills ?? 0,
      refillsUsed: opts?.refillsUsed ?? 0,
    })
    .returning();
  return rx;
}

export async function seedAllergy(patientId: number, allergen: string, severity: "mild" | "moderate" | "severe" = "moderate") {
  const db = await getDb();
  await db.insert(schema.patientAllergiesTable).values({ patientId, allergen, severity });
}

export async function seedInteraction(medicine1Id: number, medicine2Id: number, severity: "minor" | "moderate" | "major" | "contraindicated", description: string) {
  const db = await getDb();
  await db.insert(schema.drugInteractionsTable).values({ medicine1Id, medicine2Id, severity, description });
}

export type MedicineLine = {
  medicineId: number;
  quantity: number;
  unitId?: number;
  sig?: string;
};

export type CreateOrderBody = {
  patientId?: number | null;
  patientName?: string | null;
  paymentMethod?: "card" | "cash" | "insurance";
  notes?: string | null;
  discountAmount?: number;
  paymentStatus?: "unpaid";
  prescriptionId?: number | null;
  items: MedicineLine[];
};

export async function createOrder(token: string, body: CreateOrderBody) {
  return request(app).post("/api/orders").set("Authorization", token).send(body);
}

export async function createPurchaseOrder(token: string, body: { supplierId: number; items: Array<{ medicineId: number; quantity: number; unitId?: number; unitPrice: string }> }) {
  return request(app).post("/api/purchase-orders").set("Authorization", token).send(body);
}

export async function receivePurchaseOrder(token: string, id: number, items?: Array<{ medicineId: number; batchId?: number | null; batchNumber?: string | null; expiryDate?: string | null }>) {
  return request(app).patch(`/api/purchase-orders/${id}/receive`).set("Authorization", token).send(items ? { items } : {});
}