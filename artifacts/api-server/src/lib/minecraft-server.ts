import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import { logger } from "./logger.js";

export type McServerStatus = "stopped" | "starting" | "running" | "stopping";

const MC_DIR = path.resolve("/home/runner/workspace/minecraft-server");
const JAR_FILE = path.join(MC_DIR, "paper-1.21.5.jar");
const MAX_LOG_BUFFER = 500;

class MinecraftServerManager extends EventEmitter {
  private process: ChildProcess | null = null;
  private _status: McServerStatus = "stopped";
  private logBuffer: string[] = [];

  get status(): McServerStatus {
    return this._status;
  }

  get logs(): string[] {
    return [...this.logBuffer];
  }

  private setStatus(status: McServerStatus) {
    this._status = status;
    this.emit("status", status);
  }

  private addLog(line: string) {
    this.logBuffer.push(line);
    if (this.logBuffer.length > MAX_LOG_BUFFER) {
      this.logBuffer.shift();
    }
    this.emit("log", line);
  }

  start(): { success: boolean; message: string } {
    if (this._status !== "stopped") {
      return { success: false, message: `Server is already ${this._status}` };
    }

    if (!fs.existsSync(JAR_FILE)) {
      return { success: false, message: `Server JAR not found at ${JAR_FILE}` };
    }

    logger.info("Starting Minecraft server...");
    this.setStatus("starting");
    this.addLog("[Dashboard] Starting Minecraft server...");

    const javaArgs = [
      "-Xms512M",
      "-Xmx1G",
      "-XX:+UseG1GC",
      "-XX:+ParallelRefProcEnabled",
      "-XX:MaxGCPauseMillis=200",
      "-XX:+UnlockExperimentalVMOptions",
      "-XX:+DisableExplicitGC",
      "-XX:+AlwaysPreTouch",
      "-XX:G1NewSizePercent=30",
      "-XX:G1MaxNewSizePercent=40",
      "-XX:G1HeapRegionSize=8M",
      "-XX:G1ReservePercent=20",
      "-XX:G1HeapWastePercent=5",
      "-XX:G1MixedGCCountTarget=4",
      "-XX:InitiatingHeapOccupancyPercent=15",
      "-XX:G1MixedGCLiveThresholdPercent=90",
      "-XX:G1RSetUpdatingPauseTimePercent=5",
      "-XX:SurvivorRatio=32",
      "-XX:+PerfDisableSharedMem",
      "-XX:MaxTenuringThreshold=1",
      "-Dusing.aikars.flags=https://mcflags.emc.gs",
      "-Daikars.new.flags=true",
      "-jar",
      JAR_FILE,
      "--nogui",
    ];

    this.process = spawn("java", javaArgs, {
      cwd: MC_DIR,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.process.stdout?.setEncoding("utf8");
    this.process.stderr?.setEncoding("utf8");

    const handleData = (data: string) => {
      const lines = data.split("\n").filter((l) => l.trim());
      for (const line of lines) {
        this.addLog(line);
        if (line.includes("Done (") && line.includes("For help, type")) {
          this.setStatus("running");
        }
      }
    };

    this.process.stdout?.on("data", handleData);
    this.process.stderr?.on("data", handleData);

    this.process.on("close", (code) => {
      logger.info({ code }, "Minecraft server process exited");
      this.addLog(`[Dashboard] Server process exited (code: ${code})`);
      this.process = null;
      this.setStatus("stopped");
    });

    this.process.on("error", (err) => {
      logger.error({ err }, "Minecraft server process error");
      this.addLog(`[Dashboard] Server error: ${err.message}`);
      this.process = null;
      this.setStatus("stopped");
    });

    return { success: true, message: "Server is starting..." };
  }

  stop(): { success: boolean; message: string } {
    if (!this.process || this._status === "stopped") {
      return { success: false, message: "Server is not running" };
    }

    logger.info("Stopping Minecraft server...");
    this.setStatus("stopping");
    this.addLog("[Dashboard] Stopping Minecraft server...");

    this.sendCommand("stop");

    setTimeout(() => {
      if (this.process) {
        this.process.kill("SIGTERM");
      }
    }, 10000);

    return { success: true, message: "Stop signal sent" };
  }

  sendCommand(cmd: string): { success: boolean; message: string } {
    if (!this.process?.stdin || this._status !== "running") {
      return { success: false, message: "Server is not running" };
    }
    this.process.stdin.write(cmd + "\n");
    this.addLog(`> ${cmd}`);
    return { success: true, message: `Command sent: ${cmd}` };
  }

  getInfo() {
    return {
      status: this._status,
      pid: this.process?.pid ?? null,
      jarFile: JAR_FILE,
      mcDir: MC_DIR,
      jarExists: fs.existsSync(JAR_FILE),
    };
  }
}

export const mcServer = new MinecraftServerManager();
