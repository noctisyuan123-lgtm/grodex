# G3i — Customize panel + hero model picker

Wave **G3i** wires editable Customize (MCP, hooks, rules/memory) and a Cursor-style model chip on the hero/follow-up composer.

## Bridge API

| Method | Path | Purpose |
|--------|------|---------|
| GET/PUT | `/api/customize/mcp` | Read/patch Grok `config.toml` MCP + Cursor `mcp.json` |
| GET/PUT/DELETE | `/api/customize/hooks` | List/create/edit/delete `~/.grok/hooks/*` |
| GET/PUT | `/api/customize/files` | Inline edit rules + `MEMORY.md` |

Implementation: `apps/bridge/src/customize-config.ts` (logic) + routes in `apps/bridge/src/index.ts`.

## Web UI

- **Customize** (sidebar): MCP cards (toggle, cmd, `MEM0_USER_ID`, masked env, Save Grok MCP), full Hooks CRUD, inline Rules/Memory edit via files PUT. **Memory / Rules / Skills** sections use Cursor-style accordions (collapsed by default); Hooks + MCP stay expanded.
- **Model chip** on composer: `Grok 4.5 Medium` style label, model list + per-model effort (Low/Medium/High + Fast). Tooltip: applies on next **New Agent** or reconnect.

Prefs in `localStorage`:

- `grodex-model`
- `grodex-effort-by-model` (per-model effort + fast)

## Agent spawn

On `POST /api/session/connect`, bridge passes `model` + `effort` to `grodex-agent`, which spawns:

```bash
grodex agent --model <id> --effort <level|minimal> stdio
```

Changing the chip does **not** hot-swap an active session — disconnect / New Agent / send-after-idle reconnect picks up the new model.

## Try it

```bash
cd /Users/maybach/grodex

# Terminal 1 — bridge
npm run dev -w @grodex/bridge

# Terminal 2 — web
npm run dev -w @grodex/web
```

1. Open the app → **Customize** in the sidebar: expand Memory/Rules, edit MCP toggles, create a hook.
2. On the home hero (or follow-up composer), click the model chip → pick model / Edit effort.
3. **New Agent** or send first message → bridge logs show `--model` / `--effort` on the spawned process.

## Build

```bash
npm run build -w @grodex/bridge
npm run build -w @grodex/web
```

Both must pass before merge.
