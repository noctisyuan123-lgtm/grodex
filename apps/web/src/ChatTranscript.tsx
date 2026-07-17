import { useEffect, useRef } from "react";
import type { ChatMessage } from "./useChatSession";

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
  statusText: string | null;
};

export function ChatTranscript({ messages, statusText }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, statusText]);

  return (
    <div className="chat-scroll">
      {messages.length === 0 ? (
        <p className="chat-empty">
          Connect a Core session, then send a message. Same-UUID resume uses{" "}
          <code>session/load</code> when you pass a known id.
        </p>
      ) : null}

      {messages.map((m) => (
        <div
          key={m.id}
          className={`chat-row ${m.role}${m.role === "assistant" && m.live ? " live" : ""}`}
        >
          {m.role === "user" ? (
            <div className="bubble user">{m.text}</div>
          ) : m.role === "tool" ? (
            <div className="tool-chip">⚙ {m.text}</div>
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

      {statusText ? <div className="status-line">{statusText}</div> : null}
      <div ref={bottomRef} />
    </div>
  );
}
