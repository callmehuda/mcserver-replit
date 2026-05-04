import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import { logger } from "./logger.js";

export type PlayitStatus = "stopped" | "downloading" | "starting" | "waiting_claim" | "running";

const PLAYIT_BINARY_URL = "https://builds.playit.gg/0.17.1/playit-linux-amd64";
const PLAYIT_BINARY_PATH = path.resolve("/home/runner/workspace/playit-binary");
const PLAYIT_SECRET_PATH = "/home/runner/workspace/.config/playit_gg/playit.toml";

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          fs.createWriteStream(dest);
          get(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => { fs.unlink(dest, () => {}); reject(err); });
      }).on("error", reject);
    };
    get(url);
  });
}

class PlayitManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private _status: PlayitStatus = "stopped";
  private _claimUrl: string | null = null;
  private _isSetup = false;
  private _tunnelAddress: string | null = null;

  get status(): PlayitStatus { return this._status; }
  get claimUrl(): string | null { return this._claimUrl; }
  get isSetup(): boolean { return this._isSetup; }
  get tunnelAddress(): string | null { return this._tunnelAddress; }

  private setStatus(s: PlayitStatus) { this._status = s; this.emit("playit_status", s); }
  private setClaimUrl(u: string | null) { this._claimUrl = u; this.emit("playit_claim", u); }
  private setTunnelAddress(a: string | null) { this._tunnelAddress = a; this.emit("playit_address", a); }
  private setSetup(v: boolean) {
    this._isSetup = v;
    if (v) { this._claimUrl = null; this.emit("playit_claim", null); }
    this.emit("playit_setup", v);
  }
  private log(msg: string) { this.emit("playit_log", msg); }

  async start(): Promise<{ success: boolean; message: string }> {
    if (this._status !== "stopped") {
      return { success: false, message: `Playit is already ${this._status}` };
    }

    if (!fs.existsSync(PLAYIT_BINARY_PATH)) {
      this.setStatus("downloading");
      this.log("[playit] Downloading playit binary...");
      try {
        await downloadFile(PLAYIT_BINARY_URL, PLAYIT_BINARY_PATH);
        fs.chmodSync(PLAYIT_BINARY_PATH, 0o755);
        this.log("[playit] Binary downloaded successfully.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log(`[playit] Download failed: ${msg}`);
        this.setStatus("stopped");
        return { success: false, message: `Download failed: ${msg}` };
      }
    }

    this.setStatus("starting");
    this.setClaimUrl(null);
    this.setTunnelAddress(null);
    this.log("[playit] Starting playit tunnel...");

    this.process = spawn(PLAYIT_BINARY_PATH, ["-s", "start"], {
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.process.stdout?.setEncoding("utf8");
    this.process.stderr?.setEncoding("utf8");

    const handleData = (data: string) => {
      for (const line of data.split("\n").filter((l) => l.trim())) {
        this.log(`[playit] ${line}`);

        // Claim URL
        const claimMatch = line.match(/https:\/\/playit\.gg\/claim\/[\w-]+/);
        if (claimMatch) {
          this.setClaimUrl(claimMatch[0]);
          this.setStatus("waiting_claim");
        }

        // Secret auto-created → tunnel running
        if (
          line.toLowerCase().includes("secret") ||
          line.toLowerCase().includes("agent connected") ||
          line.toLowerCase().includes("connected to")
        ) {
          if (this._status === "waiting_claim" || this._status === "starting") {
            this.setSetup(true);
            this.setStatus("running");
          }
        }

        // Tunnel address — many formats playit may output
        const addrPatterns = [
          /address[:\s]+([a-zA-Z0-9.\-]+:\d+)/i,
          /alloc.*?([a-zA-Z0-9.\-]+\.playit\.gg:\d+)/i,
          /([\w.-]+\.playit\.gg:\d+)/,
          /tcp\s+([^\s]+:\d+)/i,
          /udp\s+([^\s]+:\d+)/i,
        ];
        for (const pat of addrPatterns) {
          const m = line.match(pat);
          if (m) {
            const addr = m[1];
            if (addr && !addr.startsWith("0.0.0.0")) {
              this.setTunnelAddress(addr);
              this.setSetup(true);
              this.setStatus("running");
              break;
            }
          }
        }
      }
    };

    this.process.stdout?.on("data", handleData);
    this.process.stderr?.on("data", handleData);

    this.process.on("close", (code) => {
      logger.info({ code }, "Playit process exited");
      this.log(`[playit] Process exited (code: ${code})`);
      this.process = null;
      this.setStatus("stopped");
    });

    this.process.on("error", (err) => {
      this.log(`[playit] Error: ${err.message}`);
      this.process = null;
      this.setStatus("stopped");
    });

    return { success: true, message: "Playit is starting..." };
  }

  stop(): { success: boolean; message: string } {
    if (!this.process) return { success: false, message: "Playit is not running" };
    this.log("[playit] Stopping...");
    this.process.kill("SIGTERM");
    this.process = null;
    this.setStatus("stopped");
    return { success: true, message: "Playit stopped" };
  }

  reset(): { success: boolean; message: string } {
    this.stop();
    try {
      if (fs.existsSync(PLAYIT_SECRET_PATH)) {
        fs.unlinkSync(PLAYIT_SECRET_PATH);
        this.setSetup(false);
        this.setTunnelAddress(null);
        this.log("[playit] Secret removed. Restart to re-claim.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Reset failed: ${msg}` };
    }
    return { success: true, message: "Playit reset." };
  }

  getInfo() {
    return {
      status: this._status,
      claimUrl: this._claimUrl,
      isSetup: this._isSetup,
      tunnelAddress: this._tunnelAddress,
      binaryExists: fs.existsSync(PLAYIT_BINARY_PATH),
      secretExists: fs.existsSync(PLAYIT_SECRET_PATH),
    };
  }
}

export const playitManager = new PlayitManager();
