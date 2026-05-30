# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A single-page tournament board for a children's football tournament ("Puchar Felka"), self-hosted on a LAN. A Node.js server hosts static files, exposes a tiny JSON API backed by MongoDB, and pushes live updates over Server-Sent Events so every viewer's screen updates in real time. Supports two tournament formats: round-robin **groups** and an 8-player single-elimination **bracket**. The UI is in Polish.

## Commands

```bash
docker compose up --build      # full stack (app + MongoDB) → http://localhost:3000

# Local dev without Docker (needs a reachable MongoDB):
npm install
MONGODB_URI=mongodb://127.0.0.1:27017 node server.js   # or: npm start
PORT=8080 node server.js        # env overrides config.json port
```

There is no build step, no linter, and no test suite. The only runtime dependency is the `mongodb` driver (Node.js ≥ 18). After starting, the console prints the localhost and LAN URLs. Stop with Ctrl+C (or `docker compose down`).

Verifying changes end-to-end uses Docker: `docker compose up --build -d`, then hit the API (e.g. `curl localhost:3000/api/data`), then `docker compose down -v`. To avoid the host port 3000 colliding with a locally-running server, layer an override file mapping a different host port.

## Architecture

Four moving parts: HTTP/SSE server, data layer, the frontend, and Mongo.

- **`server.js`** — the HTTP layer (plain `http`, no framework). Serves `public/` statically with a path-traversal guard against escaping `PUBLIC_DIR`. Endpoints:
  - `GET /api/data` → full tournament document, assembled from collections by `db.readTournament()`.
  - `POST /api/data` → validates JSON, calls `db.writeTournament()`, then broadcasts a `data` SSE event. Requires header `x-edit-pin` matching the configured PIN (skipped if PIN empty).
  - `GET /api/events` → SSE stream with two event types: **`data`** (data changed → viewers reload) and **`reload`** (a file in `public/` changed → browser live-reload; `fs.watch` on `public/`, debounced ~120ms).
  - `GET /api/health` → `{ok:true}` (used by the Docker healthcheck).
  - `GET /logo.png` → serves `data/images/logo.png`, which lives **outside** `public/` (the static handler won't reach it), via a dedicated fixed route.
  - Boot sequence (`start()`): connect to Mongo (with retry — the DB container may come up later), seed an empty default tournament if the DB is empty, *then* listen.
- **`db.js`** — the MongoDB data layer. Single-tournament app: everything is scoped to a fixed id `TID = 'main'`. **Normalized schema** — `groups`, `teams`, `matches` are separate collections; `tournaments` holds metadata + settings + mode + the embedded `bracket` blob; `backups` keeps the last 20 full-document snapshots. `readTournament()` joins the collections back into the exact JSON shape the frontend expects; `writeTournament()` decomposes the posted document (delete-then-insert per collection — **not** transactional; fine for a single LAN editor). The API contract is unchanged from the old file-based version, so the frontend never had to change.
- **`public/app.js`** — the whole frontend as one IIFE, no framework. Fetches state from `/api/data`, renders read-only or edit views. Edits mutate the in-memory `state` object and call `scheduleSave()` (700ms debounce) which POSTs the *entire* state back. Two modes (`state.mode`):
  - **groups**: `computeStandings()` is the scoring core — points from `settings` (win/draw/loss), sorted by **points → goal difference → goals scored → name** (Polish collation).
  - **bracket**: 8-player knockout, QF → SF → Final + 3rd-place match. `resolveBracket()` computes each round's participants from prior-round winners/losers; only the QF stores explicit participants, the rest are derived. A drawn knockout match yields no winner (downstream slots stay empty, with a warning). On a score edit, only *downstream* columns are rebuilt (`refreshDownstream()`) so the focused input keeps focus.

### Tournament data shape

`{ tournamentName, year, subtitle, mode:'groups'|'bracket', settings:{pointsWin,pointsDraw,pointsLoss,qualifyCount}, groups:[{id,name,teams:[{id,name}],matches:[{id,homeId,awayId,homeScore,awayScore,played}]}], bracket:{players:[{id,name}], qf:[…4 with homeId/awayId], sf:[…2], final:{}, third:{}}, updatedAt }`. All `id`s are client-generated strings (`uid()`); the DB preserves them as a field rather than using Mongo `_id`.

### Live-sync / edit flow (the non-obvious part)

The server is the broadcast hub but holds no per-client state beyond the SSE connection set. The client distinguishes its *own* writes from others' using a `suppressEvents` flag set around `saveNow()`, so a `data` event triggered by your own POST doesn't clobber an in-progress edit. While `editMode` is on, incoming `data` events are ignored entirely. The PIN lives only in the browser (`editPin` var), sent per-request — there is no session/login.

The PIN protection is **intentionally lightweight** — it's for a trusted local network, not the public internet. Don't treat the edit PIN as real authentication. In Docker, Mongo's port is deliberately not published (only the app reaches it).

## Configuration

`config.json` holds `{ port, editPin }`. Env vars override: `PORT`, `EDIT_PIN` (empty disables edit protection), `MONGODB_URI` (default `mongodb://127.0.0.1:27017`), `MONGODB_DB` (default `puchar_felka`). `docker-compose.yml` sets these for the app container.
