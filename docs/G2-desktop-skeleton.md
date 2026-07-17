# G2 — Desktop skeleton

Minimal in-tree Desktop stack: **web + bridge + Tauri**. Proves one Core session over ACP stdio using the forked binary `target/release/xai-grok-pager`.

## Prerequisites

```sh
# Core binary (from repo root)
cargo build -p xai-grok-pager-bin --release
# → target/release/xai-grok-pager

# Node deps (from apps/)
cd apps && npm install
```

Optional env:

| Variable | Default |
|----------|---------|
| `GRODEX_BIN` | `<repo>/target/release/xai-grok-pager` |
| `GRODEX_BRIDGE_HOST` | `127.0.0.1` |
| `GRODEX_BRIDGE_PORT` | `8790` |

## Run (browser — fastest proof)

Terminal 1 — bridge:

```sh
cd apps && npm run dev:bridge
```

Terminal 2 — web UI:

```sh
cd apps && npm run dev:web
```

Open http://127.0.0.1:5174 → **Connect Core session**. You should see **Connected** and a Core `sessionId`.

Or both at once:

```sh
cd apps && npm run dev
```

## Run (Tauri desktop)

```sh
cd apps && npm install
cd apps && npm run desktop:dev
```

Tauri starts the bridge sidecar (`tsx apps/bridge/src/index.ts`) and loads the Vite dev URL on port **5174**.

## Smoke (ACP handshake, no UI)

```sh
cd apps && npm run smoke:acp
```

Prints JSON with `sessionId`, `attachMode`, and `alive`.

Optional resume probe:

```sh
GRODEX_SMOKE_SESSION_ID=<uuid-from-cli> npm run smoke:acp
```

## Session attach

Bridge flow (`apps/bridge/src/grodex-agent.ts`):

1. Spawn `GRODEX_BIN agent stdio`
2. ACP `initialize`
3. If caller passes `sessionId` → **`session/load`** (preferred — true Core UUID continuity)
4. If load fails → **`session/new`** (transitional fallback for G2; **no** history-digest fake resume)

HTTP API (bridge on `:8790`):

| Method | Path | Body | Result |
|--------|------|------|--------|
| GET | `/health` | — | bridge + bin + session status |
| GET | `/api/session/status` | — | current session state |
| POST | `/api/session/connect` | `{ "cwd"?: string, "sessionId"?: string }` | `{ sessionId, attachMode, cwd, bin }` |
| POST | `/api/session/disconnect` | — | stops agent child |

### Getting a session id from CLI

```sh
./target/release/xai-grok-pager --session-id "$(uuidgen)" -p "hello"
# session id is stored under ~/.grok/sessions/ — use the UUID you passed or pick from TUI /resume
```

Paste that UUID into the web field **Resume sessionId** to exercise `session/load`.

## Layout

```
apps/
  bridge/     Node ACP client + HTTP API
  web/        Vite + React shell (Connected / sessionId)
  desktop/    Tauri 2 host
  package.json  workspaces + dev:bridge / dev:web
```

G3 will port richer UI from agent-pane. This skeleton intentionally stays thin.
