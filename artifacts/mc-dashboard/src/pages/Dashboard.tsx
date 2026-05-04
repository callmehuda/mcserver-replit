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
  if (l.includes("[playit]")) return "text-violet-400";
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

interface HangarProject {
  namespace: { slug: string; owner: string };
  name: string;
  description: string;
  stats: { downloads: number };
  category: string;
}

interface HangarSearchResult {
  result: HangarProject[];
  pagination: { count: number };
}

function PluginInstaller() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HangarProject[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installedMsg, setInstalledMsg] = useState<Record<string, string>>({});
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = async () => {
    if (!query.trim()) return;
    setSearching(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await fetch(`/api/plugins/search?q=${encodeURIComponent(query)}&limit=10`);
      const data = (await res.json()) as HangarSearchResult;
      setResults(data.result ?? []);
      if ((data.result ?? []).length === 0) setSearchError("No plugins found.");
    } catch {
      setSearchError("Search failed. Check connection.");
    } finally {
      setSearching(false);
    }
  };

  const handleInstall = async (slug: string) => {
    setInstalling(slug);
    setInstalledMsg((prev) => ({ ...prev, [slug]: "" }));
    try {
      const res = await fetch("/api/plugins/install", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const data = (await res.json()) as { success: boolean; message: string };
      setInstalledMsg((prev) => ({ ...prev, [slug]: data.message }));
    } catch {
      setInstalledMsg((prev) => ({ ...prev, [slug]: "Install failed." }));
    } finally {
      setInstalling(null);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">🔌</span>
        <h2 className="text-sm font-semibold text-foreground">Install Plugin</h2>
        <span className="text-xs text-muted-foreground ml-1">via Hangar (PaperMC)</span>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="Search plugins... (e.g. LuckPerms, Essentials)"
          className="flex-1 bg-background border border-border rounded-md px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/60 transition-colors"
        />
        <button
          onClick={handleSearch}
          disabled={searching || !query.trim()}
          className="px-4 py-1.5 rounded-md text-sm font-medium bg-primary text-primary-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity whitespace-nowrap"
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>

      {searchError && (
        <p className="text-xs text-muted-foreground mb-2">{searchError}</p>
      )}

      {results.length > 0 && (
        <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
          {results.map((p) => (
            <div
              key={p.namespace.slug}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-background/50 px-3 py-2.5"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{p.name}</span>
                  <span className="text-xs text-muted-foreground">by {p.namespace.owner}</span>
                  <span className="text-xs text-muted-foreground/60">·</span>
                  <span className="text-xs text-muted-foreground/60">{p.stats.downloads.toLocaleString()} downloads</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>
                {installedMsg[p.namespace.slug] && (
                  <p className={`text-xs mt-1 ${installedMsg[p.namespace.slug].includes("failed") || installedMsg[p.namespace.slug].includes("Error") ? "text-red-400" : "text-green-400"}`}>
                    {installedMsg[p.namespace.slug]}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleInstall(p.namespace.slug)}
                disabled={installing === p.namespace.slug}
                className="shrink-0 px-3 py-1 rounded text-xs font-medium bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {installing === p.namespace.slug ? "Installing..." : "Install"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { logs, status, connected, startServer, stopServer, sendCommand, playit, startPlayit, stopPlayit, resetPlayit } = useMinecraftServer();
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

  const playitCanStart = playit.status === "stopped";
  const playitCanStop = playit.status !== "stopped";

  const playitStatusColors: Record<string, string> = {
    stopped: "bg-slate-400",
    downloading: "bg-blue-400 animate-pulse",
    starting: "bg-yellow-400 animate-pulse",
    claiming: "bg-yellow-400 animate-pulse",
    waiting_claim: "bg-orange-400 animate-pulse",
    running: "bg-green-400",
  };

  const playitStatusLabels: Record<string, string> = {
    stopped: "Stopped",
    downloading: "Downloading...",
    starting: "Starting...",
    claiming: "Generating...",
    waiting_claim: "Waiting Claim",
    running: "Running",
  };

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
          <span>Plugins: <span className="text-green-400">Geyser · Floodgate · ViaVersion · ViaBackwards</span></span>
          <span className="ml-auto">Mode: <span className="text-foreground">Offline (cracked ok)</span></span>
        </div>
      </div>

      {/* playit claim code banner */}
      {playit.claimUrl && !playit.isSetup && (
        <div className="bg-orange-950/60 border-b border-orange-700/50">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse" />
              <span className="text-sm font-semibold text-orange-300">playit.gg needs to be claimed</span>
            </div>
            <div className="flex items-center gap-2 bg-black/30 border border-orange-700/40 rounded-lg px-3 py-1.5">
              <span className="font-mono text-xs text-orange-200 break-all">{playit.claimUrl}</span>
              <button
                onClick={() => navigator.clipboard.writeText(playit.claimUrl!)}
                className="text-xs text-orange-400 hover:text-orange-200 transition-colors ml-1 shrink-0"
                title="Copy claim URL"
              >
                Copy
              </button>
            </div>
            <a
              href={playit.claimUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs px-3 py-1.5 rounded-md bg-orange-600/70 hover:bg-orange-600 text-white transition-colors font-medium"
            >
              Open & Claim →
            </a>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-4 gap-3">
        {/* Log console */}
        <div className="flex-1 flex flex-col rounded-xl border border-border bg-[#0d1117] overflow-hidden min-h-0">
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

          <div
            ref={logContainerRef}
            onScroll={handleScroll}
            data-testid="log-container"
            className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed"
            style={{ minHeight: "300px", maxHeight: "calc(100vh - 320px)" }}
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

        {/* Bottom row: playit card + plugin cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Playit tunnel card */}
          <div className="rounded-xl border border-violet-800/40 bg-violet-900/20 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-base">🌐</span>
                <span className="text-sm font-semibold text-violet-300">playit.gg Tunnel</span>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border ${
                playit.status === "running"
                  ? "bg-green-900/40 text-green-300 border-green-700"
                  : playit.status === "claiming"
                  ? "bg-orange-900/40 text-orange-300 border-orange-700"
                  : playit.status === "stopped"
                  ? "bg-slate-700 text-slate-300 border-slate-600"
                  : "bg-yellow-900/40 text-yellow-300 border-yellow-700"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${playitStatusColors[playit.status]}`} />
                {playitStatusLabels[playit.status]}
              </span>
            </div>

            <p className="text-xs text-muted-foreground">
              {playit.isSetup
                ? "Tunnel active. Players can connect via your playit.gg address."
                : playit.status === "waiting_claim"
                ? "Open the claim URL above, then wait — tunnel will start automatically."
                : playit.status === "claiming"
                ? "Generating claim code..."
                : "Start the tunnel to get a public IP for your server."}
            </p>

            <div className="flex gap-2 flex-wrap">
              <button
                onClick={startPlayit}
                disabled={!playitCanStart}
                className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium bg-violet-600/70 hover:bg-violet-600 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {playit.status === "downloading" ? "Downloading..." : "Start Tunnel"}
              </button>
              <button
                onClick={stopPlayit}
                disabled={!playitCanStop}
                className="flex-1 px-3 py-1.5 rounded-md text-xs font-medium bg-destructive/70 text-destructive-foreground disabled:opacity-40 disabled:cursor-not-allowed hover:bg-destructive/90 transition-colors"
              >
                Stop
              </button>
              {playit.secretExists && (
                <button
                  onClick={resetPlayit}
                  disabled={playitCanStop}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  title="Remove saved secret and re-claim"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Plugin cards */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { name: "Geyser", desc: "Bedrock support", color: "text-blue-400", bg: "bg-blue-900/20 border-blue-800/40" },
              { name: "Floodgate", desc: "Bedrock auth", color: "text-cyan-400", bg: "bg-cyan-900/20 border-cyan-800/40" },
              { name: "ViaVersion", desc: "Newer versions", color: "text-purple-400", bg: "bg-purple-900/20 border-purple-800/40" },
              { name: "ViaBackwards", desc: "Older versions", color: "text-pink-400", bg: "bg-pink-900/20 border-pink-800/40" },
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
        </div>

        {/* Plugin installer */}
        <PluginInstaller />
      </main>
    </div>
  );
}
