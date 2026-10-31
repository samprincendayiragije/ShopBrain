import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhookRouter from "./webhook";
import adminRouter from "./admin";
import adminBatch1Router from "./adminBatch1";

const router: IRouter = Router();
router.use(healthRouter);
router.use(webhookRouter);
router.use(adminRouter);
router.use(adminBatch1Router);
export default router;