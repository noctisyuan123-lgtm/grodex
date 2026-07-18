import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const GRODEX_DIR = path.join(os.homedir(), ".grodex");
const recentPath = path.join(GRODEX_DIR, "recent.json");
const cwdPath = path.join(GRODEX_DIR, "cwd.json");

export type RecentEntry = { path: string; name: string; at: string };

function ensureDir(): void {
  fs.mkdirSync(GRODEX_DIR, { recursive: true });
}

export function loadRecent(): RecentEntry[] {
  try {
    if (!fs.existsSync(recentPath)) return [];
    const data = JSON.parse(fs.readFileSync(recentPath, "utf8")) as RecentEntry[];
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function pushRecent(cwd: string): RecentEntry[] {
  const name = path.basename(cwd) || cwd;
  const next: RecentEntry[] = [
    { path: cwd, name, at: new Date().toISOString() },
    ...loadRecent().filter((e) => e.path !== cwd),
  ].slice(0, 24);
  ensureDir();
  fs.writeFileSync(recentPath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function getRememberedCwd(): string {
  try {
    if (!fs.existsSync(cwdPath)) return "";
    const data = JSON.parse(fs.readFileSync(cwdPath, "utf8")) as { path?: string };
    const p = typeof data.path === "string" ? data.path.trim() : "";
    return p && fs.existsSync(p) ? p : "";
  } catch {
    return "";
  }
}

export function setRememberedCwd(cwd: string): string {
  const trimmed = cwd.trim();
  if (!trimmed || !fs.existsSync(trimmed)) {
    throw new Error("path missing or not found");
  }
  ensureDir();
  fs.writeFileSync(
    cwdPath,
    JSON.stringify({ path: trimmed, at: new Date().toISOString() }, null, 2),
    "utf8"
  );
  pushRecent(trimmed);
  return trimmed;
}
