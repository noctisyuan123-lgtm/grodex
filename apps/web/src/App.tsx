import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { AgentActivityStrip, RunningDock, WorkingPill } from "./AgentActivityStrip";
import { ChatTranscript } from "./ChatTranscript";
import { CustomizePanel } from "./CustomizePanel";
import { SearchModal, type SearchSelection } from "./SearchModal";
import {
  IconArrowUp,
  IconCheck,
  IconChevron,
  IconCustomize,
  IconFolder,
  IconFolderOpen,
  IconPaperPlane,
  IconRefresh,
  IconSearch,
  IconSidebar,
  IconStop,
} from "./icons";
import {
  effortLabelFor,
  getEffortFor,
} from "./modelEffort";
import {
  fetchRecentProjects,
  openLocalPath,
  pickFolder,
  setProjectCwd,
  type GrokSessionEntry,
  type ProjectEntry,
} from "./api";
import {
  collectActiveSubagentItems,
  collectNonSubagentDockItems,
  countActiveSubagents,
  deriveRunningDockOutline,
  hasNonSubagentDockProcess,
} from "./subagentProcess";
import { useChatSession } from "./useChatSession";

const SIDEBAR_W_KEY = "grodex-sidebar-w";
const SIDEBAR_COLLAPSED_KEY = "grodex-sidebar-collapsed";
const PLAN_SEED =
  "Plan a clean approach for the next change. List steps, risks, and files to touch before editing.";

const MODEL_OPTIONS = [
  { id: "grok-4.5", label: "Grok 4.5", supportsEffort: true },
  {
    id: "grok-composer-2.5-fast",
    label: "Composer 2.5",
    supportsEffort: true,
  },
] as const;

const EFFORT_OPTIONS = [
  { id: "low" as const, label: "Low" },
  { id: "medium" as const, label: "Medium" },
  { id: "high" as const, label: "High" },
];

function folderName(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || p || "Project";
}

function formatRelTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h`;
  return `${Math.floor(hr / 24)}d`;
}

type RepoGroup = {
  cwd: string;
  name: string;
  sessions: GrokSessionEntry[];
};

export function App() {
  const chat = useChatSession();
  const {
    bridgeUp,
    session,
    cwd,
    setCwd,
    agentMode,
    setAgentMode,
    historyOnly,
    recentSessions,
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
    newAgent,
    openHistorySession,
    refreshSessions,
    onConnect,
    onDisconnect,
    onSend,
    onCancel,
    model,
    setModel,
    effort,
    setEffort,
    effortFast,
    setEffortFast,
  } = chat;

  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [effortMenuOpen, setEffortMenuOpen] = useState(false);

  const [draft, setDraft] = useState("");
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [picking, setPicking] = useState(false);
  const [recentProjects, setRecentProjects] = useState<ProjectEntry[]>([]);
  const [expandedCwd, setExpandedCwd] = useState<Record<string, boolean>>({});
  const [sidebarSelectedId, setSidebarSelectedId] = useState<string | null>(
    null
  );
  const [toast, setToast] = useState<string | null>(null);
  const [sidebarW, setSidebarW] = useState(() => {
    const n = Number(localStorage.getItem(SIDEBAR_W_KEY) || "248");
    return Number.isFinite(n) ? Math.min(420, Math.max(180, n)) : 248;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1"
  );

  const sidebarDrag = useRef<{ startX: number; startW: number } | null>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const activeSessionId =
    sidebarSelectedId ?? session?.sessionId ?? chat.pendingHistory?.sessionId ?? null;

  const showHome =
    messages.length === 0 && !customizeOpen && (connected || ready);
  const showStop = messages.length > 0 && busy;
  const bridgeOnline = connected || bridgeUp === true;

  useEffect(() => {
    document.documentElement.style.setProperty("--sidebar-w", `${sidebarW}px`);
    localStorage.setItem(SIDEBAR_W_KEY, String(sidebarW));
  }, [sidebarW]);

  useEffect(() => {
    localStorage.setItem(
      SIDEBAR_COLLAPSED_KEY,
      sidebarCollapsed ? "1" : "0"
    );
  }, [sidebarCollapsed]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const d = sidebarDrag.current;
      if (!d) return;
      setSidebarW(Math.min(420, Math.max(180, d.startW + (e.clientX - d.startX))));
    };
    const onUp = () => {
      if (!sidebarDrag.current) return;
      sidebarDrag.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const loadRecentProjects = useCallback(async () => {
    const list = await fetchRecentProjects();
    setRecentProjects(list);
  }, []);

  useEffect(() => {
    void loadRecentProjects();
  }, [loadRecentProjects, cwd]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setCustomizeOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selectCwd = async (path: string, opts?: { expand?: boolean }) => {
    try {
      const saved = await setProjectCwd(path);
      setCwd(saved);
      void loadRecentProjects();
      void refreshSessions(saved);
      if (opts?.expand) setExpandedCwd({ [saved]: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onBrowse = async () => {
    setPicking(true);
    try {
      const path = await pickFolder();
      if (path) await selectCwd(path, { expand: true });
      else setToast("Folder picker cancelled");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPicking(false);
    }
  };

  const handleSearchSelect = (sel: SearchSelection) => {
    setCustomizeOpen(false);
    if (sel.kind === "agent") {
      setSidebarSelectedId(sel.item.sessionId);
      setExpandedCwd((m) => ({ ...m, [sel.item.cwd]: true }));
      void openHistorySession(sel.item.sessionId, sel.item.cwd);
      return;
    }
    if (sel.kind === "file") {
      void openLocalPath(sel.item.path).catch((e) =>
        setError(e instanceof Error ? e.message : String(e))
      );
      return;
    }
    switch (sel.item.action) {
      case "new-agent":
        void newAgent();
        break;
      case "open-project":
        void onBrowse();
        break;
      case "customize":
        setCustomizeOpen(true);
        break;
      case "connect":
        void onConnect();
        break;
      case "disconnect":
        void onDisconnect();
        break;
    }
  };

  const openHist = (sessionId: string, histCwd: string) => {
    setSidebarSelectedId(sessionId);
    setCustomizeOpen(false);
    setExpandedCwd((m) => ({ ...m, [histCwd]: true }));
    void openHistorySession(sessionId, histCwd);
  };

  const repoGroups = useMemo((): RepoGroup[] => {
    const byCwd = new Map<string, GrokSessionEntry[]>();
    for (const s of recentSessions) {
      const list = byCwd.get(s.cwd) ?? [];
      list.push(s);
      byCwd.set(s.cwd, list);
    }
    const histCwds = new Set(byCwd.keys());
    const extras = recentProjects
      .filter((r) => r.path && !histCwds.has(r.path))
      .slice(0, 12)
      .map((r) => ({
        cwd: r.path,
        name: r.name,
        sessions: [] as GrokSessionEntry[],
      }));
    return [
      ...[...byCwd.entries()].map(([path, sessions]) => ({
        cwd: path,
        name: folderName(path),
        sessions,
      })),
      ...extras,
    ];
  }, [recentProjects, recentSessions]);

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

  const modelMeta =
    MODEL_OPTIONS.find((m) => m.id === model) ?? MODEL_OPTIONS[0];
  const effortLabel = effortLabelFor({ effort, fast: effortFast });
  const modelChipLabel = `${modelMeta.label} ${effortLabel}`;

  useEffect(() => {
    if (!modelMenuOpen && !effortMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest(".model-picker")) return;
      setModelMenuOpen(false);
      setEffortMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEffortMenuOpen(false);
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [modelMenuOpen, effortMenuOpen]);

  const pickModel = (id: string) => {
    setModel(id);
  };

  const toggleEffortFast = () => {
    setEffortFast(!effortFast);
  };

  const openModelEffortEdit = (e: ReactMouseEvent, modelId: string) => {
    e.preventDefault();
    e.stopPropagation();
    pickModel(modelId);
    setModelMenuOpen(true);
    setEffortMenuOpen(true);
  };

  const pickEffort = (id: "low" | "medium" | "high") => {
    setEffort(id);
  };

  const submit = () => {
    if (showStop) {
      void onCancel();
      return;
    }
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    void onSend(text);
  };

  const onComposerKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ime =
      e.nativeEvent.isComposing ||
      (e.nativeEvent as KeyboardEvent).keyCode === 229;
    if (e.key === "Enter" && !e.shiftKey && !ime) {
      e.preventDefault();
      submit();
    }
  };

  const composerShell = (
    <div
      className={`composer-shell ${showHome ? "hero" : "followup"} crowded`}
    >
      <div className="composer-main-row crowded">
        <div className="composer-ta-wrap">
          <textarea
            ref={taRef}
            className="composer-ta"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              showHome
                ? "Plan, Build, / for commands — drop files here"
                : connected
                  ? "Send follow-up"
                  : historyOnly
                    ? "Send to resume this chat"
                    : "Connect or pick a project to start"
            }
            disabled={!ready && !connected}
            rows={showHome ? 2 : 1}
            onKeyDown={onComposerKeyDown}
          />
        </div>
        <div
          className={`model-picker ${modelMenuOpen ? "open" : ""} ${
            showHome ? "dock-left" : "dock-right"
          }`}
        >
          <button
            type="button"
            className="model-chip-btn"
            title="Model & effort for the next New Agent / reconnect"
            onClick={() => {
              setModelMenuOpen((v) => {
                const next = !v;
                if (!next) setEffortMenuOpen(false);
                return next;
              });
            }}
          >
            <span className="model-chip-label">{modelChipLabel}</span>
            <IconChevron size={12} className="model-chip-chevron" />
          </button>
          {(effortMenuOpen || modelMenuOpen) && (
            <div className="model-menu" role="listbox">
              {modelMenuOpen && (
                <div className="model-menu-list">
                  {MODEL_OPTIONS.map((m) => {
                    const selected = model === m.id;
                    const rowLabel = selected
                      ? effortLabel
                      : effortLabelFor(getEffortFor(m.id));
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={`model-menu-item ${selected ? "selected" : ""}`}
                        onClick={() => pickModel(m.id)}
                      >
                        <span className="model-menu-name">{m.label}</span>
                        <span className="model-menu-effort">{rowLabel}</span>
                        <span
                          className={`model-menu-check-slot ${
                            selected ? "on" : ""
                          }`}
                          aria-hidden={!selected}
                        >
                          {selected ? (
                            <IconCheck size={14} className="model-menu-check" />
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="effort-edit-btn"
                          title="Edit effort for this model"
                          onClick={(e) => openModelEffortEdit(e, m.id)}
                        >
                          Edit
                        </button>
                      </button>
                    );
                  })}
                </div>
              )}
              {effortMenuOpen && (
                <div className="effort-menu" role="menu">
                  <div className="effort-menu-title">Effort</div>
                  {EFFORT_OPTIONS.map((e) => {
                    const selected = !effortFast && effort === e.id;
                    return (
                      <button
                        key={e.id}
                        type="button"
                        role="menuitemradio"
                        aria-checked={selected}
                        className={`effort-menu-item ${
                          selected ? "selected" : ""
                        }`}
                        onClick={() => pickEffort(e.id)}
                      >
                        <span>{e.label}</span>
                        {selected ? <IconCheck size={14} /> : null}
                      </button>
                    );
                  })}
                  <div className="effort-menu-sep" />
                  <div className="effort-menu-title">Options</div>
                  <label className="effort-fast-row">
                    <span>Fast</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={effortFast}
                      className={`toggle-switch ${effortFast ? "on" : ""}`}
                      onClick={toggleEffortFast}
                    >
                      <i />
                    </button>
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`send-btn ${showStop ? "stop" : ""}`}
          onClick={submit}
          disabled={!showStop && !draft.trim() && !connected && !historyOnly}
          title={showStop ? "Stop" : "Send"}
        >
          {showStop ? <IconStop size={13} /> : <IconArrowUp size={15} />}
        </button>
      </div>
      {!showHome ? (
        <div className="composer-meta-row">
          <span className="composer-hint">
            {historyOnly
              ? "Idle · send continues this chat"
              : "Enter send · Shift+Enter newline"}
          </span>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className={`shell${customizeOpen ? " customize-mode" : ""}${
        sidebarCollapsed ? " sidebar-collapsed" : ""
      }`}
    >
      <div className="title-chrome">
        <button
          type="button"
          className="sidebar-toggle"
          title={sidebarCollapsed ? "Show sidebar" : "Collapse sidebar"}
          aria-label={sidebarCollapsed ? "Show sidebar" : "Collapse sidebar"}
          aria-pressed={!sidebarCollapsed}
          onClick={() => setSidebarCollapsed((v) => !v)}
        >
          <IconSidebar size={16} />
        </button>
      </div>

      <div
        className={`sidebar-rail${sidebarCollapsed ? " collapsed" : ""}`}
        aria-hidden={sidebarCollapsed}
      >
        <aside className="sidebar" style={{ width: sidebarW }}>
          <button
            type="button"
            className="side-btn primary"
            onClick={() => {
              setCustomizeOpen(false);
              void newAgent();
            }}
            disabled={busy}
          >
            <IconPaperPlane className="ico" />
            New Agent
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={() => void onBrowse()}
            disabled={picking}
          >
            <IconFolder className="ico" />
            {picking ? "Opening…" : "Open project…"}
          </button>
          <button
            type="button"
            className="side-btn"
            onClick={() => {
              setCustomizeOpen(false);
              setSearchOpen(true);
            }}
            title="Search (⌘K)"
          >
            <IconSearch className="ico" />
            Search
          </button>
          <button
            type="button"
            className={`side-btn ${customizeOpen ? "primary" : ""}`}
            onClick={() => setCustomizeOpen((v) => !v)}
          >
            <IconCustomize className="ico" />
            Customize
          </button>

          <div className="side-list">
            <div className="side-section">
              <span>Repositories</span>
              <button
                type="button"
                className="icon-mini"
                title="Refresh"
                onClick={() => {
                  void refreshSessions(cwd || undefined);
                  void loadRecentProjects();
                }}
              >
                <IconRefresh size={13} />
              </button>
            </div>

            {repoGroups.length === 0 ? (
              <div className="side-empty">Open a project to start</div>
            ) : (
              repoGroups.map((g) => {
                const open =
                  expandedCwd[g.cwd] !== undefined
                    ? expandedCwd[g.cwd]
                    : g.cwd === cwd;
                const isCurrent = cwd === g.cwd;
                return (
                  <div key={g.cwd} className="hist-group">
                    <button
                      type="button"
                      className={`side-item folder ${isCurrent ? "active" : ""} ${
                        open ? "expanded" : ""
                      }`}
                      onClick={() => {
                        setExpandedCwd((m) =>
                          open ? { ...m, [g.cwd]: false } : { [g.cwd]: true }
                        );
                        if (g.cwd !== cwd) void selectCwd(g.cwd, { expand: true });
                      }}
                      title={g.cwd}
                    >
                      {open ? (
                        <IconFolderOpen size={15} className="ico-folder" />
                      ) : (
                        <IconFolder size={15} className="ico-folder" />
                      )}
                      <span className="name">{g.name}</span>
                    </button>
                    {open
                      ? g.sessions.map((s) => (
                          <div
                            key={s.sessionId}
                            className={`side-item session row nested ${
                              activeSessionId === s.sessionId ? "active" : ""
                            }`}
                          >
                            <button
                              type="button"
                              className="session-main"
                              onClick={() => openHist(s.sessionId, s.cwd)}
                              title={s.sessionId}
                            >
                              <span className="name">{s.title}</span>
                              <span className="meta">
                                {formatRelTime(s.updatedAt)}
                              </span>
                            </button>
                          </div>
                        ))
                      : null}
                  </div>
                );
              })
            )}
          </div>

          <div className="side-foot">
            <div className={`status-pill ${bridgeOnline ? "ok" : ""}`}>
              <span className="dot" />
              {bridgeOnline ? "Bridge · grodex" : "Bridge offline"}
            </div>
          </div>

          <div
            className="sidebar-resizer"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            onMouseDown={(e) => {
              e.preventDefault();
              sidebarDrag.current = { startX: e.clientX, startW: sidebarW };
              document.body.style.cursor = "col-resize";
              document.body.style.userSelect = "none";
            }}
          />
        </aside>
      </div>

      <section className="stage">
        {toast ? <div className="status-banner">{toast}</div> : null}
        {error ? (
          <div className="error-banner" onClick={() => setError(null)}>
            {error}
          </div>
        ) : null}

        {customizeOpen ? (
          <CustomizePanel
            connected={Boolean(connected)}
            bridgeLabel="grodex"
            cwd={cwd}
            model={modelMeta.label}
            effortLabel={effortLabel}
            agentMode={agentMode}
            onClose={() => setCustomizeOpen(false)}
          />
        ) : showHome ? (
          <div className="home">
            <div className="home-stack">
              <button
                type="button"
                className="home-label"
                title={cwd || "Open a project folder"}
                onClick={() => void onBrowse()}
              >
                <span className="home-label-name">
                  {cwd ? folderName(cwd) : "Select project"}
                </span>
                <span className="home-label-chev" aria-hidden>
                  ▾
                </span>
              </button>
              {composerShell}
              <div className="pills">
                <button
                  type="button"
                  className={`pill ${agentMode === "plan" ? "active" : ""}`}
                  onClick={() => {
                    if (!cwd.trim()) {
                      setToast("Pick a project folder first");
                      return;
                    }
                    setAgentMode("plan");
                    setDraft((prev) => (prev.trim() ? prev : PLAN_SEED));
                    requestAnimationFrame(() => taRef.current?.focus());
                  }}
                >
                  Plan
                </button>
                <button
                  type="button"
                  className="pill"
                  onClick={() => {
                    if (!cwd.trim()) {
                      setToast("Pick a project folder first");
                      return;
                    }
                    setDraft("");
                    void newAgent();
                    requestAnimationFrame(() => taRef.current?.focus());
                  }}
                >
                  Multitask
                </button>
              </div>
            </div>
          </div>
        ) : (
          <>
            <header className="stage-header">
              <div className="stage-header-main">
                <h1 className="stage-title">
                  {recentSessions.find((s) => s.sessionId === activeSessionId)
                    ?.title ??
                    (activeSessionId
                      ? `${activeSessionId.slice(0, 8)}…`
                      : "grodex")}
                </h1>
                <span
                  className={`stage-status ${connected ? "ok" : bridgeOnline ? "warn" : "bad"}`}
                >
                  {connected
                    ? "Connected"
                    : historyOnly
                      ? "History"
                      : bridgeOnline
                        ? "Ready"
                        : "Offline"}
                </span>
              </div>
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
                  <WorkingPill
                    count={activeSubagentCount}
                    runningItems={workingItems}
                  />
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
                {composerShell}
              </div>
            </div>
          </>
        )}
      </section>

      <SearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={handleSearchSelect}
      />
    </div>
  );
}
