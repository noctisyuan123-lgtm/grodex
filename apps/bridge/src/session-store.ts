import type { AgentSessionInfo } from "./grodex-agent.js";
import { GrodexAgent } from "./grodex-agent.js";

export type BridgeStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "connected"; session: AgentSessionInfo }
  | { state: "error"; message: string };

let agent: GrodexAgent | null = null;
let status: BridgeStatus = { state: "idle" };

export function getStatus(): BridgeStatus {
  return status;
}

export async function connectSession(opts: {
  cwd: string;
  sessionId?: string;
}): Promise<AgentSessionInfo> {
  if (agent) {
    agent.stop();
    agent = null;
  }

  status = { state: "connecting" };
  const next = new GrodexAgent();

  try {
    const session = await next.connect(opts);
    agent = next;
    status = { state: "connected", session };
    return session;
  } catch (err) {
    next.stop();
    const message = err instanceof Error ? err.message : String(err);
    status = { state: "error", message };
    throw err;
  }
}

export function disconnectSession(): void {
  agent?.stop();
  agent = null;
  status = { state: "idle" };
}

export function isAgentAlive(): boolean {
  return agent?.isAlive() ?? false;
}
