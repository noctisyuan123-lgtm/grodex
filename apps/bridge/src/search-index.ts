import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { listRecentSessions } from "./grok-sessions-index.js";
import { getRememberedCwd, loadRecent } from "./recent-paths.js";

export type SearchAgentHit = {
  id: string;
  kind: "agent";
  sessionId: string;
  title: string;
  cwd: string;
  repo: string;
  updatedAt: string;
};

export type SearchFileHit = {
  id: string;
  kind: "file";
  name: string;
  path: string;
};

export type SearchActionHit = {
  id: string;
  kind: "action";
  label: string;
  action: "new-agent" | "open-project" | "customize" | "connect" | "disconnect";
};

const ACTIONS: SearchActionHit[] = [
  {
    id: "action:new-agent",
    kind: "action",
    label: "New Agent",
    action: "new-agent",
  },
  {
    id: "action:open-project",
    kind: "action",
    label: "Open project…",
    action: "open-project",
  },
  {
    id: "action:customize",
    kind: "action",
    label: "Customize",
    action: "customize",
  },
  {
    id: "action:connect",
    kind: "action",
    label: "Connect",
    action: "connect",
  },
  {
    id: "action:disconnect",
    kind: "action",
    label: "Disconnect",
    action: "disconnect",
  },
];

function matchesQuery(text: string, q: string): boolean {
  if (!q) return true;
  return text.toLowerCase().includes(q.toLowerCase());
}

function folderName(p: string): string {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || p || "Project";
}

function collectRecentFiles(): SearchFileHit[] {
  const out: SearchFileHit[] = [];
  const seen = new Set<string>();

  const add = (p: string) => {
    const abs = path.resolve(p);
    if (seen.has(abs)) return;
    try {
      if (!fs.existsSync(abs)) return;
      const st = fs.statSync(abs);
      if (!st.isFile()) return;
      seen.add(abs);
      out.push({
        id: `file:${abs}`,
        kind: "file",
        name: path.basename(abs),
        path: abs,
      });
    } catch {
      /* skip */
    }
  };

  const memoryRoot = path.join(os.homedir(), ".grok", "memory");
  add(path.join(memoryRoot, "MEMORY.md"));
  const entriesDir = path.join(memoryRoot, "entries");
  if (fs.existsSync(entriesDir)) {
    try {
      for (const name of fs.readdirSync(entriesDir)) {
        if (name.endsWith(".md")) add(path.join(entriesDir, name));
      }
    } catch {
      /* skip */
    }
  }

  const scanRoots = [
    getRememberedCwd(),
    ...loadRecent().map((r) => r.path),
  ].filter(Boolean);

  for (const dir of scanRoots) {
    if (!dir || !fs.existsSync(dir)) continue;
    try {
      const names = fs.readdirSync(dir);
      for (const name of names.slice(0, 40)) {
        if (name.startsWith(".") || name === "node_modules") continue;
        add(path.join(dir, name));
      }
    } catch {
      /* skip */
    }
  }

  return out;
}

export function searchAll(q: string): {
  agents: SearchAgentHit[];
  files: SearchFileHit[];
  actions: SearchActionHit[];
} {
  const query = q.trim();

  const agents = listRecentSessions({ limit: 40 })
    .filter((s) => matchesQuery(`${s.title} ${s.cwd} ${s.sessionId}`, query))
    .map((s) => ({
      id: `agent:${s.sessionId}`,
      kind: "agent" as const,
      sessionId: s.sessionId,
      title: s.title,
      cwd: s.cwd,
      repo: folderName(s.cwd),
      updatedAt: s.updatedAt,
    }));

  const files = collectRecentFiles()
    .filter((f) => matchesQuery(`${f.name} ${f.path}`, query))
    .slice(0, 40);

  const actions = ACTIONS.filter((a) => matchesQuery(a.label, query));

  return { agents, files, actions };
}
