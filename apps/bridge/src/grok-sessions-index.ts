import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type GrokSessionEntry = {
  sessionId: string;
  cwd: string;
  title: string;
  updatedAt: string;
  numMessages?: number;
};

const SESSIONS_ROOT = path.join(os.homedir(), ".grok", "sessions");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function decodeCwdDir(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

function titleFromChatHistory(sessionPath: string): string | null {
  const histPath = path.join(sessionPath, "chat_history.jsonl");
  if (!fs.existsSync(histPath)) return null;
  try {
    const raw = fs.readFileSync(histPath, "utf8");
    for (const line of raw.split("\n").slice(0, 40)) {
      if (!line.trim()) continue;
      const row = JSON.parse(line) as {
        type?: string;
        content?: unknown;
      };
      if (row.type !== "user") continue;
      const c = row.content;
      if (typeof c === "string" && c.trim()) {
        return c.trim().slice(0, 72);
      }
      if (Array.isArray(c)) {
        for (const block of c) {
          if (
            block &&
            typeof block === "object" &&
            (block as { type?: string }).type === "text"
          ) {
            const text = String((block as { text?: string }).text ?? "").trim();
            if (text && !text.startsWith("<system-reminder>")) {
              return text.slice(0, 72);
            }
          }
        }
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Best-effort scan of Core session dirs under ~/.grok/sessions. */
export function listRecentSessions(opts?: {
  cwd?: string;
  limit?: number;
}): GrokSessionEntry[] {
  const limit = opts?.limit ?? 30;
  const cwdFilter = opts?.cwd?.trim();
  const entries: GrokSessionEntry[] = [];

  if (!fs.existsSync(SESSIONS_ROOT)) return [];

  let cwdDirs: fs.Dirent[];
  try {
    cwdDirs = fs.readdirSync(SESSIONS_ROOT, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const cwdDir of cwdDirs) {
    if (!cwdDir.isDirectory()) continue;
    const cwd = decodeCwdDir(cwdDir.name);
    if (
      cwdFilter &&
      cwd !== cwdFilter &&
      !cwd.endsWith(cwdFilter.replace(/\/$/, ""))
    ) {
      continue;
    }

    const cwdPath = path.join(SESSIONS_ROOT, cwdDir.name);
    let sessionDirs: fs.Dirent[];
    try {
      sessionDirs = fs.readdirSync(cwdPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const sessionDir of sessionDirs) {
      if (!sessionDir.isDirectory()) continue;
      const sessionId = sessionDir.name;
      if (!UUID_RE.test(sessionId)) continue;

      const sessionPath = path.join(cwdPath, sessionId);
      let updatedAt = "";
      try {
        updatedAt = fs.statSync(sessionPath).mtime.toISOString();
      } catch {
        continue;
      }

      let title = sessionId.slice(0, 8) + "…";
      let numMessages = 0;
      const summaryPath = path.join(sessionPath, "summary.json");
      try {
        if (fs.existsSync(summaryPath)) {
          const summary = JSON.parse(
            fs.readFileSync(summaryPath, "utf8")
          ) as {
            updated_at?: string;
            session_summary?: string;
            num_chat_messages?: number;
            num_messages?: number;
          };
          updatedAt = summary.updated_at ?? updatedAt;
          numMessages =
            summary.num_chat_messages ?? summary.num_messages ?? 0;
          const sTitle = (summary.session_summary ?? "").trim();
          if (sTitle) title = sTitle.slice(0, 72);
        }
      } catch {
        /* ignore */
      }

      if (title.endsWith("…")) {
        const fromHist = titleFromChatHistory(sessionPath);
        if (fromHist) title = fromHist;
      }

      entries.push({ sessionId, cwd, title, updatedAt, numMessages });
    }
  }

  entries.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return entries.slice(0, limit);
}
