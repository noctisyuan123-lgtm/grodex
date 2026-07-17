import { useCallback, useEffect, useRef, useState } from "react";
import {
  cancelPrompt,
  connectSession,
  disconnectSession,
  fetchHealth,
  fetchRecentSessions,
  openSessionStream,
  promptSession,
  type BridgeStatus,
  type ChatEvent,
  type GrokSessionEntry,
  type SessionInfo,
} from "./api";
import type { ToolRow } from "./ToolTimeline";

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

export function useChatSession() {
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [bin, setBin] = useState("");
  const [status, setStatus] = useState<BridgeStatus>({ state: "idle" });
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [recentSessions, setRecentSessions] = useState<GrokSessionEntry[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tools, setTools] = useState<ToolRow[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
  const [processLine, setProcessLine] = useState<string | null>(null);
  const [subagents, setSubagents] = useState<SubagentRow[]>([]);
  const [subagentModel, setSubagentModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const liveAssistantId = useRef("a-live");
  const assistantBuf = useRef("");

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

  const refreshSessions = useCallback(async (cwd?: string) => {
    try {
      const list = await fetchRecentSessions({ cwd, limit: 20 });
      setRecentSessions(list);
    } catch {
      setRecentSessions([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
    void refreshSessions();
    const t = setInterval(() => void refresh(), 5000);
    return () => clearInterval(t);
  }, [refresh, refreshSessions]);

  useEffect(() => {
    const close = openSessionStream((event: ChatEvent) => {
      switch (event.type) {
        case "user":
          setMessages((m) => [
            ...m,
            { id: `u-${event.at}`, role: "user", text: event.text },
          ]);
          setTools([]);
          setSubagents([]);
          setSubagentModel(null);
          setProcessLine(null);
          setBusy(true);
          break;
        case "assistant_chunk":
          assistantBuf.current += event.text;
          setMessages((m) =>
            upsertAssistant(
              m,
              liveAssistantId.current,
              assistantBuf.current,
              true
            )
          );
          break;
        case "assistant_done":
          setMessages((m) =>
            m.map((msg) =>
              msg.role === "assistant" && msg.live
                ? { ...msg, live: false }
                : msg
            )
          );
          assistantBuf.current = "";
          liveAssistantId.current = `a-${Date.now()}`;
          setBusy(false);
          setStatusText(null);
          setProcessLine(null);
          setSubagentModel(null);
          break;
        case "status":
          setStatusText(event.text);
          break;
        case "activity":
          setProcessLine(event.text);
          if (event.agentKind === "subagent" && event.subagentModel?.trim()) {
            setSubagentModel(event.subagentModel.trim());
          } else if (!event.subagentModel) {
            /* keep last nested model until turn ends */
          }
          break;
        case "subagent":
          setSubagents((rows) => upsertSubagent(rows, event));
          if (event.model?.trim()) setSubagentModel(event.model.trim());
          if (event.activityLine?.trim()) setProcessLine(event.activityLine);
          if (
            event.status === "completed" ||
            event.status === "failed" ||
            event.status === "cancelled"
          ) {
            setSubagents((rows) =>
              rows.filter((r) => r.subagentId !== event.subagentId)
            );
          }
          break;
        case "tool":
          setTools((t) => upsertTool(t, event));
          if (event.status === "running") {
            setProcessLine(event.title);
          }
          break;
        case "error":
          setError(event.message);
          setBusy(false);
          setProcessLine(null);
          break;
        default:
          break;
      }
    });
    return close;
  }, []);

  const onConnect = async (sessionIdOverride?: string) => {
    setBusy(true);
    setError(null);
    setMessages([]);
    setTools([]);
    setSubagents([]);
    setSubagentModel(null);
    setProcessLine(null);
    assistantBuf.current = "";
    liveAssistantId.current = `a-${Date.now()}`;
    try {
      const sid =
        sessionIdOverride?.trim() ||
        sessionIdInput.trim() ||
        undefined;
      const result = await connectSession({ sessionId: sid });
      setSession(result.session);
      setSessionIdInput(result.session.sessionId);
      setStatus({ state: "connected", session: result.session });
      void refreshSessions(result.session.cwd);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onDisconnect = async () => {
    setBusy(true);
    try {
      await disconnectSession();
      setSession(null);
      setMessages([]);
      setTools([]);
      setProcessLine(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const onSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !session) return;
    setError(null);
    setBusy(true);
    setTools([]);
    setSubagents([]);
    setSubagentModel(null);
    setProcessLine(null);
    try {
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
    setSubagentModel(null);
  };

  const connected = status.state === "connected" && session;
  const liveTools = tools.filter((t) => t.status === "running");
  const settledTools = tools.filter((t) => t.status !== "running");

  return {
    bridgeUp,
    bin,
    status,
    session,
    recentSessions,
    sessionIdInput,
    setSessionIdInput,
    messages,
    tools,
    liveTools,
    settledTools,
    statusText,
    processLine,
    subagents,
    subagentModel,
    busy,
    error,
    connected,
    refresh,
    refreshSessions,
    onConnect,
    onDisconnect,
    onSend,
    onCancel,
  };
}
