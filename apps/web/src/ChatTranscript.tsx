import { useEffect, useRef } from "react";
import { ToolTimeline } from "./ToolTimeline";
import type { ChatMessage } from "./useChatSession";
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
  statusText: string | null;
  busy: boolean;
};

export function ChatTranscript({
  messages,
  tools,
  liveTools,
  settledTools,
  statusText,
  busy,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, tools, statusText, liveTools]);

  const showEmpty =
    messages.length === 0 && tools.length === 0 && !statusText && !busy;

  return (
    <div className="chat-scroll">
      {showEmpty ? (
        <p className="chat-empty">
          Connect a Core session, then send a message. Tool and status events
          render even when assistant text is blocked (e.g. auth/balance). Same-UUID
          resume uses <code>session/load</code> when you pass a known id.
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

      {liveTools.length > 0 ? (
        <div className="chat-process-block">
          <ToolTimeline tools={liveTools} rollLabels />
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
