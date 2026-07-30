import { Router, type IRouter } from "express";
import { sql, gte, lte, and, eq } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable, orderItemBatchAllocationsTable, medicineBatchesTable, usersTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/reports/sales", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
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

router.get("/reports/inventory", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (_req, res): Promise<void> => {
  const today = new Date().toISOString().split("T")[0];
  const ninety = new Date();
  ninety.setDate(ninety.getDate() + 90);
  const cutoff = ninety.toISOString().split("T")[0];

  const [counts] = await db
    .select({
      totalMedicines: sql<number>`COUNT(*)::int`,
      totalStock: sql<number>`COALESCE(SUM(${medicinesTable.quantity}), 0)::int`,
      lowStockCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.quantity} <= ${medicinesTable.reorderLevel})::int`,
      outOfStockCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.quantity} = 0)::int`,
      expiringCount: sql<number>`COUNT(*) FILTER (WHERE ${medicinesTable.expiryDate} IS NOT NULL AND ${medicinesTable.expiryDate} >= ${today} AND ${medicinesTable.expiryDate} <= ${cutoff})::int`,
    })
    .from(medicinesTable);

  res.json(counts);
});

router.get("/reports/top-medicines", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [sql`${ordersTable.status} != 'cancelled'`];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const rows = await db
    .select({
      medicineId: orderItemsTable.medicineId,
      medicineName: medicinesTable.name,
      totalSold: sql<number>`SUM(${orderItemsTable.quantity})::int`,
      revenue: sql<string>`SUM(${orderItemsTable.price})::text`,
    })
    .from(orderItemsTable)
    .leftJoin(medicinesTable, sql`${orderItemsTable.medicineId} = ${medicinesTable.id}`)
    .leftJoin(ordersTable, sql`${orderItemsTable.orderId} = ${ordersTable.id}`)
    .where(and(...conditions))
    .groupBy(orderItemsTable.medicineId, medicinesTable.name)
    .orderBy(sql`SUM(${orderItemsTable.quantity}) DESC`)
    .limit(10);
  res.json(rows);
});

router.get("/reports/revenue", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
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

// Profit margin — made possible by cost price now being tracked per batch
// (see medicine_batches.costPrice). Revenue comes from order_items.price;
// cost is reconstructed from exactly which batches each sale actually drew
// from (order_item_batch_allocations), so it reflects real FEFO cost, not
// a rough average. Orders lacking allocation history (e.g. sold before
// this feature existed) are excluded from cost — flagged via `unpriced`.
router.get("/reports/profit", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [sql`${ordersTable.status} != 'cancelled'`];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const [revenueRow] = await db
    .select({ revenue: sql<string>`COALESCE(SUM(${orderItemsTable.price}), 0)::text` })
    .from(orderItemsTable)
    .leftJoin(ordersTable, sql`${orderItemsTable.orderId} = ${ordersTable.id}`)
    .where(and(...conditions));

  const [costRow] = await db
    .select({
      cost: sql<string>`COALESCE(SUM(${orderItemBatchAllocationsTable.quantity} * COALESCE(${medicineBatchesTable.costPrice}, 0)), 0)::text`,
      pricedUnits: sql<number>`COALESCE(SUM(${orderItemBatchAllocationsTable.quantity}) FILTER (WHERE ${medicineBatchesTable.costPrice} IS NOT NULL), 0)::int`,
    })
    .from(orderItemBatchAllocationsTable)
    .leftJoin(orderItemsTable, sql`${orderItemBatchAllocationsTable.orderItemId} = ${orderItemsTable.id}`)
    .leftJoin(medicineBatchesTable, sql`${orderItemBatchAllocationsTable.medicineBatchId} = ${medicineBatchesTable.id}`)
    .leftJoin(ordersTable, sql`${orderItemsTable.orderId} = ${ordersTable.id}`)
    .where(and(...conditions));

  const revenue = parseFloat(revenueRow?.revenue ?? "0");
  const cost = parseFloat(costRow?.cost ?? "0");
  const profit = revenue - cost;
  const marginPct = revenue > 0 ? (profit / revenue) * 100 : 0;

  res.json({
    revenue: revenue.toFixed(2),
    cost: cost.toFixed(2),
    profit: profit.toFixed(2),
    marginPct: Math.round(marginPct * 10) / 10,
    note: "Cost is only known for stock received after batch tracking was added — older/undated batches show as $0 cost, understating true cost for that portion.",
  });
});

// Staff productivity — sales count, items dispensed, and revenue per staff member
router.get("/reports/staff-productivity", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [sql`${ordersTable.status} != 'cancelled'`];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const rows = await db
    .select({
      userId: ordersTable.servedBy,
      userName: usersTable.name,
      totalOrders: sql<number>`COUNT(DISTINCT ${ordersTable.id})::int`,
      totalRevenue: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)::text`,
      totalItems: sql<number>`COALESCE(SUM(${orderItemsTable.quantity}), 0)::int`,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.servedBy, usersTable.id))
    .leftJoin(orderItemsTable, eq(orderItemsTable.orderId, ordersTable.id))
    .where(and(...conditions))
    .groupBy(ordersTable.servedBy, usersTable.name)
    .orderBy(sql`SUM(${ordersTable.total}) DESC`);

  res.json(rows);
});

export default router;
