/** Minimal chat events streamed to the web client (G3). */
export type ChatEvent =
  | { type: "user"; text: string; at: string }
  | { type: "assistant_chunk"; text: string; at: string }
  | { type: "assistant_done"; at: string }
  | { type: "status"; text: string | null; at: string }
  | { type: "tool"; toolId: string; title: string; phase: "start" | "end"; at: string }
  | { type: "error"; message: string; at: string };

export function nowIso(): string {
  return new Date().toISOString();
}
