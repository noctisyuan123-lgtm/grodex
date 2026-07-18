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
  /** User turns visible after load hydrate (0 when attachMode=new) */
  hydrateUserTurns?: number;
  hydrateSource?: "acp_replay" | "chat_history" | "none";
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
  private activeTools = new Map<string, string>();
  /** child_session_id values from SubagentSpawned — route nested session/update here */
  private childSessionIds = new Set<string>();
  /** Live subagent rows keyed by subagent_id */
  private activeSubagents = new Map<
    string,
    {
      title: string;
      model?: string;
      subagentType?: string;
      childSessionId?: string;
      activityLine?: string;
    }
  >();
  /** True while session/load is replaying updates.jsonl into session/update */
  private replaying = false;
  private replayAssistantBuf = "";
  private replayTurn = 0;
  private replayUserTurns = 0;
  private replayLastNotifyAt = 0;

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

  private emitActivity(
    text: string,
    kind: "thinking" | "tool" | "status" = "status",
    opts?: {
      agentKind?: "main" | "subagent";
      subagentModel?: string;
      phase?:
        | "idle"
        | "working"
        | "thinking"
        | "tool"
        | "permission"
        | "compact"
        | "queue"
        | "sleeping"
        | "error";
    }
  ): void {
    const trimmed = text.trim();
    if (!trimmed) return;
    this.emit({
      type: "activity",
      text: trimmed,
      kind,
      phase: opts?.phase,
      agentKind: opts?.agentKind,
      subagentModel: opts?.subagentModel,
      at: nowIso(),
    });
  }

  private emitPermission(tool: string | undefined, status: "pending" | "resolved"): void {
    this.emit({
      type: "permission",
      tool,
      status,
      at: nowIso(),
    });
  }

  private emitSubagent(
    subagentId: string,
    status: "spawned" | "running" | "completed" | "failed" | "cancelled",
    fields: {
      title: string;
      subagentType?: string;
      model?: string;
      childSessionId?: string;
      activityLine?: string;
    }
  ): void {
    this.emit({
      type: "subagent",
      subagentId,
      childSessionId: fields.childSessionId,
      status,
      title: fields.title,
      subagentType: fields.subagentType,
      model: fields.model,
      activityLine: fields.activityLine,
      at: nowIso(),
    });
  }

  private isKnownSession(wire: string): boolean {
    if (!wire) return true;
    if (!this.providerSessionId) return true;
    if (wire === this.providerSessionId) return true;
    return this.childSessionIds.has(wire);
  }

  private subagentIdForChildSession(wire: string): string | undefined {
    for (const [id, row] of this.activeSubagents) {
      if (row.childSessionId === wire) return id;
    }
    return undefined;
  }

  private emitTool(
    toolId: string,
    title: string,
    status: "running" | "completed" | "failed",
    kind?: string
  ): void {
    const phase = status === "running" ? "start" : "end";
    this.emit({
      type: "tool",
      toolId,
      title,
      status,
      kind,
      phase,
      at: nowIso(),
    });
  }

  private noteReplayActivity(): void {
    if (this.replaying) {
      this.replayLastNotifyAt = Date.now();
    }
  }

  private replayAssistantId(): string {
    return `a-replay-${this.replayTurn}`;
  }

  private finalizeReplayAssistant(): void {
    const text = this.replayAssistantBuf.trim();
    if (!text) return;
    this.emit({
      type: "assistant_chunk",
      text,
      messageId: this.replayAssistantId(),
      at: nowIso(),
    });
    this.emit({ type: "assistant_done", at: nowIso() });
    this.replayAssistantBuf = "";
  }

  private async waitForReplayDrain(maxMs = 500): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const idle = Date.now() - this.replayLastNotifyAt;
      if (this.replayLastNotifyAt === 0 || idle >= 80) return;
      await new Promise((r) => setTimeout(r, 40));
    }
  }

  private extractChunkText(update: Record<string, unknown>): string {
    const content = update.content as { text?: string } | undefined;
    return (
      content?.text ??
      (typeof update.text === "string" ? update.text : "") ??
      ""
    );
  }

  private isReplayUserNoise(text: string): boolean {
    const t = text.trim();
    if (!t) return true;
    if (t.startsWith("<local-command")) return true;
    if (t.startsWith("<command-name>") || t.startsWith("<command-message>")) {
      return true;
    }
    return false;
  }

  async connect(opts: {
    cwd: string;
    sessionId?: string;
    model?: string;
    effort?: string;
  }): Promise<AgentSessionInfo> {
    const bin = resolveGrodexBin();
    assertGrodexBin(bin);
    this.cwd = opts.cwd;

    const agentArgs = ["agent"];
    if (opts.model) agentArgs.push("--model", opts.model);
    if (opts.effort) agentArgs.push("--effort", opts.effort);
    agentArgs.push("stdio");

    this.proc = spawn(bin, agentArgs, {
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
            toolCall?: { title?: string; kind?: string };
            options?: Array<{ optionId?: string }>;
          };
          const tool =
            p.toolCall?.title?.trim() ||
            p.toolCall?.kind?.trim() ||
            undefined;
          this.emitPermission(tool, "pending");
          this.emitStatus("Waiting for permission…");
          this.emitActivity("Waiting for permission…", "status", {
            phase: "permission",
          });
          const optionId =
            p.options?.find((o) => o.optionId)?.optionId ?? "allow-once";
          this.transport.reply(id, {
            outcome: { outcome: "selected", optionId },
          });
          this.emitPermission(tool, "resolved");
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
      this.replaying = true;
      this.replayAssistantBuf = "";
      this.replayTurn = 0;
      this.replayUserTurns = 0;
      this.replayLastNotifyAt = 0;
      try {
        const loaded = (await this.transport.send(
          "session/load",
          { sessionId: opts.sessionId, cwd: opts.cwd, mcpServers: [] },
          120_000
        )) as { sessionId?: string };
        const sessionId = loaded.sessionId ?? opts.sessionId;
        this.providerSessionId = sessionId;
        this.domainSessionId = sessionId;
        await this.waitForReplayDrain();
        this.finalizeReplayAssistant();
        this.replaying = false;
        this.emit({
          type: "history_hydrate_done",
          userTurns: this.replayUserTurns,
          source: "acp_replay",
          at: nowIso(),
        });
        return {
          sessionId,
          attachMode: "load",
          cwd: opts.cwd,
          bin,
          hydrateUserTurns: this.replayUserTurns,
          hydrateSource: this.replayUserTurns > 0 ? "acp_replay" : "none",
        };
      } catch (err) {
        this.replaying = false;
        this.replayAssistantBuf = "";
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
    this.activeTools.clear();
    this.childSessionIds.clear();
    this.activeSubagents.clear();
    this.emit({ type: "user", text: trimmed, at: nowIso() });
    this.emitStatus("Waiting for model…");
    this.emitActivity("Waiting for model…", "status");

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
      this.activeTools.clear();
      this.childSessionIds.clear();
      this.activeSubagents.clear();
      this.emitStatus(null);
      this.emit({ type: "assistant_done", at: nowIso() });
    } catch (err) {
      this.promptInFlight = false;
      this.activeTools.clear();
      this.childSessionIds.clear();
      this.activeSubagents.clear();
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
      if (!this.isKnownSession(wire)) return;
      const update = (p.update ?? p) as Record<string, unknown>;
      const meta = p._meta as Record<string, unknown> | undefined;
      const isReplay = Boolean(meta?.isReplay) || this.replaying;
      const fromChild = Boolean(
        wire && this.providerSessionId && wire !== this.providerSessionId
      );
      this.noteReplayActivity();
      this.mapSessionUpdate(update, { fromChild, childSessionId: wire, isReplay });
      return;
    }

    if (
      method === "_x.ai/session_notification" ||
      method === "x.ai/session_notification"
    ) {
      const wire = String(p.sessionId ?? "").trim();
      if (!this.isKnownSession(wire)) return;
      const update = (p.update ?? p) as Record<string, unknown>;
      const kind = String(update.sessionUpdate ?? "");
      if (kind === "pending_interaction") {
        const ik = String(update.kind ?? "interaction");
        if (ik === "permission") {
          this.emitPermission(undefined, "pending");
          this.emitStatus("Waiting for permission…");
          this.emitActivity("Waiting for permission…", "status", {
            phase: "permission",
          });
        } else {
          this.emitStatus(`Waiting: ${ik}…`);
          this.emitActivity(`Waiting: ${ik}…`, "status", { phase: "working" });
        }
      } else if (kind === "interaction_resolved") {
        this.emitPermission(undefined, "resolved");
        this.emitStatus(null);
      } else if (
        kind === "subagent_spawned" ||
        kind === "subagent_progress" ||
        kind === "subagent_finished"
      ) {
        this.mapSubagentUpdate(kind, update);
      }
    }
  }

  /** Map Core subagent lifecycle notifications (parent session channel). */
  private mapSubagentUpdate(
    kind: string,
    update: Record<string, unknown>
  ): void {
    if (this.turnCancelled) return;

    const subagentId = String(
      update.subagent_id ?? update.child_session_id ?? ""
    ).trim();
    if (!subagentId) return;

    if (kind === "subagent_spawned") {
      const childSessionId = String(update.child_session_id ?? subagentId).trim();
      const title = String(update.description ?? "Subagent").trim() || "Subagent";
      const model =
        typeof update.model === "string" ? update.model.trim() : undefined;
      const subagentType =
        typeof update.subagent_type === "string"
          ? update.subagent_type.trim()
          : undefined;

      if (childSessionId) this.childSessionIds.add(childSessionId);
      this.activeSubagents.set(subagentId, {
        title,
        model,
        subagentType,
        childSessionId,
        activityLine: "Waiting for subagent",
      });
      this.emitSubagent(subagentId, "spawned", {
        title,
        model,
        subagentType,
        childSessionId,
        activityLine: "Waiting for subagent",
      });
      this.emitActivity(title, "status", {
        agentKind: "subagent",
        subagentModel: model,
      });
      return;
    }

    if (kind === "subagent_progress") {
      const row = this.activeSubagents.get(subagentId);
      const turnCount = Number(update.turn_count ?? 0);
      const toolCalls = Number(update.tool_call_count ?? 0);
      const activityLine =
        turnCount > 0 || toolCalls > 0
          ? `Turn ${turnCount} · ${toolCalls} tool${toolCalls === 1 ? "" : "s"}`
          : row?.activityLine ?? "Working…";

      const next = {
        title: row?.title ?? "Subagent",
        model: row?.model,
        subagentType: row?.subagentType,
        childSessionId: row?.childSessionId,
        activityLine,
      };
      this.activeSubagents.set(subagentId, next);
      this.emitSubagent(subagentId, "running", next);
      this.emitActivity(activityLine, "status", {
        agentKind: "subagent",
        subagentModel: next.model,
      });
      return;
    }

    if (kind === "subagent_finished") {
      const row = this.activeSubagents.get(subagentId);
      const rawStatus = String(update.status ?? "completed").toLowerCase();
      const status =
        rawStatus === "failed"
          ? "failed"
          : rawStatus === "cancelled" || rawStatus === "canceled"
            ? "cancelled"
            : "completed";
      const childSessionId = row?.childSessionId;
      if (childSessionId) this.childSessionIds.delete(childSessionId);
      this.activeSubagents.delete(subagentId);
      this.emitSubagent(subagentId, status, {
        title: row?.title ?? "Subagent",
        model: row?.model,
        subagentType: row?.subagentType,
        childSessionId,
      });
      if (this.activeSubagents.size === 0) {
        this.emitStatus(null);
      }
    }
  }

  private mapSessionUpdate(
    update: Record<string, unknown>,
    ctx: {
      fromChild?: boolean;
      childSessionId?: string;
      isReplay?: boolean;
    } = {}
  ): void {
    if (this.turnCancelled) return;

    const kind = String(update.sessionUpdate ?? update.type ?? "");
    const at = nowIso();
    const isReplay = Boolean(ctx.isReplay);

    // Subagent lifecycle may also arrive on session/update (jsonl replay path).
    if (
      kind === "subagent_spawned" ||
      kind === "subagent_progress" ||
      kind === "subagent_finished"
    ) {
      if (!isReplay) this.mapSubagentUpdate(kind, update);
      return;
    }

    const nestedSubagentId = ctx.fromChild
      ? this.subagentIdForChildSession(ctx.childSessionId ?? "")
      : undefined;
    const nestedRow = nestedSubagentId
      ? this.activeSubagents.get(nestedSubagentId)
      : undefined;
    const nestedOpts = nestedRow
      ? { agentKind: "subagent" as const, subagentModel: nestedRow.model }
      : undefined;

    switch (kind) {
      case "user_message_chunk": {
        if (ctx.fromChild || !isReplay) break;
        const text = this.extractChunkText(update).trim();
        if (this.isReplayUserNoise(text)) break;
        this.finalizeReplayAssistant();
        this.replayTurn += 1;
        this.replayUserTurns += 1;
        this.replayAssistantBuf = "";
        this.emit({ type: "user", text, at });
        break;
      }
      case "agent_message_chunk": {
        if (ctx.fromChild) break;
        const text = this.extractChunkText(update);
        if (!text) break;
        if (isReplay) {
          this.replayAssistantBuf += text;
          this.emit({
            type: "assistant_chunk",
            text: this.replayAssistantBuf,
            messageId: this.replayAssistantId(),
            at,
          });
          break;
        }
        this.emit({ type: "assistant_chunk", text, at });
        break;
      }
      case "agent_thought_chunk": {
        const content = update.content as { text?: string } | undefined;
        const thought =
          content?.text?.trim() ??
          (typeof update.text === "string" ? update.text.trim() : "");
        if (ctx.fromChild && nestedSubagentId && nestedRow) {
          const activityLine = thought
            ? thought.slice(0, 96)
            : "Thinking…";
          this.activeSubagents.set(nestedSubagentId, {
            ...nestedRow,
            activityLine,
          });
          this.emitSubagent(nestedSubagentId, "running", {
            ...nestedRow,
            activityLine,
          });
          this.emitActivity(activityLine, "thinking", nestedOpts);
          break;
        }
        this.emitStatus("Thinking…");
        this.emitActivity(thought ? "Thinking…" : "Thinking…", "thinking", {
          phase: "thinking",
        });
        break;
      }
      case "tool_call": {
        const toolId = String(update.toolCallId ?? update.id ?? randomUUID());
        const title = String(update.title ?? update.kind ?? "tool");
        const toolKind = String(update.kind ?? "other");
        if (isReplay) {
          this.emitTool(toolId, title, "completed", toolKind);
          break;
        }
        if (ctx.fromChild && nestedSubagentId && nestedRow) {
          const activityLine = `Using ${title.slice(0, 60)}…`;
          this.activeSubagents.set(nestedSubagentId, {
            ...nestedRow,
            activityLine,
          });
          this.emitSubagent(nestedSubagentId, "running", {
            ...nestedRow,
            activityLine,
          });
          this.emitActivity(activityLine, "tool", nestedOpts);
          break;
        }
        this.activeTools.set(toolId, title);
        this.emitTool(toolId, title, "running", toolKind);
        this.emitStatus(`Running ${title}…`);
        const isSleeping =
          toolKind === "sleeping" ||
          /^(Execute|Running)\s/i.test(title) ||
          title.toLowerCase().includes("shell");
        this.emitActivity(
          title.startsWith("Execute") || toolKind === "execute"
            ? title.slice(0, 72) + (title.length > 72 ? "…" : "")
            : `Using ${title.slice(0, 60)}…`,
          "tool",
          { phase: isSleeping ? "sleeping" : "tool" }
        );
        break;
      }
      case "tool_call_update": {
        const toolId = String(update.toolCallId ?? update.id ?? "tool");
        const rawStatus = String(update.status ?? "").toLowerCase();
        const title =
          update.title != null
            ? String(update.title)
            : this.activeTools.get(toolId) ?? "tool";
        const toolKind =
          update.kind != null ? String(update.kind) : undefined;

        if (isReplay) {
          const status =
            rawStatus === "failed" || rawStatus === "error"
              ? "failed"
              : "completed";
          this.emitTool(toolId, title, status, toolKind);
          break;
        }

        if (ctx.fromChild && nestedSubagentId && nestedRow) {
          const activityLine =
            rawStatus === "completed" || rawStatus === "success"
              ? `Finished ${title.slice(0, 48)}`
              : `Using ${title.slice(0, 60)}…`;
          this.activeSubagents.set(nestedSubagentId, {
            ...nestedRow,
            activityLine,
          });
          this.emitSubagent(nestedSubagentId, "running", {
            ...nestedRow,
            activityLine,
          });
          this.emitActivity(activityLine, "tool", nestedOpts);
          break;
        }

        if (rawStatus === "failed" || rawStatus === "error") {
          this.activeTools.delete(toolId);
          this.emitTool(toolId, title, "failed", toolKind);
          this.emitStatus(null);
        } else if (
          rawStatus === "completed" ||
          rawStatus === "success" ||
          rawStatus === "done"
        ) {
          this.activeTools.delete(toolId);
          this.emitTool(toolId, title, "completed", toolKind);
          if (this.activeTools.size === 0 && this.activeSubagents.size === 0) {
            this.emitStatus(null);
          }
        } else if (title) {
          this.activeTools.set(toolId, title);
          this.emitTool(toolId, title, "running", toolKind);
          this.emitActivity(
            `Using ${title.slice(0, 60)}…`,
            "tool"
          );
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
    this.replaying = false;
    this.replayAssistantBuf = "";
    this.childSessionIds.clear();
    this.activeSubagents.clear();
  }
}
