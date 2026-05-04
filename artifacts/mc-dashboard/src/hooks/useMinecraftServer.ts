import { useState, useEffect, useRef, useCallback } from "react";

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";
export type PlayitStatus = "stopped" | "downloading" | "starting" | "claiming" | "running";

export interface ServerInfo {
  status: ServerStatus;
  pid: number | null;
  jarExists: boolean;
}

export interface PlayitInfo {
  status: PlayitStatus;
  claimUrl: string | null;
  isSetup: boolean;
  binaryExists: boolean;
  secretExists: boolean;
}

const API_BASE = "/api";

export function useMinecraftServer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<ServerStatus>("stopped");
  const [connected, setConnected] = useState(false);
  const [playit, setPlayit] = useState<PlayitInfo>({
    status: "stopped",
    claimUrl: null,
    isSetup: false,
    binaryExists: false,
  });
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
            playit?: PlayitInfo;
          };
          setStatus(payload.status);
          setLogs(payload.logs);
          if (payload.playit) setPlayit(payload.playit);
        } else if (msg.type === "log") {
          setLogs((prev) => [...prev.slice(-499), msg.payload as string]);
        } else if (msg.type === "status") {
          setStatus(msg.payload as ServerStatus);
        } else if (msg.type === "playit_log") {
          setLogs((prev) => [...prev.slice(-499), msg.payload as string]);
        } else if (msg.type === "playit_status") {
          setPlayit((prev) => ({ ...prev, status: msg.payload as PlayitStatus }));
        } else if (msg.type === "playit_claim") {
          setPlayit((prev) => ({ ...prev, claimUrl: msg.payload as string | null }));
        } else if (msg.type === "playit_setup") {
          setPlayit((prev) => ({ ...prev, isSetup: msg.payload as boolean, claimUrl: null }));
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

  const startPlayit = async () => {
    await fetch(`${API_BASE}/playit/start`, { method: "POST" });
  };

  const stopPlayit = async () => {
    await fetch(`${API_BASE}/playit/stop`, { method: "POST" });
  };

  const resetPlayit = async () => {
    await fetch(`${API_BASE}/playit/reset`, { method: "POST" });
  };

  return { logs, status, connected, startServer, stopServer, sendCommand, playit, startPlayit, stopPlayit, resetPlayit };
}
