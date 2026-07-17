import http from "node:http";
import os from "node:os";
import path from "node:path";
import {
  connectSession,
  disconnectSession,
  getStatus,
  isAgentAlive,
} from "./session-store.js";
import { resolveGrodexBin } from "./resolve-bin.js";

const PORT = Number(process.env.GRODEX_BRIDGE_PORT ?? 8790);
const HOST = process.env.GRODEX_BRIDGE_HOST ?? "127.0.0.1";

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

  if (req.method === "POST" && pathname === "/api/session/connect") {
    try {
      const raw = await readBody(req);
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
      const cwd =
        typeof body.cwd === "string" && body.cwd.trim()
          ? body.cwd.trim()
          : process.cwd();
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
  console.log(`[grodex-bridge] bin=${resolveGrodexBin()}`);
  console.log(`[grodex-bridge] default cwd=${process.cwd()}`);
});

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, () => {
    disconnectSession();
    process.exit(0);
  });
}
