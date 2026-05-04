import { useState, useEffect, useRef, useCallback } from "react";

export type ServerStatus = "stopped" | "starting" | "running" | "stopping";
export type PlayitStatus = "stopped" | "downloading" | "starting" | "waiting_claim" | "running";

export interface PlayitInfo {
  status: PlayitStatus;
  claimUrl: string | null;
  isSetup: boolean;
  tunnelAddress: string | null;
  binaryExists: boolean;
  secretExists: boolean;
}

export interface InstalledPlugin {
  name: string;
  size: number;
  mtime: string;
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
    tunnelAddress: null,
    binaryExists: false,
    secretExists: false,
  });
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}${API_BASE}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      reconnectTimer.current = setTimeout(connect, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (event: MessageEvent) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; payload: unknown };
        switch (msg.type) {
          case "init": {
            const p = msg.payload as { status: ServerStatus; logs: string[]; playit?: PlayitInfo };
            setStatus(p.status);
            setLogs(p.logs);
            if (p.playit) setPlayit(p.playit);
            break;
          }
          case "log":
          case "playit_log":
            setLogs((prev) => [...prev.slice(-499), msg.payload as string]);
            break;
          case "status":
            setStatus(msg.payload as ServerStatus);
            break;
          case "playit_status":
            setPlayit((prev) => ({ ...prev, status: msg.payload as PlayitStatus }));
            break;
          case "playit_claim":
            setPlayit((prev) => ({ ...prev, claimUrl: msg.payload as string | null }));
            break;
          case "playit_setup":
            setPlayit((prev) => ({ ...prev, isSetup: msg.payload as boolean, claimUrl: null, secretExists: msg.payload as boolean }));
            break;
          case "playit_address":
            setPlayit((prev) => ({ ...prev, tunnelAddress: msg.payload as string | null }));
            break;
        }
      } catch { /* ignore */ }
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const startServer = () => fetch(`${API_BASE}/minecraft/start`, { method: "POST" });
  const stopServer = () => fetch(`${API_BASE}/minecraft/stop`, { method: "POST" });
  const sendCommand = (command: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN)
      wsRef.current.send(JSON.stringify({ type: "command", payload: command }));
  };
  const startPlayit = () => fetch(`${API_BASE}/playit/start`, { method: "POST" });
  const stopPlayit = () => fetch(`${API_BASE}/playit/stop`, { method: "POST" });
  const resetPlayit = () => fetch(`${API_BASE}/playit/reset`, { method: "POST" });

  const fetchInstalledPlugins = async (): Promise<InstalledPlugin[]> => {
    const r = await fetch(`${API_BASE}/plugins/installed`);
    const d = await r.json() as { plugins: InstalledPlugin[] };
    return d.plugins ?? [];
  };

  const deletePlugin = async (filename: string): Promise<{ success: boolean; message: string }> => {
    const r = await fetch(`${API_BASE}/plugins/${encodeURIComponent(filename)}`, { method: "DELETE" });
    return r.json() as Promise<{ success: boolean; message: string }>;
  };

  return {
    logs, status, connected,
    startServer, stopServer, sendCommand,
    playit, startPlayit, stopPlayit, resetPlayit,
    fetchInstalledPlugins, deletePlugin,
  };
}
