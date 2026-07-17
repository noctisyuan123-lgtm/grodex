# G3d — LiveProcessStack, RunningDock, session/load smoke

Third partial G3 slice: **same-UUID `session/load` smoke**, simplified **LiveProcessStack** + **RunningDock** in the web UI, and bridge SSE for **activity phase** / **permission** (auto-approved).

Parent context: [G3 chat](G3-chat-slice.md) · [G3b timeline](G3b-timeline-slice.md) · [G3c subagents](G3c-subagent-slice.md).

---

## What shipped

| Area | Change |
|------|--------|
| **Bridge** | `session/load` unchanged from G3; emits `activity.phase`, `permission` pending/resolved on ACP `session/request_permission` + `x.ai/session_notification` (auto-approve) |
| **Smoke** | `npm run smoke:load` — picks a real UUID from `~/.grok/sessions`, connects, prints `attachMode` + `sessionId` |
| **Web** | `LiveProcessStack` (TextRoll live line + sealed step count); `RunningDock` for permission/sleeping shell (not subagents — those stay on `WorkingPill`) |
| **SSE types** | `activity.phase`, `permission` events mirrored in `apps/web/src/api.ts` |

---

## session/load smoke

From repo root:

```sh
cd apps && npm run smoke:load
```

Behavior:

1. Resolves `GRODEX_BIN` (default `target/release/xai-grok-pager`).
2. Spawns bridge on port `8798` (override with `GRODEX_BRIDGE_PORT`).
3. Picks session id:
   - `GRODEX_SMOKE_SESSION_ID` if set, else
   - most recent UUID under `~/.grok/sessions` for this repo cwd, else
   - most recent UUID anywhere under `~/.grok/sessions`.
4. `POST /api/session/connect` with `{ cwd, sessionId }`.
5. Prints JSON: `{ ok, attachMode, sessionId, loadSucceeded, pickedFrom, ... }`.
6. Disconnects and stops bridge. **No prompt** (no model / 402 exposure).

### Observed results (2026-07-18)

Run locally after `cargo build -p xai-grok-pager-bin --release`. Document honestly in PR/commit notes:

- **`attachMode: "load"`** when Core accepts `session/load` for the picked UUID.
- **`attachMode: "new"`** when load fails (bridge falls back per `grodex-agent.ts` — no history-digest fake resume).
- **Failure modes**: missing binary, no sessions dir, bridge timeout, ACP initialize error.

---

## UI: LiveProcessStack / RunningDock

Ported from [agent-pane](https://github.com/noctisyuan123-lgtm/agent-pane) in **empty-safe** simplified form:

- **`LiveProcessStack`** (`apps/web/src/LiveProcessStack.tsx`) — one rolling status line (TextRoll) in the transcript; optional “N steps completed” when settled tools exist. Returns `null` when idle.
- **`RunningDock`** (`AgentActivityStrip.tsx`) — above composer for **permission** and **sleeping/execute** long work only. Subagents use **`WorkingPill`** (G3c).
- **`AgentActivityStrip`** — soft status (`Thinking…`, `Waiting for model…`); process outline moves to dock/stack when dock-worthy.

Helpers: `hasNonSubagentDockProcess`, `deriveRunningDockOutline`, `collectNonSubagentDockItems` in `subagentProcess.ts`.

---

## Bridge SSE events (G3d)

| Event | When |
|-------|------|
| `activity` + `phase` | thinking / tool / permission / working / sleeping (best-effort from Core notifications) |
| `permission` `{ status: "pending" \| "resolved", tool? }` | ACP permission RPC (auto-approved immediately in bridge) |
| `status` | Soft line for UI strip |

Client: `useChatSession` tracks `activityPhase`, `permissionPending`.

---

## Gaps / deferred

- No **TurnBlocks** / full agent-pane turn segmentation (G3d uses flat tool list + LiveProcessStack).
- **fs/read_text_file** / **fs/write_text_file** ACP handlers still stubbed (G3).
- **session/load → prompt hang** historically seen in agent-pane — not re-tested exhaustively here; smoke:load only covers attach.
- Live model **402** / auth errors ignored in smoke (by design).
- Desktop Tauri shell unchanged (web + bridge only).

---

## Files touched

```
apps/bridge/scripts/smoke-load.ts
apps/bridge/src/grodex-agent.ts      # permission + activity phase SSE
apps/bridge/src/chat-events.ts       # permission type
apps/web/src/LiveProcessStack.tsx
apps/web/src/AgentActivityStrip.tsx  # RunningDock
apps/web/src/subagentProcess.ts      # dock helpers
apps/web/src/useChatSession.ts       # phase + permission state
apps/web/src/App.tsx                 # wire dock + stack
apps/web/src/ChatTranscript.tsx
apps/web/src/styles.css
apps/package.json                    # smoke:load
docs/G3d-liveprocess-load.md
README.md
```
