import { spawn, type ChildProcess } from "node:child_process";
import { AcpStdioTransport } from "./acp-stdio-transport.js";
import { assertGrodexBin, resolveGrodexBin } from "./resolve-bin.js";

export type SessionAttachMode = "load" | "new";

export type AgentSessionInfo = {
  sessionId: string;
  attachMode: SessionAttachMode;
  cwd: string;
  bin: string;
};

/**
 * Minimal ACP client for grodex Core (`xai-grok-pager agent stdio`).
 *
 * Session attach order (G2):
 * 1. `initialize`
 * 2. If caller passes `sessionId` → try `session/load` (true Core UUID continuity)
 * 3. On load failure → `session/new` (transitional fallback; no history-digest fake resume)
 */
export class GrodexAgent {
  private proc: ChildProcess | null = null;
  private readonly transport = new AcpStdioTransport();

  async connect(opts: {
    cwd: string;
    sessionId?: string;
  }): Promise<AgentSessionInfo> {
    const bin = resolveGrodexBin();
    assertGrodexBin(bin);

    this.proc = spawn(bin, ["agent", "stdio"], {
      cwd: opts.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env },
    });

    this.proc.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString("utf8").trim();
      if (line) console.error("[grodex-agent]", line);
    });

    this.transport.attach(this.proc, {
      onRequest: async (id, method, params) => {
        if (method === "session/request_permission") {
          const p = params as {
            options?: Array<{ optionId?: string }>;
          };
          const optionId =
            p.options?.find((o) => o.optionId)?.optionId ?? "allow-once";
          this.transport.reply(id, {
            outcome: { outcome: "selected", optionId },
          });
          return;
        }
        if (method === "fs/read_text_file" || method === "fs/write_text_file") {
          this.transport.replyError(id, `${method} not implemented in G2 skeleton`);
          return;
        }
        this.transport.replyError(id, `unsupported ACP request: ${method}`);
      },
      onNotification: () => {},
    });

    await this.transport.send(
      "initialize",
      {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: true, writeTextFile: true },
          terminal: false,
        },
        clientInfo: { name: "grodex-desktop", version: "0.1.0" },
      },
      30_000
    );

    if (opts.sessionId) {
      try {
        const loaded = (await this.transport.send(
          "session/load",
          { sessionId: opts.sessionId, cwd: opts.cwd },
          30_000
        )) as { sessionId?: string };
        const sessionId = loaded.sessionId ?? opts.sessionId;
        return {
          sessionId,
          attachMode: "load",
          cwd: opts.cwd,
          bin,
        };
      } catch (err) {
        // TRANSITIONAL (G2): prefer session/load for same-UUID resume; fall back to
        // session/new when load fails. Do NOT inject history-digest preamble here —
        // that fake resume is explicitly out of scope until G4 removes it upstream.
        console.warn(
          "[grodex-agent] session/load failed — falling back to session/new:",
          err instanceof Error ? err.message : String(err)
        );
      }
    }

    const created = (await this.transport.send(
      "session/new",
      { cwd: opts.cwd, mcpServers: [] },
      30_000
    )) as { sessionId?: string };

    return {
      sessionId: created.sessionId ?? "unknown",
      attachMode: "new",
      cwd: opts.cwd,
      bin,
    };
  }

  isAlive(): boolean {
    return this.transport.isAlive();
  }

  stop(): void {
    this.transport.dispose();
    this.proc = null;
  }
}
