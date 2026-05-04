import { useRef, useEffect, useState, type KeyboardEvent } from "react";
import { useMinecraftServer, type ServerStatus, type InstalledPlugin } from "@/hooks/useMinecraftServer";

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function getLogColor(line: string): string {
  const l = line.toLowerCase();
  if (l.includes("[error]") || l.includes("exception") || l.includes("failed")) return "text-red-400";
  if (l.includes("[warn]") || l.includes("warning")) return "text-yellow-300";
  if (l.includes("done (") || l.includes("joined the game") || l.includes("logged in")) return "text-green-400";
  if (l.includes("left the game") || l.includes("disconnected")) return "text-orange-400";
  if (l.includes("> ")) return "text-cyan-300";
  if (l.includes("[playit]")) return "text-violet-300";
  if (l.includes("[dashboard]")) return "text-blue-300";
  return "text-zinc-300";
}

function fmt(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/* ─── Neo-Brutalism primitives ─────────────────────────────────────────────── */

function NbCard({ children, className = "", accent = "border-white" }: { children: React.ReactNode; className?: string; accent?: string }) {
  return (
    <div className={`border-2 ${accent} bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(255,255,255,0.15)] ${className}`}>
      {children}
    </div>
  );
}

function NbBadge({ label, dot, dotColor, bg, text, border }: { label: string; dot?: boolean; dotColor?: string; bg: string; text: string; border: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 border-2 ${border} ${bg} ${text} font-bold text-xs uppercase tracking-wider`}>
      {dot && <span className={`w-2 h-2 rounded-full ${dotColor}`} />}
      {label}
    </span>
  );
}

function NbBtn({ children, onClick, disabled, variant = "default", className = "", title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean;
  variant?: "default" | "danger" | "ghost" | "yellow" | "violet"; className?: string; title?: string;
}) {
  const variants = {
    default: "bg-white text-black border-white hover:bg-zinc-200 shadow-[3px_3px_0px_0px_rgba(255,255,255,0.3)]",
    danger: "bg-red-500 text-white border-red-500 hover:bg-red-400 shadow-[3px_3px_0px_0px_rgba(239,68,68,0.4)]",
    ghost: "bg-transparent text-zinc-300 border-zinc-600 hover:border-zinc-400 hover:text-white",
    yellow: "bg-yellow-400 text-black border-yellow-400 hover:bg-yellow-300 shadow-[3px_3px_0px_0px_rgba(234,179,8,0.4)]",
    violet: "bg-violet-500 text-white border-violet-500 hover:bg-violet-400 shadow-[3px_3px_0px_0px_rgba(139,92,246,0.4)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`px-3 py-1.5 border-2 font-bold text-xs uppercase tracking-wider transition-all active:translate-x-[1px] active:translate-y-[1px] active:shadow-none disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}

/* ─── Status badge ─────────────────────────────────────────────────────────── */

function StatusBadge({ status }: { status: ServerStatus }) {
  const cfg: Record<ServerStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
    stopped:  { label: "Offline",    bg: "bg-zinc-800",       text: "text-zinc-300",   border: "border-zinc-600", dot: "bg-zinc-500" },
    starting: { label: "Starting",   bg: "bg-yellow-900/60",  text: "text-yellow-300", border: "border-yellow-500", dot: "bg-yellow-400 animate-pulse" },
    running:  { label: "Online",     bg: "bg-green-900/60",   text: "text-green-300",  border: "border-green-500", dot: "bg-green-400" },
    stopping: { label: "Stopping",   bg: "bg-orange-900/60",  text: "text-orange-300", border: "border-orange-500", dot: "bg-orange-400 animate-pulse" },
  };
  const c = cfg[status];
  return <NbBadge label={c.label} dot dotColor={c.dot} bg={c.bg} text={c.text} border={c.border} />;
}

/* ─── Plugin Installer ─────────────────────────────────────────────────────── */

interface HangarProject {
  namespace: { slug: string; owner: string };
  name: string;
  description: string;
  stats: { downloads: number };
}

function PluginInstaller() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<HangarProject[]>([]);
  const [searching, setSearching] = useState(false);
  const [installing, setInstalling] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!query.trim()) return;
    setSearching(true); setError(null); setResults([]);
    try {
      const r = await fetch(`/api/plugins/search?q=${encodeURIComponent(query)}&limit=10`);
      const d = await r.json() as { result: HangarProject[] };
      setResults(d.result ?? []);
      if (!d.result?.length) setError("No plugins found.");
    } catch { setError("Search failed."); }
    finally { setSearching(false); }
  };

  const install = async (slug: string) => {
    setInstalling(slug);
    setMsgs((p) => ({ ...p, [slug]: "" }));
    try {
      const r = await fetch("/api/plugins/install", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug }),
      });
      const d = await r.json() as { success: boolean; message: string };
      setMsgs((p) => ({ ...p, [slug]: d.message }));
    } catch { setMsgs((p) => ({ ...p, [slug]: "Install failed." })); }
    finally { setInstalling(null); }
  };

  return (
    <NbCard accent="border-cyan-500" className="shadow-[4px_4px_0px_0px_rgba(6,182,212,0.3)]">
      <div className="border-b-2 border-cyan-500 px-4 py-2 flex items-center gap-2 bg-cyan-950/40">
        <span className="font-black text-sm uppercase tracking-widest text-cyan-300">⬇ Install Plugin</span>
        <span className="text-xs text-zinc-500 font-mono">via Hangar PaperMC</span>
      </div>
      <div className="p-4">
        <div className="flex gap-2 mb-3">
          <input
            type="text" value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="Search plugins... (LuckPerms, Essentials...)"
            className="flex-1 bg-zinc-950 border-2 border-zinc-600 focus:border-cyan-500 outline-none px-3 py-1.5 text-sm font-mono text-white placeholder:text-zinc-600 transition-colors"
          />
          <NbBtn onClick={search} disabled={searching || !query.trim()} variant="yellow">
            {searching ? "..." : "Search"}
          </NbBtn>
        </div>

        {error && <p className="text-xs text-red-400 font-mono mb-2">{error}</p>}

        {results.length > 0 && (
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {results.map((p) => (
              <div key={p.namespace.slug} className="border-2 border-zinc-700 bg-zinc-950 p-2.5 flex items-start justify-between gap-3 hover:border-zinc-500 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-bold text-white">{p.name}</span>
                    <span className="text-xs text-zinc-500 font-mono">by {p.namespace.owner}</span>
                    <span className="text-xs text-zinc-600">· {p.stats.downloads.toLocaleString()} dl</span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5 line-clamp-1">{p.description}</p>
                  {msgs[p.namespace.slug] && (
                    <p className={`text-xs mt-1 font-bold ${msgs[p.namespace.slug].includes("failed") ? "text-red-400" : "text-green-400"}`}>
                      {msgs[p.namespace.slug]}
                    </p>
                  )}
                </div>
                <NbBtn onClick={() => install(p.namespace.slug)} disabled={installing === p.namespace.slug} variant="violet" className="shrink-0">
                  {installing === p.namespace.slug ? "..." : "Install"}
                </NbBtn>
              </div>
            ))}
          </div>
        )}
      </div>
    </NbCard>
  );
}

