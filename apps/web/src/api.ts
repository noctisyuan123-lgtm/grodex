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

export type ProjectEntry = { path: string; name: string; at: string };

export type AgentMode = "agent" | "plan";

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
  model?: string;
  effort?: string;
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

export async function fetchRecentProjects(): Promise<ProjectEntry[]> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/recent`);
  if (!res.ok) return [];
  const data = (await res.json()) as { recent?: ProjectEntry[] };
  return data.recent ?? [];
}

export async function rememberPath(p: string): Promise<void> {
  await fetch(`${DEFAULT_BRIDGE}/api/recent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p }),
  }).catch(() => undefined);
}

export async function fetchRememberedCwd(): Promise<string> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/cwd`);
  if (!res.ok) return "";
  const data = (await res.json()) as { path?: string };
  return typeof data.path === "string" ? data.path : "";
}

export async function setProjectCwd(p: string): Promise<string> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/cwd`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: p }),
  });
  const data = (await res.json()) as { ok?: boolean; path?: string; error?: string };
  if (!res.ok || !data.ok || !data.path) {
    throw new Error(data.error ?? `cwd ${res.status}`);
  }
  return data.path;
}

export async function pickFolder(): Promise<string | null> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/folder-pick`, { method: "POST" });
  if (!res.ok) {
    throw new Error(`folder-pick ${res.status}`);
  }
  const data = (await res.json()) as {
    cancelled?: boolean;
    path?: string | null;
    error?: string;
  };
  if (data.error) throw new Error(data.error);
  if (data.cancelled || !data.path) return null;
  return data.path;
}

export type SearchAgentHit = {
  id: string;
  kind: "agent";
  sessionId: string;
  title: string;
  cwd: string;
  repo: string;
  updatedAt: string;
};

export type SearchFileHit = {
  id: string;
  kind: "file";
  name: string;
  path: string;
};

export type SearchActionHit = {
  id: string;
  kind: "action";
  label: string;
  action: "new-agent" | "open-project" | "customize" | "connect" | "disconnect";
};

export async function fetchSearch(q = ""): Promise<{
  agents: SearchAgentHit[];
  files: SearchFileHit[];
  actions: SearchActionHit[];
}> {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  const qs = params.toString();
  const res = await fetch(`${DEFAULT_BRIDGE}/api/search${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error(`search ${res.status}`);
  const data = (await res.json()) as {
    agents?: SearchAgentHit[];
    files?: SearchFileHit[];
    actions?: SearchActionHit[];
  };
  return {
    agents: data.agents ?? [],
    files: data.files ?? [],
    actions: data.actions ?? [],
  };
}

export type SkillEntry = {
  name: string;
  description: string;
  source: string;
  dir: string;
};

export type GrokMcpServer = {
  name: string;
  enabled: boolean;
  command?: string;
  args?: string[];
  env: Record<string, string>;
};

export type CustomizeOverview = {
  memory: {
    index: string;
    sticky: string;
    entriesDir: string;
    indexExists: boolean;
    stickyExists: boolean;
    entriesExists: boolean;
  };
  rules: Array<{ name: string; path: string }>;
  ruleFiles: Array<{
    id: string;
    name: string;
    path: string;
    content: string;
  }>;
  skills: SkillEntry[];
  bridge: {
    connected: boolean;
    bin: string;
    sessionId: string | null;
    cwd: string;
    status: string;
  };
  mcp: {
    configPath: string;
    servers: GrokMcpServer[];
  };
};

export async function fetchCustomizeOverview(
  cwd?: string
): Promise<CustomizeOverview> {
  const params = new URLSearchParams();
  if (cwd) params.set("cwd", cwd);
  const qs = params.toString();
  const res = await fetch(
    `${DEFAULT_BRIDGE}/api/customize/overview${qs ? `?${qs}` : ""}`
  );
  if (!res.ok) throw new Error(`customize overview ${res.status}`);
  const data = (await res.json()) as { overview?: CustomizeOverview };
  if (!data.overview) throw new Error("customize overview missing");
  return data.overview;
}

export async function revealInFinder(target: string): Promise<void> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/fs/reveal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: target }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `reveal failed (${res.status})`);
  }
}

export async function openLocalPath(target: string): Promise<void> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/fs/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: target }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `open failed (${res.status})`);
  }
}

export async function fetchSkills(cwd?: string): Promise<SkillEntry[]> {
  const params = new URLSearchParams();
  if (cwd) params.set("cwd", cwd);
  const qs = params.toString();
  const res = await fetch(
    `${DEFAULT_BRIDGE}/api/skills${qs ? `?${qs}` : ""}`
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { skills?: SkillEntry[] };
  return data.skills ?? [];
}

export type CustomizeFile = {
  id: string;
  name: string;
  path: string;
  kind: "rule" | "memory";
  content: string;
};

export type CustomizeMcpState = {
  grokConfigPath: string;
  cursorMcpPath: string;
  grok: GrokMcpServer[];
  cursorJson: string;
};

export async function fetchCustomizeFiles(): Promise<CustomizeFile[]> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/files`);
  if (!res.ok) return [];
  const data = (await res.json()) as { files?: CustomizeFile[] };
  return data.files ?? [];
}

export async function saveCustomizeFile(
  id: string,
  content: string
): Promise<CustomizeFile> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/files`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, content }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? `save failed (${res.status})`);
  }
  const data = (await res.json()) as { file: CustomizeFile };
  return data.file;
}

export async function fetchCustomizeMcp(): Promise<CustomizeMcpState | null> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/mcp`);
  if (!res.ok) return null;
  return (await res.json()) as CustomizeMcpState;
}

export async function saveCustomizeMcp(input: {
  grok?: Array<{
    name: string;
    enabled?: boolean;
    env?: Record<string, string>;
  }>;
  cursorJson?: string;
}): Promise<CustomizeMcpState> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/mcp`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    let msg = `save MCP failed HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  return (await res.json()) as CustomizeMcpState;
}

export type CustomizeHookFile = {
  id: string;
  name: string;
  path: string;
  kind: "json" | "script";
  content: string;
  events: string[];
};

export type CustomizeHooksState = {
  hooksDir: string;
  files: CustomizeHookFile[];
};

export async function fetchCustomizeHooks(): Promise<CustomizeHooksState> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/hooks`);
  if (!res.ok) return { hooksDir: "", files: [] };
  return (await res.json()) as CustomizeHooksState;
}

export async function saveCustomizeHook(
  name: string,
  content: string,
  create = false
): Promise<{ file: CustomizeHookFile } & CustomizeHooksState> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/hooks`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content, create }),
  });
  if (!res.ok) {
    let msg = `save hook failed HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  return (await res.json()) as { file: CustomizeHookFile } & CustomizeHooksState;
}

export async function deleteCustomizeHook(
  name: string
): Promise<CustomizeHooksState> {
  const res = await fetch(`${DEFAULT_BRIDGE}/api/customize/hooks`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    let msg = `delete hook failed HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* keep */
    }
    throw new Error(msg);
  }
  const data = (await res.json()) as CustomizeHooksState;
  return data;
}
