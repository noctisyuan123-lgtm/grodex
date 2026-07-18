import { useState } from "react";
import { AgentActivityStrip, RunningDock, WorkingPill } from "./AgentActivityStrip";
import { ChatTranscript } from "./ChatTranscript";
import {
  collectActiveSubagentItems,
  collectNonSubagentDockItems,
  countActiveSubagents,
  deriveRunningDockOutline,
  hasNonSubagentDockProcess,
} from "./subagentProcess";
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
    connected,
    onConnect,
    onDisconnect,
    onSend,
    onCancel,
    refresh,
  } = useChatSession();

  const [draft, setDraft] = useState("");

  const activeSessionId = session?.sessionId ?? null;

  const activeSubagentCount = countActiveSubagents(
    tools,
    subagents,
    subagentModel
  );
  const workingItems = collectActiveSubagentItems(
    tools,
    subagents,
    subagentModel,
    statusText
  );
  const showWorkingPill = activeSubagentCount > 0;
  const showRunningDock = hasNonSubagentDockProcess(
    tools,
    activityPhase,
    statusText,
    permissionPending
  );
  const dockOutline = deriveRunningDockOutline(
    tools,
    activityPhase,
    processLine,
    statusText,
    permissionPending
  );
  const dockItems = collectNonSubagentDockItems(
    tools,
    activityPhase,
    processLine,
    statusText,
    permissionPending
  );
  const dockDetail =
    activityPhase === "sleeping" && processLine?.trim() ? processLine.trim() : null;

  const submit = () => {
    const text = draft;
    setDraft("");
    void onSend(text);
  };

  const connectionLabel = connected
    ? "Connected"
    : bridgeUp
      ? "Bridge up"
      : "Bridge offline";

  const stageTitle =
    recentSessions.find((s) => s.sessionId === activeSessionId)?.title ??
    (activeSessionId ? `${activeSessionId.slice(0, 8)}…` : "Select or connect a session");

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="brand">grodex</span>
          <span
            className={`status-dot ${connected ? "ok" : bridgeUp ? "warn" : "bad"}`}
            title={connectionLabel}
          />
        </div>

        <div className="sidebar-actions">
          <button
            type="button"
            className="side-btn primary"
            onClick={() => void onConnect()}
            disabled={busy || !bridgeUp}
          >
            {busy && !connected ? "Connecting…" : "Connect"}
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={() => {
              setSessionIdInput("");
              void onDisconnect();
            }}
            disabled={busy}
          >
            New session
          </button>
        </div>

        <details className="resume-details">
          <summary>Resume by id</summary>
          <label className="field compact">
            <input
              value={sessionIdInput}
              onChange={(e) => setSessionIdInput(e.target.value)}
              placeholder="Core session UUID"
              spellCheck={false}
            />
          </label>
        </details>

        {session ? (
          <div className="session-current mono" title={session.sessionId}>
            {session.sessionId.slice(0, 8)}… · {session.attachMode}
          </div>
        ) : null}

        <div className="side-section">
          <span>Recent</span>
          <button
            type="button"
            className="icon-mini"
            onClick={() => void refresh()}
            title="Refresh bridge"
          >
            ↻
          </button>
        </div>

        <ul className="side-list">
          {recentSessions.length === 0 ? (
            <li className="side-empty">No sessions under ~/.grok/sessions</li>
          ) : (
            recentSessions.map((s) => {
              const active = activeSessionId === s.sessionId;
              return (
                <li
                  key={s.sessionId}
                  className={`side-item session row${active ? " active" : ""}`}
                >
                  <button
                    type="button"
                    className="session-main"
                    onClick={() => {
                      setSessionIdInput(s.sessionId);
                      void onConnect(s.sessionId);
                    }}
                    title={s.sessionId}
                  >
                    <span className="name">{s.title}</span>
                    <span className="meta mono">
                      {s.sessionId.slice(0, 8)}… · {s.numMessages ?? 0}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>

        {bin ? (
          <div className="sidebar-foot mono" title={bin}>
            {bin.split("/").pop()}
          </div>
        ) : null}
      </aside>

      <section className="stage">
        <header className="stage-header">
          <div className="stage-header-main">
            <h1 className="stage-title">{stageTitle}</h1>
            <span className={`stage-status ${connected ? "ok" : bridgeUp ? "warn" : "bad"}`}>
              {connectionLabel}
            </span>
          </div>
          {connected ? (
            <button
              type="button"
              className="ghost-btn compact"
              onClick={() => void onDisconnect()}
              disabled={busy}
            >
              Disconnect
            </button>
          ) : null}
        </header>

        <div className="stage-main">
          <ChatTranscript
            messages={messages}
            tools={tools}
            liveTools={liveTools}
            settledTools={settledTools}
            subagents={subagents}
            subagentModel={subagentModel}
            statusText={statusText}
            processLine={processLine}
            busy={busy}
          />
        </div>

        <div className="composer-dock">
          <div className="composer-dock-inner">
            {showWorkingPill ? (
              <WorkingPill count={activeSubagentCount} runningItems={workingItems} />
            ) : null}

            {showRunningDock ? (
              <RunningDock
                outline={dockOutline}
                detail={dockDetail}
                runningItems={dockItems}
              />
            ) : null}

            <AgentActivityStrip
              status={statusText}
              processLine={showRunningDock ? null : processLine}
              busy={busy}
            />

            <div className="composer-shell followup">
              <textarea
                className="composer-ta"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  connected
                    ? "Message Core…"
                    : "Connect a session to start chatting"
                }
                disabled={!connected || busy}
                rows={2}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (connected && draft.trim()) submit();
                  }
                }}
              />
              <div className="composer-meta-row">
                <span className="composer-hint">Enter send · Shift+Enter newline</span>
                <div className="composer-actions">
                  {busy ? (
                    <button
                      type="button"
                      className="ghost-btn compact stop"
                      onClick={() => void onCancel()}
                    >
                      Stop
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="send-btn primary"
                    onClick={submit}
                    disabled={!connected || busy || !draft.trim()}
                  >
                    Send
                  </button>
                </div>
              </div>
            </div>

            {error ? <pre className="error">{error}</pre> : null}
          </div>
        </div>
      </section>
    </div>
  );
}
