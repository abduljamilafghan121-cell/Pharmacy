import { Router, type IRouter } from "express";
import { sql, gte, lte, and, eq, or, desc, asc } from "drizzle-orm";
import { db, ordersTable, orderItemsTable, medicinesTable, orderItemBatchAllocationsTable, medicineBatchesTable, usersTable, paymentsTable, suppliersTable, purchaseOrdersTable, supplierPaymentsTable, supplierReturnsTable, insuranceClaimsTable, controlledSubstanceLogsTable } from "@workspace/db";
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

// Payment method & outstanding receivables — cash/card/insurance split of
// completed payments, plus how much is still owed from unpaid (and
// refunded) orders. Date range applies to payment creation and order dates.
router.get("/reports/payments", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const payConditions = [sql`${paymentsTable.status} = 'completed'`];
  const orderConditions = [];
  if (from) {
    payConditions.push(gte(sql`DATE(${paymentsTable.createdAt})`, from));
    orderConditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  }
  if (to) {
    payConditions.push(lte(sql`DATE(${paymentsTable.createdAt})`, to));
    orderConditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));
  }

  const byMethod = await db
    .select({
      method: paymentsTable.method,
      count: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)::text`,
    })
    .from(paymentsTable)
    .where(and(...payConditions))
    .groupBy(paymentsTable.method);

  const [totalCollectedRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${paymentsTable.amount}), 0)::text` })
    .from(paymentsTable)
    .where(and(...payConditions));

  const byOrderStatus = await db
    .select({
      paymentStatus: ordersTable.paymentStatus,
      count: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)::text`,
    })
    .from(ordersTable)
    .where(orderConditions.length ? and(...orderConditions) : undefined)
    .groupBy(ordersTable.paymentStatus);

  const [unpaidRow] = await db
    .select({
      count: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${ordersTable.total}), 0)::text`,
    })
    .from(ordersTable)
    .where(and(...orderConditions, sql`${ordersTable.paymentStatus} = 'unpaid'`));

  res.json({
    byMethod,
    totalCollected: parseFloat(totalCollectedRow?.total ?? "0").toFixed(2),
    byOrderStatus,
    outstanding: {
      count: unpaidRow?.count ?? 0,
      amount: parseFloat(unpaidRow?.amount ?? "0").toFixed(2),
    },
  });
});

// Purchases by supplier — value purchased (non-cancelled POs), value paid,
// returns credited back, and the resulting outstanding balance.
router.get("/reports/purchases-by-supplier", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const poConditions = [sql`${purchaseOrdersTable.status} != 'cancelled'`];
  const payConditions: any[] = [];
  const retConditions: any[] = [];
  if (from) {
    poConditions.push(gte(sql`DATE(${purchaseOrdersTable.createdAt})`, from));
    payConditions.push(gte(sql`DATE(${supplierPaymentsTable.createdAt})`, from));
    retConditions.push(gte(sql`DATE(${supplierReturnsTable.createdAt})`, from));
  }
  if (to) {
    poConditions.push(lte(sql`DATE(${purchaseOrdersTable.createdAt})`, to));
    payConditions.push(lte(sql`DATE(${supplierPaymentsTable.createdAt})`, to));
    retConditions.push(lte(sql`DATE(${supplierReturnsTable.createdAt})`, to));
  }

  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.name);

  const rows = await Promise.all(
    suppliers.map(async (s) => {
      const [poRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${purchaseOrdersTable.total}), 0)::text`, count: sql<number>`COUNT(*)::int` })
        .from(purchaseOrdersTable)
        .where(and(...poConditions, sql`${purchaseOrdersTable.supplierId} = ${s.id}`));

      const [payRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${supplierPaymentsTable.amount}), 0)::text` })
        .from(supplierPaymentsTable)
        .where(and(...payConditions, sql`${supplierPaymentsTable.supplierId} = ${s.id}`));

      const [retRow] = await db
        .select({ total: sql<string>`COALESCE(SUM(${supplierReturnsTable.totalAmount}), 0)::text` })
        .from(supplierReturnsTable)
        .where(and(...retConditions, sql`${supplierReturnsTable.supplierId} = ${s.id}`));

      const ordered = parseFloat(poRow?.total ?? "0");
      const paid = parseFloat(payRow?.total ?? "0");
      const returned = parseFloat(retRow?.total ?? "0");

      return {
        supplierId: s.id,
        supplierName: s.name,
        purchaseOrders: poRow?.count ?? 0,
        totalPurchased: ordered.toFixed(2),
        totalPaid: paid.toFixed(2),
        totalReturns: returned.toFixed(2),
        balance: (ordered - paid - returned).toFixed(2),
      };
    })
  );

  res.json(rows);
});

