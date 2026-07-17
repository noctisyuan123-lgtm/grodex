/** Subagent spawn detection + live activity derivation (Cursor-aligned). */

import type { RunningProcessItem } from "./AgentActivityStrip";
import type { SubagentRow } from "./useChatSession";
import type { ToolRow } from "./ToolTimeline";

const MODEL_LABELS: Record<string, string> = {
  "grok-4.5": "Grok 4.5",
  "grok-composer-2.5-fast": "Composer 2.5",
  "composer-2.5": "Composer 2.5",
  "composer-2.5-fast": "Composer 2.5 Fast",
  "claude-4.6-opus-medium-thinking": "Opus 4.6",
  "claude-4.6-sonnet-low-thinking": "Sonnet 4.6",
  "gpt-5.6-sol-medium": "GPT 5.6",
};

function truncateOneLine(text: string, max = 72): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

/** Human-readable model chip (e.g. grok-4.5 → Grok 4.5). */
export function formatModelLabel(modelId: string | null | undefined): string {
  const raw = (modelId || "").trim();
  if (!raw) return "";
  const known = MODEL_LABELS[raw];
  if (known) return known;
  const slug = raw
    .replace(/^grok-/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return slug || raw;
}

/** Subagent / task spawn tool — NOT ordinary execute. */
export function isSubagentSpawnTool(t: {
  kind?: string;
  name?: string;
  label?: string;
}): boolean {
  const kind = (t.kind || "").toLowerCase();
  if (kind === "sleeping" || kind === "execute") return false;
  const blob = `${t.name || ""} ${t.label || ""} ${t.kind || ""}`;
  return /subagent|spawn_subagent|Task\b|task_tool|dispatch|^task$/i.test(blob);
}

function runningSpawnTools(tools: ToolRow[]) {
  const out: Array<{ toolId: string; label: string; name: string }> = [];
  const seen = new Set<string>();
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i]!;
    if (t.status !== "running" || !isSubagentSpawnTool(t)) continue;
    if (seen.has(t.toolId)) continue;
    seen.add(t.toolId);
    out.push({
      toolId: t.toolId,
      label: (t.label || t.name || "Subagent").replace(/^Ran\s+/i, "").trim(),
      name: t.name || t.kind || "",
    });
  }
  return out;
}

/** Active nested subagents — SSE rows + running spawn tools. */
export function countActiveSubagents(
  tools: ToolRow[],
  subagents: SubagentRow[],
  subagentModel: string | null | undefined
): number {
  const live = subagents.filter((s) =>
    s.status === "spawned" || s.status === "running"
  );
  if (live.length > 0) return live.length;
  const spawns = runningSpawnTools(tools);
  if (subagentModel?.trim()) return Math.max(1, spawns.length);
  return spawns.length;
}

export function collectActiveSubagentItems(
  tools: ToolRow[],
  subagents: SubagentRow[],
  subagentModel: string | null | undefined,
  statusMsg: string | null
): RunningProcessItem[] {
  const items: RunningProcessItem[] = [];
  const seen = new Set<string>();

  for (const s of subagents) {
    if (s.status !== "spawned" && s.status !== "running") continue;
    if (seen.has(s.subagentId)) continue;
    seen.add(s.subagentId);
    items.push({
      id: s.subagentId,
      kind: "subagent",
      label: truncateOneLine(s.title || s.subagentType || "Subagent"),
      detail: s.activityLine?.trim() || statusMsg?.trim() || undefined,
    });
  }

  for (const t of runningSpawnTools(tools)) {
    if (seen.has(t.toolId)) continue;
    seen.add(t.toolId);
    items.push({
      id: t.toolId,
      kind: "subagent",
      label: t.label,
    });
  }

  if (subagentModel?.trim()) {
    const id = `subagent-model-${subagentModel.trim()}`;
    if (!seen.has(id)) {
      seen.add(id);
      items.unshift({
        id,
        kind: "subagent",
        label: formatModelLabel(subagentModel) || subagentModel.trim(),
        detail: statusMsg?.trim() || undefined,
      });
    }
  }

  return items;
}

export function deriveSubagentCardTitle(
  tool: { label?: string; name?: string; kind?: string },
  subagent?: SubagentRow | null
): string {
  if (subagent?.title?.trim()) {
    return truncateOneLine(subagent.title);
  }
  const raw = (tool.label || tool.name || tool.kind || "Subagent")
    .replace(/^Ran\s+/i, "")
    .replace(/^Running\s+/i, "")
    .trim();
  return truncateOneLine(raw || "Subagent");
}

