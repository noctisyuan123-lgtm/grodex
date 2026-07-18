# G3h — Search palette & Customize panel

Wave **G3h** adds a Cursor-style command palette and a real Customize panel to grodex web.

## Search

- **Open:** sidebar **Search** button, or **⌘K** / **Ctrl+K**
- **Placeholder:** `Search agents, files, actions...`
- **Filters:** All · Agents · Files · Actions (**⌘[** / **⌘]** cycle chips)
- **Keyboard:** ↑↓ select · ↵ open · Esc close
- **API:** `GET /api/search?q=` → `{ agents, files, actions }`
  - **Agents** — recent Grok sessions from `/api/sessions`
  - **Files** — best-effort scan of `~/.grok/memory`, remembered cwd, and recent project roots
  - **Actions** — New Agent, Open project…, Customize, Connect, Disconnect

**Open project…** remains the folder picker (`POST /api/folder-pick`). The old **Enter path…** sidebar entry is removed.

## Customize

- **Open:** sidebar **Customize**, or Search → action **Customize**
- **API:** `GET /api/customize/overview` — memory paths, rules (with inline read), skills, bridge status, MCP servers (read-only)
- **FS helpers:** `POST /api/fs/reveal`, `POST /api/fs/open` for Finder / default app
- **Sections:** Memory · Rules · Skills · Bridge status · MCP (edit in Wave C)

Ported slim from agent-pane `CustomizePanel.tsx` + bridge customize file discovery (`~/.grok/rules`, `~/.grok/memory`, `~/.grok/config.toml`).

## Dev

```bash
cd apps && npm run dev          # bridge :8790 + web :5173
cd apps && npm run build        # tsc bridge + vite web
```

Try Search with bridge running; Customize needs bridge for overview + open/reveal.
