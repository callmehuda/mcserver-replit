import { useState, useEffect, useRef, useCallback } from "react";

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";

export interface ServerInfo {
  status: ServerStatus;
  pid: number | null;
  jarExists: boolean;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const API_BASE = "/api";

export function useMinecraftServer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${API_BASE}/ws`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as {
          type: string;
          payload: unknown;
        };

        if (msg.type === "init") {
          const payload = msg.payload as {
            status: ServerStatus;
            logs: string[];
          };
          setStatus(payload.status);
          setLogs(payload.logs);
        } else if (msg.type === "log") {
          setLogs((prev) => [...prev.slice(-499), msg.payload as string]);
        } else if (msg.type === "status") {
          setStatus(msg.payload as ServerStatus);
        }
      } catch {
        // ignore
      }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const startServer = async () => {
    await fetch(`${API_BASE}/minecraft/start`, { method: "POST" });
  };

  const stopServer = async () => {
    await fetch(`${API_BASE}/minecraft/stop`, { method: "POST" });
  };

  const sendCommand = (command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "command", payload: command }));
    }
  };

  return { logs, status, connected, startServer, stopServer, sendCommand };
}
