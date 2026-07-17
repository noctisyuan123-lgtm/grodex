const DEFAULT_BRIDGE =
  import.meta.env.VITE_GRODEX_BRIDGE_URL ?? "http://127.0.0.1:8790";

export type SessionAttachMode = "load" | "new";

export type SessionInfo = {
  sessionId: string;
  attachMode: SessionAttachMode;
  cwd: string;
  bin: string;
  hydrateUserTurns?: number;
  hydrateSource?: "acp_replay" | "chat_history" | "none";
};

export type BridgeStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "connected"; session: SessionInfo }
  | { state: "error"; message: string };

export type GrokSessionEntry = {
  sessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  numMessages?: number;
};

export type ChatEvent =
  | { type: "user"; text: string; at: string }
  | {
      type: "assistant_chunk";
      text: string;
      at: string;
      messageId?: string;
    }
  | { type: "assistant_done"; at: string }
  | {
      type: "history_hydrate_done";
      userTurns: number;
      source: "acp_replay" | "chat_history";
      at: string;
    }
  | { type: "status"; text: string | null; at: string }
  | {
      type: "tool";
      toolId: string;
      title: string;
      status: "running" | "completed" | "failed";
      kind?: string;
      /** @deprecated use status */
      phase?: "start" | "end";
      at: string;
    }
  | {
      type: "activity";
      text: string;
      kind?: "thinking" | "tool" | "status";
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
      agentKind?: "main" | "subagent";
      subagentModel?: string;
      at: string;
    }
  | {
      type: "permission";
      tool?: string;
      status: "pending" | "resolved";
      at: string;
    }
  | {
      type: "subagent";
      subagentId: string;
      childSessionId?: string;
      status: "spawned" | "running" | "completed" | "failed" | "cancelled";
      title: string;
      subagentType?: string;
      model?: string;
      activityLine?: string;
      at: string;
    }
  | { type: "error"; message: string; at: string }
  | { type: "connected"; at: string };

export async function fetchHealth(): Promise<{
  ok: boolean;
  bin: string;
  alive: boolean;
  status: BridgeStatus;
}> {
  const res = await fetch(`${DEFAULT_BRIDGE}/health`);
  if (!res.ok) throw new Error(`health ${res.status}`);
  return res.json();
}

export async function fetchSessionStatus(): Promise<{
  alive: boolean;
  status: BridgeStatus;
}> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/session/status`);
  if (!res.ok) throw new Error(`status ${res.status}`);
  return res.json();
}

export async function fetchRecentSessions(opts?: {
  cwd?: string;
  limit?: number;
}): Promise<GrokSessionEntry[]> {
  const params = new URLSearchParams();
  if (opts?.cwd) params.set("cwd", opts.cwd);
  if (opts?.limit) params.set("limit", String(opts.limit));
  const qs = params.toString();
  const res = await fetch(
    `${DEFAULT_BRIDGE}/api/sessions${qs ? `?${qs}` : ""}`
  );
  if (!res.ok) throw new Error(`sessions ${res.status}`);
  const data = (await res.json()) as { sessions?: GrokSessionEntry[] };
  return data.sessions ?? [];
}

export async function fetchSessionHistory(sessionId: string): Promise<{
  ok: boolean;
  userTurns: number;
  events: ChatEvent[];
  source: "chat_history";
}> {
  const params = new URLSearchParams({ sessionId });
  const res = await fetch(`${DEFAULT_BRIDGE}/api/session/history?${params}`);
  const data = (await res.json()) as {
    ok?: boolean;
    userTurns?: number;
    events?: ChatEvent[];
    source?: "chat_history";
    error?: string;
  };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `history ${res.status}`);
  }
  return {
    ok: true,
    userTurns: data.userTurns ?? 0,
    events: data.events ?? [],
    source: "chat_history",
  };
}

export async function connectSession(opts?: {
  cwd?: string;
  sessionId?: string;
}): Promise<{ ok: true; session: SessionInfo }> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/session/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(opts ?? {}),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    session?: SessionInfo;
    error?: string;
  };
  if (!res.ok || !data.ok || !data.session) {
    throw new Error(data.error ?? `connect failed (${res.status})`);
  }
  return { ok: true, session: data.session };
}

export async function promptSession(text: string): Promise<void> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/session/prompt`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !data.ok) {
    throw new Error(data.error ?? `prompt failed (${res.status})`);
  }
}

export async function cancelPrompt(): Promise<void> {
  await fetch(`${DEFAULT_BRIDGE}/api/session/cancel`, { method: "POST" });
}

export async function disconnectSession(): Promise<void> {
  await fetch(`${DEFAULT_BRIDGE}/api/session/disconnect`, { method: "POST" });
}

export function openSessionStream(
  onEvent: (event: ChatEvent) => void,
  onError?: (err: Error) => void
): () => void {
  const es = new EventSource(`${DEFAULT_BRIDGE}/api/session/stream`);

  es.onmessage = (ev) => {
    try {
      onEvent(JSON.parse(ev.data) as ChatEvent);
    } catch {
      /* ignore */
    }
  };

  es.onerror = () => {
    onError?.(new Error("SSE disconnected — bridge may be offline"));
  };

  return () => es.close();
}

export function bridgeBaseUrl(): string {
  return DEFAULT_BRIDGE;
}
