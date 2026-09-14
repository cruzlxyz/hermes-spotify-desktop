"""Spotify remote REST API for the ``spotify-desktop`` plugin.

Reuses the bundled Spotify agent client (``plugins.spotify.client``) so token
refresh, the 401 retry, and error mapping are inherited from the existing
Hermes Spotify integration (``hermes auth spotify`` / ``providers.spotify`` in
``auth.json``). The dashboard web server mounts this router under
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

from plugins.spotify.client import SpotifyClient, SpotifyError

router = APIRouter()
_client = SpotifyClient()


def _call(fn, *args, **kwargs) -> Dict[str, Any]:
    try:
        return {"ok": True, "data": fn(*args, **kwargs)}
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc), "status_code": getattr(exc, "status_code", None)}


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
    """Full playback state: item, progress, device, shuffle/repeat."""
    return _call(_client.get_playback_state)


@router.get("/devices")
async def devices():
    res = _call(_client.request, "GET", "/me/devices")
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
        body["uris"] = [payload["uri"]]
    if payload.get("uris"):
        body["uris"] = list(payload["uris"])[:50]
    if payload.get("position_ms") not in (None, ""):
        body["position_ms"] = int(payload["position_ms"])
    if payload.get("offset"):
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


@router.get("/search")
async def search(q: str, type: str = "track", limit: int = 8):
    return _call(_client.request, "GET", "/search", params={"q": q, "type": type, "limit": max(1, min(20, limit))})


@router.get("/playlists")
async def playlists(limit: int = 20):
    return _call(_client.request, "GET", "/me/playlists", params={"limit": max(1, min(50, limit))})
