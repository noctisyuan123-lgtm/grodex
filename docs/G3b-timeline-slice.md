# G3b — Tool timeline & activity slice

Follow-up to [G3 chat slice](./G3-chat-slice.md): port **TextRoll**, a simplified **tool timeline**, and **activity/process** UI from agent-pane. Works from ACP `session/update` events even when assistant text is blocked (402 balance / auth).

## What's in this slice

| Layer | Delivered |
|-------|-----------|
| **Bridge** | Richer SSE events: `tool` (status running/completed/failed), `activity` (live process line) |
| **Web** | `TextRoll`, `ToolTimeline` (name + status), `AgentActivityStrip` above composer |
| **UX** | Graceful empty state; tool/status rows without requiring assistant chunks |

**Still deferred:** subagent cards, diff bodies, permissions UI, full LiveProcessStack / ProcessPackFold, history replay.

## SSE events (G3b additions)

Existing G3 events unchanged. New / extended:

| type | fields | meaning |
|------|--------|---------|
| `tool` | `toolId`, `title`, `status`, `kind?`, `phase?` | Tool lifecycle (`running` → `completed` / `failed`) |
| `activity` | `text`, `kind?` | Live process outline for TextRoll strip (`thinking`, `tool`, `status`) |

Bridge maps ACP `session/update` kinds:

- `tool_call` → `tool` running + `activity`
- `tool_call_update` → `tool` completed/failed (or still running)
- `agent_thought_chunk` → `status` + `activity` "Thinking…"

`phase: start|end` remains on `tool` for G3 clients but **`status` is canonical**.

## Run

Same as G3:

```sh
cd apps && npm run dev:bridge   # :8790
cd apps && npm run dev:web      # :5174
```

Connect → Send. If model replies 402, you should still see:

1. `user` event
2. `status` / `activity` ("Waiting for model…")
3. Optional `tool` rows if Core emits tool calls before failure
4. `error` + `assistant_done` when prompt RPC settles

## Smoke

```sh
cd apps && npm run smoke:chat
```

Summary now includes `gotTool` / `gotActivity` when the stream carries those types.

## Files touched

```
apps/bridge/src/chat-events.ts
apps/bridge/src/grodex-agent.ts
apps/bridge/scripts/smoke-chat.ts
apps/web/src/TextRoll.tsx
apps/web/src/ToolTimeline.tsx
apps/web/src/AgentActivityStrip.tsx
apps/web/src/useChatSession.ts
apps/web/src/ChatTranscript.tsx
apps/web/src/App.tsx
apps/web/src/api.ts
apps/web/src/styles.css
docs/G3b-timeline-slice.md
README.md
```

## Remaining gaps (G3+)

- Full agent-pane ToolTimeline (diffs, expand bodies, group summary)
- LiveProcessStack / sealed process packs
- Subagent task cards + WorkingPill
- Permission prompts (bridge still auto-approves)
- Session jsonl history replay
- Multi-session SSE fan-out
