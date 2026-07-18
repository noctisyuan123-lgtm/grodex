import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import {
  cancelPrompt,
  connectSession,
  disconnectSession,
  fetchHealth,
  fetchRecentSessions,
  fetchRememberedCwd,
  fetchSessionHistory,
  openSessionStream,
  promptSession,
  rememberPath,
  type AgentMode,
  type BridgeStatus,
  type ChatEvent,
  type GrokSessionEntry,
  type SessionInfo,
} from "./api";
import type { ToolRow } from "./ToolTimeline";

export type { AgentMode } from "./api";

export type PendingHistorySession = {
  sessionId: string;
  cwd: string;
};

export type SubagentRow = {
  subagentId: string;
  title: string;
  model?: string;
  subagentType?: string;
  status: "spawned" | "running" | "completed" | "failed" | "cancelled";
  activityLine?: string;
};

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; live?: boolean };

function upsertAssistant(
  messages: ChatMessage[],
  id: string,
  text: string,
  live = true
): ChatMessage[] {
  const idx = messages.findIndex((m) => m.id === id);
  if (idx >= 0) {
    const next = [...messages];
    next[idx] = { id, role: "assistant", text, live };
    return next;
  }
  return [...messages, { id, role: "assistant", text, live }];
}

function upsertTool(tools: ToolRow[], event: Extract<ChatEvent, { type: "tool" }>): ToolRow[] {
  const status =
    event.status ??
    (event.phase === "start"
      ? "running"
      : event.phase === "end"
        ? "completed"
        : "running");
  const idx = tools.findIndex((t) => t.toolId === event.toolId);
  const row: ToolRow = {
    toolId: event.toolId,
    label: event.title,
    status,
    kind: event.kind,
    name: event.kind,
  };
  if (idx >= 0) {
    const next = [...tools];
    next[idx] = row;
    return next;
  }
  return [...tools, row];
}

function upsertSubagent(
  rows: SubagentRow[],
  event: Extract<ChatEvent, { type: "subagent" }>
): SubagentRow[] {
  const idx = rows.findIndex((r) => r.subagentId === event.subagentId);
  const row: SubagentRow = {
    subagentId: event.subagentId,
    title: event.title,
    model: event.model,
    subagentType: event.subagentType,
    status:
      event.status === "spawned"
        ? "running"
        : event.status,
    activityLine: event.activityLine,
  };
  if (idx >= 0) {
    const next = [...rows];
    next[idx] = { ...next[idx]!, ...row };
    return next;
  }
  return [...rows, row];
}

function applyChatEvent(
  event: ChatEvent,
  ctx: {
    liveAssistantId: { current: string };
    assistantBuf: { current: string };
    setMessages: Dispatch<SetStateAction<ChatMessage[]>>;
    setTools: Dispatch<SetStateAction<ToolRow[]>>;
    setSubagents: Dispatch<SetStateAction<SubagentRow[]>>;
    setSubagentModel: Dispatch<SetStateAction<string | null>>;
    setProcessLine: Dispatch<SetStateAction<string | null>>;
    setActivityPhase: Dispatch<SetStateAction<string | null>>;
    setPermissionPending: Dispatch<SetStateAction<boolean>>;
    setStatusText: Dispatch<SetStateAction<string | null>>;
    setError: Dispatch<SetStateAction<string | null>>;
    setBusy: Dispatch<SetStateAction<boolean>>;
  }
): void {
  switch (event.type) {
    case "user":
      ctx.setMessages((m) => [
        ...m,
        { id: `u-${event.at}-${m.length}`, role: "user", text: event.text },
      ]);
      ctx.setTools([]);
      ctx.setSubagents([]);
      ctx.setSubagentModel(null);
      ctx.setProcessLine(null);
      ctx.setActivityPhase(null);
      ctx.setPermissionPending(false);
      ctx.setBusy(true);
      break;
    case "assistant_chunk": {
      const msgId = event.messageId ?? ctx.liveAssistantId.current;
      if (event.messageId) {
        ctx.liveAssistantId.current = msgId;
        ctx.assistantBuf.current = event.text;
      } else {
        ctx.assistantBuf.current += event.text;
      }
      ctx.setMessages((m) =>
        upsertAssistant(
          m,
          msgId,
          event.messageId ? event.text : ctx.assistantBuf.current,
          true
        )
      );
      break;
    }
    case "assistant_done":
      ctx.setMessages((m) =>
        m.map((msg) =>
          msg.role === "assistant" && msg.live
            ? { ...msg, live: false }
            : msg
        )
      );
      ctx.assistantBuf.current = "";
      ctx.liveAssistantId.current = `a-${Date.now()}`;
      ctx.setBusy(false);
      ctx.setStatusText(null);
      ctx.setProcessLine(null);
      ctx.setActivityPhase(null);
      ctx.setPermissionPending(false);
      ctx.setSubagentModel(null);
      break;
    case "history_hydrate_done":
      ctx.setBusy(false);
      break;
    case "status":
      ctx.setStatusText(event.text);
      break;
    case "activity":
      ctx.setProcessLine(event.text);
      if (event.phase) ctx.setActivityPhase(event.phase);
      if (event.agentKind === "subagent" && event.subagentModel?.trim()) {
        ctx.setSubagentModel(event.subagentModel.trim());
      }
      break;
    case "subagent":
      ctx.setSubagents((rows) => upsertSubagent(rows, event));
      if (event.model?.trim()) ctx.setSubagentModel(event.model.trim());
      if (event.activityLine?.trim()) ctx.setProcessLine(event.activityLine);
      if (
        event.status === "completed" ||
        event.status === "failed" ||
        event.status === "cancelled"
      ) {
        ctx.setSubagents((rows) =>
          rows.filter((r) => r.subagentId !== event.subagentId)
        );
      }
      break;
    case "permission":
      ctx.setPermissionPending(event.status === "pending");
      if (event.status === "pending") {
        ctx.setActivityPhase("permission");
        ctx.setStatusText(
          event.tool ? `Permission: ${event.tool}` : "Waiting for permission…"
        );
      } else {
        ctx.setPermissionPending(false);
      }
      break;
    case "tool":
      ctx.setTools((t) => upsertTool(t, event));
      if (event.status === "running") {
        ctx.setProcessLine(event.title);
      }
      break;
    case "error":
      ctx.setError(event.message);
      ctx.setBusy(false);
      ctx.setProcessLine(null);
      break;
    default:
      break;
  }
}

