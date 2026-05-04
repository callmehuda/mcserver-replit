import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import https from "node:https";
import http from "node:http";
import { logger } from "./logger.js";

export type PlayitStatus = "stopped" | "downloading" | "claiming" | "waiting_claim" | "starting" | "running";

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
          const newFile = fs.createWriteStream(dest);
          void newFile;
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

function parseLastWord(line: string): string {
  return line.trim().split(/\s+/).pop() ?? "";
}

class PlayitManager extends EventEmitter {
  private tunnelProcess: ChildProcess | null = null;
  private exchangeProcess: ChildProcess | null = null;
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
    if (v) {
      this._claimUrl = null;
      this.emit("playit_claim", null);
    }
    this.emit("playit_setup", v);
  }

  private log(msg: string) {
    this.emit("playit_log", msg);
  }

  async start(): Promise<{ success: boolean; message: string }> {
    if (this._status !== "stopped") {
      return { success: false, message: `Playit is already ${this._status}` };
    }

    // --- Download binary if needed ---
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

    // --- If already claimed, start tunnel directly ---
    if (fs.existsSync(PLAYIT_SECRET_PATH)) {
      this.log("[playit] Secret found, starting tunnel...");
      this.runTunnel();
      return { success: true, message: "Playit tunnel is starting..." };
    }

    // --- Claim flow ---
    this.setStatus("claiming");
    this.log("[playit] Generating claim code...");

    const genResult = spawnSync(PLAYIT_BINARY_PATH, ["--stdout", "claim", "generate"], {
      encoding: "utf8",
      timeout: 10000,
    });

    const genOutput = (genResult.stdout ?? "").trim();
    this.log(`[playit] ${genOutput}`);

    const claimCode = parseLastWord(genOutput);
    if (!claimCode) {
      this.log("[playit] Failed to generate claim code.");
      this.setStatus("stopped");
      return { success: false, message: "Failed to generate claim code" };
    }

    // Get the claim URL
    const urlResult = spawnSync(PLAYIT_BINARY_PATH, ["--stdout", "claim", "url", claimCode], {
      encoding: "utf8",
      timeout: 10000,
    });

    const urlOutput = (urlResult.stdout ?? "").trim();
    this.log(`[playit] ${urlOutput}`);

    const claimUrl = parseLastWord(urlOutput);
    if (!claimUrl || !claimUrl.startsWith("http")) {
      this.log("[playit] Failed to get claim URL.");
      this.setStatus("stopped");
      return { success: false, message: "Failed to get claim URL" };
    }

    this.setClaimUrl(claimUrl);
    this.setStatus("waiting_claim");
    this.log(`[playit] Visit this URL to claim your tunnel: ${claimUrl}`);
    this.log("[playit] Waiting for you to claim the agent...");

    // Run exchange in background — blocks until user claims
    this.exchangeProcess = spawn(
      PLAYIT_BINARY_PATH,
      ["--stdout", "claim", "exchange", claimCode, "--wait", "0"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    this.exchangeProcess.stdout?.setEncoding("utf8");
    this.exchangeProcess.stderr?.setEncoding("utf8");

    const handleExchangeData = (data: string) => {
      for (const line of data.split("\n").filter((l) => l.trim())) {
        this.log(`[playit] ${line}`);
      }
    };
    this.exchangeProcess.stdout?.on("data", handleExchangeData);
    this.exchangeProcess.stderr?.on("data", handleExchangeData);

    this.exchangeProcess.on("close", (code) => {
      this.exchangeProcess = null;
      if (this._status === "stopped") return;

      if (code === 0) {
        this.log("[playit] Agent claimed successfully! Starting tunnel...");
        this.setSetup(true);
        this.runTunnel();
      } else {
        this.log(`[playit] Claim exchange failed (exit code: ${code}). Please try again.`);
        this.setStatus("stopped");
      }
    });

    this.exchangeProcess.on("error", (err) => {
      this.log(`[playit] Exchange error: ${err.message}`);
      this.setStatus("stopped");
    });

    return { success: true, message: "Waiting for agent claim..." };
  }

  private runTunnel(): void {
    this.setStatus("starting");

    this.tunnelProcess = spawn(
      PLAYIT_BINARY_PATH,
      ["--stdout", "--secret_path", PLAYIT_SECRET_PATH, "start"],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    this.tunnelProcess.stdout?.setEncoding("utf8");
    this.tunnelProcess.stderr?.setEncoding("utf8");

    const handleData = (data: string) => {
      for (const line of data.split("\n").filter((l) => l.trim())) {
        this.log(`[playit] ${line}`);

        const l = line.toLowerCase();
        if (
          l.includes("tunnel") ||
          l.includes("connected") ||
          l.includes("listening") ||
          l.includes("assigned") ||
          l.includes("address")
        ) {
          if (this._status !== "running") {
            this.setStatus("running");
            this.setSetup(true);
          }
        }
      }
    };

    this.tunnelProcess.stdout?.on("data", handleData);
    this.tunnelProcess.stderr?.on("data", handleData);

    // Assume running after 3s if no output triggered it
    setTimeout(() => {
      if (this._status === "starting" && this.tunnelProcess) {
        this.setStatus("running");
        this.setSetup(true);
      }
    }, 3000);

    this.tunnelProcess.on("close", (code) => {
      this.log(`[playit] Tunnel process exited (code: ${code})`);
      this.tunnelProcess = null;
      this.setStatus("stopped");
    });

    this.tunnelProcess.on("error", (err) => {
      this.log(`[playit] Tunnel error: ${err.message}`);
      this.tunnelProcess = null;
      this.setStatus("stopped");
    });
  }

  stop(): { success: boolean; message: string } {
    let stopped = false;

    if (this.exchangeProcess) {
      this.exchangeProcess.kill("SIGTERM");
      this.exchangeProcess = null;
      stopped = true;
    }
    if (this.tunnelProcess) {
      this.tunnelProcess.kill("SIGTERM");
      this.tunnelProcess = null;
      stopped = true;
    }

    if (!stopped) {
      return { success: false, message: "Playit is not running" };
    }

    this.log("[playit] Stopped.");
    this.setStatus("stopped");
    return { success: true, message: "Playit stopped" };
  }

  reset(): { success: boolean; message: string } {
    this.stop();
    try {
      if (fs.existsSync(PLAYIT_SECRET_PATH)) {
        fs.unlinkSync(PLAYIT_SECRET_PATH);
        this.setSetup(false);
        this.log("[playit] Secret removed. You will need to claim the agent again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, message: `Failed to reset: ${msg}` };
    }
    return { success: true, message: "Playit reset. Restart to re-claim." };
  }

  getInfo() {
    return {
      status: this._status,
      claimUrl: this._claimUrl,
      isSetup: this._isSetup,
      binaryExists: fs.existsSync(PLAYIT_BINARY_PATH),
      secretExists: fs.existsSync(PLAYIT_SECRET_PATH),
    };
  }
}

export const playitManager = new PlayitManager();
