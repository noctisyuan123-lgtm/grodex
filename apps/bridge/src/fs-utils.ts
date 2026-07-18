import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Resolve path and refuse escapes outside the given root (if set). */
export function resolveSafePath(target: string, root?: string): string {
  const abs = path.resolve(target);
  if (root) {
    const rootAbs = path.resolve(root);
    if (abs !== rootAbs && !abs.startsWith(`${rootAbs}${path.sep}`)) {
      throw new Error("path outside allowed root");
    }
  }
  if (!fs.existsSync(abs)) {
    throw new Error("path not found");
  }
  return abs;
}

export async function revealInFinder(target: string): Promise<void> {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error("path not found");
  if (process.platform !== "darwin") {
    throw new Error("Reveal in Finder is macOS-only");
  }
  await execFileAsync("open", ["-R", abs], { timeout: 15_000 });
}

export async function openWithDefaultApp(target: string): Promise<void> {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) throw new Error("path not found");
  if (process.platform === "darwin") {
    await execFileAsync("open", [abs], { timeout: 15_000 });
    return;
  }
  if (process.platform === "win32") {
    await execFileAsync("cmd", ["/c", "start", "", abs], { timeout: 15_000 });
    return;
  }
  await execFileAsync("xdg-open", [abs], { timeout: 15_000 });
}
