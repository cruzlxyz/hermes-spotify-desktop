# spotify-desktop

A Spotify **remote** for Hermes Desktop: a mini player in the status bar plus a
picker popover. Audio keeps playing through your Spotify apps (Spotify
Connect) — the desktop app cannot decrypt Spotify's DRM stream, so this plugin
drives your devices instead of replacing them.

## What you get

- Status bar chip: now playing (track — artist), play/pause, next
- Popover panel with four views:
  - **Player** — artwork, track/artist, device + active state, progress bar,
    shuffle / previous / play-pause / next / repeat, volume slider, device
    transfer list
  - **Playlists** — your playlists; click one to start it
  - **Search** — track search; hover a row to play it now or add it to the queue
  - **Queue** — upcoming tracks; play one now
- Live progress between polls; polls every 4s with the popover open, 12s closed

## How it works

```
spotify-desktop/
├── dashboard/
│   ├── manifest.json     ← discovered by the web server (name + api mount)
│   └── plugin_api.py     ← FastAPI router mounted at /api/plugins/spotify-desktop/ (backend only — no web UI)
├── desktop/
│   └── plugin.js         ← the Hermes Desktop mini player (runtime door contract)
└── README.md
```

- `dashboard/plugin_api.py` reuses the **bundled Spotify agent client**
  (`plugins.spotify.client`) — token refresh, 401 retry, and error mapping come
  from the existing Hermes Spotify integration. No credentials are handled here.
- `desktop/plugin.js` follows the desktop runtime-plugin contract (default
  `HermesPlugin` export; imports only `@hermes/plugin-sdk`, `react`,
  `react/jsx-runtime`) and reads the API above via `ctx.rest`.

## Install

**Option A — Install from Git (GUI, both halves):** paste this repo's URL into
Settings ▸ Plugins ▸ **Install from Git**. The probe recognizes the unified
package and offers two checkboxes:

- **Desktop UI** — copies `desktop/` into the app's `desktop-plugins/` folder
- **Agent plugin** — installs the package into the profile's `plugins/` root
  (this is what carries `dashboard/plugin_api.py`) and enables it
  (`plugins.enabled`); accepting both materializes the desktop half from the
  installed package (no duplicate copies)

When the restart prompt appears, take it — the backend API mounts at startup.

**Option B — manual:**

1. Copy this folder into the Hermes plugins root:

   - Windows: `%LOCALAPPDATA%\hermes\plugins\spotify-desktop`
   - Linux/macOS: `~/.hermes/plugins/spotify-desktop`

   ```bash
   git clone https://github.com/cruzlxyz/hermes-spotify-desktop <HERMES_HOME>/plugins/spotify-desktop
   ```

2. Enable it (the user-plugin trust gate requires it before the backend API
   mounts):

   ```bash
   hermes plugins enable spotify-desktop
   # or add `spotify-desktop` under plugins.enabled in config.yaml
   ```

3. Restart Hermes Desktop. The desktop half is materialized automatically from
   `plugins/spotify-desktop/desktop/plugin.js` into `desktop-plugins/`, then
   enable **Spotify** in Capabilities ▸ Plugins if it is not already on.

4. Spotify auth: see [Spotify auth](#spotify-auth-one-time) below — it is
   independent of the install and can be done in either order.

## Spotify auth (one-time)

Install and Spotify auth are **independent** — do them in either order. The
plugin never touches credentials itself: it reads whatever Hermes already has
in `~/.hermes/auth.json` (`providers.spotify`), so once you log in, the player
starts working on its next poll — no restart needed.

```bash
hermes tools                 # toggle Spotify on — walks you through app setup
hermes auth spotify          # or run the login wizard directly
hermes auth status spotify   # verify
```

Spotify does not allow public third-party OAuth apps, so **every user creates
their own free Spotify developer app** during the wizard: any name and
description, leave the website field blank, add the redirect URI
`http://127.0.0.1:43827/spotify/callback`, and enable the **Web API** product.
Only the Client ID is required — PKCE uses no client secret. The refresh token
lives ~6 months; re-run the wizard if it gets revoked.

**What works without Premium:** search, playlists, library, device list, and
read-only playback state. **Premium** is required for the mutations this
remote is built for: play / pause / skip / seek / repeat / shuffle / volume /
queue-add / device transfer.

Troubleshooting quick hits: `403 no active device` → open Spotify on any
device first; `403 Premium required` → Free account calling a mutation; `204`
→ nothing is playing (normal, not an error); `429` → Spotify rate limit,
resets in ~30 seconds; repeated `401` → refresh token revoked, re-run
`hermes auth spotify`.

## Configuration

Settings live under `plugins.entries.spotify-desktop.settings` in `config.yaml`
(the official Hermes plugin-settings mechanism — all optional, sensible
defaults apply when the block is absent):

```yaml
plugins:
  enabled: [spotify-desktop]
  entries:
    spotify-desktop:
      settings:
        poll_interval_open: 4     # seconds between polls while the popover is open
        poll_interval_closed: 12  # seconds while closed
```

No environment variables are required — Spotify auth piggybacks on Hermes's
PKCE login (`hermes auth spotify`). The schema is declared in `plugin.yaml`
(`config_schema:`), so the loader warns about invalid values.

## Package structure

The package has two halves, each running in its own runtime:

| Folder | Runs in | What it is |
|---|---|---|
| `desktop/` | Hermes Desktop (Electron) | The status-bar mini player — the whole product |
| `dashboard/` | Hermes backend (Python) | The REST API (`plugin_api.py`) the player reads — no web UI ships here |

**Why is it called `dashboard/`?** Not a legacy name: Hermes requires every
plugin with a backend HTTP API to keep it in a `dashboard/` folder — the web
server only discovers `<name>/dashboard/manifest.json` and only mounts API
files inside that directory. The name comes from Hermes' backend process,
which doubles as its web-dashboard server.

**Desktop-focused by default.** `dashboard/manifest.json` sets
`"tab": { "hidden": true }` — an official manifest option that keeps the
plugin registered and its API mounted while adding nothing to the web
dashboard. The API routes stay reachable at `/api/plugins/spotify-desktop/*`
for anyone who wants to build their own browser remote (a full one exists in
git history at commit `20099d7`).

**Removing the desktop player** (rare): delete the `desktop/` folder — the
backend API keeps working. Removing `dashboard/`, however, is not possible:
the player reads its data from `/api/plugins/spotify-desktop/*`, which only
mounts through that folder. With the tab hidden, the web side is already
fully "gone".

## Notes

- No client secrets, no extra OAuth flow — the plugin piggybacks on Hermes's
  PKCE login (`providers.spotify` in `auth.json`).

## Compatibility note

The dashboard backend reuses Hermes' **bundled Spotify plugin** for auth:
`dashboard/plugin_api.py` imports `plugins.spotify.client` (token refresh, the
401 retry, and error mapping) and the private `_plugin_settings_entry` helper
from `hermes_cli.plugins` (settings lookup). These are internal seams that can
move between Hermes releases — if a Hermes update breaks them, this plugin
follows upstream shortly after. Everything else is self-contained.

