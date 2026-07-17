import { TextRoll, TEXT_ROLL_MIN_HOLD_MS } from "./TextRoll";
import type { ToolRow } from "./ToolTimeline";
import { useEffect, useRef, useState } from "react";

/**
 * Simplified LiveProcessStack for grodex G3d — one rolling live line + optional
 * sealed summary. Empty-safe: returns null when idle.
 */
type LiveProcessStackProps = {
  liveTools: ToolRow[];
  processLine?: string | null;
  settledCount?: number;
  busy?: boolean;
};

function useHeldTextKey(
  targetKey: string | null,
  minHoldMs: number
): string | null {
  const [heldKey, setHeldKey] = useState<string | null>(targetKey);
  const sinceRef = useRef(Date.now());
  const heldRef = useRef(heldKey);
  heldRef.current = heldKey;

  useEffect(() => {
    if (targetKey == null) {
      setHeldKey(null);
      return;
    }
    if (heldRef.current == null) {
      sinceRef.current = Date.now();
      setHeldKey(targetKey);
      return;
    }
    if (heldRef.current === targetKey) return;

    const wait = Math.max(0, minHoldMs - (Date.now() - sinceRef.current));
    const t = window.setTimeout(() => {
      sinceRef.current = Date.now();
      setHeldKey(targetKey);
    }, wait);
    return () => window.clearTimeout(t);
  }, [targetKey, minHoldMs]);

  return heldKey;
}

function latestRollLine(
  liveTools: ToolRow[],
  processLine?: string | null
): { id: string; text: string; shimmer: boolean } | null {
  const process = processLine?.trim();
  if (process) {
    return { id: `proc-${process}`, text: process, shimmer: true };
  }
  const last = liveTools[liveTools.length - 1];
  if (last?.label?.trim()) {
    return {
      id: `tool-${last.toolId}`,
      text: last.label.trim(),
      shimmer: last.status === "running",
    };
  }
  return null;
}

export function LiveProcessStack({
  liveTools,
  processLine,
  settledCount = 0,
  busy = false,
}: LiveProcessStackProps) {
  const live = latestRollLine(liveTools, processLine);
  if (!live && settledCount === 0) return null;

  const heldKey = useHeldTextKey(live?.id ?? null, TEXT_ROLL_MIN_HOLD_MS);
  const display = live && (heldKey === live.id || heldKey == null) ? live : live;

  return (
    <div className="live-process-stack" aria-live="polite">
      {settledCount > 0 ? (
        <div className="live-process-sealed">
          <span className="live-process-sealed-summary">
            {settledCount} step{settledCount === 1 ? "" : "s"} completed
          </span>
        </div>
      ) : null}
      {display ? (
        <div className="live-process-stage">
          <div className="live-process-item live-process-roll-line">
            <TextRoll
              text={display.text}
              textKey={display.id}
              shimmer={busy && display.shimmer}
              className="live-process-text-roll"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
