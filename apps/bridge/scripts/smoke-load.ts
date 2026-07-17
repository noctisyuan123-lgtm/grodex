/**
 * Smoke: connect with a real Core UUID from ~/.grok/sessions → session/load.
 *
 *   cd apps && npm run smoke:load
 *
 * Prints attachMode (load|new) + sessionId. Does not prompt (no model call).
 * Optional: GRODEX_SMOKE_SESSION_ID=<uuid> to force a specific id.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listRecentSessions } from "../src/grok-sessions-index.js";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const PORT = Number(process.env.GRODEX_BRIDGE_PORT ?? 8798);
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(maxMs = 15_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      const res = await fetch(`${BASE}/health`);
      if (res.ok) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("Bridge did not become healthy in time");
}

function pickSessionId(): { sessionId: string; source: string } | null {
  const forced = process.env.GRODEX_SMOKE_SESSION_ID?.trim();
  if (forced) {
    return { sessionId: forced, source: "GRODEX_SMOKE_SESSION_ID" };
  }

  const recent = listRecentSessions({ cwd: repoRoot, limit: 5 });
  if (recent.length > 0) {
    return {
      sessionId: recent[0]!.sessionId,
      source: `~/.grok/sessions (${recent[0]!.title.slice(0, 40)})`,
    };
  }

  const anyRecent = listRecentSessions({ limit: 1 });
  if (anyRecent.length > 0) {
    return {
      sessionId: anyRecent[0]!.sessionId,
      source: `~/.grok/sessions any cwd (${anyRecent[0]!.cwd})`,
    };
  }

  return null;
}

async function main(): Promise<void> {
  const picked = pickSessionId();
  if (!picked) {
    console.log(
      JSON.stringify(
        {
          ok: false,
          error: "No session UUID found under ~/.grok/sessions",
          hint: "Set GRODEX_SMOKE_SESSION_ID or run grodex CLI once in this repo",
        },
        null,
        2
      )
    );
    process.exit(1);
  }

  const { spawn } = await import("node:child_process");
  const bridge = spawn("npx", ["tsx", "src/index.ts"], {
    cwd: path.join(repoRoot, "apps/bridge"),
    env: {
      ...process.env,
      GRODEX_BRIDGE_PORT: String(PORT),
      GRODEX_BIN:
        process.env.GRODEX_BIN ??
        path.join(repoRoot, "target/release/xai-grok-pager"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  bridge.stderr?.on("data", (c: Buffer) => {
    const line = c.toString("utf8").trim();
    if (line) console.error("[bridge]", line);
  });

  try {
    await waitForHealth();

    const connectRes = await fetch(`${BASE}/api/session/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cwd: repoRoot,
        sessionId: picked.sessionId,
      }),
    });
    const connectBody = (await connectRes.json()) as {
      ok?: boolean;
      session?: {
        sessionId: string;
        attachMode: "load" | "new";
        hydrateUserTurns?: number;
        hydrateSource?: string;
      };
      error?: string;
    };

    if (!connectRes.ok || !connectBody.ok || !connectBody.session) {
      console.log(
        JSON.stringify(
          {
            ok: false,
            requestedSessionId: picked.sessionId,
            pickedFrom: picked.source,
            error: connectBody.error ?? `connect ${connectRes.status}`,
          },
          null,
          2
        )
      );
      process.exit(1);
    }

    const out = {
      ok: true,
      attachMode: connectBody.session.attachMode,
      sessionId: connectBody.session.sessionId,
      requestedSessionId: picked.sessionId,
      pickedFrom: picked.source,
      loadSucceeded: connectBody.session.attachMode === "load",
      hydrateUserTurns: connectBody.session.hydrateUserTurns ?? 0,
      hydrateSource: connectBody.session.hydrateSource ?? "none",
    };

    let historyApiUserTurns = 0;
    if (connectBody.session.attachMode === "load") {
      try {
        const histRes = await fetch(
          `${BASE}/api/session/history?sessionId=${encodeURIComponent(connectBody.session.sessionId)}`
        );
        const histBody = (await histRes.json()) as { userTurns?: number };
        historyApiUserTurns = histBody.userTurns ?? 0;
      } catch {
        /* optional */
      }
    }

    console.log(JSON.stringify({ ...out, historyApiUserTurns }, null, 2));

    await fetch(`${BASE}/api/session/disconnect`, { method: "POST" });
  } finally {
    bridge.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exit(1);
});
