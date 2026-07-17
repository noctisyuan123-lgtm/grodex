const DEFAULT_BRIDGE =
  import.meta.env.VITE_GRODEX_BRIDGE_URL ?? "http://127.0.0.1:8790";

export type SessionAttachMode = "load" | "new";

export type SessionInfo = {
  sessionId: string;
  attachMode: SessionAttachMode;
  cwd: string;
  bin: string;
};

export type BridgeStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "connected"; session: SessionInfo }
  | { state: "error"; message: string };

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

export async function disconnectSession(): Promise<void> {
  await fetch(`${DEFAULT_BRIDGE}/api/session/disconnect`, { method: "POST" });
}
