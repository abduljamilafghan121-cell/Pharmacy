import { Router, type IRouter } from "express";
import { sql, gte, lte, and } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/reports/sales", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const byDay = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})::text`,
      orders: sql<number>`COUNT(*)::int`,
      revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)::text`,
    })
    .from(ordersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  const totalOrders = byDay.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = byDay.reduce((s, r) => s + parseFloat(r.revenue), 0).toFixed(2);

  res.json({ totalOrders, totalRevenue, byDay });
});

router.get("/reports/inventory", requireAuth, requireRole("admin", "pharmacist"), async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const ninety = new Date();
  ninety.setDate(ninety.getDate() + 90);
  const cutoff = ninety.toISOString().split("T")[0];

  const [counts] = await db
    .select({
      totalMedicines: sql<number>`COUNT(*)::int`,
      totalStock: sql<number>`COALESCE(SUM(${medicinesTable.quantity}), 0)::int`,
      lowStockCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.quantity} <= 10)::int`,
      outOfStockCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.quantity} = 0)::int`,
      expiringCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.expiryDate} IS NOT NULL AND ${medicinesTable.expiryDate} >= ${today} AND ${medicinesTable.expiryDate} <= ${cutoff})::int`,
    })
    .from(medicinesTable);

  res.json(counts);
});

router.get("/reports/top-medicines", requireAuth, requireRole("admin", "pharmacist"), async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      medicineId: orderItemsTable.medicineId,
      medicineName: medicinesTable.name,
      totalSold: sql<number>`SUM(${orderItemsTable.quantity})::int`,
      revenue: sql<string>`SUM(${orderItemsTable.price})::text`,
    })
    .from(orderItemsTable)
    .leftJoin(medicinesTable, sql`${orderItemsTable.medicineId} = ${medicinesTable.id}`)
    .groupBy(orderItemsTable.medicineId, medicinesTable.name)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(10);
  res.json(rows);
});

router.get("/reports/revenue", requireAuth, requireRole("admin", "pharmacist"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;

  const conditions = [];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const byDate = await db
    .select({
      date: sql<string>`DATE(${ordersTable.createdAt})::text`,
      revenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)::text`,
    })
    .from(ordersTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(sql`DATE(${ordersTable.createdAt})`)
    .orderBy(sql`DATE(${ordersTable.createdAt})`);

  const totalRevenue = byDate.reduce((s, r) => s + parseFloat(r.revenue), 0).toFixed(2);
  res.json({ totalRevenue, byDate });
});

export default router;
