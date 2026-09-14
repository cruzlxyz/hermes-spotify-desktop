"""Spotify remote REST API for the Hermes Desktop ``spotify-desktop`` plugin.

Reuses the bundled Spotify agent client (``plugins.spotify.client``) so token
refresh, the 401 retry, and error mapping are inherited from the existing
Hermes Spotify integration (``hermes auth spotify`` / ``providers.spotify`` in
``auth.json``). The dashboard web server mounts this router under
``/api/plugins/spotify-desktop/`` at startup; as a user plugin it must be
listed in ``plugins.enabled`` (the same trust gate every user plugin has).

Every endpoint answers ``{"ok": true, "data": ...}`` or
``{"ok": false, "error": "<message>"}`` so the desktop player can render a
friendly line instead of surfacing raw 5xx bodies.
"""

from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Body

from plugins.spotify.client import SpotifyClient, SpotifyError

router = APIRouter()
_client = SpotifyClient()


def _call(fn, *args, **kwargs) -> Dict[str, Any]:
    try:
        return {"ok": True, "data": fn(*args, **kwargs)}
    except SpotifyError as exc:
        return {"ok": False, "error": str(exc), "status_code": getattr(exc, "status_code", None)}


def _device_params(payload: Dict[str, Any]) -> Dict[str, Any]:
    return {"device_id": payload["device_id"]} if payload.get("device_id") else None


@router.get("/player")
async def player():
    """Full playback state: item, progress, device, shuffle/repeat."""
    return _call(_client.get_playback_state)


@router.get("/devices")
async def devices():
    return _call(_client.request, "GET", "/me/devices")


@router.post("/play")
async def play(payload: Dict[str, Any] = Body(default={})):
    """Resume, or start a context/track. Empty body = resume on the active device."""
    body: Dict[str, Any] = {}
    if payload.get("context_uri"):
        body["context_uri"] = payload["context_uri"]
    if payload.get("uri"):
        body["uris"] = [payload["uri"]]
    if payload.get("uris"):
        body["uris"] = list(payload["uris"])[:50]
    if payload.get("position_ms") is not None:
        body["position_ms"] = int(payload["position_ms"])
    if payload.get("offset"):
        offset = payload["offset"]
        body["offset"] = {"uri": offset} if isinstance(offset, str) else {"position": int(offset)}
    return _call(_client.request, "PUT", "/me/player/play", params=_device_params(payload), json_body=body or None)


@router.post("/pause")
async def pause(payload: Dict[str, Any] = Body(default={})):
    return _call(_client.request, "PUT", "/me/player/pause", params=_device_params(payload))


@router.post("/next")
async def next_track(payload: Dict[str, Any] = Body(default={})):
    return _call(_client.request, "POST", "/me/player/next", params=_device_params(payload))


@router.post("/previous")
async def previous_track(payload: Dict[str, Any] = Body(default={})):
    return _call(_client.request, "POST", "/me/player/previous", params=_device_params(payload))


@router.put("/volume")
async def volume(payload: Dict[str, Any] = Body(default={})):
    percent = max(0, min(100, int(payload.get("volume_percent", 0))))
    return _call(
        _client.request, "PUT", "/me/player/volume",
        params={"volume_percent": percent, **(_device_params(payload) or {})},
    )


@router.put("/transfer")
async def transfer(payload: Dict[str, Any] = Body(default={})):
    """Move playback to a Spotify Connect device."""
    device_id = payload.get("device_id")
    if not device_id:
        return {"ok": False, "error": "device_id is required"}
    return _call(_client.request, "PUT", "/me/player", json_body={"device_ids": [device_id], "play": bool(payload.get("play", True))})


@router.get("/queue")
async def queue():
    return _call(_client.request, "GET", "/me/player/queue")


@router.post("/queue")
async def queue_add(payload: Dict[str, Any] = Body(default={})):
    uri = payload.get("uri")
    if not uri:
        return {"ok": False, "error": "uri is required"}
    return _call(_client.request, "POST", "/me/player/queue", params={"uri": uri, **(_device_params(payload) or {})})


@router.put("/shuffle")
async def shuffle(payload: Dict[str, Any] = Body(default={})):
    return _call(
        _client.request, "PUT", "/me/player/shuffle",
        params={"state": "true" if payload.get("state", False) else "false", **(_device_params(payload) or {})},
    )


@router.put("/repeat")
async def repeat(payload: Dict[str, Any] = Body(default={})):
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
