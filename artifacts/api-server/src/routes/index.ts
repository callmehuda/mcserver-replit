import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import minecraftRouter from "./minecraft.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(minecraftRouter);

export default router;
