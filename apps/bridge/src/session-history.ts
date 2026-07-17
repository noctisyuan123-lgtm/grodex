import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ChatEvent } from "./chat-events.js";
import { nowIso } from "./chat-events.js";

const GROK_ROOT = path.join(os.homedir(), ".grok", "sessions");

function extractText(content: unknown): string {
  if (content == null) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((x) => {
        if (!x || typeof x !== "object") return "";
        const o = x as { type?: string; text?: string };
        if (o.type === "text" || o.type === "summary_text" || o.text != null) {
          return String(o.text ?? "");
        }
        return "";
      })
      .join("");
  }
  return String(content);
}

function isNoiseUser(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  if (t.startsWith("<local-command")) return true;
  if (t.startsWith("<command-name>") || t.startsWith("<command-message>")) {
    return true;
  }
  if (t.includes("<system-reminder>") && t.length < 200) return true;
  return false;
}

/** Locate ~/.grok/sessions/<encoded-cwd>/<uuid>/ for a Core session id. */
export function findGrokSessionDir(sessionId: string): string | null {
  if (!fs.existsSync(GROK_ROOT)) return null;
  for (const ent of fs.readdirSync(GROK_ROOT, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const cand = path.join(GROK_ROOT, ent.name, sessionId);
    if (fs.existsSync(path.join(cand, "chat_history.jsonl"))) return cand;
  }
  return null;
}

/**
 * Fallback hydrate: map Grok Core chat_history.jsonl → bridge ChatEvents.
 * User/assistant bubbles only (no tool timeline — ACP replay covers that when available).
 */
export function chatHistoryToEvents(sessionId: string): {
  events: ChatEvent[];
  userTurns: number;
} {
  const grokDir = findGrokSessionDir(sessionId);
  if (!grokDir) {
    throw new Error(`grok session not found: ${sessionId}`);
  }

  const histPath = path.join(grokDir, "chat_history.jsonl");
  const lines = fs.readFileSync(histPath, "utf8").split("\n").filter(Boolean);

  const events: ChatEvent[] = [];
  let userTurns = 0;
  let turn = 0;
  let assistantBuf = "";

  const flushAssistant = (): void => {
    const text = assistantBuf.trim();
    if (!text) return;
    events.push({
      type: "assistant_chunk",
      text,
      messageId: `a-hist-${turn}`,
      at: nowIso(),
    });
    events.push({ type: "assistant_done", at: nowIso() });
    assistantBuf = "";
  };

  for (const raw of lines) {
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }

    const typ = obj.type;
    if (typ === "system") continue;

    if (typ === "user") {
      const text = extractText(obj.content).trim();
      if (isNoiseUser(text)) continue;
      flushAssistant();
      userTurns += 1;
      turn += 1;
      events.push({
        type: "user",
        text,
        at: nowIso(),
      });
    } else if (typ === "assistant") {
      const text = extractText(obj.content).trim();
      if (text) assistantBuf += text;
    }
  }

  flushAssistant();

  return { events, userTurns };
}
