import { describe, it, expect, beforeEach } from "vitest";
import { api, bearer, wipeAll, seedSettings, seedUser, seedMedicine, seedMedicineUnit } from "./helpers";
import { resetStatementCount, getStatementCount } from "./db-mock";

beforeEach(async () => {
  await wipeAll();
  await seedSettings("0");
});

describe("GET /api/medicines", () => {
  it("returns every medicine with its units using a bounded number of queries", async () => {
    const viewer = await seedUser("viewer");
    for (let i = 0; i < 25; i++) {
      const med = await seedMedicine({ name: `Med ${String(i).padStart(2, "0")}`, price: "1.00" });
      await seedMedicineUnit(med.id, "Tablet", 1, { isBaseUnit: true });
      await seedMedicineUnit(med.id, "Strip", 10);
    }

    resetStatementCount();
    const res = await api.get("/api/medicines").set("Authorization", bearer("viewer", viewer.id));

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(25);
    const med00 = res.body.find((m: { name: string }) => m.name === "Med 00");
    expect(med00.units.map((u: { unitName: string }) => u.unitName)).toEqual(["Tablet", "Strip"]);

    // 1 auth user lookup + 1 list + 1 units query. The point of this assertion
    // is that it does not grow with the catalog size (it was 1 + N + 1 before).
    expect(getStatementCount()).toBeLessThanOrEqual(4);
  });
});
