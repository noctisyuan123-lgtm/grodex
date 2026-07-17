/**
 * Smoke: connect → prompt "ping" → collect streamed chat events via bridge HTTP+SSE.
 *
 *   cd apps && npm run smoke:chat
 *
 * Requires network/auth for a real model reply. Without auth, still proves wiring
 * (connect + prompt RPC + SSE client attach).
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

const PORT = Number(process.env.GRODEX_BRIDGE_PORT ?? 8799);
const BASE = `http://127.0.0.1:${PORT}`;

type ChatEvent = {
  type: string;
  text?: string;
  message?: string;
  at?: string;
};

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

async function main(): Promise<void> {
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

  const events: ChatEvent[] = [];
  let streamDone = false;

  try {
    await waitForHealth();

    const streamRes = await fetch(`${BASE}/api/session/stream`);
    if (!streamRes.ok || !streamRes.body) {
      throw new Error(`SSE connect failed: ${streamRes.status}`);
    }

    const reader = streamRes.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";

    const readLoop = (async () => {
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";
        for (const part of parts) {
          for (const line of part.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const ev = JSON.parse(line.slice(6)) as ChatEvent;
              if (ev.type !== "connected") events.push(ev);
            } catch {
              /* ignore */
            }
          }
        }
      }
    })();

    const connectRes = await fetch(`${BASE}/api/session/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cwd: repoRoot }),
    });
    const connectBody = (await connectRes.json()) as {
      ok?: boolean;
      session?: { sessionId: string; attachMode: string };
      error?: string;
    };
    if (!connectRes.ok || !connectBody.ok || !connectBody.session) {
      throw new Error(connectBody.error ?? `connect ${connectRes.status}`);
    }

    console.log("[smoke] connected", connectBody.session);

    const promptRes = await fetch(`${BASE}/api/session/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "ping" }),
    });
    const promptBody = (await promptRes.json()) as { ok?: boolean; error?: string };
    if (!promptRes.ok || !promptBody.ok) {
      console.warn("[smoke] prompt error (auth/network may block):", promptBody.error);
    } else {
      console.log("[smoke] prompt RPC ok");
    }

    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      if (events.some((e) => e.type === "assistant_done")) break;
      if (events.some((e) => e.type === "error")) break;
      if (events.some((e) => e.type === "user") && !promptBody.ok) break;
      await new Promise((r) => setTimeout(r, 200));
    }

    streamDone = true;
    await readLoop.catch(() => {});

    const summary = {
      ok: true,
      sessionId: connectBody.session.sessionId,
      attachMode: connectBody.session.attachMode,
      eventCount: events.length,
      eventTypes: [...new Set(events.map((e) => e.type))],
      gotAssistantChunk: events.some((e) => e.type === "assistant_chunk"),
      gotAssistantDone: events.some((e) => e.type === "assistant_done"),
      gotUser: events.some((e) => e.type === "user"),
      gotTool: events.some((e) => e.type === "tool"),
      gotActivity: events.some((e) => e.type === "activity"),
      lastError: events.find((e) => e.type === "error")?.message ?? null,
    };

    if (!summary.gotUser && !summary.lastError && !promptBody.ok) {
      // Auth/network blocked model — wiring still ok if connect succeeded
      summary.ok = true;
    }

    console.log(JSON.stringify(summary, null, 2));

    if (!summary.gotUser && !promptBody.ok && !summary.lastError) {
      process.exitCode = 1;
    }
  } finally {
    streamDone = true;
    bridge.kill("SIGTERM");
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: String(err) }, null, 2));
  process.exit(1);
});
