import type { AgentSessionInfo } from "./grodex-agent.js";
import { GrodexAgent } from "./grodex-agent.js";
import { broadcastChatEvent } from "./event-hub.js";

export type BridgeStatus =
  | { state: "idle" }
  | { state: "connecting" }
  | { state: "connected"; session: AgentSessionInfo }
  | { state: "error"; message: string };

let agent: GrodexAgent | null = null;
let status: BridgeStatus = { state: "idle" };
let unsubEvents: (() => void) | null = null;

function wireAgentEvents(next: GrodexAgent): void {
  unsubEvents?.();
  unsubEvents = next.onEvent((event) => broadcastChatEvent(event));
}

export function getStatus(): BridgeStatus {
  return status;
}

export function getAgent(): GrodexAgent | null {
  return agent;
}

export async function connectSession(opts: {
  cwd: string;
  sessionId?: string;
}): Promise<AgentSessionInfo> {
  if (agent) {
    unsubEvents?.();
    unsubEvents = null;
    agent.stop();
    agent = null;
  }

  status = { state: "connecting" };
  const next = new GrodexAgent();
  wireAgentEvents(next);

  try {
    const session = await next.connect(opts);
    agent = next;
    status = { state: "connected", session };
    return session;
  } catch (err) {
    unsubEvents?.();
    unsubEvents = null;
    next.stop();
    const message = err instanceof Error ? err.message : String(err);
    status = { state: "error", message };
    throw err;
  }
}

export async function promptSession(text: string): Promise<void> {
  if (!agent) {
    throw new Error("No active session — connect first");
  }
  await agent.prompt(text);
}

export function cancelPrompt(): void {
  agent?.cancel();
}

export function disconnectSession(): void {
  unsubEvents?.();
  unsubEvents = null;
  agent?.stop();
  agent = null;
  status = { state: "idle" };
}

export function isAgentAlive(): boolean {
  return agent?.isAlive() ?? false;
}
