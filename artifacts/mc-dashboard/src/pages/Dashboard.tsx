import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { useMinecraftServer, type ServerStatus } from "@/hooks/useMinecraftServer";

function getLogColor(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("[error]") || l.includes("error") || l.includes("exception") || l.includes("failed")) return "text-red-400";
  if (l.includes("[warn]") || l.includes("warning")) return "text-yellow-400";
  if (l.includes("done (") || l.includes("starting minecraft") || l.includes("joined the game") || l.includes("logged in")) return "text-green-400";
  if (l.includes("left the game") || l.includes("lost connection") || l.includes("disconnected")) return "text-orange-400";
  if (l.includes("[info]")) return "text-slate-300";
  if (l.includes("> ")) return "text-cyan-400";
  if (l.includes("[dashboard]")) return "text-blue-400";
  return "text-slate-400";
}

function StatusBadge({ status }: { status: ServerStatus }) {
  const configs: Record<ServerStatus, { label: string; classes: string; dot: string }> = {
    stopped: { label: "Stopped", classes: "bg-slate-700 text-slate-300 border-slate-600", dot: "bg-slate-400" },
    starting: { label: "Starting...", classes: "bg-yellow-900/40 text-yellow-300 border-yellow-700", dot: "bg-yellow-400 animate-pulse" },
    running: { label: "Online", classes: "bg-green-900/40 text-green-300 border-green-700", dot: "bg-green-400" },
    stopping: { label: "Stopping...", classes: "bg-orange-900/40 text-orange-300 border-orange-700", dot: "bg-orange-400 animate-pulse" },
  };
  const c = configs[status];
  return (
    <span data-testid="status-badge" className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-sm font-medium ${c.classes}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  );
}

export default function Dashboard() {
  const { logs, status, connected, startServer, stopServer, sendCommand } = useMinecraftServer();
  const [command, setCommand] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    setAutoScroll(atBottom);
  };

  const handleSendCommand = () => {
    const cmd = command.trim();
    if (!cmd) return;
    sendCommand(cmd);
    setCmdHistory((prev) => [cmd, ...prev.slice(0, 49)]);
    setHistoryIndex(-1);
    setCommand("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      handleSendCommand();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIndex + 1, cmdHistory.length - 1);
      setHistoryIndex(next);
      setCommand(cmdHistory[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = Math.max(historyIndex - 1, -1);
      setHistoryIndex(next);
      setCommand(next === -1 ? "" : (cmdHistory[next] ?? ""));
    }
  };

  const isRunning = status === "running";
  const canStart = status === "stopped";
  const canStop = status === "running" || status === "starting";

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border bg-card/80 backdrop-blur sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center text-lg">
              ⛏️
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground leading-none">Minecraft Server</h1>
              <p className="text-xs text-muted-foreground mt-0.5">PaperMC 1.21.5 • Crossplatform</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* WS connection dot */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-400" : "bg-red-400"}`} />
              {connected ? "Connected" : "Reconnecting..."}
            </div>

            <StatusBadge status={status} />

            <div className="flex gap-2">
              <button
                data-testid="button-start"
                onClick={startServer}
                disabled={!canStart}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Start
              </button>
              <button
                data-testid="button-stop"
                onClick={stopServer}
                disabled={!canStop}
                className="px-4 py-1.5 rounded-md text-sm font-medium bg-destructive/90 text-destructive-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
              >
                Stop
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Info bar */}
      <div className="bg-card/50 border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
          <span>Port: <span className="text-foreground font-mono">25565</span> (Java)</span>
          <span>Bedrock: <span className="text-foreground font-mono">19132</span> (Geyser)</span>
          <span>Plugins: <span className="text-green-400">Geyser · Floodgate · ViaVersion · ViaBackwards · playit</span></span>
          <span className="ml-auto">Mode: <span className="text-foreground">Offline (cracked ok)</span></span>
        </div>
      </div>

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-4 gap-3">
        {/* Log console */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-[#0d1117] overflow-hidden min-h-0">
          {/* Console header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-black/30">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-red-500/70" />
              <span className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <span className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-xs text-muted-foreground font-mono">server.log</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">{logs.length} lines</span>
              <button
                data-testid="button-autoscroll"
                onClick={() => setAutoScroll((v) => !v)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  autoScroll
                    ? "border-primary/50 text-primary bg-primary/10"
                    : "border-border text-muted-foreground hover:border-border/80"
                }`}
              >
                Auto-scroll {autoScroll ? "ON" : "OFF"}
              </button>
              <button
                data-testid="button-clear"
                onClick={() => window.location.reload()}
                className="text-xs px-2 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Clear
              </button>
            </div>
          </div>

          {/* Log output */}
          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            data-testid="log-container"
            className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed"
            style={{ minHeight: "300px", maxHeight: "calc(100vh - 280px)" }}
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2">
                <p className="text-sm">No logs yet.</p>
                <p className="text-xs opacity-60">Start the server to see output here.</p>
              </div>
            ) : (
              logs.map((line, i) => (
                <div
                  key={i}
                  data-testid={`log-line-${i}`}
                  className={`whitespace-pre-wrap break-all ${getLogColor(line)}`}
                >
                  {line}
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          {/* Command input */}
          <div className="border-t border-border/60 bg-black/20 px-4 py-2 flex gap-2 items-center">
            <span className="text-primary font-mono text-sm select-none">&gt;</span>
            <input
              data-testid="input-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isRunning}
              placeholder={isRunning ? "Type a server command (e.g. list, say hello)..." : "Server must be running to send commands"}
              className="flex-1 bg-transparent outline-none font-mono text-sm text-cyan-300 placeholder:text-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-50"
            />
            <button
              data-testid="button-send-command"
              onClick={handleSendCommand}
              disabled={!isRunning || !command.trim()}
              className="px-3 py-1 rounded text-xs bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-mono"
            >
              Send ↵
            </button>
          </div>
        </div>

        {/* Plugin cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {[
            { name: "Geyser", desc: "Bedrock support", color: "text-blue-400", bg: "bg-blue-900/20 border-blue-800/40" },
            { name: "Floodgate", desc: "Bedrock auth", color: "text-cyan-400", bg: "bg-cyan-900/20 border-cyan-800/40" },
            { name: "ViaVersion", desc: "Newer versions", color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800/40" },
            { name: "ViaBackwards", desc: "Older versions", color: "text-pink-400", bg: "bg-pink-900/20 border-pink-800/40" },
            { name: "playit.gg", desc: "Public tunnel", color: "text-green-400", bg: "bg-green-900/20 border-green-800/40" },
          ].map((p) => (
            <div key={p.name} className={`rounded-lg border p-3 ${p.bg}`}>
              <p className={`text-sm font-semibold ${p.color}`}>{p.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
              <div className="mt-1.5 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                <span className="text-xs text-green-400">Installed</span>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
