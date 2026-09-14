(function () {
  "use strict";
  // spotify-desktop — web dashboard tab. The real player lives in the Hermes
  // Desktop status bar (desktop/plugin.js); this page is a light pointer plus
  // a quick "is the backend talking to Spotify?" status card.
  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !window.__HERMES_PLUGINS__) return;

  const React = SDK.React;
  const C = SDK.components;

  function SpotifyPage() {
    const [status, setStatus] = React.useState(null);
    React.useEffect(function () {
      SDK.fetchJSON("/api/plugins/spotify-desktop/player")
        .then(function (res) { setStatus(res && res.ok ? res.data : { error: res && res.error }); })
        .catch(function (err) { setStatus({ error: String(err) }); });
    }, []);

    var line;
    if (!status) line = "Checking the Spotify backend…";
    else if (status.error) line = "Spotify backend says: " + status.error;
    else if (status.item) line = "Now playing: " + status.item.name + " — " + (status.item.artists || []).map(function (a) { return a.name; }).join(", ");
    else line = "Connected. Nothing is playing right now.";

    return React.createElement("div", { style: { padding: "1.5rem", maxWidth: "38rem", margin: "0 auto" } },
      React.createElement("h1", { style: { fontSize: "1.4rem", fontWeight: 700, letterSpacing: "-0.02em" } }, "Spotify"),
      React.createElement("p", { style: { opacity: 0.75, lineHeight: 1.5, marginTop: "0.5rem" } },
        "The Spotify mini player lives in the Hermes Desktop status bar — now playing, play/pause, next/previous, volume, devices, search, playlists, and queue. It is a remote: audio plays through your Spotify apps via Spotify Connect."),
      React.createElement("p", { style: { opacity: 0.9, marginTop: "1rem", fontSize: "0.92rem" } }, line)
    );
  }

  window.__HERMES_PLUGINS__.register("spotify-desktop", SpotifyPage);
})();
