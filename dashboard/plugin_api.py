"""Spotify remote REST API for the ``spotify-desktop`` plugin.

Reuses the Hermes Spotify client so token refresh, the 401 retry, and error
mapping are inherited from the Hermes Spotify integration (``providers.spotify``
in ``auth.json``). That client lives in the official ``spotify`` plugin
(``hermes plugins install spotify``, login with ``hermes spotify login``);
Hermes releases that still bundle Spotify in core ship it as
``plugins.spotify.client``, which is used as a fallback. The dashboard web server mounts this router under
``/api/plugins/spotify-desktop/`` at startup; as a user plugin it must be
listed in ``plugins.enabled`` (the same trust gate every user plugin has).

Every endpoint answers ``{"ok": true, "data": ...}`` or
``{"ok": false, "error": "<message>"}`` so the desktop player and the web tab
can render a friendly line instead of surfacing raw 5xx bodies. Mutating
endpoints accept their payload from the JSON body **or** query parameters —
both UIs call these with slightly different fetch plumbing.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Request



def _load_spotify_client():
    """``(SpotifyClient, SpotifyError)`` from the ``spotify`` plugin the agent loaded, else from the
    copy older Hermes releases bundled in core."""
    import importlib

    try:
        from hermes_cli.plugins import discover_plugins, get_plugin_manager

        discover_plugins()
        loaded = get_plugin_manager()._plugins.get("spotify")
        module = getattr(loaded, "module", None) if loaded is not None and loaded.enabled else None
        if module is not None:
            client = importlib.import_module(f"{module.__name__}.spotify_client")
            return client.SpotifyClient, client.SpotifyError
    except ImportError:
        pass
    try:
        from plugins.spotify.client import SpotifyClient, SpotifyError  # Hermes with Spotify in core

        return SpotifyClient, SpotifyError
    except ImportError as exc:
        raise ImportError(
            "spotify-desktop needs the 'spotify' plugin: run `hermes plugins install spotify`, "
            "then `hermes spotify login`"
        ) from exc


SpotifyClient, SpotifyError = _load_spotify_client()

router = APIRouter()

class _LazySpotifyClient:
    """Build the client on first use so a missing login doesn't break the mount."""

    _inner = None

    def __getattr__(self, name):
        if _LazySpotifyClient._inner is None:
            _LazySpotifyClient._inner = SpotifyClient()
        return getattr(_LazySpotifyClient._inner, name)

_client = _LazySpotifyClient()

PLUGIN_NAME = "spotify-desktop"
_DEFAULT_SETTINGS = {"poll_interval_open": 4, "poll_interval_closed": 12}


def _plugin_settings() -> Dict[str, Any]:
    """Read ``plugins.entries.spotify-desktop.settings`` via Hermes' official
    plugin-settings mechanism (config_schema lives in plugin.yaml). Falls back
    to defaults on any failure — settings must never break the player."""
    merged = dict(_DEFAULT_SETTINGS)

    try:
        from hermes_cli.config import load_config_readonly
        from hermes_cli.plugins import _plugin_settings_entry

        entry = _plugin_settings_entry(load_config_readonly() or {}, PLUGIN_NAME) or {}
        settings = entry.get("settings") or {}

        for key in _DEFAULT_SETTINGS:
            if key in settings:
                merged[key] = max(1, int(float(settings[key])))
    except Exception:
        pass

    return merged


def _call(fn, *args, **kwargs) -> Dict[str, Any]:
    try:
        return {"ok": True, "data": fn(*args, **kwargs)}
    except Exception as exc:
        status = getattr(exc, "status_code", None)
        res: Dict[str, Any] = {"ok": False, "error": str(exc), "status_code": status}
        if type(exc).__name__ == "SpotifyAuthRequiredError" or status == 401:
            res["auth_required"] = True
        return res


async def _payload(request: Request) -> Dict[str, Any]:
    """Merge query params with an optional JSON body (body wins on conflicts)."""
    payload: Dict[str, Any] = dict(request.query_params)
    try:
        body = await request.json()
        if isinstance(body, dict):
            payload.update(body)
    except Exception:
        pass
    return payload


def _device_params(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"device_id": payload["device_id"]} if payload.get("device_id") else None


@router.get("/player")
async def player():
    """Full playback state: item, progress, device, shuffle/repeat + settings."""
    res = _call(_client.get_playback_state)
    res["settings"] = _plugin_settings()
    return res


