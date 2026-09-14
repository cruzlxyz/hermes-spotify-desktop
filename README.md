# spotify-desktop

A Spotify **remote** for Hermes Desktop, styled after the bundled Radio plugin:
a mini player in the status bar plus a picker popover. Audio keeps playing
through your Spotify apps (Spotify Connect) — the desktop app cannot decrypt
Spotify's DRM stream, so this plugin drives your devices instead of replacing
them.

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
│   ├── plugin_api.py     ← FastAPI router mounted at /api/plugins/spotify-desktop/
│   └── dist/index.js     ← optional web-dashboard page (tab hidden by default)
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

## Desktop-only or dashboard-only install

The package is two halves sharing one backend API:

- `desktop/plugin.js` — the Hermes Desktop status-bar player
- `dashboard/` — the backend API (`plugin_api.py`) plus the optional web-dashboard tab

**This repo ships desktop-only by default**: `dashboard/manifest.json` sets
`"tab": { "hidden": true }` — an official manifest option that keeps the plugin
registered and its API mounted (the desktop player needs it) while adding no
tab to the web dashboard sidebar.

**Bring back the full web page:** change the tab line in
`dashboard/manifest.json` to:

```json
"tab": { "path": "/spotify", "position": "after:kanban" },
```

and restart the backend — plugin discovery happens at startup.

**Dashboard only (no desktop player):** skip or delete the `desktop/` folder.
Nothing materializes into the desktop app; the web page keeps working.

You cannot skip `dashboard/` entirely: the desktop player reads its data from
`/api/plugins/spotify-desktop/*`, which only mounts through
`dashboard/manifest.json` + `plugin_api.py`. The API is invisible plumbing in
the web UI — hiding the tab is what makes the web side "gone".

## Notes

- No client secrets, no extra OAuth flow — the plugin piggybacks on Hermes's
  PKCE login (`providers.spotify` in `auth.json`).
- The web dashboard has no Spotify tab by default; re-enable it with the tab
  line above if you want the full browser remote.
