import { TextRoll } from "./TextRoll";

export type ToolRow = {
  toolId: string;
  label: string;
  status: "running" | "completed" | "failed";
};

function statusTag(status: ToolRow["status"]): string {
  switch (status) {
    case "running":
      return "…";
    case "failed":
      return "failed";
    default:
      return "done";
  }
}

function ToolRowView({
  tool,
  rollLabel = false,
}: {
  tool: ToolRow;
  rollLabel?: boolean;
}) {
  const labelCore = rollLabel ? (
    <TextRoll
      text={tool.label}
      textKey={`${tool.toolId}:${tool.label}`}
      shimmer={tool.status === "running"}
      className="tl-label-roll"
    />
  ) : (
    tool.label
  );

  return (
    <div className={`tl-row ${tool.status}`}>
      <div className="tl-head">
        <span className="tl-chev empty">·</span>
        <span className="tl-label">
          {labelCore}
          {tool.status === "running" && !rollLabel ? (
            <span className="tl-spin"> …</span>
          ) : null}
          {tool.status === "failed" ? (
            <span className="tl-fail-tag"> failed</span>
          ) : null}
        </span>
        <span className={`tl-status-tag ${tool.status}`}>
          {statusTag(tool.status)}
        </span>
      </div>
    </div>
  );
}

/**
 * Simplified tool timeline — name + status only (G3b).
 * Live seat: single running tool with TextRoll on the label.
 */
export function ToolTimeline({
  tools,
  rollLabels = false,
}: {
  tools: ToolRow[];
  rollLabels?: boolean;
}) {
  if (!tools.length) return null;

  const running = tools.filter((t) => t.status === "running");
  const liveSeat = rollLabels && running.length === 1 ? running[0] : null;

  if (liveSeat) {
    return (
      <div className="tl tl-live-seat">
        <div className="tl-list">
          <ToolRowView tool={liveSeat} rollLabel />
        </div>
      </div>
    );
  }

  return (
    <div className="tl">
      <div className="tl-list">
        {tools.map((t) => (
          <ToolRowView key={t.toolId} tool={t} rollLabel={rollLabels} />
        ))}
      </div>
    </div>
  );
}
