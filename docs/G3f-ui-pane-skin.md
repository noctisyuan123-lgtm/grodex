# G3f — agent-pane skin for grodex web

Solid browser/Tauri shell styled after **agent-pane** materials (`/Users/maybach/agent-pane/apps/web`).

## Tokens (no vibrancy)

| Token | Value | Use |
|-------|-------|-----|
| `--bg-deep-solid` | `#080808` | Window shell |
| `--bg-sidebar-solid` | `#121212` | Left rail |
| `--bg-editor-solid` | `#1e1e1e` | Chat stage |
| `--accent` | `#81a1c1` | Primary actions (Send) |
| `--content-max` | `880px` | Transcript + composer column |

Text/hover/active/input/border tokens match agent-pane (`--text`, `--text-muted`, `--text-dim`, `--bg-hover`, `--bg-active`, `--bg-input`, `--glass-border`).

## Layout

- **Sidebar (~248px):** brand + status dot, Connect / New session, collapsible resume-id (`<details>`), recent sessions as `.session-main` rows with active highlight.
- **Stage:** thin header (title + connection label), scrollable transcript, bottom composer dock.
- **Composer:** `.composer-shell` + `.composer-ta`; Enter send / Shift+Enter newline unchanged.

## Scope

Restyle only — G3 chat slices (TextRoll, ToolTimeline, subagents, RunningDock, hydrate) kept intact. Bridge/Core untouched.

## Verify

```bash
npm run build -w @grodex/web
```
