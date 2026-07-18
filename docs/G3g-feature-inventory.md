# G3g — agent-pane feature inventory → grodex

Source inventory: agent-pane sidebar / home / chrome (2026-07-18).  
Full tables live in the explore transcript; this file is the **port decision**.

## Send / receive

| | agent-pane | grodex |
|---|---|---|
| Path | WS prompt + DomainEvents | REST prompt + SSE |
| Status | Full | **Works** (connect → send → stream); not hero composer UX |

## Port waves (chief designer)

### Wave A — now (UI + thin bridge) ✅
1. Sidebar top: New Agent, Open project, Enter path, Customize (stub OK)
2. Collapse + resize sidebar; Bridge status pill copy
3. Home hero composer: placeholder, Plan / Multitask pills, send ↑, model chip shell
4. Open history without live agent (reuse `fetchSessionHistory`); resume on send

**Shipped 2026-07-18:** pane shell in `@grodex/web`; bridge `GET/POST /api/recent`, `GET/POST /api/cwd`, `POST /api/folder-pick` (macOS); state under `~/.grodex/`.

### Wave B — bridge
1. `/api/recent` + folder-pick + enter path
2. History groups by cwd → Repositories tree
3. Session ⋯ pin/rename/delete (meta)
4. `permissionMode` / model+effort on connect

### Wave C — later
Attachments, Allow/Deny permissions, diffs rail, terminal/browser rails, Customize APIs, multitask multi-live, rewind/fork.

## Already in grodex
Skin tokens, session list (flat), connect/load, chat+tools+subagents, WorkingPill/RunningDock, Enter send.
