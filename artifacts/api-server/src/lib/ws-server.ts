import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "node:http";
import { mcServer } from "./minecraft-server.js";
import { logger } from "./logger.js";

export function setupWebSocket(httpServer: Server): void {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  logger.info("WebSocket server attached at /api/ws");

  wss.on("connection", (ws) => {
    logger.info("WebSocket client connected");

    const send = (type: string, payload: unknown) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type, payload }));
      }
    };

    send("init", {
      status: mcServer.status,
      logs: mcServer.logs,
    });

    const onLog = (line: string) => send("log", line);
    const onStatus = (status: string) => send("status", status);

    mcServer.on("log", onLog);
    mcServer.on("status", onStatus);

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; payload?: unknown };
        if (msg.type === "command" && typeof msg.payload === "string") {
          mcServer.sendCommand(msg.payload);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      mcServer.off("log", onLog);
      mcServer.off("status", onStatus);
      logger.info("WebSocket client disconnected");
    });

    ws.on("error", (err) => {
      logger.error({ err }, "WebSocket client error");
    });
  });
}
