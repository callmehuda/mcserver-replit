import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import { logger } from "./logger.js";

export type PlayitStatus = "stopped" | "downloading" | "starting" | "claiming" | "running";

const PLAYIT_BINARY_URL = "https://builds.playit.gg/0.17.1/playit-linux-amd64";
const PLAYIT_BINARY_PATH = path.resolve("/home/runner/workspace/playit-binary");

function downloadFile(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          get(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
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

  get status(): PlayitStatus {
    return this._status;
  }

  get claimUrl(): string | null {
    return this._claimUrl;
  }

  get isSetup(): boolean {
    return this._isSetup;
  }

  private setStatus(status: PlayitStatus) {
    this._status = status;
    this.emit("playit_status", status);
  }

  private setClaimUrl(url: string | null) {
    this._claimUrl = url;
    this.emit("playit_claim", url);
  }

  private setSetup(v: boolean) {
    this._isSetup = v;
    this.emit("playit_setup", v);
  }

  async start(): Promise<{ success: boolean; message: string }> {
    if (this._status !== "stopped") {
      return { success: false, message: `Playit is already ${this._status}` };
    }

    if (!fs.existsSync(PLAYIT_BINARY_PATH)) {
      logger.info("Downloading playit binary...");
      this.setStatus("downloading");
      this.emit("playit_log", "[playit] Downloading playit binary...");
      try {
        await downloadFile(PLAYIT_BINARY_URL, PLAYIT_BINARY_PATH);
        fs.chmodSync(PLAYIT_BINARY_PATH, 0o755);
        this.emit("playit_log", "[playit] Binary downloaded successfully.");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.emit("playit_log", `[playit] Download failed: ${msg}`);
        this.setStatus("stopped");
        return { success: false, message: `Download failed: ${msg}` };
      }
    }

    logger.info("Starting playit...");
    this.setStatus("starting");
    this.setClaimUrl(null);
    this.setSetup(false);
    this.emit("playit_log", "[playit] Starting playit tunnel...");

    this.process = spawn(PLAYIT_BINARY_PATH, [], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const handleData = (data: string) => {
      const lines = data.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        this.emit("playit_log", `[playit] ${line}`);

        const claimMatch = line.match(/https:\/\/playit\.gg\/claim\/[\w-]+/);
        if (claimMatch) {
          this.setClaimUrl(claimMatch[0]);
          this.setStatus("claiming");
        }

        const setupKeywords = [
          "tunnel is ready",
          "tunnel ready",
          "connected to playit",
          "agent connected",
          "udp tunnel",
          "tcp tunnel",
          "listening on",
          "created tunnel",
          "tunnel created",
        ];
        if (setupKeywords.some((kw) => line.toLowerCase().includes(kw))) {
          this.setSetup(true);
          this.setClaimUrl(null);
          this.setStatus("running");
        }
      }
    };

    this.process.stdout?.setEncoding("utf8");
    this.process.stderr?.setEncoding("utf8");
    this.process.stdout?.on("data", handleData);
    this.process.stderr?.on("data", handleData);

    this.process.on("close", (code) => {
      this.emit("playit_log", `[playit] Process exited (code: ${code})`);
      this.process = null;
      this.setStatus("stopped");
    });

    this.process.on("error", (err) => {
      this.emit("playit_log", `[playit] Error: ${err.message}`);
      this.process = null;
      this.setStatus("stopped");
    });

    return { success: true, message: "Playit is starting..." };
  }

  stop(): { success: boolean; message: string } {
    if (!this.process) {
      return { success: false, message: "Playit is not running" };
    }
    this.emit("playit_log", "[playit] Stopping playit...");
    this.process.kill("SIGTERM");
    this.setStatus("stopped");
    return { success: true, message: "Playit stopped" };
  }

  getInfo() {
    return {
      status: this._status,
      claimUrl: this._claimUrl,
      isSetup: this._isSetup,
      binaryExists: fs.existsSync(PLAYIT_BINARY_PATH),
    };
  }
}

export const playitManager = new PlayitManager();