@router.get("/config")
async def get_config():
    return {"ok": True, "data": _plugin_settings()}


@router.get("/devices")
async def devices():
    res = _call(_client.request, "GET", "/me/player/devices")
    if res.get("ok") and not ((res.get("data") or {}).get("devices") or []):
        # Spotify quirk: /me/devices can be empty while /me/player knows the
        # active device — synthesize the row from the playback state.
        player_res = _call(_client.get_playback_state)
        if player_res.get("ok"):
            device = (player_res.get("data") or {}).get("device") or {}
            if device.get("id"):
                res = {"ok": True, "data": {"devices": [dict(device, is_active=True)]}}
    return res


@router.post("/play")
async def play(request: Request):
    """Resume, or start a context/track. Empty payload = resume on the active device."""
    payload = await _payload(request)
    body: Dict[str, Any] = {}
    if payload.get("context_uri"):
        body["context_uri"] = payload["context_uri"]
    if payload.get("uri"):
        # Single-track play via {"uris": [...]} can be silently ignored by
        # Spotify (204 but playback never starts, observed live). Resolving the
        # track's album and playing context_uri + offset starts reliably.
        track_uri = payload["uri"]
        try:
            track_id = str(track_uri).rsplit(":", 1)[-1]
            track = _client.request("GET", f"/tracks/{track_id}")
            album_uri = (track or {}).get("album", {}).get("uri")
            if album_uri:
                body["context_uri"] = album_uri
                body["offset"] = {"uri": track_uri}
            else:
                body["uris"] = [track_uri]
        except Exception:
            body["uris"] = [track_uri]
    if payload.get("uris"):
        body["uris"] = list(payload["uris"])[:50]
    if payload.get("position_ms") not in (None, ""):
        body["position_ms"] = int(payload["position_ms"])
    if payload.get("offset") and "offset" not in body:
        offset = payload["offset"]
        body["offset"] = {"uri": offset} if isinstance(offset, str) else {"position": int(offset)}
    return _call(_client.request, "PUT", "/me/player/play", params=_device_params(payload), json_body=body or None)


@router.post("/pause")
async def pause(request: Request):
    return _call(_client.request, "PUT", "/me/player/pause", params=_device_params(await _payload(request)))


@router.post("/next")
async def next_track(request: Request):
    return _call(_client.request, "POST", "/me/player/next", params=_device_params(await _payload(request)))


@router.post("/previous")
async def previous_track(request: Request):
    return _call(_client.request, "POST", "/me/player/previous", params=_device_params(await _payload(request)))


@router.put("/volume")
async def volume(request: Request):
    payload = await _payload(request)
    percent = max(0, min(100, int(float(payload.get("volume_percent", 0) or 0))))
    return _call(
        _client.request, "PUT", "/me/player/volume",
        params={"volume_percent": percent, **(_device_params(payload) or {})},
    )


@router.put("/transfer")
async def transfer(request: Request):
    """Move playback to a Spotify Connect device."""
    payload = await _payload(request)
    device_id = payload.get("device_id")
    if not device_id:
        return {"ok": False, "error": "device_id is required"}
    return _call(_client.request, "PUT", "/me/player", json_body={"device_ids": [device_id], "play": str(payload.get("play", "true")).lower() != "false"})


@router.get("/queue")
async def queue():
    return _call(_client.request, "GET", "/me/player/queue")


@router.post("/queue")
async def queue_add(request: Request):
    payload = await _payload(request)
    uri = payload.get("uri")
    if not uri:
        return {"ok": False, "error": "uri is required"}
    return _call(_client.request, "POST", "/me/player/queue", params={"uri": uri, **(_device_params(payload) or {})})


@router.put("/shuffle")
async def shuffle(request: Request):
    payload = await _payload(request)
    raw = str(payload.get("state", "false")).lower()
    state = raw in ("1", "true", "yes", "on")
    return _call(
        _client.request, "PUT", "/me/player/shuffle",
        params={"state": "true" if state else "false", **(_device_params(payload) or {})},
    )


@router.put("/repeat")
async def repeat(request: Request):
    payload = await _payload(request)
    state = payload.get("state", "off")
    if state not in ("off", "context", "track"):
        return {"ok": False, "error": "state must be one of off/context/track"}
    return _call(
        _client.request, "PUT", "/me/player/repeat",
        params={"state": state, **(_device_params(payload) or {})},
    )


