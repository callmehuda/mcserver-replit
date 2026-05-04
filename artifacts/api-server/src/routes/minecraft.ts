import { Router } from "express";
import { mcServer } from "../lib/minecraft-server.js";

const router = Router();

router.get("/minecraft/status", (_req, res) => {
  res.json(mcServer.getInfo());
});

router.post("/minecraft/start", (_req, res) => {
  const result = mcServer.start();
  res.json(result);
});

router.post("/minecraft/stop", (_req, res) => {
  const result = mcServer.stop();
  res.json(result);
});

router.post("/minecraft/command", (req, res) => {
  const { command } = req.body as { command?: string };
  if (!command || typeof command !== "string") {
    res.status(400).json({ success: false, message: "command is required" });
    return;
  }
  const result = mcServer.sendCommand(command);
  res.json(result);
});

router.get("/minecraft/logs", (_req, res) => {
  res.json({ logs: mcServer.logs });
});

export default router;
