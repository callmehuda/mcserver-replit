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
        if (res.statusCode === 301 || res.statusCode === 302) {
          get(res.headers.location as string);
          return;
        }
        let data = "";
        res.on("data", (chunk: string) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error("Failed to parse JSON"));
          }
        });
      }).on("error", reject);
    };
    get(url);
  });
}

function downloadBinary(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = (u: string) => {
      const mod = u.startsWith("https") ? https : http;
      mod.get(u, { headers: { "User-Agent": "mc-dashboard/1.0" } }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          file.destroy();
          const newFile = fs.createWriteStream(dest);
          get(res.headers.location as string);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => file.close(() => resolve()));
      }).on("error", reject);
    };
    get(url);
  });
}

router.get("/plugins/search", async (req, res) => {
  const query = (req.query.q as string) || "";
  const limit = Math.min(Number(req.query.limit) || 15, 25);
  try {
    const data = await fetchJson(
      `${HANGAR_API}/projects?query=${encodeURIComponent(query)}&limit=${limit}&offset=0`
    );
    res.json(data);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Hangar search failed");
    res.status(500).json({ error: msg });
  }
});

router.post("/plugins/install", async (req, res) => {
  const { slug, version } = req.body as { slug?: string; version?: string };
  if (!slug) {
    res.status(400).json({ success: false, message: "slug is required" });
    return;
  }

  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
    }

    let ver = version;
    if (!ver) {
      const versionsData = await fetchJson(
        `${HANGAR_API}/projects/${slug}/versions?limit=1&offset=0&channel=Release`
      ) as { result: Array<{ name: string }> };
      ver = versionsData?.result?.[0]?.name;
      if (!ver) {
        res.status(404).json({ success: false, message: "No release version found" });
        return;
      }
    }

    const downloadUrl = `${HANGAR_API}/projects/${slug}/versions/${ver}/PAPER/download`;
    const destPath = path.join(PLUGINS_DIR, `${slug}-${ver}.jar`);

    await downloadBinary(downloadUrl, destPath);
    logger.info({ slug, ver, destPath }, "Plugin installed");
    res.json({ success: true, message: `Installed ${slug} v${ver}`, file: path.basename(destPath) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err, slug }, "Plugin install failed");
    res.status(500).json({ success: false, message: msg });
  }
});

router.get("/plugins/installed", (_req, res) => {
  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      res.json({ plugins: [] });
      return;
    }
    const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith(".jar"));
    res.json({ plugins: files });
  } catch {
    res.json({ plugins: [] });
  }
});

export default router;
