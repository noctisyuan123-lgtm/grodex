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

## Status (G0)

| Phase | Outcome |
|-------|---------|
| **G0** | This fork + product README |
| **G1** | CLI builds & runs from this tree; resume documented |
| **G2** | Desktop skeleton in-tree; start/attach one Core session |
| **G3** | Port agent-pane chat + tool timeline; same-UUID resume from Desktop |
| **G4** | Drop digest-resume; upstream sync playbook |

v1 data/auth: keep **`~/.grok`** for compatibility (branding is the app/CLI name).

Upstream sync: occasional; divergence is accepted for this product fork.

---

## Build (CLI / upstream harness)

Same toolchain notes as upstream: Rust (see `rust-toolchain.toml`), [DotSlash](https://dotslash-cli.com) on `PATH` for hermetic `bin/protoc`, then:

```sh
cargo check -p xai-grok-pager-bin
cargo run -p xai-grok-pager-bin
cargo build -p xai-grok-pager-bin --release
```

Official installs ship the binary as `grok`; this fork’s target CLI name is **`grodex`** (rename lands in a later phase).

Desktop is **not in tree yet** (starts G2).

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
