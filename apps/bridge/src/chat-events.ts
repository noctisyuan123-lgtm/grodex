/** Minimal chat events streamed to the web client (G3 / G3b). */
export type ChatEvent =
  | { type: "user"; text: string; at: string }
  | { type: "assistant_chunk"; text: string; at: string }
  | { type: "assistant_done"; at: string }
  | { type: "status"; text: string | null; at: string }
  | {
      type: "tool";
      toolId: string;
      title: string;
      /** G3b: explicit lifecycle status */
      status: "running" | "completed" | "failed";
      kind?: string;
      /** @deprecated use status — kept for G3 clients */
      phase?: "start" | "end";
      at: string;
    }
  | {
      type: "activity";
      /** Live process outline (tool name, thinking, etc.) */
      text: string;
      kind?: "thinking" | "tool" | "status";
      /** When the line comes from a nested subagent session */
      agentKind?: "main" | "subagent";
      /** Effective model slug for nested work (WorkingPill / task cards) */
      subagentModel?: string;
      at: string;
    }
  | {
      type: "subagent";
      /** Same as Core `subagent_id` / child session id */
      subagentId: string;
      childSessionId?: string;
      status: "spawned" | "running" | "completed" | "failed" | "cancelled";
      /** Short task description from Core */
      title: string;
      subagentType?: string;
      model?: string;
      /** Progress / live outline (may be empty until Core emits progress) */
      activityLine?: string;
      at: string;
    }
  | { type: "error"; message: string; at: string };

export function nowIso(): string {
  return new Date().toISOString();
}
