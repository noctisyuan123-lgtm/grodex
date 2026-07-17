# G3c — Subagent task cards & Working pill

Follow-up to [G3b timeline slice](./G3b-timeline-slice.md): port **SubagentTaskCard**, **WorkingPill**, and subagent helpers from agent-pane; map Core ACP nested/subagent notifications onto bridge SSE.

## What's in this slice

| Layer | Delivered |
|-------|-----------|
| **Bridge** | `subagent` SSE lifecycle + extended `activity` (`agentKind`, `subagentModel`); child-session routing for nested tool/thought updates |
| **Web** | `SubagentTaskCard`, `SessionWorkingDots`, `WorkingPill`, `subagentProcess` helpers, hanging cards under running `task` tools |
| **UX** | `{n} Working` pill above composer when nested agents are live; demo-safe empty states when Core emits spawn tools but no subagent payload yet |

**Still deferred:** LiveProcessStack / sealed process packs, tool↔subagent_id correlation, permissions UI, history replay, multi-session SSE fan-out.

## SSE design (G3c)

We use a dedicated **`subagent`** event for lifecycle/state (not overload `tool`):

| type | fields | meaning |
|------|--------|---------|
| `subagent` | `subagentId`, `status`, `title`, `model?`, `subagentType?`, `activityLine?`, `childSessionId?` | Spawn → running → completed/failed/cancelled |
| `activity` | `text`, `kind?`, **`agentKind?`**, **`subagentModel?`** | Live outline; when `agentKind=subagent`, drives WorkingPill model chip + card activity fallback |

Bridge maps ACP (parent session channel unless noted):

| ACP `sessionUpdate` | SSE |
|---------------------|-----|
| `subagent_spawned` | `subagent` status=`spawned` + `activity` (title) |
| `subagent_progress` | `subagent` status=`running` (`Turn N · M tools`) + `activity` |
| `subagent_finished` | `subagent` terminal status |
| Child `session/update` (`tool_call`, `agent_thought_chunk`, …) | `activity` with `agentKind=subagent` + `subagent` running refresh |

Sources: `x.ai/session_notification`, `_x.ai/session_notification`, and `session/update` jsonl replay path.

**Note:** Core `SubagentProgress` is stats-only (turn/tool counts). Rich step text depends on child-session updates or future ACP fields — UI shows **Waiting for subagent** / **Working…** until then.

## Run

Same as G3/G3b:

```sh
cd apps && npm run dev:bridge   # :8790
cd apps && npm run dev:web      # :5174
```

Spawn a `task` subagent from Core to exercise cards + pill. Without auth/balance, wiring still proves connect + SSE attach.

## Smoke

```sh
cd apps && npm run smoke:chat
```

Summary includes `gotSubagent` when the stream carries nested lifecycle events (usually only on real task spawns).

## Files touched

```
apps/bridge/src/chat-events.ts
apps/bridge/src/grodex-agent.ts
apps/bridge/scripts/smoke-chat.ts
apps/web/src/SessionWorkingDots.tsx
apps/web/src/SubagentTaskCard.tsx
apps/web/src/subagentProcess.ts
apps/web/src/AgentActivityStrip.tsx
apps/web/src/ToolTimeline.tsx
apps/web/src/useChatSession.ts
apps/web/src/ChatTranscript.tsx
apps/web/src/App.tsx
apps/web/src/api.ts
apps/web/src/styles.css
docs/G3c-subagent-slice.md
README.md
```

## Remaining gaps (G3+)

- Correlate `task` tool_call_id ↔ `subagent_id` for precise card pairing (currently first live subagent / spawn-tool heuristic)
- LiveProcessStack / RunningDock for sleeping shells & permission rows
- Full agent-pane ToolTimeline (diff bodies, expand)
- Permission prompts (bridge still auto-approves)
- Session jsonl history replay
- Multi-session SSE fan-out
