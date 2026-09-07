import { describe, it, expect, beforeEach } from "vitest";
import { api, bearer, wipeAll, seedSettings, seedUser } from "./helpers";

beforeEach(async () => {
  await wipeAll();
  await seedSettings("0");
});

describe("expenses ledger is admin-only", () => {
  it("blocks non-admin roles from listing expenses", async () => {
    for (const role of ["pharmacist", "cashier", "viewer"] as const) {
      const user = await seedUser(role);
      const res = await api.get("/api/expenses").set("Authorization", bearer(role, user.id));
      expect(res.status).toBe(403);
    }
  });

  it("blocks non-admin roles from recording an expense", async () => {
    for (const role of ["pharmacist", "cashier", "viewer"] as const) {
      const user = await seedUser(role);
      const res = await api
        .post("/api/expenses")
        .set("Authorization", bearer(role, user.id))
        .send({ category: "rent", description: "Shop rent", amount: "100.00", method: "cash" });
      expect(res.status).toBe(403);
    }
  });

  it("blocks non-admin roles from voiding an expense", async () => {
    const admin = await seedUser("admin");
    const viewer = await seedUser("viewer");
    const created = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "utilities", description: "Electric bill", amount: "45.50", method: "bank" });
    expect(created.status).toBe(201);
    const id = created.body.id;

    const denied = await api
      .patch(`/api/expenses/${id}/void`)
      .set("Authorization", bearer("viewer", viewer.id))
      .send({ reason: "should not work" });
    expect(denied.status).toBe(403);
  });
});

describe("recording expenses", () => {
  it("creates an expense and returns the recorded fields", async () => {
    const admin = await seedUser("admin");
    const res = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "rent", description: "Monthly shop rent", amount: "1200.00", method: "transfer", note: "September" });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      category: "rent",
      description: "Monthly shop rent",
      amount: "1200.00",
      method: "transfer",
      note: "September",
      recordedById: admin.id,
      voided: false,
      voidReason: null,
    });
    expect(res.body.recordedByName).toBe(admin.name);
    expect(new Date(res.body.expenseDate).getTime()).not.toBeNaN();
  });

  it("rejects an unknown category", async () => {
    const admin = await seedUser("admin");
    const res = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "gambling", description: "Casino night", amount: "100.00" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/category/i);
  });

  it("requires a description and a positive amount", async () => {
    const admin = await seedUser("admin");

    const noDescription = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "supplies", amount: "10.00" });
    expect(noDescription.status).toBe(400);

    const zero = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "supplies", description: "Pens", amount: "0.00" });
    expect(zero.status).toBe(400);
    expect(zero.body.error).toMatch(/greater than zero/i);
  });

  it("rejects an invalid expense date", async () => {
    const admin = await seedUser("admin");
    const res = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "miscellaneous", description: "Party", amount: "20.00", expenseDate: "not-a-date" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/valid date/i);
  });
});

describe("expenses ledger summary", () => {
  it("sums entries by category and month, excluding voided ones", async () => {
    const admin = await seedUser("admin");
    const token = bearer("admin", admin.id);
    const post = (body: object) => api.post("/api/expenses").set("Authorization", token).send(body);

    const rent = await post({ category: "rent", description: "Shop rent", amount: "1000.00", method: "bank" });
    const electricity = await post({ category: "utilities", description: "Electricity", amount: "200.50", method: "bank" });
    await post({ category: "utilities", description: "Water", amount: "50.00", method: "cash" });
    expect(rent.status).toBe(201);
    expect(electricity.status).toBe(201);

    const voided = await api
      .patch(`/api/expenses/${electricity.body.id}/void`)
      .set("Authorization", token)
      .send({ reason: "wrong amount" });
    expect(voided.status).toBe(200);

    const list = await api.get("/api/expenses").set("Authorization", token);
    expect(list.status).toBe(200);

    expect(list.body.summary.total).toBe("1050.00"); // 1000 rent + 50 water (voided 200.50 excluded)
    expect(list.body.summary.thisMonth).toBe("1050.00");
    expect(list.body.summary.byCategory).toMatchObject({ rent: "1000.00", utilities: "50.00", salaries: "0.00" });

    const visible = list.body.entries.filter((e: { voided: boolean }) => !e.voided);
    expect(visible).toHaveLength(2);
    const voidedEntry = list.body.entries.find((e: { id: number }) => e.id === electricity.body.id);
    expect(voidedEntry.voided).toBe(true);
    expect(voidedEntry.voidReason).toBe("wrong amount");
  });
});

describe("voiding expenses", () => {
  it("requires a reason", async () => {
    const admin = await seedUser("admin");
    const created = await api
      .post("/api/expenses")
      .set("Authorization", bearer("admin", admin.id))
      .send({ category: "marketing", description: "Flyers", amount: "30.00", method: "cash" });
    expect(created.status).toBe(201);

    const noReason = await api
      .patch(`/api/expenses/${created.body.id}/void`)
      .set("Authorization", bearer("admin", admin.id))
      .send({});
    expect(noReason.status).toBe(400);
  });

  it("returns 404 for an unknown expense and 409 for a double void", async () => {
    const admin = await seedUser("admin");
    const token = bearer("admin", admin.id);

    const missing = await api.patch("/api/expenses/99999/void").set("Authorization", token).send({ reason: "gone" });
    expect(missing.status).toBe(404);

    const created = await api
      .post("/api/expenses")
      .set("Authorization", token)
      .send({ category: "maintenance", description: "AC repair", amount: "80.00", method: "cash" });
    expect(created.status).toBe(201);

    const first = await api.patch(`/api/expenses/${created.body.id}/void`).set("Authorization", token).send({ reason: "duplicate" });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ id: created.body.id, voidReason: "duplicate" });

    const second = await api.patch(`/api/expenses/${created.body.id}/void`).set("Authorization", token).send({ reason: "again" });
    expect(second.status).toBe(409);
  });
});