export function useChatSession() {
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [bin, setBin] = useState("");
  const [status, setStatus] = useState<BridgeStatus>({ state: "idle" });
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [recentSessions, setRecentSessions] = useState<GrokSessionEntry[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [cwd, setCwdState] = useState(
    () => localStorage.getItem("grodex-cwd") || ""
  );
  const [agentMode, setAgentMode] = useState<AgentMode>(() => {
    const raw = localStorage.getItem("grodex-mode");
    return raw === "plan" ? "plan" : "agent";
  });
  const [historyOnly, setHistoryOnly] = useState(false);
  const [pendingHistory, setPendingHistory] =
    useState<PendingHistorySession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [processLine, setProcessLine] = useState<string | null>(null);
  const [activityPhase, setActivityPhase] = useState<string | null>(null);
  const [permissionPending, setPermissionPending] = useState(false);
  const [subagents, setSubagents] = useState<SubagentRow[]>([]);
  const [subagentModel, setSubagentModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveAssistantId = useRef("a-live");
  const assistantBuf = useRef("");
  const messageCountRef = useRef(0);

  useEffect(() => {
    messageCountRef.current = messages.length;
  }, [messages]);

  const eventCtx = {
    liveAssistantId,
    assistantBuf,
    setMessages,
    setTools,
    setSubagents,
    setSubagentModel,
    setProcessLine,
    setActivityPhase,
    setPermissionPending,
    setStatusText,
    setError,
    setBusy,
  };

  const applyHistoryEvents = useCallback(
    (events: ChatEvent[]) => {
      for (const event of events) {
        applyChatEvent(event, eventCtx);
      }
    },
    [
      setMessages,
      setTools,
      setSubagents,
      setSubagentModel,
      setProcessLine,
      setActivityPhase,
      setPermissionPending,
      setStatusText,
      setError,
      setBusy,
    ]
  );

  const refresh = useCallback(async () => {
    try {
      const health = await fetchHealth();
      setBridgeUp(true);
      setBin(health.bin);
      setStatus(health.status);
      if (health.status.state === "connected") {
        setSession(health.status.session);
      } else {
        setSession(null);
      }
      setError(null);
    } catch (e) {
      setBridgeUp(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const refreshSessions = useCallback(async (cwdFilter?: string) => {
    try {
      const list = await fetchRecentSessions({ cwd: cwdFilter, limit: 30 });
      setRecentSessions(list);
    } catch {
      setRecentSessions([]);
    }
  }, []);

  const setCwd = useCallback(
    (path: string) => {
      const trimmed = path.trim();
      setCwdState(trimmed);
      if (trimmed) localStorage.setItem("grodex-cwd", trimmed);
      else localStorage.removeItem("grodex-cwd");
    },
    []
  );

  const setMode = useCallback((mode: AgentMode) => {
    setAgentMode(mode);
    localStorage.setItem("grodex-mode", mode);
  }, []);

  useEffect(() => {
    void fetchRememberedCwd().then((p) => {
      if (p) setCwd(p);
    });
  }, [setCwd]);

  useEffect(() => {
    void refresh();
    void refreshSessions(cwd || undefined);
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh, refreshSessions, cwd]);

  useEffect(() => {
    const close = openSessionStream((event: ChatEvent) => {
      applyChatEvent(event, eventCtx);
    });
    return close;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs + setState are stable
  }, []);

  const resetTimeline = useCallback(() => {
    setMessages([]);
    setTools([]);
    setSubagents([]);
    setSubagentModel(null);
    setProcessLine(null);
    setActivityPhase(null);
    setPermissionPending(false);
    setStatusText(null);
    assistantBuf.current = "";
    liveAssistantId.current = `a-${Date.now()}`;
  }, []);

  const connectCore = async (
    sessionIdOverride?: string,
    opts?: { preserveMessages?: boolean; cwdOverride?: string }
  ) => {
    if (!opts?.preserveMessages) resetTimeline();
    setHistoryOnly(false);
    setPendingHistory(null);
    const sid =
      sessionIdOverride?.trim() ||
      pendingHistory?.sessionId ||
      sessionIdInput.trim() ||
      undefined;
    const connectCwd = opts?.cwdOverride?.trim() || cwd.trim() || undefined;
    const result = await connectSession({
      sessionId: sid,
      cwd: connectCwd,
    });
    setSession(result.session);
    setSessionIdInput(result.session.sessionId);
    setCwd(result.session.cwd);
    void rememberPath(result.session.cwd);
    setStatus({ state: "connected", session: result.session });

    const hydratedTurns = result.session.hydrateUserTurns ?? 0;
    if (result.session.attachMode === "load" && !opts?.preserveMessages) {
      try {
        const hist = await fetchSessionHistory(result.session.sessionId);
        const preferHistory =
          hist.userTurns > hydratedTurns ||
          (hist.userTurns > 0 && messageCountRef.current === 0);
        if (preferHistory) {
          resetTimeline();
          applyHistoryEvents(hist.events);
        }
      } catch {
        /* bridge may have already hydrated via SSE */
      }
    }

    void refreshSessions(result.session.cwd);
    return result.session;
  };

  const onConnect = async (
    sessionIdOverride?: string,
    opts?: { preserveMessages?: boolean; cwdOverride?: string }
  ) => {
    setBusy(true);
    setError(null);
    try {
      await connectCore(sessionIdOverride, opts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const openHistorySession = async (sessionId: string, histCwd: string) => {
    setBusy(true);
    setError(null);
    try {
      if (session) {
        await disconnectSession();
        setSession(null);
        setStatus({ state: "idle" });
      }
      resetTimeline();
      setCwd(histCwd);
      void rememberPath(histCwd);
      setSessionIdInput(sessionId);
      setPendingHistory({ sessionId, cwd: histCwd });
      setHistoryOnly(true);
      const hist = await fetchSessionHistory(sessionId);
      applyHistoryEvents(hist.events);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const newAgent = async () => {
    setBusy(true);
    try {
      await disconnectSession();
      setSession(null);
      setStatus({ state: "idle" });
      setHistoryOnly(false);
      setPendingHistory(null);
      setSessionIdInput("");
      resetTimeline();
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    await newAgent();
  };

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    setError(null);
    setBusy(true);
    setTools([]);
    setSubagents([]);
    setSubagentModel(null);
    setProcessLine(null);
    setActivityPhase(null);
    setPermissionPending(false);
    try {
      if (historyOnly && pendingHistory) {
        await connectCore(pendingHistory.sessionId, {
          preserveMessages: true,
          cwdOverride: pendingHistory.cwd,
        });
      } else if (!session) {
        if (!cwd.trim()) {
          throw new Error("Select a project folder first");
        }
        await connectCore(undefined, { cwdOverride: cwd });
      }
      await promptSession(trimmed);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const onCancel = async () => {
    await cancelPrompt();
    setBusy(false);
    setStatusText(null);
    setProcessLine(null);
    setActivityPhase(null);
    setPermissionPending(false);
    setSubagentModel(null);
  };

  const connected = status.state === "connected" && session;
  const ready = bridgeUp === true;
  const liveTools = tools.filter((t) => t.status === "running");
  const settledTools = tools.filter((t) => t.status !== "running");

  return {
    bridgeUp,
    bin,
    status,
    session,
    cwd,
    setCwd,
    agentMode,
    setAgentMode: setMode,
    historyOnly,
    pendingHistory,
    recentSessions,
    sessionIdInput,
    setSessionIdInput,
    messages,
    tools,
    liveTools,
    settledTools,
    statusText,
    processLine,
    activityPhase,
    permissionPending,
    subagents,
    subagentModel,
    busy,
    error,
    setError,
    connected,
    ready,
    refresh,
    refreshSessions,
    onConnect,
    onDisconnect,
    newAgent,
    openHistorySession,
    onSend,
    onCancel,
  };
}
