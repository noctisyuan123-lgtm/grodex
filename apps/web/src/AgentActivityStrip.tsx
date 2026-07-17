import { useEffect, useRef, useState } from "react";
import { TextRoll } from "./TextRoll";

const SLIDE_MS = 280;

function slideIdentity(text: string): string {
  return text.replace(/\s+\d+(\.\d+)?s\s*$/, "").trim();
}

function SlideLine({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  const [current, setCurrent] = useState(text);
  const [exiting, setExiting] = useState<string | null>(null);
  const [entering, setEntering] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const identityRef = useRef(slideIdentity(text));

  useEffect(() => {
    return () => {
      for (const t of timers.current) clearTimeout(t);
      timers.current = [];
    };
  }, []);

  useEffect(() => {
    const nextId = slideIdentity(text);
    if (nextId === identityRef.current) {
      if (text !== current) setCurrent(text);
      return;
    }
    identityRef.current = nextId;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setCurrent(text);
      setExiting(null);
      setEntering(false);
      return;
    }
    setExiting(current);
    setCurrent(text);
    setEntering(true);
    const t1 = setTimeout(() => setExiting(null), SLIDE_MS);
    const t2 = setTimeout(() => setEntering(false), SLIDE_MS);
    timers.current.push(t1, t2);
  }, [text, current]);

  return (
    <span className={`agent-activity-slide-wrap ${className}`.trim()}>
      {exiting != null && (
        <span
          className="agent-activity-slide agent-activity-slide-exit"
          aria-hidden
        >
          {exiting}
        </span>
      )}
      <span
        className={`agent-activity-slide${
          entering ? " agent-activity-slide-enter" : ""
        }`}
      >
        {current}
      </span>
    </span>
  );
}

export type AgentActivityStripProps = {
  status?: string | null;
  /** Live process line (tool/thought) — TextRoll when busy. */
  processLine?: string | null;
  busy?: boolean;
};

/**
 * Compact status strip above the composer — soft status + optional live process line.
 */
export function AgentActivityStrip({
  status,
  processLine,
  busy = false,
}: AgentActivityStripProps) {
  const processText = processLine?.trim() ?? "";
  const statusText = status?.trim() ?? "";
  if (!processText && !statusText) return null;

  return (
    <div
      className="agent-activity agent-activity--status-only"
      aria-live="polite"
    >
      {processText ? (
        <div className="agent-activity-process-row">
          <TextRoll
            text={processText}
            textKey={processText}
            shimmer={busy}
            className="live-process-text-roll"
          />
        </div>
      ) : null}
      {statusText ? (
        <div className="agent-activity-status-row">
          <SlideLine text={statusText} className="agent-activity-status" />
        </div>
      ) : null}
    </div>
  );
}
