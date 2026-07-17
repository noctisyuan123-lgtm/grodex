import { useState } from "react";
import { ChatTranscript } from "./ChatTranscript";
import { useChatSession } from "./useChatSession";

export function App() {
  const {
    bridgeUp,
    bin,
    session,
    recentSessions,
    sessionIdInput,
    setSessionIdInput,
    messages,
    statusText,
    busy,
    error,
    connected,
    onConnect,
    onDisconnect,
    onSend,
    onCancel,
    refresh,
  } = useChatSession();

  const [draft, setDraft] = useState("");

  const submit = () => {
    const text = draft;
    setDraft("");
    void onSend(text);
  };

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">grodex</div>
        <div className={`pill ${connected ? "ok" : bridgeUp ? "warn" : "bad"}`}>
          {connected
            ? "Connected"
            : bridgeUp
              ? "Bridge up"
              : "Bridge offline"}
        </div>
      </header>

      <div className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <h2>Session</h2>
            <button type="button" className="ghost sm" onClick={() => void refresh()}>
              ↻
            </button>
          </div>

          <label className="field compact">
            <span>Resume by id</span>
            <input
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              placeholder="Core session UUID"
              spellCheck={false}
            />
          </label>

          <div className="actions stack">
            <button
              type="button"
              onClick={() => void onConnect()}
              disabled={busy || !bridgeUp}
            >
              {busy && !connected ? "Connecting…" : "Connect"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => void onDisconnect()}
              disabled={busy || !connected}
            >
              Disconnect
            </button>
          </div>

          {session ? (
            <dl className="facts compact">
              <div>
                <dt>sessionId</dt>
                <dd className="mono">{session.sessionId}</dd>
              </div>
              <div>
                <dt>attach</dt>
                <dd>{session.attachMode}</dd>
              </div>
              <div>
                <dt>bin</dt>
                <dd className="mono small">{bin || session.bin}</dd>
              </div>
            </dl>
          ) : null}

          <div className="sidebar-head">
            <h2>Recent</h2>
          </div>
          <ul className="session-list">
            {recentSessions.length === 0 ? (
              <li className="muted">No sessions under ~/.grok/sessions</li>
            ) : (
              recentSessions.map((s) => (
                <li key={s.sessionId}>
                  <button
                    type="button"
                    className="session-item"
                    onClick={() => {
                      setSessionIdInput(s.sessionId);
                      void onConnect(s.sessionId);
                    }}
                    title={s.sessionId}
                  >
                    <span className="session-title">{s.title}</span>
                    <span className="session-meta mono">
                      {s.sessionId.slice(0, 8)}… · {s.numMessages ?? 0} msgs
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <main className="chat-main">
          <ChatTranscript messages={messages} statusText={statusText} />

          <div className="composer">
            <textarea
              className="composer-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                connected
                  ? "Message Core… (Enter to send, Shift+Enter for newline)"
                  : "Connect a session first"
              }
              disabled={!connected || busy}
              rows={3}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (connected && draft.trim()) submit();
                }
              }}
            />
            <div className="composer-actions">
              {busy ? (
                <button type="button" className="ghost" onClick={() => void onCancel()}>
                  Stop
                </button>
              ) : null}
              <button
                type="button"
                onClick={submit}
                disabled={!connected || busy || !draft.trim()}
              >
                Send
              </button>
            </div>
          </div>

          {error ? <pre className="error">{error}</pre> : null}
        </main>
      </div>
    </div>
  );
}
