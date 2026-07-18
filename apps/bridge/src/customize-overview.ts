import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  listCustomizeFiles,
  loadCustomizeMcp,
  type GrokMcpServer,
} from "./customize-config.js";
import { listSkills, type SkillEntry } from "./skills.js";
import { getStatus } from "./session-store.js";
import { resolveGrodexBin } from "./resolve-bin.js";
import { getRememberedCwd } from "./recent-paths.js";

const GROK_DIR = path.join(os.homedir(), ".grok");
const MEMORY_INDEX = path.join(GROK_DIR, "memory", "MEMORY.md");
const MEMORY_STICKY = path.join(GROK_DIR, "rules", "00-automemory-sticky.md");
const MEMORY_ENTRIES = path.join(GROK_DIR, "memory", "entries");
const RULES_DIR = path.join(GROK_DIR, "rules");

export type CustomizeOverview = {
  memory: {
    index: string;
    sticky: string;
    entriesDir: string;
    indexExists: boolean;
    stickyExists: boolean;
    entriesExists: boolean;
  };
  rules: Array<{ name: string; path: string }>;
  ruleFiles: Array<{
    id: string;
    name: string;
    path: string;
    content: string;
  }>;
  skills: SkillEntry[];
  bridge: {
    connected: boolean;
    bin: string;
    sessionId: string | null;
    cwd: string;
    status: string;
  };
  mcp: {
    configPath: string;
    servers: GrokMcpServer[];
  };
};

export function buildCustomizeOverview(cwd?: string): CustomizeOverview {
  const status = getStatus();
  const files = listCustomizeFiles();
  const rules = files
    .filter((f) => f.kind === "rule")
    .map((f) => ({ name: f.name, path: f.path }));
  const mcp = loadCustomizeMcp();

  let sessionId: string | null = null;
  let bridgeCwd = cwd?.trim() || getRememberedCwd();
  if (status.state === "connected") {
    sessionId = status.session.sessionId;
    bridgeCwd = status.session.cwd || bridgeCwd;
  }

  return {
    memory: {
      index: MEMORY_INDEX,
      sticky: MEMORY_STICKY,
      entriesDir: MEMORY_ENTRIES,
      indexExists: fs.existsSync(MEMORY_INDEX),
      stickyExists: fs.existsSync(MEMORY_STICKY),
      entriesExists: fs.existsSync(MEMORY_ENTRIES),
    },
    rules,
    ruleFiles: files
      .filter((f) => f.kind === "rule")
      .map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        content: f.content.slice(0, 8000),
      })),
    skills: listSkills(cwd || bridgeCwd || undefined),
    bridge: {
      connected: status.state === "connected",
      bin: resolveGrodexBin(),
      sessionId,
      cwd: bridgeCwd,
      status: status.state,
    },
    mcp: {
      configPath: mcp.grokConfigPath,
      servers: mcp.grok,
    },
  };
}

export function rulesDir(): string {
  return RULES_DIR;
}
