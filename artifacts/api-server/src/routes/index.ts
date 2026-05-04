import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import minecraftRouter from "./minecraft.js";
import playitRouter from "./playit.js";
import pluginsRouter from "./plugins.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(minecraftRouter);
router.use(playitRouter);
router.use(pluginsRouter);

export default router;