export function deriveSubagentActivityLine(opts: {
  statusMsg: string | null;
  processLine: string | null;
  subagentModel: string | null | undefined;
  spawnRunning: boolean;
  subagent?: SubagentRow | null;
}): string {
  const { statusMsg, processLine, subagentModel, spawnRunning, subagent } = opts;

  if (subagent?.activityLine?.trim()) {
    return truncateOneLine(subagent.activityLine, 96);
  }

  if (subagentModel?.trim() && processLine?.trim()) {
    return truncateOneLine(processLine, 96);
  }

  if (subagentModel?.trim() && statusMsg?.trim()) {
    const msg = statusMsg.trim();
    if (
      /^(Running|Using|Calling|Queued:|Exploring|Investigating|Turn)/i.test(
        msg
      )
    ) {
      return truncateOneLine(msg, 96);
    }
    if (!/^(Thinking|Waiting for model)/i.test(msg)) {
      return truncateOneLine(msg, 96);
    }
  }

  if (
    spawnRunning &&
    (!subagentModel?.trim() || processLine?.trim() || statusMsg?.trim())
  ) {
    return "Waiting for subagent";
  }

  if (subagentModel?.trim()) {
    return "Working…";
  }

  return spawnRunning ? "Waiting for subagent" : "";
}

/** RunningDock-worthy but not subagent (sleeping shell / permission). */
export function hasNonSubagentDockProcess(
  tools: ToolRow[],
  activityPhase: string | null | undefined,
  statusMsg: string | null,
  permissionPending: boolean
): boolean {
  if (permissionPending) return true;
  if (activityPhase === "sleeping") return true;
  if (activityPhase === "permission") return true;
  if (statusMsg != null && /^Permission\b|Waiting for permission/i.test(statusMsg)) {
    return true;
  }
  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i]!;
    if (t.status !== "running") continue;
    if ((t.kind || "").toLowerCase() === "sleeping") return true;
    if (/^Execute\s/i.test(t.label || "")) return true;
  }
  return false;
}

export function collectNonSubagentDockItems(
  tools: ToolRow[],
  activityPhase: string | null | undefined,
  processLine: string | null,
  statusMsg: string | null,
  permissionPending: boolean
): RunningProcessItem[] {
  const items: RunningProcessItem[] = [];
  const seen = new Set<string>();

  if (permissionPending || activityPhase === "permission") {
    items.push({
      id: "permission",
      kind: "permission",
      label: statusMsg?.trim() || "Waiting for permission…",
    });
  }

  for (let i = tools.length - 1; i >= 0; i--) {
    const t = tools[i]!;
    if (t.status !== "running") continue;
    const kind = (t.kind || "").toLowerCase();
    const isShell =
      kind === "sleeping" ||
      kind === "execute" ||
      /^Execute\s/i.test(t.label || "");
    if (!isShell || isSubagentSpawnTool(t)) continue;
    if (seen.has(t.toolId)) continue;
    seen.add(t.toolId);
    items.push({
      id: t.toolId,
      kind: "shell",
      label: (t.label || t.name || "Shell").replace(/^Ran\s+/i, "").trim(),
      detail: processLine?.trim() || undefined,
    });
  }

  if (
    activityPhase === "sleeping" &&
    processLine?.trim() &&
    !items.some((x) => x.detail === processLine.trim())
  ) {
    items.unshift({
      id: "sleeping-activity",
      kind: "shell",
      label: processLine.trim(),
    });
  }

  return items;
}

export function deriveRunningDockOutline(
  tools: ToolRow[],
  activityPhase: string | null | undefined,
  processLine: string | null,
  statusMsg: string | null,
  permissionPending: boolean
): string {
  if (permissionPending || activityPhase === "permission") {
    return statusMsg?.trim() || "Waiting for permission…";
  }
  const shell = tools.find(
    (t) =>
      t.status === "running" &&
      ((t.kind || "").toLowerCase() === "sleeping" ||
        (t.kind || "").toLowerCase() === "execute" ||
        /^Execute\s/i.test(t.label || "")) &&
      !isSubagentSpawnTool(t)
  );
  if (shell?.label?.trim()) {
    return shell.label.replace(/^Ran\s+/i, "").trim();
  }
  if (activityPhase === "sleeping" && processLine?.trim()) {
    return processLine.trim();
  }
  return "";
}

/** Best-effort match: first live subagent for a running spawn tool row. */
export function pickSubagentForSpawnTool(
  subagents: SubagentRow[],
  _tool: ToolRow
): SubagentRow | null {
  const live = subagents.filter(
    (s) => s.status === "spawned" || s.status === "running"
  );
  return live[0] ?? null;
}
