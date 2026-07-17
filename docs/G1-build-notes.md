# G1: xai-grok-pager-bin compile notes

Date: 2026-07-18 (local)

## Toolchain

| Tool | Status |
|------|--------|
| `rustc` | 1.92.0 (ded5c06cf 2025-12-08) — pinned by `rust-toolchain.toml` |
| `cargo` | 1.92.0 (344c4567c 2025-10-21) |
| `dotslash` | **Not installed** (`which dotslash` empty). `bin/protoc` dotslash wrapper fails; build uses PATH fallback (`/opt/anaconda3/bin/protoc`, libprotoc 29.3). |

## Commands run

```bash
cd /Users/maybach/projects/grodex

# Initial attempts (failed — see blockers)
cargo check -p xai-grok-pager-bin

# Successful check (~4m 25s)
export CARGO_NET_GIT_FETCH_WITH_CLI=true NO_PROXY='*' no_proxy='*'
unset http_proxy https_proxy HTTP_PROXY HTTPS_PROXY ALL_PROXY all_proxy
cargo check -p xai-grok-pager-bin

# Successful release build (~4m 32s)
cargo build -p xai-grok-pager-bin --release
```

Logs: `/tmp/grodex-cargo-check2.log`, `/tmp/grodex-cargo-release.log`

## Result

**Success** — both `cargo check` and `cargo build --release` completed with exit code 0.

Release binary:

`/Users/maybach/projects/grodex/target/release/xai-grok-pager`

(~151 MB, crate `xai-grok-pager-bin`, binary name `xai-grok-pager`)

## First-failure summary (resolved for this run)

1. **Git deps via libgit2**: Cargo/libgit2 tried `127.0.0.1:7890` and could not fetch `nucleo` from GitHub (`revision … not found` / network failure).
   - **Workaround used**: `CARGO_NET_GIT_FETCH_WITH_CLI=true` so Cargo uses the `git` CLI (direct GitHub OK in this environment).
2. **dotslash**: Not required for this build because `protoc` on PATH satisfies proto build scripts after `bin/protoc` fallback.

## Next blockers / follow-ups

- Document or script env for fresh clones: `CARGO_NET_GIT_FETCH_WITH_CLI=true` (and/or fix proxy so libgit2/curl can reach crates.io/GitHub without a dead `127.0.0.1:7890`).
- Optional: `cargo install dotslash` so `bin/protoc` works without relying on system `protoc`.
- `rustup` reported partial toolchain recovery errors on first `rustc --version`; toolchain 1.92.0 was usable afterward — consider `rustup toolchain install 1.92.0-aarch64-apple-darwin` if installs flake again.
