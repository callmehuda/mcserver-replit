import { Router } from "express";
import { playitManager } from "../lib/playit-manager.js";

const router = Router();

router.get("/playit/status", (_req, res) => {
  res.json(playitManager.getInfo());
});

router.post("/playit/start", async (_req, res) => {
  const result = await playitManager.start();
  res.json(result);
});

router.post("/playit/stop", (_req, res) => {
  const result = playitManager.stop();
  res.json(result);
});

export default router;
