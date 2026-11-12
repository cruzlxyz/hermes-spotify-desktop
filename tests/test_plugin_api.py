"""Offline tests for dashboard/plugin_api.py — a fake Spotify client, no network."""

import importlib.util
import sys
import types
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

API = Path(__file__).resolve().parents[1] / "dashboard" / "plugin_api.py"


class FakeError(Exception):
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


class FakeClient:
    def __init__(self):
        self.calls = []

    def request(self, method, path, params=None, json_body=None):
        self.calls.append((method, path, params, json_body))
        if path.startswith("/tracks/"):
            return {"album": {"uri": "spotify:album:A"}}
        if path == "/me/library/contains":
            return [u.endswith("saved") for u in params["uris"].split(",")]
        if path == "/me/player/devices":
            return {"devices": []}
        if path == "/me/player/seek" and params["position_ms"] > 10_000_000:
            raise FakeError("too far", 400)
        return {"ok": True}

    def get_playback_state(self):
        return {"device": {"id": "dev1", "name": "Laptop"}}


@pytest.fixture()
def api(monkeypatch):
    # Mimic the agent having loaded the official ``spotify`` plugin.
    pkg = types.ModuleType("fake_spotify_plugin")
    client_mod = types.ModuleType("fake_spotify_plugin.spotify_client")
    client_mod.SpotifyClient = FakeClient
    client_mod.SpotifyError = FakeError
    monkeypatch.setitem(sys.modules, "fake_spotify_plugin", pkg)
    monkeypatch.setitem(sys.modules, "fake_spotify_plugin.spotify_client", client_mod)
    loaded = types.SimpleNamespace(module=pkg, enabled=True)
    manager = types.SimpleNamespace(_plugins={"spotify": loaded})
    hermes_plugins = types.ModuleType("hermes_cli.plugins")
    hermes_plugins.discover_plugins = lambda: None
    hermes_plugins.get_plugin_manager = lambda: manager
    monkeypatch.setitem(sys.modules, "hermes_cli", types.ModuleType("hermes_cli"))
    monkeypatch.setitem(sys.modules, "hermes_cli.plugins", hermes_plugins)
    spec = importlib.util.spec_from_file_location("spotify_desktop_api", API)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    app = FastAPI()
    app.include_router(module.router)
    return TestClient(app), module._client


def test_devices_uses_player_endpoint_and_falls_back_to_active(api):
    client, fake = api
    body = client.get("/devices").json()
    assert ("GET", "/me/player/devices", None, None) in fake.calls
    assert body["data"]["devices"][0]["id"] == "dev1"


def test_play_single_track_resolves_album_context(api):
    client, fake = api
    client.post("/play", json={"uri": "spotify:track:T", "device_id": "d"})
    method, path, params, body = fake.calls[-1]
    assert (method, path, params) == ("PUT", "/me/player/play", {"device_id": "d"})
    assert body == {"context_uri": "spotify:album:A", "offset": {"uri": "spotify:track:T"}}


def test_play_context_with_offset_and_position(api):
    client, fake = api
    client.post("/play", json={"context_uri": "spotify:playlist:P", "offset": "spotify:track:T", "position_ms": 3100})
    assert fake.calls[-1][3] == {"context_uri": "spotify:playlist:P", "offset": {"uri": "spotify:track:T"}, "position_ms": 3100}


def test_search_limit_capped_at_ten(api):
    client, fake = api
    client.get("/search", params={"q": "doom", "limit": 50})
    assert fake.calls[-1][2]["limit"] == 10


def test_seek_validates_and_maps_errors(api):
    client, _ = api
    assert client.put("/seek", json={"position_ms": "x"}).json()["ok"] is False
    err = client.put("/seek", json={"position_ms": 99_000_000}).json()
    assert err == {"ok": False, "error": "too far", "status_code": 400}


def test_library_contains_save_remove(api):
    client, fake = api
    assert client.get("/library/contains", params={"uris": "spotify:track:saved,spotify:track:new"}).json()["data"] == [True, False]
    client.put("/library", json={"uris": ["spotify:track:new", "not-a-uri"]})
    assert fake.calls[-1][:3] == ("PUT", "/me/library", {"uris": "spotify:track:new"})
    client.request("DELETE", "/library", json={"uris": ["spotify:track:new"]})
    assert fake.calls[-1][:2] == ("DELETE", "/me/library")
    assert client.put("/library", json={}).json()["ok"] is False


def test_library_uri_list_capped_at_forty(api):
    client, fake = api
    client.put("/library", json={"uris": [f"spotify:track:{i}" for i in range(60)]})
    assert len(fake.calls[-1][2]["uris"].split(",")) == 40


def test_playlist_items_rejects_bad_ids(api):
    client, fake = api
    assert client.get("/playlists/a.b/items").json() == {"ok": False, "error": "invalid playlist id"}
    client.get("/playlists/37i9dQZF1DX/items", params={"limit": 500})
    assert fake.calls[-1][1:3] == ("/playlists/37i9dQZF1DX/items", {"limit": 50, "offset": 0})


def test_repeat_rejects_unknown_state(api):
    client, _ = api
    assert client.put("/repeat", json={"state": "forever"}).json()["ok"] is False


def test_search_types_filtered_and_defaulted(api):
    client, fake = api
    client.get("/search", params={"q": "x", "type": "track,artist,evil,album"})
    assert fake.calls[-1][2]["type"] == "track,artist,album"
    client.get("/search", params={"q": "x", "type": "nope"})
    assert fake.calls[-1][2]["type"] == "track"


def test_album_artist_ids_validated(api):
    client, fake = api
    assert client.get("/albums/..evil").json()["ok"] is False
    assert client.get("/artists/a-b/albums").json()["ok"] is False
    client.get("/artists/abc123/albums", params={"limit": 999})
    assert fake.calls[-1][1:3] == ("/artists/abc123/albums", {"include_groups": "album,single", "limit": 50})


def test_saved_and_me_are_trimmed(api, monkeypatch):
    client, fake = api
    client.get("/saved", params={"limit": 0})
    assert fake.calls[-1][1:3] == ("/me/tracks", {"limit": 1, "offset": 0})
    monkeypatch.setattr(fake, "request", lambda *a, **k: {"id": "amit", "display_name": "Amit", "email": "x@y", "uri": "spotify:user:amit"})
    assert client.get("/me").json()["data"] == {"id": "amit", "display_name": "Amit", "uri": "spotify:user:amit"}


def test_auth_errors_are_flagged(api, monkeypatch):
    client, fake = api

    def boom(*a, **k):
        raise FakeError("expired", 401)

    monkeypatch.setattr(fake, "request", boom)
    body = client.get("/queue").json()
    assert body["auth_required"] is True and body["status_code"] == 401
