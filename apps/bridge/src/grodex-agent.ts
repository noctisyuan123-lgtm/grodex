import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { AcpStdioTransport } from "./acp-stdio-transport.js";
import { assertGrodexBin, resolveGrodexBin } from "./resolve-bin.js";
import { nowIso, type ChatEvent } from "./chat-events.js";

export type SessionAttachMode = "load" | "new";

export type AgentSessionInfo = {
  sessionId: string;
  attachMode: SessionAttachMode;
  cwd: string;
  bin: string;
};

type EventHandler = (event: ChatEvent) => void;

/**
 * Minimal ACP client for grodex Core (`xai-grok-pager agent stdio`).
 *
 * Session attach order (G2/G3):
 * 1. `initialize`
 * 2. If caller passes `sessionId` → try `session/load` (true Core UUID continuity)
 * 3. On load failure → `session/new` (transitional fallback; no history-digest fake resume)
 */
export class GrodexAgent {
  private proc: ChildProcess | null = null;
  private readonly transport = new AcpStdioTransport();
  private providerSessionId = "";
  private domainSessionId = "";
  private cwd = ".";
  private handlers: EventHandler[] = [];
  private promptInFlight = false;
  private turnCancelled = false;

  onEvent(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  private emit(event: ChatEvent): void {
    for (const h of this.handlers) {
      try {
        h(event);
      } catch (err) {
        console.error("[grodex-agent] event handler error", err);
      }
    }
  }

  private emitStatus(text: string | null): void {
    this.emit({ type: "status", text, at: nowIso() });
  }

  async connect(opts: {
    cwd: string;
    sessionId?: string;
  }): Promise<AgentSessionInfo> {
    const bin = resolveGrodexBin();
    assertGrodexBin(bin);
    this.cwd = opts.cwd;

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
          this.transport.replyError(id, `${method} not implemented in G3 bridge`);
          return;
        }
        this.transport.replyError(id, `unsupported ACP request: ${method}`);
      },
      onNotification: (method, params) => {
        this.handleNotification(method, params);
      },
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
        this.providerSessionId = sessionId;
        this.domainSessionId = sessionId;
        return {
          sessionId,
          attachMode: "load",
          cwd: opts.cwd,
          bin,
        };
      } catch (err) {
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

    const sessionId = created.sessionId ?? "unknown";
    this.providerSessionId = sessionId;
    this.domainSessionId = sessionId;

    return {
      sessionId,
      attachMode: "new",
      cwd: opts.cwd,
      bin,
    };
  }

  getSessionId(): string {
    return this.domainSessionId;
  }

  isAlive(): boolean {
    return this.transport.isAlive();
  }

  async prompt(text: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error("prompt text is empty");
    }
    if (!this.providerSessionId) {
      throw new Error("No active session");
    }
    if (this.promptInFlight) {
      throw new Error("Prompt already in flight");
    }

    this.turnCancelled = false;
    this.promptInFlight = true;
    this.emit({ type: "user", text: trimmed, at: nowIso() });
    this.emitStatus("Waiting for model…");

    const PROMPT_TIMEOUT_MS = 30 * 60_000;
    try {
      await this.transport.send(
        "session/prompt",
        {
          sessionId: this.providerSessionId,
          prompt: [{ type: "text", text: trimmed }],
        },
        PROMPT_TIMEOUT_MS
      );
      this.promptInFlight = false;
      this.emitStatus(null);
      this.emit({ type: "assistant_done", at: nowIso() });
    } catch (err) {
      this.promptInFlight = false;
      this.emitStatus(null);
      if (this.turnCancelled) {
        this.emit({ type: "assistant_done", at: nowIso() });
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      this.emit({ type: "error", message, at: nowIso() });
      this.emit({ type: "assistant_done", at: nowIso() });
      throw err;
    }
  }

  cancel(): void {
    this.turnCancelled = true;
    if (this.providerSessionId) {
      this.transport.notify("session/cancel", {
        sessionId: this.providerSessionId,
      });
    }
    this.promptInFlight = false;
    this.emitStatus(null);
  }

  private handleNotification(method: string, params: unknown): void {
    const p = (params ?? {}) as Record<string, unknown>;

    if (method === "session/update") {
      const wire = String(p.sessionId ?? "").trim();
      if (wire && this.providerSessionId && wire !== this.providerSessionId) {
        return;
      }
      const update = (p.update ?? p) as Record<string, unknown>;
      this.mapSessionUpdate(update);
      return;
    }

    if (
      method === "_x.ai/session_notification" ||
      method === "x.ai/session_notification"
    ) {
      const wire = String(p.sessionId ?? "").trim();
      if (wire && this.providerSessionId && wire !== this.providerSessionId) {
        return;
      }
      const update = (p.update ?? p) as Record<string, unknown>;
      const kind = String(update.sessionUpdate ?? "");
      if (kind === "pending_interaction") {
        this.emitStatus("Waiting for permission…");
      } else if (kind === "interaction_resolved") {
        this.emitStatus(null);
      }
    }
  }

  private mapSessionUpdate(update: Record<string, unknown>): void {
    if (this.turnCancelled) return;

    const kind = String(update.sessionUpdate ?? update.type ?? "");
    const at = nowIso();

    switch (kind) {
      case "agent_message_chunk": {
        const content = update.content as { text?: string } | undefined;
        const text = content?.text ?? (update.text as string) ?? "";
        if (text) {
          this.emit({ type: "assistant_chunk", text, at });
        }
        break;
      }
      case "agent_thought_chunk":
        this.emitStatus("Thinking…");
        break;
      case "tool_call": {
        const toolId = String(update.toolCallId ?? update.id ?? randomUUID());
        const title = String(update.title ?? update.kind ?? "tool");
        this.emit({ type: "tool", toolId, title, phase: "start", at });
        this.emitStatus(`Running ${title}…`);
        break;
      }
      case "tool_call_update": {
        const status = String(update.status ?? "");
        if (status === "completed" || status === "failed") {
          const toolId = String(update.toolCallId ?? update.id ?? "tool");
          const title = String(update.title ?? update.kind ?? "tool");
          this.emit({
            type: "tool",
            toolId,
            title,
            phase: "end",
            at,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  stop(): void {
    this.transport.dispose();
    this.proc = null;
    this.providerSessionId = "";
    this.domainSessionId = "";
    this.promptInFlight = false;
  }
}
