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

4. Spotify auth: `hermes auth spotify` (Premium required for playback control).

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