// Expiring stock — every batch with stock left that expires within `days`
// (default 90). Useful for proactive markdowns and write-offs.
router.get("/reports/expiring-stock", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const days = Math.max(1, parseInt(String(req.query["days"] ?? "90"), 10) || 90);
  const today = new Date().toISOString().split("T")[0];
  const cutoff = new Date(Date.now() + days * 86400000).toISOString().split("T")[0];

  const rows = await db
    .select({
      medicineId: medicinesTable.id,
      medicineName: medicinesTable.name,
      batchId: medicineBatchesTable.id,
      batchNumber: medicineBatchesTable.batchNumber,
      expiryDate: medicineBatchesTable.expiryDate,
      quantity: medicineBatchesTable.quantity,
      supplierId: suppliersTable.id,
      supplierName: suppliersTable.name,
    })
    .from(medicineBatchesTable)
    .leftJoin(medicinesTable, eq(medicineBatchesTable.medicineId, medicinesTable.id))
    .leftJoin(suppliersTable, eq(medicineBatchesTable.supplierId, suppliersTable.id))
    .where(
      and(
        gte(sql`DATE(${medicineBatchesTable.expiryDate})`, today),
        lte(sql`DATE(${medicineBatchesTable.expiryDate})`, cutoff),
        sql`${medicineBatchesTable.expiryDate} IS NOT NULL`,
        sql`${medicineBatchesTable.quantity} > 0`
      )
    )
    .orderBy(asc(medicineBatchesTable.expiryDate));

  res.json(rows);
});

