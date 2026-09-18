"""spotify-desktop — Hermes unified agent+desktop package marker.

The plugin's real backend is the dashboard API (``dashboard/plugin_api.py``,
mounted by the web server at ``/api/plugins/spotify-desktop/``); the player UI
is ``desktop/plugin.js``. This package marker exists so the desktop installer
recognizes the repository as a unified agent+desktop package and so the agent
install lands the ``dashboard/`` half (plus ``desktop/`` for materialization)
into the plugins root. It registers no agent tools.
"""


def register(ctx):
    """Desktop + dashboard plugin; no agent tools."""
    pass
