# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page tournament standings board for a children's football tournament ("Puchar Felka"), self-hosted on a LAN. A zero-dependency Node.js server hosts static files, exposes a tiny JSON API, and pushes live updates over Server-Sent Events so every viewer's table updates in real time. The UI is in Polish.

## Commands

```bash
node server.js          # start the server (or: npm start)
PORT=8080 node server.js # override the port (env wins over config.json)
```

There is no build step, no linter, and no test suite — the server has **no external dependencies** (only Node.js ≥ 16 stdlib). After starting, the console prints the localhost and LAN URLs. Stop with Ctrl+C.

## Architecture

Three pieces and the data file:

- **`server.js`** — the entire backend (~240 lines, plain `http`). Serves `public/` statically (with a path-traversal guard against escaping `PUBLIC_DIR`), and exposes:
  - `GET /api/data` → raw contents of `data/tournament.json`
  - `POST /api/data` → validates JSON, stamps `updatedAt`, backs up the old file, writes, then broadcasts a `data` SSE event. Requires header `x-edit-pin` matching `config.json`'s `editPin` (skipped if the PIN is empty).
  - `GET /api/events` → SSE stream emitting two event types: **`data`** (tournament changed) and **`reload`** (a source file in `public/` changed → triggers browser live-reload). `fs.watch` on both `public/` and `data/` drives these, debounced ~120ms.
- **`public/app.js`** — the whole frontend as one IIFE, no framework. Fetches state from `/api/data`, renders read-only or edit views, and recomputes standings client-side. `computeStandings()` is the scoring core: points from `settings` (win/draw/loss), sorted by **points → goal difference → goals scored → name** (Polish collation). Edits mutate the in-memory `state` object and call `scheduleSave()` (700ms debounce) which POSTs the *entire* state back.
- **`data/tournament.json`** — the single source of truth. Hand-editable; the server watches it and pushes changes to all viewers. Shape: `{ tournamentName, year, subtitle, settings:{pointsWin,pointsDraw,pointsLoss,qualifyCount}, groups:[{ id, name, teams:[{id,name}], matches:[{id, homeId, awayId, homeScore, awayScore, played}] }] }`. Auto-backups go to `data/backups/` (last 20 kept).

### Live-sync / edit flow (the non-obvious part)

The server is the broadcast hub but holds no per-client state beyond the SSE connection set. The client distinguishes its *own* writes from others' using a `suppressEvents` flag set around `saveNow()`, so a `data` event triggered by your own POST doesn't clobber an in-progress edit. While `editMode` is on, incoming `data` events are ignored entirely. The PIN lives only in the browser (`editPin` var), sent per-request — there is no session/login.

The PIN protection is **intentionally lightweight** — it's for a trusted local network, not the public internet. Don't treat `editPin` as real authentication.

## Configuration

`config.json` holds `{ port, editPin }`. Set `editPin` to `""` to disable edit protection entirely. `PORT` env var overrides the configured port.