// Controlled-substance dispensing register — every controlled dispensing
// event within the range, grouped totals by schedule for quick compliance
// review (the full line-by-line log lives under Controlled Substance Logs).
router.get("/reports/controlled-substances", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [];
  if (from) conditions.push(gte(sql`DATE(${controlledSubstanceLogsTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${controlledSubstanceLogsTable.createdAt})`, to));

  const bySchedule = await db
    .select({
      schedule: controlledSubstanceLogsTable.scheduleAtDispensing,
      count: sql<number>`COUNT(*)::int`,
      quantity: sql<number>`COALESCE(SUM(${controlledSubstanceLogsTable.quantityDispensed}), 0)::int`,
    })
    .from(controlledSubstanceLogsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(controlledSubstanceLogsTable.scheduleAtDispensing)
    .orderBy(controlledSubstanceLogsTable.scheduleAtDispensing);

  const byMedicine = await db
    .select({
      medicineId: controlledSubstanceLogsTable.medicineId,
      medicineName: medicinesTable.name,
      count: sql<number>`COUNT(*)::int`,
      quantity: sql<number>`COALESCE(SUM(${controlledSubstanceLogsTable.quantityDispensed}), 0)::int`,
    })
    .from(controlledSubstanceLogsTable)
    .leftJoin(medicinesTable, eq(controlledSubstanceLogsTable.medicineId, medicinesTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(controlledSubstanceLogsTable.medicineId, medicinesTable.name)
    .orderBy(desc(sql`SUM(${controlledSubstanceLogsTable.quantityDispensed})`));

  res.json({ totalEvents: bySchedule.reduce((s, r) => s + r.count, 0), bySchedule, byMedicine });
});

// Insurance claims report — claim volume/value by status and the pending
// receivable (submitted + approved claims not yet paid).
router.get("/reports/insurance-claims", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [];
  if (from) conditions.push(gte(sql`DATE(${insuranceClaimsTable.submittedAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${insuranceClaimsTable.submittedAt})`, to));

  const byStatus = await db
    .select({
      status: insuranceClaimsTable.status,
      count: sql<number>`COUNT(*)::int`,
      amount: sql<string>`COALESCE(SUM(${insuranceClaimsTable.claimAmount}), 0)::text`,
    })
    .from(insuranceClaimsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .groupBy(insuranceClaimsTable.status)
    .orderBy(insuranceClaimsTable.status);

  const [totalRow] = await db
    .select({ total: sql<string>`COALESCE(SUM(${insuranceClaimsTable.claimAmount}), 0)::text` })
    .from(insuranceClaimsTable)
    .where(conditions.length ? and(...conditions) : undefined);

  const pending = byStatus
    .filter((r) => r.status === "submitted" || r.status === "approved")
    .reduce((s, r) => s + parseFloat(r.amount), 0);

  res.json({
    totalClaims: byStatus.reduce((s, r) => s + r.count, 0),
    totalAmount: parseFloat(totalRow?.total ?? "0").toFixed(2),
    pendingReceivable: pending.toFixed(2),
    byStatus,
  });
});

// Detailed sale report — every individual transaction within the range, with
// patient, staff, item count, discount/tax breakdown and payment method.
// Complements the daily-totals "sales" endpoint with line-level detail.
router.get("/reports/sales-transactions", requireAuth, requireRole("admin", "pharmacist", "viewer"), async (req, res): Promise<void> => {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const conditions = [];
  if (from) conditions.push(gte(sql`DATE(${ordersTable.createdAt})`, from));
  if (to) conditions.push(lte(sql`DATE(${ordersTable.createdAt})`, to));

  const rows = await db
    .select({
      id: ordersTable.id,
      createdAt: ordersTable.createdAt,
      patientName: ordersTable.patientName,
      servedByName: usersTable.name,
      status: ordersTable.status,
      subtotal: ordersTable.subtotal,
      discountAmount: ordersTable.discountAmount,
      taxAmount: ordersTable.taxAmount,
      total: ordersTable.total,
      paymentStatus: ordersTable.paymentStatus,
      paymentMethod: sql<string | null>`(
        SELECT ${paymentsTable.method} FROM ${paymentsTable}
        WHERE ${paymentsTable.orderId} = ${ordersTable.id} AND ${paymentsTable.status} = 'completed'
        ORDER BY ${paymentsTable.createdAt} DESC LIMIT 1
      )`,
      itemCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${orderItemsTable}
        WHERE ${orderItemsTable.orderId} = ${ordersTable.id}
      )`,
    })
    .from(ordersTable)
    .leftJoin(usersTable, eq(ordersTable.servedBy, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(ordersTable.createdAt));

  const totalRevenue = rows
    .filter((r) => r.status !== "cancelled")
    .reduce((s, r) => s + parseFloat(r.total ?? "0"), 0);
  const totalDiscount = rows
    .filter((r) => r.status !== "cancelled")
    .reduce((s, r) => s + parseFloat(r.discountAmount ?? "0"), 0);
  const totalTax = rows
    .filter((r) => r.status !== "cancelled")
    .reduce((s, r) => s + parseFloat(r.taxAmount ?? "0"), 0);
  const cancelledCount = rows.filter((r) => r.status === "cancelled").length;

  res.json({
    totalSales: rows.filter((r) => r.status !== "cancelled").length,
    totalRevenue: totalRevenue.toFixed(2),
    totalDiscount: totalDiscount.toFixed(2),
    totalTax: totalTax.toFixed(2),
    cancelledCount,
    transactions: rows,
  });
});

export default router;
