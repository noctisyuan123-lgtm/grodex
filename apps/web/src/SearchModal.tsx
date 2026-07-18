import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import {
  fetchSearch,
  type SearchActionHit,
  type SearchAgentHit,
  type SearchFileHit,
} from "./api";
import { IconSearch } from "./icons";

export type SearchFilter = "all" | "agents" | "files" | "actions";

export type SearchSelection =
  | { kind: "agent"; item: SearchAgentHit }
  | { kind: "file"; item: SearchFileHit }
  | { kind: "action"; item: SearchActionHit };

type Props = {
  open: boolean;
  onClose: () => void;
  onSelect: (sel: SearchSelection) => void;
};

const FILTERS: { id: SearchFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "agents", label: "Agents" },
  { id: "files", label: "Files" },
  { id: "actions", label: "Actions" },
];

function formatRelTime(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function relPath(abs: string): string {
  const home = typeof window !== "undefined" ? "" : "";
  void home;
  const prefix = abs.startsWith("/Users/")
    ? abs.replace(/^\/Users\/[^/]+/, "~")
    : abs;
  if (prefix.length <= 56) return prefix;
  return `…${prefix.slice(-52)}`;
}

type FlatRow = SearchSelection & { id: string; label: string; meta?: string };

export function SearchModal({ open, onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<SearchFilter>("all");
  const [loading, setLoading] = useState(false);
  const [agents, setAgents] = useState<SearchAgentHit[]>([]);
  const [files, setFiles] = useState<SearchFileHit[]>([]);
  const [actions, setActions] = useState<SearchActionHit[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const data = await fetchSearch(q);
      setAgents(data.agents);
      setFiles(data.files);
      setActions(data.actions);
    } catch {
      setAgents([]);
      setFiles([]);
      setActions([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setFilter("all");
    setSelectedIdx(0);
    void load("");
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => void load(query), 120);
    return () => window.clearTimeout(t);
  }, [open, query, load]);

  const flatRows = useMemo((): FlatRow[] => {
    const rows: FlatRow[] = [];
    const showAgents = filter === "all" || filter === "agents";
    const showFiles = filter === "all" || filter === "files";
    const showActions = filter === "all" || filter === "actions";

    if (showAgents) {
      for (const item of agents) {
        rows.push({
          kind: "agent",
          item,
          id: item.id,
          label: item.title,
          meta: `${item.repo} · ${formatRelTime(item.updatedAt)}`,
        });
      }
    }
    if (showFiles) {
      for (const item of files) {
        rows.push({
          kind: "file",
          item,
          id: item.id,
          label: item.name,
          meta: relPath(item.path),
        });
      }
    }
    if (showActions) {
      for (const item of actions) {
        rows.push({
          kind: "action",
          item,
          id: item.id,
          label: item.label,
        });
      }
    }
    return rows;
  }, [agents, files, actions, filter]);

  useEffect(() => {
    setSelectedIdx((i) => (flatRows.length === 0 ? 0 : Math.min(i, flatRows.length - 1)));
  }, [flatRows.length, filter, query]);

  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-search-idx="${selectedIdx}"]`
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [open, selectedIdx]);

  const cycleFilter = (dir: -1 | 1) => {
    const idx = FILTERS.findIndex((f) => f.id === filter);
    const next = (idx + dir + FILTERS.length) % FILTERS.length;
    setFilter(FILTERS[next]!.id);
    setSelectedIdx(0);
  };

  const activate = (row: FlatRow) => {
    if (row.kind === "agent") onSelect({ kind: "agent", item: row.item });
    else if (row.kind === "file") onSelect({ kind: "file", item: row.item });
    else onSelect({ kind: "action", item: row.item });
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault();
        cycleFilter(-1);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "]") {
        e.preventDefault();
        cycleFilter(1);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => (flatRows.length ? (i + 1) % flatRows.length : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) =>
          flatRows.length ? (i - 1 + flatRows.length) % flatRows.length : 0
        );
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const row = flatRows[selectedIdx];
        if (row) activate(row);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, flatRows, selectedIdx, onClose, onSelect]);

  if (!open) return null;

  const showAgentSection =
    (filter === "all" || filter === "agents") && agents.length > 0;
  const showFileSection =
    (filter === "all" || filter === "files") && files.length > 0;
  const showActionSection =
    (filter === "all" || filter === "actions") && actions.length > 0;

  let rowCounter = -1;

  const renderRow = (row: FlatRow) => {
    rowCounter += 1;
    const idx = rowCounter;
    const active = idx === selectedIdx;
    return (
      <button
        key={row.id}
        type="button"
        data-search-idx={idx}
        className={`search-row ${active ? "active" : ""}`}
        onMouseEnter={() => setSelectedIdx(idx)}
        onClick={() => activate(row)}
      >
        <span className="search-row-label">{row.label}</span>
        {row.meta ? <span className="search-row-meta">{row.meta}</span> : null}
      </button>
    );
  };

  return createPortal(
    <div className="search-backdrop" onClick={onClose}>
      <div className="search-palette" onClick={(e) => e.stopPropagation()}>
        <div className="search-input-wrap">
          <IconSearch size={16} className="search-input-icon" />
          <input
            ref={inputRef}
            className="search-input"
            placeholder="Search agents, files, actions..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        <div className="search-chips">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              className={`search-chip ${filter === f.id ? "active" : ""}`}
              onClick={() => {
                setFilter(f.id);
                setSelectedIdx(0);
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="search-results" ref={listRef}>
          {loading && flatRows.length === 0 ? (
            <div className="search-empty">Searching…</div>
          ) : flatRows.length === 0 ? (
            <div className="search-empty">No matches</div>
          ) : (
            <>
              {showAgentSection ? (
                <section className="search-section">
                  <div className="search-section-title">Recent agents</div>
                  {agents.map((item) =>
                    renderRow({
                      kind: "agent",
                      item,
                      id: item.id,
                      label: item.title,
                      meta: `${item.repo} · ${formatRelTime(item.updatedAt)}`,
                    })
                  )}
                </section>
              ) : null}
              {showFileSection ? (
                <section className="search-section">
                  <div className="search-section-title">Recent files</div>
                  {files.map((item) =>
                    renderRow({
                      kind: "file",
                      item,
                      id: item.id,
                      label: item.name,
                      meta: relPath(item.path),
                    })
                  )}
                </section>
              ) : null}
              {showActionSection ? (
                <section className="search-section">
                  <div className="search-section-title">Actions</div>
                  {actions.map((item) =>
                    renderRow({
                      kind: "action",
                      item,
                      id: item.id,
                      label: item.label,
                    })
                  )}
                </section>
              ) : null}
            </>
          )}
        </div>

        <footer className="search-footer">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> Select
          </span>
          <span>
            <kbd>↵</kbd> Open
          </span>
          <span>
            <kbd>⌘[</kbd> / <kbd>⌘]</kbd> Change Filter
          </span>
        </footer>
      </div>
    </div>,
    document.body
  );
}
