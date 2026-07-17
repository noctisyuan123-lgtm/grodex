import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  connectSession,
  disconnectSession,
  cancelPrompt,
  getStatus,
  isAgentAlive,
  promptSession,
} from "./session-store.js";
import { resolveGrodexBin } from "./resolve-bin.js";
import { listRecentSessions } from "./grok-sessions-index.js";
import {
  addSseClient,
  removeSseClient,
} from "./event-hub.js";
import { chatHistoryToEvents } from "./session-history.js";
import { nowIso } from "./chat-events.js";

const PORT = Number(process.env.GRODEX_BRIDGE_PORT ?? 8790);
const HOST = process.env.GRODEX_BRIDGE_HOST ?? "127.0.0.1";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../.."
);

function cors(res: http.ServerResponse): void {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  cors(res);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/health") {
    json(res, 200, {
      ok: true,
      bin: resolveGrodexBin(),
      alive: isAgentAlive(),
      status: getStatus(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/session/status") {
    json(res, 200, {
      alive: isAgentAlive(),
      status: getStatus(),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/sessions") {
    const cwd = url.searchParams.get("cwd")?.trim() || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = limitRaw ? Number(limitRaw) : 30;
    json(res, 200, {
      ok: true,
      sessions: listRecentSessions({ cwd, limit: Number.isFinite(limit) ? limit : 30 }),
    });
    return;
  }

  if (req.method === "GET" && pathname === "/api/session/history") {
    const sessionId = url.searchParams.get("sessionId")?.trim();
    if (!sessionId) {
      json(res, 400, { ok: false, error: "sessionId required" });
      return;
    }
    try {
      const { events, userTurns } = chatHistoryToEvents(sessionId);
      json(res, 200, {
        ok: true,
        sessionId,
        userTurns,
        source: "chat_history",
        events,
      });
    } catch (err) {
      json(res, 404, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  /**
   * SSE stream for session/update → chat events.
   * One shared stream per bridge process (G3 single-session).
   */
  if (req.method === "GET" && pathname === "/api/session/stream") {
    cors(res);
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "connected", at: nowIso() })}\n\n`);
    addSseClient(res);
    req.on("close", () => removeSseClient(res));
    return;
  }

  if (req.method === "POST" && pathname === "/api/session/connect") {
    try {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const cwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : repoRoot;
      const sessionId =
        typeof body.sessionId === "string" && body.sessionId.trim()
          ? body.sessionId.trim()
          : undefined;

      const session = await connectSession({ cwd, sessionId });
      json(res, 200, { ok: true, session });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
        status: getStatus(),
      });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/session/prompt") {
    try {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const text = typeof body.text === "string" ? body.text : "";
      await promptSession(text);
      json(res, 200, { ok: true });
    } catch (err) {
      json(res, 500, {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return;
  }

  if (req.method === "POST" && pathname === "/api/session/cancel") {
    cancelPrompt();
    json(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && pathname === "/api/session/disconnect") {
    disconnectSession();
    json(res, 200, { ok: true });
    return;
  }

  json(res, 404, { error: "not found" });
});

server.listen(PORT, HOST, () => {
  console.log(`[grodex-bridge] http://${HOST}:${PORT}`);
  console.log(`[grodex-bridge] health http://${HOST}:${PORT}/health`);
  console.log(`[grodex-bridge] SSE   http://${HOST}:${PORT}/api/session/stream`);
  console.log(`[grodex-bridge] bin=${resolveGrodexBin()}`);
  console.log(`[grodex-bridge] default cwd=${repoRoot}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    disconnectSession();
    process.exit(0);
  });
}
