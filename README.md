# grodex

**grodex** is a personal product fork of [Grok Build](https://github.com/xai-org/grok-build): one **Agent Core**, three faces — **CLI**, **Desktop**, and **API** — in the same shape as Claude Code / Codex.

> Not an official xAI / SpaceXAI product. Upstream remains [xai-org/grok-build](https://github.com/xai-org/grok-build).

```
              Agent Core
         (loop / tools / sessions)
                    |
        ┌───────────┼───────────┐
        │           │           │
       CLI        Desktop      API
   (TUI/headless) (full window) (stdio / serve / ACP)
```

| Surface | Role |
|---------|------|
| **Core** | Turns, tools, session UUID — primarily upstream `xai-grok-shell` + tools |
| **CLI** | First-class daily path; target binary name `grodex` (early builds may still be upstream artifact names) |
| **Desktop** | Cursor-like full window; **first-party** face of Core (same session id as CLI) |
| **API** | `grok agent stdio` / `serve` (ACP) for scripts and embedders |

**Hard rule:** one conversation ⇒ one Core session UUID. Desktop must not rely long-term on ACP `session/new` + history-digest fake resume.

Design write-up (also mirrored in the UI materials repo):  
[agent-pane `2026-07-17-grodex-design.md`](https://github.com/noctisyuan123-lgtm/agent-pane/blob/main/docs/superpowers/specs/2026-07-17-grodex-design.md)

UI materials (not the Core host): [`noctisyuan123-lgtm/agent-pane`](https://github.com/noctisyuan123-lgtm/agent-pane).

---

## Status

| Phase | Outcome |
|-------|---------|
| **G0** | Done — this fork + product README |
| **G1** | Done — CLI `cargo build --release`; surface notes in `docs/G1-*.md` |
| **G2** | Done — Desktop skeleton under `apps/`; see `docs/G2-desktop-skeleton.md` |
| **G3** | **Partial — chat + timeline + subagent UI** (`docs/G3-chat-slice.md`, `docs/G3b-timeline-slice.md`, `docs/G3c-subagent-slice.md`): connect + prompt + SSE + TextRoll/tool timeline/activity strip + subagent cards/WorkingPill; full process stack still deferred |
| **G4** | Drop digest-resume; upstream sync playbook |

v1 data/auth: keep **`~/.grok`** for compatibility (branding is the app/CLI name).

Upstream sync: occasional; divergence is accepted for this product fork.

---

## Build (CLI / upstream harness)

Same toolchain notes as upstream: Rust (see `rust-toolchain.toml`), [DotSlash](https://dotslash-cli.com) on `PATH` for hermetic `bin/protoc` (PATH `protoc` works as fallback), then:

```sh
# If git deps fail through a dead local proxy:
export CARGO_NET_GIT_FETCH_WITH_CLI=true NO_PROXY='*' no_proxy='*'
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy

cargo check -p xai-grok-pager-bin
cargo build -p xai-grok-pager-bin --release
# → target/release/xai-grok-pager   (clap name: grok; product rename → grodex later)
```

Resume / ACP flags: [`docs/G1-cli-surface.md`](docs/G1-cli-surface.md). Build log: [`docs/G1-build-notes.md`](docs/G1-build-notes.md).

Desktop (G2) lives under `apps/` — run notes in [`docs/G2-desktop-skeleton.md`](docs/G2-desktop-skeleton.md). G3 chat: [`docs/G3-chat-slice.md`](docs/G3-chat-slice.md). G3b timeline/activity: [`docs/G3b-timeline-slice.md`](docs/G3b-timeline-slice.md). G3c subagents: [`docs/G3c-subagent-slice.md`](docs/G3c-subagent-slice.md).

---

## Repository layout (upstream)

| Path | Contents |
|------|----------|
| `crates/codegen/xai-grok-pager-bin` | Binary composition root |
| `crates/codegen/xai-grok-pager` | TUI |
| `crates/codegen/xai-grok-shell` | Agent runtime + stdio/headless |
| `crates/codegen/xai-grok-tools` | Tools |
| `crates/codegen/xai-grok-workspace` | FS / VCS / execution |

Root `Cargo.toml` is generated upstream-style — prefer editing per-crate manifests.

---

## License

First-party code follows upstream **Apache License 2.0** (`LICENSE`). Third-party / vendored notices: `THIRD-PARTY-NOTICES`.
