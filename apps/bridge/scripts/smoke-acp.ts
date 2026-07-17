/**
 * Smoke: initialize + session/new against forked Core binary.
 *
 *   cd apps && npm run smoke:acp
 *
 * Optional:
 *   GRODEX_SMOKE_SESSION_ID=<uuid>  — try session/load first
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GrodexAgent } from "../src/grodex-agent.js";
import { resolveGrodexBin } from "../src/resolve-bin.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const sessionId = process.env.GRODEX_SMOKE_SESSION_ID?.trim() || undefined;
const agent = new GrodexAgent();

try {
  const session = await agent.connect({
    cwd: repoRoot,
    sessionId,
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        bin: resolveGrodexBin(),
        sessionId: session.sessionId,
        attachMode: session.attachMode,
        alive: agent.isAlive(),
      },
      null,
      2
    )
  );
} finally {
  agent.stop();
}
