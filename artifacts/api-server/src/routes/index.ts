import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import setupRouter from "./setup";
import categoriesRouter from "./categories";
import suppliersRouter from "./suppliers";
import medicinesRouter from "./medicines";
import patientsRouter from "./patients";
import prescriptionsRouter from "./prescriptions";
import ordersRouter from "./orders";
import paymentsRouter from "./payments";
import purchaseOrdersRouter from "./purchase-orders";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(setupRouter);
router.use(categoriesRouter);
router.use(suppliersRouter);
router.use(medicinesRouter);
router.use(patientsRouter);
router.use(prescriptionsRouter);
router.use(ordersRouter);
router.use(paymentsRouter);
router.use(purchaseOrdersRouter);
router.use(reportsRouter);

export default router;
