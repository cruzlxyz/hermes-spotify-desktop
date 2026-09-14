(function () {
  "use strict";
  // spotify-desktop — web dashboard tab. A full Spotify Connect remote in the
  // same visual language as the Achievements page: hero, now-playing strip
  // with transport + volume, devices/playlists/queue panels, and track search.
  // Audio keeps playing through the user's Spotify apps; this page drives them
  // through this plugin's backend API (plugin_api.py → Spotify Web API using
  // Hermes' existing `hermes auth spotify` credentials).
  const SDK = window.__HERMES_PLUGIN_SDK__;
  if (!SDK || !window.__HERMES_PLUGINS__) return;

  const React = SDK.React;
  const hooks = SDK.hooks;
  const C = SDK.components;
  const API = "/api/plugins/spotify-desktop";

  function api(path, options) {
    return SDK.fetchJSON(API + path, options);
  }

  function post(path, payload) {
    return api(path, {
      body: JSON.stringify(payload || {}),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });
  }

  function put(path, payload) {
    return api(path, {
      body: JSON.stringify(payload || {}),
      headers: { "Content-Type": "application/json" },
      method: "PUT",
    });
  }

  const CSS = `
.hsd-page{display:flex;flex-direction:column;gap:1rem}
.hsd-hero{position:relative;overflow:hidden;display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;border:1px solid var(--color-border);background:radial-gradient(circle at 12% 0,rgba(103,232,249,.13),transparent 30%),linear-gradient(135deg,color-mix(in srgb,var(--color-card) 88%,transparent),color-mix(in srgb,var(--color-primary) 10%,transparent));padding:1.25rem}
.hsd-hero:before{content:"";position:absolute;inset:auto -10% -80% -10%;height:180%;pointer-events:none;background:radial-gradient(circle,rgba(29,185,84,.12),transparent 55%)}
.hsd-hero h1{position:relative;margin:0;font-size:clamp(2rem,4vw,4.2rem);line-height:.9;letter-spacing:-.06em}
.hsd-hero p{position:relative;max-width:52rem;margin:.65rem 0 0;color:var(--color-muted-foreground)}
.hsd-kicker{position:relative;color:var(--color-muted-foreground);text-transform:uppercase;letter-spacing:.18em;font-size:.72rem;font-family:var(--font-mono,ui-monospace,monospace)}
.hsd-refresh{position:relative;white-space:nowrap;cursor:pointer;border:1px solid var(--color-foreground);background:var(--color-foreground);color:#0b1112;padding:.5rem 1rem;font-size:.82rem;font-family:var(--font-mono,ui-monospace,monospace);letter-spacing:.03em}
.hsd-refresh:hover{background:#67e8f9;border-color:#67e8f9}
.hsd-card{border:1px solid var(--color-border);background:color-mix(in srgb,var(--color-card) 92%,#000)}
.hsd-card-content{padding:1rem}
.hsd-now{display:flex;gap:1.25rem;align-items:center}
.hsd-art{width:96px;height:96px;border-radius:4px;background:rgba(127,127,127,.12);display:grid;place-items:center;font-size:34px;overflow:hidden;flex-shrink:0}
.hsd-art img{width:100%;height:100%;object-fit:cover;display:block}
.hsd-meta{min-width:0;flex:1}
.hsd-track{font-size:1.35rem;font-weight:750;letter-spacing:-.025em;line-height:1.05}
.hsd-artists{margin-top:.3rem;color:var(--color-muted-foreground);font-size:.92rem}
.hsd-device{margin-top:.5rem;font-size:.78rem;color:var(--color-muted-foreground);font-family:var(--font-mono,ui-monospace,monospace)}
.hsd-progress{display:flex;align-items:center;gap:.55rem;margin-top:.85rem;max-width:34rem}
.hsd-time{font-size:.72rem;color:var(--color-muted-foreground);font-family:var(--font-mono,ui-monospace,monospace);min-width:2.6rem}
.hsd-trackbar{flex:1;height:.48rem;border:1px solid color-mix(in srgb,var(--color-primary) 34%,var(--color-border));background:rgba(0,0,0,.22);overflow:hidden}
.hsd-trackbar>span{display:block;height:100%;background:linear-gradient(90deg,var(--color-primary),color-mix(in srgb,var(--color-primary) 48%,white))}
.hsd-transport{display:flex;align-items:center;gap:.5rem;margin-top:1rem;flex-wrap:wrap}
.hsd-tbtn{border:1px solid var(--color-border);background:color-mix(in srgb,var(--color-card) 72%,transparent);color:var(--color-foreground);padding:.4rem .6rem;cursor:pointer;display:inline-flex;align-items:center;gap:.35rem;font-size:.78rem}
.hsd-tbtn:hover{border-color:var(--color-ring);background:color-mix(in srgb,var(--color-primary) 16%,var(--color-card))}
.hsd-tbtn svg{width:1rem;height:1rem;stroke:currentColor;stroke-width:2;fill:none;stroke-linecap:round;stroke-linejoin:round}
.hsd-tbtn[data-on=true]{color:#67e8f9;border-color:color-mix(in srgb,#67e8f9 52%,var(--color-border))}
.hsd-tbtn-primary{background:var(--color-foreground);color:#0b1112;border-color:var(--color-foreground)}
.hsd-tbtn-primary:hover{background:#67e8f9;border-color:#67e8f9}
.hsd-volwrap{display:flex;align-items:center;gap:.5rem;margin-left:auto;color:var(--color-muted-foreground)}
.hsd-volwrap input{width:9rem;accent-color:var(--color-primary)}
.hsd-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}
.hsd-heading{font-size:.72rem;text-transform:uppercase;letter-spacing:.12em;color:var(--color-muted-foreground);font-family:var(--font-mono,ui-monospace,monospace);margin-bottom:.5rem}
.hsd-list{display:flex;flex-direction:column;max-height:15rem;overflow-y:auto}
.hsd-row{display:flex;align-items:center;gap:.5rem;width:100%;border:0;background:transparent;color:var(--color-foreground);font-size:.82rem;padding:.42rem .5rem;cursor:pointer;text-align:left}
.hsd-row:hover{background:color-mix(in srgb,var(--color-primary) 10%,transparent)}
.hsd-row[data-active=true]{color:#67e8f9}
.hsd-row-main{min-width:0;flex:1}
.hsd-row-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hsd-row-sub{font-size:.72rem;color:var(--color-muted-foreground);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hsd-row-actions{display:flex;gap:.25rem;opacity:0;flex-shrink:0}
.hsd-row:hover .hsd-row-actions{opacity:1}
.hsd-mini{border:1px solid var(--color-border);background:transparent;color:var(--color-muted-foreground);font-size:.66rem;padding:.14rem .4rem;cursor:pointer;text-transform:uppercase;font-family:var(--font-mono,ui-monospace,monospace)}
.hsd-mini:hover{color:#67e8f9;border-color:#67e8f9}
.hsd-search{display:flex;gap:.5rem;margin-bottom:.6rem}
.hsd-search input{flex:1;border:1px solid var(--color-border);background:color-mix(in srgb,var(--color-card) 72%,transparent);color:var(--color-foreground);padding:.5rem .7rem;font-size:.85rem;outline:none}
.hsd-search input:focus{border-color:var(--color-ring)}
.hsd-error{border:1px solid #ef4444;color:#fecaca;background:color-mix(in srgb,#ef4444 10%,transparent);padding:.8rem 1rem;font-size:.85rem}
@media (max-width:980px){.hsd-grid{grid-template-columns:1fr}}
`;

  const SVG = { "aria-hidden": true, fill: "none", strokeLinecap: "round", strokeLinejoin: "round", stroke: "currentColor", strokeWidth: 2, viewBox: "0 0 24 24" };

  const IcShuffle = () => React.createElement("svg", { ...SVG, style: { width: "1rem", height: "1rem" } },
    React.createElement("path", { d: "M16 3h5v5" }), React.createElement("path", { d: "M4 20L21 3" }),
    React.createElement("path", { d: "M21 16v5h-5" }), React.createElement("path", { d: "M15 15l6 6" }),
    React.createElement("path", { d: "M4 4l5 5" }));

  const IcRepeat = () => React.createElement("svg", { ...SVG, style: { width: "1rem", height: "1rem" } },
    React.createElement("path", { d: "m17 2 4 4-4 4" }), React.createElement("path", { d: "M3 11v-1a4 4 0 0 1 4-4h14" }),
    React.createElement("path", { d: "m7 22-4-4 4-4" }), React.createElement("path", { d: "M21 13v1a4 4 0 0 1-4 4H3" }));

  const IcNext = () => React.createElement("svg", { ...SVG, style: { width: "1rem", height: "1rem" } },
    React.createElement("path", { d: "M6 5l8.5 7L6 19z", fill: "currentColor", stroke: "none" }),
    React.createElement("path", { d: "M18 5v14" }));

  const IcPrev = () => React.createElement("svg", { ...SVG, style: { width: "1rem", height: "1rem" } },
    React.createElement("path", { d: "M18 5l-8.5 7L18 19z", fill: "currentColor", stroke: "none" }),
    React.createElement("path", { d: "M6 5v14" }));

  function fmtTime(ms) {
    if (!ms || ms < 0) return "0:00";
    const total = Math.floor(ms / 1000);
    return Math.floor(total / 60) + ":" + String(total % 60).padStart(2, "0");
  }

  function SpotifyPage() {
    const [player, setPlayer] = hooks.useState(null);
    const [devices, setDevices] = hooks.useState([]);
    const [playlists, setPlaylists] = hooks.useState([]);
    const [queue, setQueue] = hooks.useState(null);
    const [error, setError] = hooks.useState(null);
    const [note, setNote] = hooks.useState("");
    const [text, setText] = hooks.useState("");
    const [query, setQuery] = hooks.useState("");
    const [results, setResults] = hooks.useState([]);
    const [searching, setSearching] = hooks.useState(false);

    const refreshPlayer = hooks.useCallback(function () {
      return api("/player").then(function (res) {
        if (res && res.ok) { setPlayer(res.data); setError(null); }
        else setError((res && res.error) || "Spotify unavailable");
      }).catch(function (err) { setError(String(err)); });
    }, []);

    const refreshSides = hooks.useCallback(function () {
      api("/devices").then(function (res) { if (res && res.ok) setDevices((res.data.devices) || []); }).catch(function () {});
      api("/playlists").then(function (res) { if (res && res.ok) setPlaylists((res.data.items) || []); }).catch(function () {});
      api("/queue").then(function (res) { if (res && res.ok) setQueue(res.data); }).catch(function () {});
    }, []);

    hooks.useEffect(function () {
      refreshPlayer();
      refreshSides();
      const id = setInterval(refreshPlayer, 5000);
      return function () { clearInterval(id); };
    }, [refreshPlayer, refreshSides]);

    hooks.useEffect(function () {
      const timer = setTimeout(function () { setQuery(text.trim()); }, 350);
      return function () { clearTimeout(timer); };
    }, [text]);

    hooks.useEffect(function () {
      if (query.length < 2) { setResults([]); return; }
      setSearching(true);
      api("/search?q=" + encodeURIComponent(query) + "&type=track&limit=8")
        .then(function (res) { setResults(res && res.ok && res.data.tracks ? res.data.tracks.items : []); })
        .catch(function () { setResults([]); })
        .finally(function () { setSearching(false); });
    }, [query]);

    function run(promise, okNote) {
      return promise.then(function (res) {
        setNote(res && res.ok ? (okNote || "") : ((res && res.error) || "Command failed"));
        refreshPlayer();
        return res;
      }).catch(function (err) { setNote(String(err)); });
    }

    const s = player || {};
    const item = s.item || {};
    const pct = s.progress_ms && item.duration_ms ? Math.min(100, (s.progress_ms / item.duration_ms) * 100) : 0;
    const playing = !!s.is_playing;

    return React.createElement("div", { className: "hsd-page" },
      React.createElement("section", { className: "hsd-hero" },
        React.createElement("div", null,
          React.createElement("div", { className: "hsd-kicker" }, "Spotify Connect"),
          React.createElement("h1", null, "Spotify"),
          React.createElement("p", null, "A Spotify Connect remote for Hermes. Audio keeps playing through your Spotify apps — this page drives them: transport, volume, devices, playlists, search, and the queue.")),
        React.createElement("button", {
          className: "hsd-refresh", onClick: function () { refreshPlayer(); refreshSides(); },
        }, "Refresh")),

      error && React.createElement("div", { className: "hsd-error" }, String(error)),
      note && React.createElement("div", { className: "hsd-note" }, note),

      React.createElement("section", { className: "hsd-card" },
        React.createElement("div", { className: "hsd-card-content" },
          React.createElement("div", { className: "hsd-now" },
            React.createElement("div", { className: "hsd-art" }, item.album && item.album.images && item.album.images[0]
              ? React.createElement("img", { alt: "", src: item.album.images[0].url })
              : "♪"),
            React.createElement("div", { className: "hsd-meta" },
              React.createElement("div", { className: "hsd-track" }, item.name || "Nothing playing"),
              React.createElement("div", { className: "hsd-artists" }, item.artists ? item.artists.map(function (a) { return a.name; }).join(", ") : "Open Spotify on any device and press play"),
              React.createElement("div", { className: "hsd-device" }, s.device
                ? (playing ? "▶ " : "⏸ ") + s.device.name + (s.device.is_active ? " · active" : "")
                : "No device reported yet"))),
          React.createElement("div", { className: "hsd-progress" },
            React.createElement("span", { className: "hsd-time" }, fmtTime(s.progress_ms)),
            React.createElement("div", { className: "hsd-trackbar" }, React.createElement("span", { style: { width: pct + "%" } })),
            React.createElement("span", { className: "hsd-time" }, fmtTime(item.duration_ms))),
          React.createElement("div", { className: "hsd-transport" },
            React.createElement("button", { className: "hsd-tbtn", "data-on": !!s.shuffle_state, onClick: function () { run(put("/shuffle", { state: !s.shuffle_state }), "Shuffle " + (!s.shuffle_state ? "on" : "off")); } }, React.createElement(IcShuffle, null), "Shuffle"),
            React.createElement("button", { className: "hsd-tbtn", onClick: function () { run(post("/previous")); } }, React.createElement(IcPrev, null), "Prev"),
            React.createElement("button", { className: "hsd-tbtn hsd-tbtn-primary", onClick: function () { run(post(playing ? "/pause" : "/play")); } }, playing ? "Pause" : "Play"),
            React.createElement("button", { className: "hsd-tbtn", onClick: function () { run(post("/next")); } }, React.createElement(IcNext, null), "Next"),
            React.createElement("button", { className: "hsd-tbtn", "data-on": !!s.repeat_state && s.repeat_state !== "off", onClick: function () { const order = ["off", "context", "track"]; const next = order[(order.indexOf(s.repeat_state || "off") + 1) % 3]; run(put("/repeat", { state: next }), "Repeat: " + next); } }, React.createElement(IcRepeat, null), "Repeat: " + (s.repeat_state || "off")),
            React.createElement("span", { className: "hsd-volwrap" },
              React.createElement("input", {
                "aria-label": "Volume", max: 100, min: 0, type: "range",
                value: s.device && typeof s.device.volume_percent === "number" ? s.device.volume_percent : 50,
                onChange: function (e) { run(put("/volume", { volume_percent: Number(e.target.value) })); },
              }))))),

      React.createElement("div", { className: "hsd-grid" },
        React.createElement("section", { className: "hsd-card" },
          React.createElement("div", { className: "hsd-card-content" },
            React.createElement("div", { className: "hsd-heading" }, "Devices"),
            React.createElement("div", { className: "hsd-list" }, devices.length === 0
              ? React.createElement("div", { className: "hsd-row", style: { cursor: "default" } }, "No Spotify Connect devices reported")
              : devices.map(function (d) {
                  return React.createElement("button", { className: "hsd-row", "data-active": d.is_active, key: d.id || d.name,
                    onClick: function () { run(put("/transfer", { device_id: d.id, play: true }), "Moved to " + d.name); } },
                    React.createElement("span", { className: "hsd-row-main" },
                      React.createElement("span", { className: "hsd-row-title", style: { display: "block" } }, d.name + " · " + d.type),
                      React.createElement("span", { className: "hsd-row-sub", style: { display: "block" } }, d.is_active ? "Active device" : "Volume " + (d.volume_percent != null ? d.volume_percent : "?") + "%")));
                })))),
        React.createElement("section", { className: "hsd-card" },
          React.createElement("div", { className: "hsd-card-content" },
            React.createElement("div", { className: "hsd-heading" }, "Your playlists"),
            React.createElement("div", { className: "hsd-list" }, playlists.length === 0
              ? React.createElement("div", { className: "hsd-row", style: { cursor: "default" } }, "No playlists found")
              : playlists.map(function (pl) {
                  return React.createElement("button", { className: "hsd-row", key: pl.id,
                    onClick: function () { run(post("/play", { context_uri: pl.uri }), "Playing " + pl.name); } },
                    React.createElement("span", { className: "hsd-row-main" },
                      React.createElement("span", { className: "hsd-row-title", style: { display: "block" } }, pl.name),
                      React.createElement("span", { className: "hsd-row-sub", style: { display: "block" } }, (pl.tracks ? pl.tracks.total : "?") + " tracks")));
                })))),
        React.createElement("section", { className: "hsd-card" },
          React.createElement("div", { className: "hsd-card-content" },
            React.createElement("div", { className: "hsd-heading" }, "Queue"),
            React.createElement("div", { className: "hsd-list" }, !queue || !(queue.queue || []).length
              ? React.createElement("div", { className: "hsd-row", style: { cursor: "default" } }, "Queue is empty — search something and add it")
              : queue.queue.map(function (t, i) {
                  return React.createElement("div", { className: "hsd-row", key: (t.id || t.uri) + "-" + i, style: { cursor: "default" } },
                    React.createElement("span", { className: "hsd-row-main" },
                      React.createElement("span", { className: "hsd-row-title", style: { display: "block" } }, t.name),
                      React.createElement("span", { className: "hsd-row-sub", style: { display: "block" } }, t.artists.map(function (a) { return a.name; }).join(", "))),
                    React.createElement("span", { className: "hsd-row-actions" },
                      React.createElement("button", { className: "hsd-mini", onClick: function () { run(post("/play", { uri: t.uri }), "Playing " + t.name); } }, "play")));
                }))))),

      React.createElement("section", { className: "hsd-card" },
        React.createElement("div", { className: "hsd-card-content" },
          React.createElement("div", { className: "hsd-heading" }, "Search tracks"),
          React.createElement("div", { className: "hsd-search" },
            React.createElement("input", {
              onChange: function (e) { setText(e.target.value); },
              placeholder: "Track, artist, album…", value: text,
            })),
          React.createElement("div", { className: "hsd-list" },
            searching && React.createElement("div", { className: "hsd-row", style: { cursor: "default" } }, "Searching…"),
            !searching && query.length >= 2 && results.length === 0 && React.createElement("div", { className: "hsd-row", style: { cursor: "default" } }, "No tracks found"),
            results.map(function (t) {
              return React.createElement("div", { className: "hsd-row", key: t.id, style: { cursor: "default" } },
                React.createElement("span", { className: "hsd-row-main" },
                  React.createElement("span", { className: "hsd-row-title", style: { display: "block" } }, t.name),
                  React.createElement("span", { className: "hsd-row-sub", style: { display: "block" } }, t.artists.map(function (a) { return a.name; }).join(", ") + " · " + fmtTime(t.duration_ms))),
                React.createElement("span", { className: "hsd-row-actions" },
                  React.createElement("button", { className: "hsd-mini", onClick: function () { run(post("/play", { uri: t.uri }), "Playing " + t.name); } }, "play"),
                  React.createElement("button", { className: "hsd-mini", onClick: function () { run(post("/queue", { uri: t.uri }), "Queued " + t.name); } }, "queue")));
            })),
          React.createElement("div", { className: "hsd-note", style: { marginTop: ".6rem" } }, "Computed through your local Hermes backend — Spotify credentials never leave this machine."))));
  }

  function injectStyles() {
    if (document.getElementById("hsd-styles")) return;
    const el = document.createElement("style");
    el.id = "hsd-styles";
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  injectStyles();
  window.__HERMES_PLUGINS__.register("spotify-desktop", SpotifyPage);
})();
