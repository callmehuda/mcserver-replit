import { Router } from "express";
import https from "node:https";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../lib/logger.js";

const router = Router();
const HANGAR_API = "https://hangar.papermc.io/api/v1";
const PLUGINS_DIR = path.resolve("/home/runner/workspace/minecraft-server/plugins");

function fetchJson(url: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const get = (u: string) => {
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "mc-dashboard/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) { get(res.headers.location as string); return; }
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => { try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); } });
      }).on("error", reject);
    };
    get(url);
  });
}

function downloadBinary(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const get = (u: string) => {
      const file = fs.createWriteStream(dest);
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "mc-dashboard/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          get(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) { reject(new Error(`HTTP ${res.statusCode}`)); return; }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
        file.on("error", reject);
      }).on("error", reject);
    };
    get(url);
  });
}

router.get("/plugins/search", async (req, res) => {
  const query = (req.query.q as string) || "";
  const limit = Math.min(Number(req.query.limit) || 15, 25);
  try {
    const data = await fetchJson(`${HANGAR_API}/projects?query=${encodeURIComponent(query)}&limit=${limit}&offset=0`);
    res.json(data);
  } catch (err: unknown) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.post("/plugins/install", async (req, res) => {
  const { slug, version } = req.body as { slug?: string; version?: string };
  if (!slug) { res.status(400).json({ success: false, message: "slug required" }); return; }
  try {
    if (!fs.existsSync(PLUGINS_DIR)) fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    let ver = version;
    if (!ver) {
      const data = await fetchJson(`${HANGAR_API}/projects/${slug}/versions?limit=1&offset=0&channel=Release`) as { result: Array<{ name: string }> };
      ver = data?.result?.[0]?.name;
      if (!ver) { res.status(404).json({ success: false, message: "No release version found" }); return; }
    }
    const destPath = path.join(PLUGINS_DIR, `${slug}-${ver}.jar`);
    await downloadBinary(`${HANGAR_API}/projects/${slug}/versions/${ver}/PAPER/download`, destPath);
    logger.info({ slug, ver }, "Plugin installed");
    res.json({ success: true, message: `Installed ${slug} v${ver}`, file: path.basename(destPath) });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

router.get("/plugins/installed", (_req, res) => {
  try {
    if (!fs.existsSync(PLUGINS_DIR)) { res.json({ plugins: [] }); return; }
    const files = fs.readdirSync(PLUGINS_DIR)
      .filter((f) => f.endsWith(".jar"))
      .map((f) => {
        const stat = fs.statSync(path.join(PLUGINS_DIR, f));
        return { name: f, size: stat.size, mtime: stat.mtime.toISOString() };
      });
    res.json({ plugins: files });
  } catch { res.json({ plugins: [] }); }
});

router.delete("/plugins/:filename", (req, res) => {
  const { filename } = req.params;
  if (!filename.endsWith(".jar") || filename.includes("/") || filename.includes("..")) {
    res.status(400).json({ success: false, message: "Invalid filename" });
    return;
  }
  const filePath = path.join(PLUGINS_DIR, filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ success: false, message: "File not found" }); return; }
  try {
    fs.unlinkSync(filePath);
    res.json({ success: true, message: `Deleted ${filename}` });
  } catch (err: unknown) {
    res.status(500).json({ success: false, message: err instanceof Error ? err.message : String(err) });
  }
});

export default router;
