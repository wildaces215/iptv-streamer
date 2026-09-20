# IPTV Streamer

Desktop IPTV player with playlist management — Electron + React + TypeScript.

**Made with [Claude Code](https://claude.com/claude-code)** — the entire application (architecture, main-process streaming pipeline, React UI, tests, packaging) was built in one session with Claude Code.

## Features
- **CRUD**: add/edit/delete channels and playlists; favorites; full-text search.
- **M3U import**: by URL or local file, with preview and idempotent re-import (user edits and favorites survive re-imports).
- **Playback**: HLS via hls.js; raw MPEG-TS / non-Chromium-codec streams are remuxed or transcoded to HLS by a helper ffmpeg process. All playback flows through a local loopback proxy that solves CORS and applies per-channel User-Agent/Referer overrides.

## Requirements
- Node 20+ (dev)
- ffmpeg for non-HLS streams — `sudo dnf install ffmpeg` (Fedora), `brew install ffmpeg` (mac), `winget install ffmpeg` (Windows). Pure-HLS playlists play without it.

## Develop
```bash
npm install
npm run dev
npm test          # vitest unit tests (M3U parser, HLS manifest rewriter)
npm run typecheck
```

## Package
```bash
npm run build:linux   # AppImage + rpm
```
`mac` (dmg) and `win` (nsis) targets are also configured; CI builds all three in parallel (`.github/workflows/build.yml`, triggered on `v*` tags).

## Architecture

Three Electron processes with a single typed IPC contract as the spine
(`src/shared/ipc-channels.ts` is imported by all of them, so a typo'd IPC
channel name is a compile error):

```
┌─────────────────────┐   contextBridge (window.api)   ┌──────────────────────────┐
│  Renderer (React)   │ ◄────────────────────────────► │  Preload (sandboxed)     │
│  hls.js player      │     invoke / events only       │  contextBridge + zod     │
│  zustand store      │                                └──────────────────────────┘
└─────────────────────┘                                          ▲ ipcMain.handle
                                                                 ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  Main process                                                                   │
│  ┌──────────────┐  ┌───────────────────────┐  ┌──────────────────────────────┐  │
│  │ SQLite       │  │ M3U import            │  │ Streaming                    │  │
│  │ better-      │  │ iptv-playlist-parser  │  │ probe → mode decision        │  │
│  │ sqlite3      │  │ transactional upsert  │  │ ffmpeg spawn (remux/encode)  │  │
│  │ WAL + FTS5   │  │ preserves user edits  │  │ loopback HTTP server         │  │
│  └──────────────┘  └───────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Playback pipeline
The one rule: **every `<video>` request goes through a loopback HTTP server
(`127.0.0.1`, ephemeral port) in the main process.** This solves three problems
at once — IPTV origins almost never send CORS headers, many require specific
`Referer`/`User-Agent` values, and Chromium would otherwise block cross-origin
media. No `webSecurity: false` anywhere.

```
channel click
  → probe (cache → extension → content-type sniff → ffprobe)
  → mode decision
      ├── HLS + h264/aac        → direct-hls:    hls.js ← /proxy?url=…  (manifest rewritten so nested URIs also go through /proxy)
      ├── MPEG-TS + h264/aac    → transcode-remux:    ffmpeg -c copy → 4s HLS segments in temp dir
      └── mpeg2/hevc/ac3/…      → transcode-reencode: ffmpeg → libx264 + aac → HLS
  → renderer plays http://127.0.0.1:<port>/hls/<session>/index.m3u8
```

Lifecycle: one stream at a time (channel switch stops the previous session),
SIGTERM → process-group SIGKILL teardown, 45 s idle watchdog, orphaned-ffmpeg
sweep on startup, session temp dirs deleted on stop. Non-Windows uses process
groups; Windows uses `taskkill /T /F`.

### Security
- Renderer fully sandboxed (`contextIsolation`, no node integration, strict CSP)
- Every IPC handler zod-validates its payload; the renderer is treated as untrusted
- Proxy rejects non-http(s) and loopback targets (SSRF guard)
- All permission requests denied; external navigation/popups blocked

### Storage
SQLite (`userData/iptv.db`) via better-sqlite3 with WAL: `playlists` and
`channels` (unique on `playlist_id + url` so re-import upserts instead of
duplicating), FTS5 full-text search with sync triggers, `app_settings`,
`watch_history`, and a derived `v_groups` view for channel groups. All SQL
sits behind repository modules so the driver could be swapped (e.g. to Node's
built-in `node:sqlite`) without touching call sites.

## Directory layout
```
src/shared/    types, IPC channel names, zod schemas (consumed by all processes)
src/main/      db/ (sqlite + repositories) · m3u/ (parse, fetch, upsert)
               stream/ (probe, ffmpeg args, loopback server, StreamManager)
src/preload/   contextBridge exposing the typed window.api
src/renderer/  React UI: zustand store, virtualized channel list, hls.js player
```