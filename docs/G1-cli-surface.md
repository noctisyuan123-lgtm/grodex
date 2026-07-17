# G1 — CLI surface (from fork tree)

Captured 2026-07-18. Source of truth: upstream clap + user-guide in this repo.

## Build

```sh
cargo check -p xai-grok-pager-bin
cargo run -p xai-grok-pager-bin
cargo build -p xai-grok-pager-bin --release
```

- Package: `xai-grok-pager-bin` → binary artifact **`xai-grok-pager`**
- Clap / install name today: **`grok`** (symlink in install.sh)
- Product target name: **`grodex`** (rename not landed yet)

## Resume (same Core session UUID)

| Flag | Meaning |
|------|---------|
| `-r` / `--resume [SESSION_ID]` | Resume id, or latest in cwd if omitted |
| `-c` / `--continue` | Continue latest session in cwd |
| `-s` / `--session-id <UUID>` | Name a **new** session only (not for resume) |
| `--fork-session` | With `-r`/`-c`, fork to a new id |
| `--load <SESSION_ID>` | Hidden alias of `--resume` |
| TUI `/resume` | Picker |

Docs: `crates/codegen/xai-grok-pager/docs/user-guide/17-sessions.md`

## API / ACP

```sh
grok agent stdio      # ACP over stdio
grok agent serve      # WS ACP (default 127.0.0.1:2419)
grok agent headless
grok agent leader
```

`grok agent` with no subcommand → headless (not stdio).

ACP resume: `session/load` + `sessionId` (see same sessions guide).

## Desktop

No in-tree Desktop crate yet (G2).
