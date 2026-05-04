import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { mcServer } from "./minecraft-server.js";
import { playitManager } from "./playit-manager.js";
import { logger } from "./logger.js";

export function setupWebSocket(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });
  logger.info("WebSocket server attached at /api/ws");

  wss.on("connection", (ws) => {
    logger.info("WebSocket client connected");

    const send = (type: string, payload: unknown) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, payload }));
    };

    send("init", {
      status: mcServer.status,
      logs: mcServer.logs,
      playit: playitManager.getInfo(),
    });

    const onLog = (line: string) => send("log", line);
    const onStatus = (status: string) => send("status", status);
    const onPlayitLog = (line: string) => send("playit_log", line);
    const onPlayitStatus = (s: string) => send("playit_status", s);
    const onPlayitClaim = (u: string | null) => send("playit_claim", u);
    const onPlayitSetup = (v: boolean) => send("playit_setup", v);
    const onPlayitAddress = (a: string | null) => send("playit_address", a);

    mcServer.on("log", onLog);
    mcServer.on("status", onStatus);
    playitManager.on("playit_log", onPlayitLog);
    playitManager.on("playit_status", onPlayitStatus);
    playitManager.on("playit_claim", onPlayitClaim);
    playitManager.on("playit_setup", onPlayitSetup);
    playitManager.on("playit_address", onPlayitAddress);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload?: unknown };
        if (msg.type === "command" && typeof msg.payload === "string") mcServer.sendCommand(msg.payload);
      } catch { /* ignore */ }
    });

    ws.on("close", () => {
      mcServer.off("log", onLog);
      mcServer.off("status", onStatus);
      playitManager.off("playit_log", onPlayitLog);
      playitManager.off("playit_status", onPlayitStatus);
      playitManager.off("playit_claim", onPlayitClaim);
      playitManager.off("playit_setup", onPlayitSetup);
      playitManager.off("playit_address", onPlayitAddress);
      logger.info("WebSocket client disconnected");
    });

    ws.on("error", (err) => logger.error({ err }, "WebSocket error"));
  });
}
