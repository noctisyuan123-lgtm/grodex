import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { LiveProcessStack } from "./LiveProcessStack";
import { SubagentTaskCard } from "./SubagentTaskCard";
import {
  deriveSubagentActivityLine,
  deriveSubagentCardTitle,
  isSubagentSpawnTool,
  pickSubagentForSpawnTool,
} from "./subagentProcess";
import { ToolTimeline } from "./ToolTimeline";
import type { ChatMessage, SubagentRow } from "./useChatSession";
import type { ToolRow } from "./ToolTimeline";

function renderMinimalMarkdown(text: string): string {
  let html = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\n/g, "<br />");
  return html;
}

type Props = {
  messages: ChatMessage[];
  tools: ToolRow[];
  liveTools: ToolRow[];
  settledTools: ToolRow[];
  subagents: SubagentRow[];
  subagentModel: string | null;
  statusText: string | null;
  processLine: string | null;
  busy: boolean;
};

export function ChatTranscript({
  messages,
  tools,
  liveTools,
  settledTools,
  subagents,
  subagentModel,
  statusText,
  processLine,
  busy,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tools, statusText, liveTools, subagents]);

  const subagentCardsByToolId = useMemo(() => {
    const out: Record<string, ReactNode> = {};
    for (const tool of liveTools) {
      if (!isSubagentSpawnTool(tool)) continue;
      const subagent = pickSubagentForSpawnTool(subagents, tool);
      out[tool.toolId] = (
        <SubagentTaskCard
          title={deriveSubagentCardTitle(tool, subagent)}
          model={subagent?.model ?? subagentModel}
          activityLine={deriveSubagentActivityLine({
            statusMsg: statusText,
            processLine,
            subagentModel: subagent?.model ?? subagentModel,
            spawnRunning: tool.status === "running",
            subagent,
          })}
          active={tool.status === "running"}
        />
      );
    }
    return out;
  }, [liveTools, subagents, subagentModel, statusText, processLine]);

  const showEmpty =
    messages.length === 0 && tools.length === 0 && !statusText && !busy;

  return (
    <div className="chat-scroll">
      {showEmpty ? (
        <p className="chat-empty">
          Connect a Core session, then send a message. Tool, subagent, and status
          events render even when assistant text is blocked (e.g. auth/balance).
          Same-UUID resume uses <code>session/load</code> when you pass a known
          id.
        </p>
      ) : null}

      {messages.map((m) => (
        <div
          key={m.id}
          className={`chat-row ${m.role}${m.role === "assistant" && m.live ? " live" : ""}`}
        >
          {m.role === "user" ? (
            <div className="bubble user">{m.text}</div>
          ) : (
            <div
              className="bubble assistant"
              dangerouslySetInnerHTML={{
                __html: renderMinimalMarkdown(m.text),
              }}
            />
          )}
        </div>
      ))}

      {liveTools.length > 0 || (busy && processLine?.trim()) ? (
        <div className="chat-process-block">
          <LiveProcessStack
            liveTools={liveTools}
            processLine={processLine}
            settledCount={settledTools.length}
            busy={busy}
          />
          <ToolTimeline
            tools={liveTools}
            rollLabels={false}
            subagentCardsByToolId={
              Object.keys(subagentCardsByToolId).length > 0
                ? subagentCardsByToolId
                : undefined
            }
          />
        </div>
      ) : null}

      {settledTools.length > 0 ? (
        <div className="chat-process-block">
          <ToolTimeline tools={settledTools} />
        </div>
      ) : null}

      {busy && liveTools.length === 0 && statusText ? (
        <div className="status-line">{statusText}</div>
      ) : null}

      <div ref={bottomRef} />
    </div>
  );
}
