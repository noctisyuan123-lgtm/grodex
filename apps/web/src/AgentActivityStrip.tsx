import { useEffect, useRef, useState } from "react";
import { SessionWorkingDots } from "./SessionWorkingDots";
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

export type RunningProcessItem = {
  id: string;
  label: string;
  kind?: string;
  detail?: string;
};

export type RunningDockProps = {
  outline: string;
  detail?: string | null;
  secondary?: string | null;
  runningItems?: RunningProcessItem[];
};

export type WorkingPillProps = {
  /** Active nested subagents only */
  count: number;
  runningItems?: RunningProcessItem[];
};

/** Cursor Glass Agents Tray parity — compact `{n} Working` pill above composer. */
export function WorkingPill({ count, runningItems = [] }: WorkingPillProps) {
  const [listOpen, setListOpen] = useState(false);
  if (count <= 0) return null;

  const label = `${count} Working`;
  const canExpand = runningItems.length > 0;

  return (
    <div
      className={`working-pill-wrap${listOpen ? " working-pill-wrap--expanded" : ""}`}
      aria-live="polite"
    >
      {canExpand ? (
        <button
          type="button"
          className="working-pill"
          onClick={() => setListOpen((v) => !v)}
          aria-expanded={listOpen}
          title={listOpen ? "Hide agents" : "Show running agents"}
        >
          <SessionWorkingDots className="working-pill-dots" />
          <span className="working-pill-label">{label}</span>
          <span className={`working-pill-chev ${listOpen ? "open" : ""}`}>▾</span>
        </button>
      ) : (
        <div className="working-pill" aria-label={label}>
          <SessionWorkingDots className="working-pill-dots" />
          <span className="working-pill-label">{label}</span>
        </div>
      )}
      {listOpen && canExpand ? (
        <ul className="working-pill-list">
          {runningItems.map((item) => (
            <li key={item.id} className="working-pill-item">
              {item.kind ? (
                <span className="working-pill-kind">{item.kind}</span>
              ) : null}
              <span className="working-pill-item-label">{item.label}</span>
              {item.detail?.trim() ? (
                <span className="working-pill-item-detail">
                  {item.detail.trim()}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** Compact running shell / permission bar — above composer, left-aligned. */
export function RunningDock({
  outline,
  detail,
  secondary,
  runningItems = [],
}: RunningDockProps) {
  const [listOpen, setListOpen] = useState(false);
  const title = outline.trim();
  if (!title) return null;

  const canExpand = runningItems.length > 0;

  return (
    <div
      className={`running-dock${listOpen ? " running-dock--expanded" : ""}`}
      aria-live="polite"
    >
      <SessionWorkingDots className="running-dock-dots" />
      <div className="running-dock-lines">
        <div className="running-dock-outline-row">
          {canExpand ? (
            <button
              type="button"
              className="running-dock-outline-btn"
              onClick={() => setListOpen((v) => !v)}
              aria-expanded={listOpen}
              title={
                listOpen
                  ? "Hide running processes"
                  : "Show running subagents / scripts"
              }
            >
              <SlideLine text={title} className="running-dock-outline" />
              <span
                className={`running-dock-expand-chev ${listOpen ? "open" : ""}`}
              >
                ▾
              </span>
            </button>
          ) : (
            <SlideLine text={title} className="running-dock-outline" />
          )}
          {secondary ? (
            <span className="running-dock-secondary">{secondary}</span>
          ) : null}
        </div>
        {detail?.trim() ? (
          <div className="running-dock-detail-row">
            <SlideLine text={detail.trim()} className="running-dock-detail" />
          </div>
        ) : null}
        {listOpen && canExpand ? (
          <ul className="running-dock-list">
            {runningItems.map((item) => (
              <li key={item.id} className="running-dock-item">
                {item.kind ? (
                  <span className="running-dock-kind">{item.kind}</span>
                ) : null}
                <span className="running-dock-label">{item.label}</span>
                {item.detail?.trim() ? (
                  <span className="running-dock-item-detail">
                    {item.detail.trim()}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

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
