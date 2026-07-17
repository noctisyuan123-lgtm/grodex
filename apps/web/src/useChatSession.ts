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

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | { id: string; role: "assistant"; text: string; live?: boolean }
  | { id: string; role: "tool"; text: string };

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

export function useChatSession() {
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [bin, setBin] = useState("");
  const [status, setStatus] = useState<BridgeStatus>({ state: "idle" });
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [recentSessions, setRecentSessions] = useState<GrokSessionEntry[]>([]);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [statusText, setStatusText] = useState<string | null>(null);
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
          break;
        case "status":
          setStatusText(event.text);
          break;
        case "tool":
          if (event.phase === "start") {
            setMessages((m) => [
              ...m,
              {
                id: `tool-${event.toolId}`,
                role: "tool",
                text: event.title,
              },
            ]);
          }
          break;
        case "error":
          setError(event.message);
          setBusy(false);
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
  };

  const connected = status.state === "connected" && session;

  return {
    bridgeUp,
    bin,
    status,
    session,
    recentSessions,
    sessionIdInput,
    setSessionIdInput,
    messages,
    statusText,
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
