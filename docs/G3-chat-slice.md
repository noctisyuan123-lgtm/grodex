# G3 — Chat slice

First shippable Desktop chat path: **connect → prompt → streamed assistant updates** over the G2 bridge, with a minimal React UI and same-UUID `session/load` resume.

## What's in this slice

| Layer | Delivered |
|-------|-----------|
| **Bridge** | `POST /api/session/prompt`, `GET /api/session/stream` (SSE), optional `GET /api/sessions`, `POST /api/session/cancel` |
| **Web** | Sidebar (resume id + recent Core sessions), chat transcript, composer, minimal markdown |
| **Proof** | `npm run smoke:chat` — connect + prompt + SSE event capture |

**Not in G3** (later slices): TextRoll, subagent cards, tool timeline polish, permissions UI, history replay from jsonl, Tauri-specific chrome.

## Streaming transport: SSE

G3 uses **Server-Sent Events** (not WebSocket):

```
GET /api/session/stream
Content-Type: text/event-stream
```

Each line is `data: <json>\` where `<json>` is a `ChatEvent`:

| type | meaning |
|------|---------|
| `user` | User turn appended (from bridge before ACP prompt) |
| `assistant_chunk` | Incremental assistant text from ACP `session/update` |
| `assistant_done` | Turn sealed (prompt RPC returned or error path) |
| `status` | Ephemeral status (`Waiting for model…`, tool/thought hints) |
| `tool` | Tool start/end (minimal chip in UI) |
| `error` | Turn-level error message |

The web client uses `EventSource` (`apps/web/src/api.ts` → `openSessionStream`).

Rationale: single-session G3 does not need bidirectional WS yet; SSE is simpler to proxy and documents cleanly in smoke scripts.

## HTTP API (bridge `:8790`)

| Method | Path | Body / query | Result |
|--------|------|--------------|--------|
| GET | `/health` | — | bridge + bin + session status |
| GET | `/api/session/status` | — | current session state |
| GET | `/api/sessions` | `?cwd=&limit=` | recent sessions from `~/.grok/sessions` (best-effort) |
| GET | `/api/session/stream` | — | **SSE** chat events |
| POST | `/api/session/connect` | `{ "cwd"?, "sessionId"? }` | `{ sessionId, attachMode, cwd, bin }` |
| POST | `/api/session/prompt` | `{ "text": "..." }` | `{ ok: true }` when prompt RPC completes |
| POST | `/api/session/cancel` | — | notifies Core `session/cancel` |
| POST | `/api/session/disconnect` | — | stops agent child |

### Same-UUID attach

When `sessionId` is provided, bridge tries **`session/load`** first (`apps/bridge/src/grodex-agent.ts`). On failure it falls back to **`session/new`** — no history-digest fake resume (chief designer decision).

## Run (browser)

Terminal 1:

```sh
cd apps && npm run dev:bridge
```

Terminal 2:

```sh
cd apps && npm run dev:web
```

Open http://127.0.0.1:5174 → **Connect** → type a message → **Send**.

Optional: pick a **Recent** session (scanned from `~/.grok/sessions`) or paste a UUID in **Resume by id**.

## Smoke

ACP handshake only (G2):

```sh
cd apps && npm run smoke:acp
```

Chat wiring (G3 — spawns ephemeral bridge on port **8799**):

```sh
cd apps && npm run smoke:chat
```

Expect JSON summary with `gotUser: true`. A live model reply also yields `gotAssistantChunk: true` when network/auth allow.

If auth blocks the model, smoke still proves:

1. Bridge HTTP connect
2. SSE client attach
3. Prompt RPC dispatch
4. User event on the stream

Document any auth failure in `lastError` in the smoke output.

## Auth / network caveats

Real assistant traffic requires a logged-in Grok Build Core (`grok login` / valid credentials in `~/.grok`). Without auth:

- Connect + `session/new` may still succeed
- `session/prompt` may error or time out
- UI shows the error; SSE wiring remains valid

## Remaining G3+ gaps

- Rich tool timeline (agent-pane `ToolTimeline`, live process stack)
- TextRoll / streaming typography
- Subagent task cards
- Permission prompts (bridge auto-approves in G3)
- Full history open/replay from session jsonl
- Multi-session bridge fan-out (WS hub like agent-pane)
- Context usage ring, model/mode picker

## Files touched

```
apps/bridge/src/grodex-agent.ts      prompt + session/update → ChatEvent
apps/bridge/src/session-store.ts     prompt/cancel + SSE fan-out
apps/bridge/src/grok-sessions-index.ts
apps/bridge/src/event-hub.ts
apps/bridge/src/chat-events.ts
apps/bridge/scripts/smoke-chat.ts
apps/web/src/App.tsx
apps/web/src/useChatSession.ts
apps/web/src/ChatTranscript.tsx
apps/web/src/api.ts
apps/web/src/styles.css
```
