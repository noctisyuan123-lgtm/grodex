import { useCallback, useEffect, useState } from "react";
import {
  connectSession,
  disconnectSession,
  fetchHealth,
  fetchSessionStatus,
  type BridgeStatus,
  type SessionInfo,
} from "./api";

export function App() {
  const [bridgeUp, setBridgeUp] = useState<boolean | null>(null);
  const [bin, setBin] = useState("");
  const [status, setStatus] = useState<BridgeStatus>({ state: "idle" });
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [sessionIdInput, setSessionIdInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 3000);
    return () => clearInterval(t);
  }, [refresh]);

  const onConnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await connectSession({
        sessionId: sessionIdInput.trim() || undefined,
      });
      setSession(result.session);
      const next = await fetchSessionStatus();
      setStatus(next.status);
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
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const connected = status.state === "connected" && session;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">grodex</div>
        <div className={`pill ${connected ? "ok" : bridgeUp ? "warn" : "bad"}`}>
          {connected
            ? "Connected"
            : bridgeUp
              ? "Bridge up — no session"
              : "Bridge offline"}
        </div>
      </header>

      <main className="panel">
        <h1>Desktop skeleton (G2)</h1>
        <p className="lede">
          Proves one Core session over ACP stdio via the forked binary.
        </p>

        <dl className="facts">
          <div>
            <dt>Bridge</dt>
            <dd>{bridgeUp ? "reachable" : "unreachable"}</dd>
          </div>
          <div>
            <dt>Binary</dt>
            <dd className="mono">{bin || "—"}</dd>
          </div>
          <div>
            <dt>Attach mode</dt>
            <dd>{session?.attachMode ?? "—"}</dd>
          </div>
          <div>
            <dt>sessionId</dt>
            <dd className="mono">{session?.sessionId ?? "—"}</dd>
          </div>
        </dl>

        <label className="field">
          <span>Resume sessionId (optional — tries session/load)</span>
          <input
            value={sessionIdInput}
            onChange={(e) => setSessionIdInput(e.target.value)}
            placeholder="uuid from CLI / prior session"
            spellCheck={false}
          />
        </label>

        <div className="actions">
          <button type="button" onClick={() => void onConnect()} disabled={busy || !bridgeUp}>
            {busy ? "Connecting…" : "Connect Core session"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void onDisconnect()}
            disabled={busy || !connected}
          >
            Disconnect
          </button>
          <button type="button" className="ghost" onClick={() => void refresh()} disabled={busy}>
            Refresh
          </button>
        </div>

        {error ? <pre className="error">{error}</pre> : null}
      </main>
    </div>
  );
}