/* ─── Plugin Manager ─────────────────────────────────────────────────────────  */

function PluginManager({ deletePlugin }: { deletePlugin: (f: string) => Promise<{ success: boolean; message: string }> }) {
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch("/api/plugins/installed");
      const d = await r.json() as { plugins: InstalledPlugin[] };
      setPlugins(d.plugins ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const del = async (name: string) => {
    if (!confirm(`Delete ${name}?`)) return;
    setDeleting(name);
    await deletePlugin(name);
    await load();
    setDeleting(null);
  };

  return (
    <NbCard accent="border-orange-500" className="shadow-[4px_4px_0px_0px_rgba(249,115,22,0.3)]">
      <div className="border-b-2 border-orange-500 px-4 py-2 flex items-center justify-between bg-orange-950/30">
        <span className="font-black text-sm uppercase tracking-widest text-orange-300">📦 Manage Plugins</span>
        <NbBtn onClick={load} variant="ghost" className="text-[10px] py-0.5">Refresh</NbBtn>
      </div>
      <div className="p-4">
        {loading ? (
          <p className="text-xs text-zinc-500 font-mono">Loading...</p>
        ) : plugins.length === 0 ? (
          <p className="text-xs text-zinc-500 font-mono">No plugins installed.</p>
        ) : (
          <div className="space-y-1.5">
            {plugins.map((p) => (
              <div key={p.name} className="border-2 border-zinc-700 bg-zinc-950 px-3 py-2 flex items-center justify-between gap-3 hover:border-zinc-500 transition-colors">
                <div className="min-w-0">
                  <p className="text-xs font-bold text-white font-mono truncate">{p.name}</p>
                  <p className="text-[10px] text-zinc-500">{fmt(p.size)}</p>
                </div>
                <NbBtn onClick={() => del(p.name)} disabled={deleting === p.name} variant="danger" className="shrink-0 text-[10px] py-0.5">
                  {deleting === p.name ? "..." : "Delete"}
                </NbBtn>
              </div>
            ))}
          </div>
        )}
      </div>
    </NbCard>
  );
}

/* ─── Main Dashboard ────────────────────────────────────────────────────────── */

export default function Dashboard() {
  const {
    logs, status, connected, startServer, stopServer, sendCommand,
    playit, startPlayit, stopPlayit, resetPlayit, deletePlugin,
  } = useMinecraftServer();

  const [command, setCommand] = useState("");
  const [autoScroll, setAutoScroll] = useState(true);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [copied, setCopied] = useState(false);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && logEndRef.current) logEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const handleScroll = () => {
    const el = logContainerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  const handleSendCommand = () => {
    const cmd = command.trim();
    if (!cmd) return;
    sendCommand(cmd);
    setCmdHistory((p) => [cmd, ...p.slice(0, 49)]);
    setHistoryIndex(-1);
    setCommand("");
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { handleSendCommand(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); const n = Math.min(historyIndex + 1, cmdHistory.length - 1); setHistoryIndex(n); setCommand(cmdHistory[n] ?? ""); }
    else if (e.key === "ArrowDown") { e.preventDefault(); const n = Math.max(historyIndex - 1, -1); setHistoryIndex(n); setCommand(n === -1 ? "" : (cmdHistory[n] ?? "")); }
  };

  const copyClaimUrl = () => {
    if (playit.claimUrl) {
      navigator.clipboard.writeText(playit.claimUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isRunning = status === "running";
  const canStart = status === "stopped";
  const canStop = status === "running" || status === "starting";
  const playitCanStart = playit.status === "stopped";
  const playitCanStop = playit.status !== "stopped";

  const playitStatusCfg: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
    stopped:      { label: "Offline",        bg: "bg-zinc-800",       text: "text-zinc-300",   border: "border-zinc-600",   dot: "bg-zinc-500" },
    downloading:  { label: "Downloading",    bg: "bg-blue-900/60",    text: "text-blue-300",   border: "border-blue-500",   dot: "bg-blue-400 animate-pulse" },
    starting:     { label: "Starting",       bg: "bg-yellow-900/60",  text: "text-yellow-300", border: "border-yellow-500", dot: "bg-yellow-400 animate-pulse" },
    waiting_claim:{ label: "Needs Claim",    bg: "bg-orange-900/60",  text: "text-orange-300", border: "border-orange-500", dot: "bg-orange-400 animate-pulse" },
    running:      { label: "Tunnel Active",  bg: "bg-green-900/60",   text: "text-green-300",  border: "border-green-500",  dot: "bg-green-400" },
  };
  const psCfg = playitStatusCfg[playit.status] ?? playitStatusCfg.stopped;

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans">

      {/* ── Header ── */}
      <header className="border-b-2 border-white bg-zinc-900 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 border-2 border-white bg-zinc-950 flex items-center justify-center text-xl shadow-[3px_3px_0px_rgba(255,255,255,0.2)]">
              ⛏
            </div>
            <div>
              <h1 className="text-base font-black uppercase tracking-widest text-white leading-none">Minecraft Server</h1>
              <p className="text-[10px] text-zinc-500 font-mono mt-0.5 uppercase tracking-wider">PaperMC 1.21.5 · Crossplatform</p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
              <span className={`w-2 h-2 border ${connected ? "border-green-400 bg-green-400" : "border-red-400 bg-red-400"}`} />
              {connected ? "WS Connected" : "Reconnecting"}
            </div>
            <StatusBadge status={status} />
            <div className="flex gap-1.5">
              <NbBtn onClick={startServer} disabled={!canStart} variant="default">Start</NbBtn>
              <NbBtn onClick={stopServer} disabled={!canStop} variant="danger">Stop</NbBtn>
            </div>
          </div>
        </div>
      </header>

      {/* ── Info bar ── */}
      <div className="border-b border-zinc-800 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 py-1.5 flex flex-wrap gap-4 text-[11px] font-mono text-zinc-500">
          <span>Java: <span className="text-white">:25565</span></span>
          <span>Bedrock: <span className="text-white">:19132</span></span>
          <span>Plugins: <span className="text-green-400">Geyser · Floodgate · ViaVersion · ViaBackwards</span></span>
          <span className="ml-auto">Mode: <span className="text-yellow-400">Offline / Cracked</span></span>
        </div>
      </div>

      {/* ── Claim URL Banner ── */}
      {playit.claimUrl && !playit.isSetup && (
        <div className="border-b-2 border-orange-500 bg-orange-950/70 shadow-[0_4px_0px_rgba(249,115,22,0.3)]">
          <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-orange-400 animate-pulse" />
              <span className="text-sm font-black uppercase tracking-widest text-orange-300">⚡ Claim Your Tunnel</span>
            </div>
            <div className="flex-1 min-w-0 border-2 border-orange-600 bg-zinc-950 px-3 py-1.5 flex items-center gap-2">
              <span className="font-mono text-xs text-orange-200 truncate flex-1">{playit.claimUrl}</span>
              <NbBtn onClick={copyClaimUrl} variant="ghost" className="shrink-0 text-[10px] py-0.5">
                {copied ? "Copied!" : "Copy"}
              </NbBtn>
            </div>
            <a
              href={playit.claimUrl} target="_blank" rel="noopener noreferrer"
              className="px-4 py-1.5 border-2 border-orange-400 bg-orange-500 hover:bg-orange-400 text-white font-black text-xs uppercase tracking-wider shadow-[3px_3px_0px_rgba(249,115,22,0.5)] transition-all active:translate-x-px active:translate-y-px active:shadow-none"
            >
              Open & Claim →
            </a>
            <p className="text-xs text-orange-400/70 font-mono w-full">After claiming, tunnel will start automatically.</p>
          </div>
        </div>
      )}

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col max-w-7xl mx-auto w-full px-4 py-4 gap-4">

        {/* Log Console */}
        <NbCard accent="border-zinc-600" className="flex flex-col shadow-[4px_4px_0px_0px_rgba(255,255,255,0.08)]">
          <div className="border-b-2 border-zinc-600 px-4 py-2 flex items-center justify-between bg-zinc-950">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-red-500 bg-red-500/40" />
              <span className="w-3 h-3 border-2 border-yellow-500 bg-yellow-500/40" />
              <span className="w-3 h-3 border-2 border-green-500 bg-green-500/40" />
              <span className="ml-2 text-xs font-mono text-zinc-500 uppercase tracking-wider">server.log</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-600">{logs.length} lines</span>
              <NbBtn onClick={() => setAutoScroll((v) => !v)} variant="ghost" className={`text-[10px] py-0.5 ${autoScroll ? "border-green-500 text-green-400" : ""}`}>
                Scroll {autoScroll ? "ON" : "OFF"}
              </NbBtn>
              <NbBtn onClick={() => window.location.reload()} variant="ghost" className="text-[10px] py-0.5">Clear</NbBtn>
            </div>
          </div>

          <div
            ref={logContainerRef} onScroll={handleScroll}
            className="overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed bg-[#080808]"
            style={{ minHeight: "260px", maxHeight: "calc(100vh - 360px)" }}
          >
            {logs.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-zinc-700 gap-1 min-h-[200px]">
                <p className="text-sm font-bold uppercase tracking-wider">No output yet</p>
                <p className="text-xs opacity-60">Start the server to see logs.</p>
              </div>
            ) : (
              logs.map((line, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${getLogColor(line)}`}>{line}</div>
              ))
            )}
            <div ref={logEndRef} />
          </div>

          <div className="border-t-2 border-zinc-700 bg-zinc-950 px-4 py-2 flex gap-2 items-center">
            <span className="text-cyan-400 font-mono text-sm select-none font-bold">›</span>
            <input
              type="text" value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={!isRunning}
              placeholder={isRunning ? "Type command (list, say hello...)" : "Server must be running"}
              className="flex-1 bg-transparent outline-none font-mono text-sm text-cyan-300 placeholder:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <NbBtn onClick={handleSendCommand} disabled={!isRunning || !command.trim()} variant="ghost" className="font-mono text-[10px]">
              Send ↵
            </NbBtn>
          </div>
        </NbCard>

        {/* playit + installed plugins row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Playit Tunnel Card */}
          <NbCard accent="border-violet-500" className="shadow-[4px_4px_0px_0px_rgba(139,92,246,0.35)] flex flex-col">
            <div className="border-b-2 border-violet-500 px-4 py-2 flex items-center justify-between bg-violet-950/40">
              <span className="font-black text-sm uppercase tracking-widest text-violet-300">🌐 Playit Tunnel</span>
              <NbBadge label={psCfg.label} dot dotColor={psCfg.dot} bg={psCfg.bg} text={psCfg.text} border={psCfg.border} />
            </div>

            <div className="p-4 flex flex-col gap-3 flex-1">
              {playit.tunnelAddress && (
                <div className="border-2 border-green-500 bg-green-950/40 px-3 py-2">
                  <p className="text-[10px] uppercase tracking-widest text-green-400 font-bold mb-0.5">Tunnel Address</p>
                  <p className="font-mono text-sm text-white font-bold break-all">{playit.tunnelAddress}</p>
                </div>
              )}

              <p className="text-xs text-zinc-400 font-mono">
                {playit.isSetup
                  ? "Tunnel is active. Share the address above with players."
                  : playit.status === "waiting_claim"
                  ? "Visit claim URL above → tunnel starts automatically."
                  : "Start the tunnel to expose your server publicly."}
              </p>

              <div className="flex gap-1.5 flex-wrap mt-auto">
                <NbBtn onClick={startPlayit} disabled={!playitCanStart} variant="violet" className="flex-1">
                  {playit.status === "downloading" ? "Downloading..." : "Start"}
                </NbBtn>
                <NbBtn onClick={stopPlayit} disabled={!playitCanStop} variant="danger" className="flex-1">Stop</NbBtn>
                {playit.secretExists && (
                  <NbBtn onClick={resetPlayit} disabled={playitCanStop} variant="ghost" className="text-[10px]" title="Re-claim agent">Reset</NbBtn>
                )}
              </div>
            </div>
          </NbCard>

          {/* Plugin status cards */}
          <div className="md:col-span-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { name: "Geyser",       desc: "Bedrock support",  color: "border-blue-500",   header: "bg-blue-950/50 text-blue-300",   shadow: "shadow-[3px_3px_0px_rgba(59,130,246,0.3)]" },
              { name: "Floodgate",    desc: "Bedrock auth",     color: "border-cyan-500",   header: "bg-cyan-950/50 text-cyan-300",   shadow: "shadow-[3px_3px_0px_rgba(6,182,212,0.3)]" },
              { name: "ViaVersion",   desc: "Newer clients",    color: "border-purple-500", header: "bg-purple-950/50 text-purple-300", shadow: "shadow-[3px_3px_0px_rgba(168,85,247,0.3)]" },
              { name: "ViaBackwards", desc: "Older clients",    color: "border-pink-500",   header: "bg-pink-950/50 text-pink-300",   shadow: "shadow-[3px_3px_0px_rgba(236,72,153,0.3)]" },
            ].map((p) => (
              <div key={p.name} className={`border-2 ${p.color} bg-zinc-900 ${p.shadow}`}>
                <div className={`border-b-2 ${p.color} px-2 py-1.5 ${p.header}`}>
                  <p className="text-xs font-black uppercase tracking-wide truncate">{p.name}</p>
                </div>
                <div className="px-2 py-2">
                  <p className="text-[10px] text-zinc-500 font-mono">{p.desc}</p>
                  <div className="mt-2 flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-green-400" />
                    <span className="text-[10px] text-green-400 font-bold uppercase">Loaded</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Install + Manage row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PluginInstaller />
          <PluginManager deletePlugin={deletePlugin} />
        </div>

      </main>
    </div>
  );
}
