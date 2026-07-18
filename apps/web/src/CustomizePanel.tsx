import { useEffect, useState } from "react";
import {
  fetchCustomizeOverview,
  openLocalPath,
  revealInFinder,
  type CustomizeOverview,
  type SkillEntry,
} from "./api";
import {
  IconCheck,
  IconCustomize,
  IconLayers,
  IconList,
  IconPencil,
  IconSpark,
  IconTerminal,
} from "./icons";

type Props = {
  connected: boolean;
  cwd: string;
  onClose: () => void;
};

export function CustomizePanel({ connected, cwd, onClose }: Props) {
  const [overview, setOverview] = useState<CustomizeOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const [viewRule, setViewRule] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchCustomizeOverview(cwd || undefined)
      .then((data) => {
        if (!cancelled) setOverview(data);
      })
      .catch(() => {
        if (!cancelled) setOverview(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const copyPath = async (path: string) => {
    try {
      await navigator.clipboard.writeText(path);
      setCopied(path);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      /* ignore */
    }
  };

  const memory = overview?.memory;
  const bridge = overview?.bridge;
  const skills: SkillEntry[] = overview?.skills ?? [];
  const rules = overview?.ruleFiles ?? [];
  const mcpServers = overview?.mcp.servers ?? [];
  const viewing = viewRule
    ? rules.find((r) => r.id === viewRule) ?? null
    : null;

  return (
    <div className="customize">
      <div className="customize-head">
        <div className="customize-title">
          <IconCustomize size={16} />
          <span>Customize</span>
        </div>
        <button type="button" className="customize-close" onClick={onClose}>
          Done
        </button>
      </div>

      <div className="customize-body">
        {loading ? (
          <div className="customize-empty">Loading…</div>
        ) : !overview ? (
          <div className="customize-empty">
            Bridge offline — start grodex-bridge to load customize data.
          </div>
        ) : (
          <>
            <section className="customize-section">
              <h3>
                <IconList size={14} /> Memory
              </h3>
              <p className="customize-hint">
                Index + sticky protocol + entries under{" "}
                <code>~/.grok/memory</code>.
              </p>
              <div className="customize-rows">
                <div className="customize-row">
                  <span className="customize-row-label">Index</span>
                  <code className="customize-path">{memory?.index}</code>
                  <button
                    type="button"
                    className="customize-mini"
                    onClick={() => memory && void copyPath(memory.index)}
                  >
                    {copied === memory?.index ? (
                      <IconCheck size={12} />
                    ) : (
                      "Copy"
                    )}
                  </button>
                  {memory?.indexExists ? (
                    <>
                      <button
                        type="button"
                        className="customize-mini"
                        onClick={() => void revealInFinder(memory.index)}
                      >
                        Reveal
                      </button>
                      <button
                        type="button"
                        className="customize-mini"
                        onClick={() => void openLocalPath(memory.index)}
                      >
                        Open
                      </button>
                    </>
                  ) : (
                    <span className="customize-missing">missing</span>
                  )}
                </div>
                <div className="customize-row">
                  <span className="customize-row-label">Sticky</span>
                  <code className="customize-path">{memory?.sticky}</code>
                  <button
                    type="button"
                    className="customize-mini"
                    onClick={() => memory && void copyPath(memory.sticky)}
                  >
                    {copied === memory?.sticky ? (
                      <IconCheck size={12} />
                    ) : (
                      "Copy"
                    )}
                  </button>
                  {memory?.stickyExists ? (
                    <button
                      type="button"
                      className="customize-mini"
                      onClick={() => void openLocalPath(memory.sticky)}
                    >
                      Open
                    </button>
                  ) : null}
                </div>
                <div className="customize-row">
                  <span className="customize-row-label">Entries</span>
                  <code className="customize-path">{memory?.entriesDir}</code>
                  {memory?.entriesExists ? (
                    <button
                      type="button"
                      className="customize-mini"
                      onClick={() => void revealInFinder(memory.entriesDir)}
                    >
                      Reveal
                    </button>
                  ) : (
                    <span className="customize-missing">missing</span>
                  )}
                </div>
              </div>
            </section>

            <section className="customize-section">
              <h3>
                <IconPencil size={14} /> Rules
              </h3>
              <p className="customize-hint">
                Markdown under <code>~/.grok/rules</code>. Open in your editor
                to edit; new sessions pick up changes.
              </p>
              {rules.length === 0 ? (
                <div className="customize-empty">No rule files found</div>
              ) : (
                <div className="customize-rows">
                  {rules.map((f) => (
                    <div key={f.id} className="customize-row">
                      <span className="customize-row-label">Rule</span>
                      <code className="customize-path">{f.name}</code>
                      <button
                        type="button"
                        className="customize-mini"
                        onClick={() =>
                          setViewRule((cur) => (cur === f.id ? null : f.id))
                        }
                      >
                        {viewRule === f.id ? "Hide" : "Read"}
                      </button>
                      <button
                        type="button"
                        className="customize-mini"
                        onClick={() => void openLocalPath(f.path)}
                      >
                        Open
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {viewing ? (
                <pre className="customize-readonly">{viewing.content}</pre>
              ) : null}
            </section>

            <section className="customize-section">
              <h3>
                <IconSpark size={14} /> Skills
              </h3>
              <p className="customize-hint">
                Discovered from Grok / Claude / Cursor skill dirs (read-only).
              </p>
              {skills.length === 0 ? (
                <div className="customize-empty">No skills found</div>
              ) : (
                <ul className="customize-skills">
                  {skills.slice(0, 48).map((s) => (
                    <li key={`${s.source}:${s.name}`}>
                      <span className="customize-skill-name">{s.name}</span>
                      <span className="customize-skill-source">{s.source}</span>
                      {s.description ? (
                        <span className="customize-skill-desc">
                          {s.description}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="customize-section">
              <h3>
                <IconLayers size={14} /> Bridge status
              </h3>
              <div className="customize-kv">
                <div>
                  <span>Bridge</span>
                  <strong className={connected || bridge?.connected ? "ok" : "bad"}>
                    {connected || bridge?.connected
                      ? "● connected"
                      : "○ disconnected"}
                  </strong>
                </div>
                <div>
                  <span>Bin</span>
                  <strong>{bridge?.bin ?? "—"}</strong>
                </div>
                <div>
                  <span>Session</span>
                  <strong>{bridge?.sessionId ?? "—"}</strong>
                </div>
                <div>
                  <span>CWD</span>
                  <strong>{bridge?.cwd || cwd || "—"}</strong>
                </div>
              </div>
            </section>

            <section className="customize-section">
              <h3>
                <IconTerminal size={14} /> MCP
              </h3>
              <p className="customize-hint">
                Read-only view of Grok MCP servers in{" "}
                <code>~/.grok/config.toml</code>. Editing lands in Wave C.
              </p>
              {mcpServers.length === 0 ? (
                <div className="customize-empty">No MCP servers configured</div>
              ) : (
                <div className="customize-mcp-list">
                  {overview.mcp.configPath ? (
                    <div className="customize-editor-actions">
                      <button
                        type="button"
                        className="customize-mini"
                        onClick={() =>
                          void revealInFinder(overview.mcp.configPath)
                        }
                      >
                        Reveal config.toml
                      </button>
                    </div>
                  ) : null}
                  {mcpServers.map((s) => (
                    <div key={s.name} className="customize-mcp-card">
                      <div className="customize-mcp-card-top">
                        <strong>{s.name}</strong>
                        <span className={s.enabled ? "ok" : "bad"}>
                          {s.enabled ? "On" : "Off"}
                        </span>
                      </div>
                      {s.command ? (
                        <code className="customize-mcp-cmd">
                          {s.command}
                          {s.args?.length ? ` ${s.args.join(" ")}` : ""}
                        </code>
                      ) : null}
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
