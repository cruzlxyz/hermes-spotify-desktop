## What

Adds `plugin-catalog/spotify-desktop.yaml` — a community entry for [spotify-desktop](https://github.com/cruzlxyz/hermes-spotify-desktop), a **Spotify Connect remote for Hermes Desktop**.

## The plugin

- **Desktop half** (`desktop/plugin.js`): a status-bar mini player — now playing, play/pause/next, shuffle/repeat, volume, device transfer, track search, playlists, and queue. Follows the runtime door contract (default `HermesPlugin` export; imports only `@hermes/plugin-sdk` + `react`).
- **Agent/backend half** (`dashboard/`): a small FastAPI router (`plugin_api.py`) mounted at `/api/plugins/spotify-desktop/*` that proxies the Spotify Web API through the bundled Hermes Spotify client — token refresh and auth come from the built-in integration (`hermes auth spotify`), and no credentials live in the plugin itself.
- **Desktop-focused**: `dashboard/manifest.json` sets `"tab": { "hidden": true }` — installing adds nothing visible to the web dashboard; the `dashboard/` folder is backend plumbing only.
- Optional config via `plugins.entries.spotify-desktop.settings`, declared in the `plugin.yaml` `config_schema` (poll intervals).

## Capabilities

No agent tools, hooks, middleware, or required env — the `capabilities:` block is intentionally all-empty and matches the pinned commit (`v0.1.1`, `b98b181f3496efe8331d017296c962195be14273`).

## Pin

- Repo: https://github.com/cruzlxyz/hermes-spotify-desktop
- Commit: `b98b181f3496efe8331d017296c962195be14273` (tag `v0.1.1`)
- Maintainer / submitter: @cruzlxyz (repo owner)

## Verification

`hermes auth spotify`, then `hermes plugins install spotify-desktop`, restart Hermes Desktop — the mini player appears in the status bar. Playback mutations require Spotify Premium; without auth the panel shows a clear auth-required hint instead of failing silently.