@router.put("/seek")
async def seek(request: Request):
    payload = await _payload(request)
    try:
        position = max(0, int(float(payload.get("position_ms", 0) or 0)))
    except (TypeError, ValueError):
        return {"ok": False, "error": "position_ms must be a number"}
    return _call(
        _client.request, "PUT", "/me/player/seek",
        params={"position_ms": position, **(_device_params(payload) or {})},
    )


@router.get("/recent")
async def recent(limit: int = 1):
    """Recently played tracks — the idle player's resume target and the Recent list."""
    return _call(_client.request, "GET", "/me/player/recently-played", params={"limit": max(1, min(20, limit))})


def _uri_list(raw: Any) -> list:
    if isinstance(raw, (list, tuple)):
        items = [str(u).strip() for u in raw]
    else:
        items = [u.strip() for u in str(raw or "").split(",")]
    return [u for u in items if u.startswith("spotify:")][:40]


@router.get("/library/contains")
async def library_contains(uris: str = ""):
    """Which of ``uris`` are saved in the user's library (``[bool, ...]``)."""
    items = _uri_list(uris)
    if not items:
        return {"ok": False, "error": "uris is required"}
    return _call(_client.request, "GET", "/me/library/contains", params={"uris": ",".join(items)})


@router.put("/library")
async def library_save(request: Request):
    items = _uri_list((await _payload(request)).get("uris"))
    if not items:
        return {"ok": False, "error": "uris is required"}
    return _call(_client.request, "PUT", "/me/library", params={"uris": ",".join(items)})


@router.delete("/library")
async def library_remove(request: Request):
    items = _uri_list((await _payload(request)).get("uris"))
    if not items:
        return {"ok": False, "error": "uris is required"}
    return _call(_client.request, "DELETE", "/me/library", params={"uris": ",".join(items)})


@router.get("/playlists/{playlist_id}/items")
async def playlist_items(playlist_id: str, limit: int = 50, offset: int = 0):
    """Tracks of one playlist. Spotify only returns items for playlists the user owns or collaborates on."""
    if not playlist_id.replace("_", "").isalnum():
        return {"ok": False, "error": "invalid playlist id"}
    return _call(
        _client.request, "GET", f"/playlists/{playlist_id}/items",
        params={"limit": max(1, min(50, limit)), "offset": max(0, offset)},
    )


def _safe_id(value: str) -> bool:
    return bool(value) and value.replace("_", "").isalnum()


@router.get("/me")
async def me():
    """The signed-in account (id + display name) — used for the Liked Songs context URI."""
    res = _call(_client.request, "GET", "/me")
    if res.get("ok"):
        data = res.get("data") or {}
        res["data"] = {"id": data.get("id"), "display_name": data.get("display_name"), "uri": data.get("uri")}
    return res


@router.get("/saved")
async def saved_tracks(limit: int = 50, offset: int = 0):
    """The user's Liked Songs."""
    return _call(_client.request, "GET", "/me/tracks", params={"limit": max(1, min(50, limit)), "offset": max(0, offset)})


@router.get("/albums/{album_id}")
async def album(album_id: str):
    if not _safe_id(album_id):
        return {"ok": False, "error": "invalid album id"}
    return _call(_client.request, "GET", f"/albums/{album_id}")


@router.get("/artists/{artist_id}/albums")
async def artist_albums(artist_id: str, limit: int = 20):
    if not _safe_id(artist_id):
        return {"ok": False, "error": "invalid artist id"}
    return _call(
        _client.request, "GET", f"/artists/{artist_id}/albums",
        params={"include_groups": "album,single", "limit": max(1, min(50, limit))},
    )


_SEARCH_TYPES = {"track", "album", "artist", "playlist"}


@router.get("/search")
async def search(q: str, type: str = "track", limit: int = 8):
    # Spotify capped search at 10 results per type in the February 2026 API change.
    types = ",".join(t for t in dict.fromkeys(type.split(",")) if t in _SEARCH_TYPES) or "track"
    return _call(_client.request, "GET", "/search", params={"q": q, "type": types, "limit": max(1, min(10, limit))})


@router.get("/playlists")
async def playlists(limit: int = 20):
    return _call(_client.request, "GET", "/me/playlists", params={"limit": max(1, min(50, limit))})
