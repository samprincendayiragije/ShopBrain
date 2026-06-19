import { Router, type IRouter } from "express";
import healthRouter from "./health";
import webhookRouter from "./webhook";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(webhookRouter);
router.use(adminRouter);

export default router;
