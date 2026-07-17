import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Default: monorepo `target/release/xai-grok-pager`. Override with GRODEX_BIN. */
export function resolveGrodexBin(): string {
  if (process.env.GRODEX_BIN) {
    return process.env.GRODEX_BIN;
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const monorepoRoot = path.resolve(here, "../../..");
  return path.join(monorepoRoot, "target/release/xai-grok-pager");
}

export function assertGrodexBin(bin: string): void {
  if (!fs.existsSync(bin)) {
    throw new Error(
      `GRODEX binary not found at ${bin}. Build: cargo build -p xai-grok-pager-bin --release`
    );
  }
}
