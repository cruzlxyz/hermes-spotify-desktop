/**
 * spotify-desktop — Hermes DESKTOP half.
 *
 * A Radio-style Spotify remote for the Hermes Desktop status bar. The desktop
 * app cannot decrypt Spotify's DRM stream, so this is a Spotify Connect
 * remote: audio keeps playing through the user's Spotify apps while this
 * player drives them — now playing, play/pause, next/previous, shuffle,
 * repeat, volume, device transfer, track search (play or queue), playlists,
 * and the queue.
 *
 * Data flows through this package's dashboard API (dashboard/plugin_api.py),
 * which reuses the bundled Hermes Spotify client (auth + token refresh from
 * `hermes auth spotify`): ctx.rest('/...') → /api/plugins/spotify-desktop/*.
 *
 * Plain ESM, no build step — loaded via the unified-package door
 * (plugins/spotify-desktop/desktop/plugin.js, copied to desktop-plugins by the
 * desktop app) or directly from desktop-plugins/spotify-desktop/plugin.js.
 */

import { atom, Button, createBudgetedLoop, GlyphSpinner, icons, Popover, PopoverContent, PopoverTrigger, SearchField, STATUSBAR_AREAS, Tip, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'spotify-desktop'

/** ctx.rest is bound here at register time. */
let api = async () => {
  throw new Error('Spotify plugin not initialized')
}

/** jsx with children-as-args ergonomics: h(type, props, ...children). */
const h = (type, props, ...children) =>
  jsx(type, { ...props, children: children.length <= 1 ? children[0] : children })

const fmtTime = ms => {
  if (!ms || ms < 0) return '0:00'
  const total = Math.floor(ms / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

const svgProps = {
  'aria-hidden': true,
  fill: 'none',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  stroke: 'currentColor',
  strokeWidth: 2,
  viewBox: '0 0 24 24'
}

/** Transport glyphs the SDK icon set doesn't ship. */
const IcNext = () =>
  jsxs('svg', { ...svgProps, style: { width: 14, height: 14 }, children: [
    jsx('path', { d: 'M6 5l8.5 7L6 19z', fill: 'currentColor', stroke: 'none' }),
    jsx('path', { d: 'M18 5v14' })
  ] })

const IcPrev = () =>
  jsxs('svg', { ...svgProps, style: { width: 14, height: 14 }, children: [
    jsx('path', { d: 'M18 5l-8.5 7L18 19z', fill: 'currentColor', stroke: 'none' }),
    jsx('path', { d: 'M6 5v14' })
  ] })

const IcShuffle = () =>
  jsxs('svg', { ...svgProps, style: { width: 13, height: 13 }, children: [
    jsx('path', { d: 'M16 3h5v5' }),
    jsx('path', { d: 'M4 20L21 3' }),
    jsx('path', { d: 'M21 16v5h-5' }),
    jsx('path', { d: 'M15 15l6 6' }),
    jsx('path', { d: 'M4 4l5 5' })
  ] })

const IcRepeat = () =>
  jsxs('svg', { ...svgProps, style: { width: 13, height: 13 }, children: [
    jsx('path', { d: 'm17 2 4 4-4 4' }),
    jsx('path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }),
    jsx('path', { d: 'm7 22-4-4 4-4' }),
    jsx('path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' })
  ] })

const CSS = `
.hermes-spotify-bar{display:flex;align-items:center;gap:2px;height:100%;color:var(--ui-text-tertiary)}
.hermes-spotify-name{max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-action{display:inline-flex;align-items:center;justify-content:center;color:inherit}
.hermes-spotify-action[data-on=true]{color:var(--ui-accent)}
.hermes-spotify-panel{width:340px;padding:0;overflow:hidden}
.hermes-spotify-tabs{display:flex;gap:2px;padding:6px 8px 0}
.hermes-spotify-tab{flex:1;border:1px solid transparent;background:transparent;color:var(--ui-text-tertiary);font-size:11px;padding:3px 0;cursor:pointer}
.hermes-spotify-tab:hover{color:var(--ui-text-primary)}
.hermes-spotify-tab[data-active=true]{color:var(--ui-text-primary);border-color:var(--ui-border);background:var(--ui-bg-tertiary,rgba(127,127,127,.08))}
.hermes-spotify-body{max-height:430px;overflow-y:auto;padding:8px}
.hermes-spotify-now{display:flex;gap:10px;align-items:center}
.hermes-spotify-art{width:52px;height:52px;border-radius:4px;background:rgba(127,127,127,.14);display:grid;place-items:center;font-size:20px;flex-shrink:0;overflow:hidden}
.hermes-spotify-art img{width:100%;height:100%;object-fit:cover;display:block}
.hermes-spotify-meta{min-width:0;flex:1}
.hermes-spotify-track{font-size:12px;font-weight:600;color:var(--ui-text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-artist{font-size:11px;color:var(--ui-text-tertiary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-device{font-size:10px;color:var(--ui-text-tertiary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-progress{display:flex;align-items:center;gap:6px;margin-top:6px}
.hermes-spotify-time{font-size:9.5px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;flex-shrink:0}
.hermes-spotify-trackbar{flex:1;height:3px;background:rgba(127,127,127,.25);overflow:hidden}
.hermes-spotify-trackbar>span{display:block;height:100%;background:var(--ui-accent)}
.hermes-spotify-transport{display:flex;align-items:center;justify-content:center;gap:4px;margin-top:8px}
.hermes-spotify-volume{display:flex;align-items:center;gap:6px;margin-top:8px;color:var(--ui-text-tertiary)}
.hermes-spotify-volume input{flex:1;accent-color:var(--ui-accent);height:3px}
.hermes-spotify-section{margin-top:8px}
.hermes-spotify-heading{font-size:9.5px;text-transform:uppercase;letter-spacing:.08em;color:var(--ui-text-tertiary);margin-bottom:4px}
.hermes-spotify-row{display:flex;align-items:center;gap:6px;width:100%;border:0;background:transparent;color:var(--ui-text-secondary);font-size:11px;padding:4px 6px;cursor:pointer;text-align:left}
.hermes-spotify-row:hover{background:var(--ui-bg-tertiary,rgba(127,127,127,.08));color:var(--ui-text-primary)}
.hermes-spotify-row[data-active=true]{color:var(--ui-accent)}
.hermes-spotify-row-main{min-width:0;flex:1}
.hermes-spotify-row-title{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-row-sub{font-size:10px;color:var(--ui-text-tertiary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-row-actions{display:flex;gap:2px;flex-shrink:0;opacity:0}
.hermes-spotify-row:hover .hermes-spotify-row-actions{opacity:1}
.hermes-spotify-note{font-size:10px;color:var(--ui-text-tertiary);padding:4px 8px;border-top:1px solid var(--ui-border);min-height:12px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-list{display:flex;flex-direction:column}
.hermes-spotify-search{padding-bottom:6px}
`

function createPlayer(ctx) {
  const state = atom(null)
  const devices = atom([])
  const note = atom('')
  const open = atom(false)
  const view = atom('now')

  async function refresh(force = false) {
    if (force) lastFetch = 0
    try {
      const res = await api('/player')
      if (res && res.ok) {
        const d = res.data || {}
        const item = d.item
        state.set({
          track: item ? item.name : null,
          artist: item ? (item.artists || []).map(a => a.name).join(', ') : '',
          album_img: item && item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : null,
          is_playing: !!d.is_playing,
          progress_ms: d.progress_ms || 0,
          duration_ms: item ? item.duration_ms || 0 : 0,
          device_id: d.device ? d.device.id : null,
          device_name: d.device ? d.device.name : '',
          is_active: !!(d.device && d.device.is_active),
          volume: d.device && typeof d.device.volume_percent === 'number' ? d.device.volume_percent : 50,
          shuffle: !!d.shuffle_state,
          repeat: d.repeat_state || 'off'
        })
        note.set('')
      } else {
        note.set((res && res.error) || 'Spotify unavailable')
      }
    } catch (err) {
      note.set(err && err.message ? err.message : String(err))
    }
  }

  async function refreshDevices() {
    try {
      const res = await api('/devices')
      if (res && res.ok) {
        devices.set(((res.data && res.data.devices) || []).map(d => ({
          active: d.is_active,
          id: d.id,
          name: d.name,
          type: d.type,
          volume: d.volume_percent
        })))
      }
    } catch {
      // Device refresh is best-effort.
    }
  }

  let lastFetch = 0
  let inFlight = false
  let lastTick = Date.now()
  const loop = createBudgetedLoop(() => {
    const now = Date.now()
    const current = state.get()
    if (current && current.is_playing && current.duration_ms) {
      state.set({ ...current, progress_ms: Math.min(current.duration_ms, (current.progress_ms || 0) + (now - lastTick)) })
    }
    lastTick = now
    if (inFlight || now - lastFetch < (open.get() ? 4000 : 12000)) return
    inFlight = true
    lastFetch = now
    void refresh().finally(() => { inFlight = false })
  }, { fps: 1, pauseWhenUnfocused: false })

  async function transport(action) {
    note.set('')
    const res = await api('/' + action, { method: 'POST' })
    if (!res || !res.ok) note.set((res && res.error) || 'Command failed')
    await refresh(true)
  }

  async function playPayload(payload) {
    note.set('')
    const res = await api('/play', { method: 'POST', body: payload })
    if (!res || !res.ok) note.set((res && res.error) || 'Could not start playback')
    await refresh(true)
  }

  async function setVolume(pct) {
    const current = state.get()
    if (current) state.set({ ...current, volume: pct })
    const res = await api('/volume', { method: 'PUT', body: { volume_percent: pct } })
    if (!res || !res.ok) note.set((res && res.error) || 'Volume failed')
  }

  async function toggleShuffle() {
    const current = state.get()
    await api('/shuffle', { method: 'PUT', body: { state: !(current && current.shuffle) } })
    await refresh(true)
  }

  async function cycleRepeat() {
    const order = ['off', 'context', 'track']
    const current = state.get()
    const next = order[(order.indexOf((current && current.repeat) || 'off') + 1) % 3]
    await api('/repeat', { method: 'PUT', body: { state: next } })
    await refresh(true)
  }

  async function transfer(deviceId) {
    note.set('')
    const res = await api('/transfer', { method: 'PUT', body: { device_id: deviceId, play: true } })
    if (!res || !res.ok) note.set((res && res.error) || 'Transfer failed')
    await Promise.all([refresh(true), refreshDevices()])
  }

  async function addToQueue(uri) {
    const res = await api('/queue', { method: 'POST', body: { uri } })
    note.set(res && res.ok ? 'Added to queue' : ((res && res.error) || 'Queue failed'))
  }

  function onOpenChange(value) {
    open.set(value)
    if (value) {
      void refresh(true)
      void refreshDevices()
    }
  }

  ctx.onDispose(() => loop.dispose())

  return { state, devices, note, open, view, refresh, refreshDevices, transport, playPayload, setVolume, toggleShuffle, cycleRepeat, transfer, addToQueue, onOpenChange }
}

function SmallAction({ label, icon, onClick, busy = false, on = false }) {
  return jsx(Tip, {
    label,
    children: jsx(Button, {
      'aria-label': label,
      className: 'hermes-spotify-action',
      'data-on': on,
      onClick,
      size: 'icon-xs',
      variant: 'ghost',
      children: jsx('span', { children: busy ? jsx(GlyphSpinner, { ariaLabel: label }) : jsx(icon, {}) })
    })
  })
}

function NowPlaying({ player }) {
  const s = useValue(player.state)
  const pct = s && s.duration_ms ? Math.min(100, (s.progress_ms / s.duration_ms) * 100) : 0

  return jsxs('div', { children: [
    jsxs('div', { className: 'hermes-spotify-now', children: [
      jsx('div', { className: 'hermes-spotify-art', children: s && s.album_img ? jsx('img', { alt: '', src: s.album_img }) : '♪' }),
      jsxs('div', { className: 'hermes-spotify-meta', children: [
        jsx('div', { className: 'hermes-spotify-track', children: s && s.track ? s.track : 'Nothing playing' }),
        jsx('div', { className: 'hermes-spotify-artist', children: s && s.artist ? s.artist : 'Open Spotify on any device and press play' }),
        jsx('div', { className: 'hermes-spotify-device', children: s && s.device_name ? `${s.is_playing ? '▶' : '⏸'} ${s.device_name}${s.is_active ? ' · active' : ''}` : 'No device reported yet' })
      ] })
    ] }),
    jsxs('div', { className: 'hermes-spotify-progress', children: [
      jsx('span', { className: 'hermes-spotify-time', children: fmtTime(s && s.progress_ms) }),
      jsx('div', { className: 'hermes-spotify-trackbar', children: jsx('span', { style: { width: pct + '%' } }) }),
      jsx('span', { className: 'hermes-spotify-time', children: fmtTime(s && s.duration_ms) })
    ] })
  ] })
}

function Transport({ player }) {
  const s = useValue(player.state)
  const playing = !!(s && s.is_playing)

  return jsxs('div', { children: [
    jsxs('div', { className: 'hermes-spotify-transport', children: [
      jsx(SmallAction, { icon: IcShuffle, label: 'Shuffle', on: !!(s && s.shuffle), onClick: () => player.toggleShuffle() }),
      jsx(SmallAction, { icon: IcPrev, label: 'Previous', onClick: () => player.transport('previous') }),
      jsx(SmallAction, { busy: false, icon: playing ? icons.Pause : icons.Play, label: playing ? 'Pause' : 'Play', onClick: () => player.transport(playing ? 'pause' : 'play') }),
      jsx(SmallAction, { icon: IcNext, label: 'Next', onClick: () => player.transport('next') }),
      jsx(SmallAction, { icon: IcRepeat, label: `Repeat: ${(s && s.repeat) || 'off'}`, on: !!(s && s.repeat && s.repeat !== 'off'), onClick: () => player.cycleRepeat() })
    ] }),
    jsxs('div', { className: 'hermes-spotify-volume', children: [
      jsx(icons.Volume2, { style: { width: 13, height: 13, flexShrink: 0 } }),
      jsx('input', {
        'aria-label': 'Volume',
        max: 100,
        min: 0,
        onChange: event => player.setVolume(Number(event.target.value)),
        type: 'range',
        value: (s && s.volume) ?? 50
      })
    ] })
  ] })
}

function Devices({ player }) {
  const devices = useValue(player.devices)
  const s = useValue(player.state)
  // Spotify quirk: /me/devices can come back empty while /me/player knows the
  // active device — fall back to it so the row shows up.
  const list = devices.length === 0 && s && s.device_id
    ? [{ active: true, id: s.device_id, name: s.device_name, type: 'Spotify Connect', volume: s.volume }]
    : devices

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-heading', children: 'Devices' }),
    jsx('div', { className: 'hermes-spotify-list', children: list.length === 0
      ? jsx('div', { className: 'hermes-spotify-row', style: { cursor: 'default' }, children: 'No Spotify Connect devices found' })
      : list.map(d => jsx('button', {
          className: 'hermes-spotify-row',
          'data-active': d.active,
          key: d.id || d.name,
          onClick: () => player.transfer(d.id),
          children: jsxs('span', { className: 'hermes-spotify-row-main', children: [
            jsx('span', { className: 'hermes-spotify-row-title', children: `${d.name} · ${d.type}` }),
            jsx('span', { className: 'hermes-spotify-row-sub', children: d.active ? 'Active device' : `Volume ${d.volume ?? '?'}%` })
          ] })
        }, d.id || d.name))
    }),
    s && s.device_name && !s.is_active
      ? jsx('div', { className: 'hermes-spotify-heading', children: `Playback is on “${s.device_name}” — pick a device above to move it.` })
      : null
  ] })
}

function Playlists({ player, open }) {
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'playlists'],
    queryFn: () => api('/playlists'),
    staleTime: 120000
  })
  const items = query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items : []

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-heading', children: 'Your playlists' }),
    jsx('div', { className: 'hermes-spotify-list', children: items.map(pl => jsx('button', {
      className: 'hermes-spotify-row',
      key: pl.id,
      onClick: () => player.playPayload({ context_uri: pl.uri }),
      children: jsxs('span', { className: 'hermes-spotify-row-main', children: [
        jsx('span', { className: 'hermes-spotify-row-title', children: pl.name }),
        jsx('span', { className: 'hermes-spotify-row-sub', children: `${pl.tracks ? pl.tracks.total : '?'} tracks · ${pl.owner && pl.owner.display_name ? pl.owner.display_name : ''}` })
      ] })
    }, pl.id)) }),
    query.isFetching ? jsx('div', { className: 'hermes-spotify-heading', children: 'Loading playlists…' }) : null,
    query.data && !query.data.ok ? jsx('div', { className: 'hermes-spotify-heading', children: query.data.error }) : null
  ] })
}

function SearchPanel({ player, open }) {
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 350)
    return () => clearTimeout(timer)
  }, [text])
  const result = useQuery({
    enabled: open && query.length >= 2,
    queryKey: [ID, 'search', query],
    queryFn: () => api(`/search?q=${encodeURIComponent(query)}&type=track&limit=8`),
    staleTime: 60000
  })
  const tracks = result.data && result.data.ok && result.data.data && result.data.data.tracks && result.data.data.tracks.items
    ? result.data.data.tracks.items
    : []

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-heading', children: 'Search tracks' }),
    jsx('div', { className: 'hermes-spotify-search', children: jsx(SearchField, { onChange: setText, placeholder: 'Track, artist, album…', value: text }) }),
    jsx('div', { className: 'hermes-spotify-list', children: tracks.map(t => jsxs('div', { className: 'hermes-spotify-row', style: { cursor: 'default' }, children: [
      jsxs('span', { className: 'hermes-spotify-row-main', children: [
        jsx('span', { className: 'hermes-spotify-row-title', children: t.name }),
        jsx('span', { className: 'hermes-spotify-row-sub', children: (t.artists || []).map(a => a.name).join(', ') })
      ] }),
      jsxs('span', { className: 'hermes-spotify-row-actions', children: [
        jsx(SmallAction, { icon: icons.Play, label: `Play ${t.name}`, onClick: () => player.playPayload({ uri: t.uri }) }),
        jsx(SmallAction, { icon: icons.Plus, label: `Queue ${t.name}`, onClick: () => player.addToQueue(t.uri) })
      ] })
    ] }, t.id)) }),
    query.length >= 2 && !result.isFetching && tracks.length === 0
      ? jsx('div', { className: 'hermes-spotify-heading', children: 'No tracks found' })
      : null
  ] })
}

function QueuePanel({ player, open }) {
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'queue'],
    queryFn: () => api('/queue'),
    staleTime: 5000
  })
  const data = query.data && query.data.ok ? query.data.data : null
  const current = data && data.currently_playing
  const upcoming = (data && data.queue) || []

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-heading', children: 'Queue' }),
    jsx('div', { className: 'hermes-spotify-list', children: upcoming.length === 0
      ? jsx('div', { className: 'hermes-spotify-row', style: { cursor: 'default' }, children: 'Queue is empty' })
      : upcoming.map((t, index) => jsxs('div', { className: 'hermes-spotify-row', style: { cursor: 'default' }, children: [
          jsxs('span', { className: 'hermes-spotify-row-main', children: [
            jsx('span', { className: 'hermes-spotify-row-title', children: t.name }),
            jsx('span', { className: 'hermes-spotify-row-sub', children: (t.artists || []).map(a => a.name).join(', ') })
          ] }),
          jsx('span', { className: 'hermes-spotify-row-actions', children: jsx(SmallAction, { icon: icons.Play, label: `Play ${t.name} now`, onClick: () => player.playPayload({ uri: t.uri }) }) })
        ] }, (t.id || t.uri) + '-' + index))
    }),
    current
      ? jsx('div', { className: 'hermes-spotify-heading', children: `Playing now: ${current.name}` })
      : null
  ] })
}

function PanelBody({ player }) {
  const view = useValue(player.view)
  const open = useValue(player.open)
  const note = useValue(player.note)

  return jsxs('div', { children: [
    jsxs('div', { className: 'hermes-spotify-tabs', children: [
      jsx('button', { className: 'hermes-spotify-tab', 'data-active': view === 'now', onClick: () => player.view.set('now'), children: 'Player' }),
      jsx('button', { className: 'hermes-spotify-tab', 'data-active': view === 'playlists', onClick: () => player.view.set('playlists'), children: 'Playlists' }),
      jsx('button', { className: 'hermes-spotify-tab', 'data-active': view === 'search', onClick: () => player.view.set('search'), children: 'Search' }),
      jsx('button', { className: 'hermes-spotify-tab', 'data-active': view === 'queue', onClick: () => player.view.set('queue'), children: 'Queue' })
    ] }),
    jsxs('div', { className: 'hermes-spotify-body', children: [
      view === 'now' ? jsxs('div', { children: [jsx(NowPlaying, { player }), jsx(Transport, { player }), jsx(Devices, { player })] }) : null,
      view === 'playlists' ? jsx(Playlists, { open, player }) : null,
      view === 'search' ? jsx(SearchPanel, { open, player }) : null,
      view === 'queue' ? jsx(QueuePanel, { open, player }) : null
    ] }),
    jsx('div', { className: 'hermes-spotify-note', 'data-filled': Boolean(note), role: 'status', children: note || 'Remote control — audio plays in your Spotify apps' })
  ] })
}

function SpotifyBar({ player, ctx }) {
  const s = useValue(player.state)
  const open = useValue(player.open)
  const label = s && s.track ? `${s.track} — ${s.artist}` : 'Spotify'

  return jsxs('div', { className: 'hermes-spotify-bar', 'data-tour': 'spotify-player', children: [
    jsxs(Popover, { onOpenChange: player.onOpenChange, open, children: [
      jsx(PopoverTrigger, { asChild: true, children: jsx(Button, {
        'aria-label': `Spotify: ${label}`,
        size: 'micro',
        style: { maxWidth: 220 },
        variant: 'ghost',
        children: jsx('span', { className: 'hermes-spotify-name', children: label })
      }) }),
      jsx(PopoverContent, { 'aria-label': 'Spotify player', className: 'hermes-spotify-panel', side: 'top', align: 'end', children: jsx(PanelBody, { player }) })
    ] }),
    jsx(SmallAction, { icon: s && s.is_playing ? icons.Pause : icons.Play, label: s && s.is_playing ? 'Pause' : 'Play', onClick: () => player.transport(s && s.is_playing ? 'pause' : 'play') }),
    jsx(SmallAction, { icon: IcNext, label: 'Next track', onClick: () => player.transport('next') })
  ] })
}

export default {
  id: ID,
  name: 'Spotify',
  description: 'Spotify Connect remote in the status bar — now playing, transport, volume, devices, search, playlists, and queue.',
  defaultEnabled: true,
  register(ctx) {
    const style = document.createElement('style')
    style.textContent = CSS
    document.head.append(style)
    ctx.onDispose(() => style.remove())

    api = (path, opts) => ctx.rest(path, opts)
    const player = createPlayer(ctx)
    void player.refresh(true)

    ctx.register({
      area: STATUSBAR_AREAS.right,
      id: 'player',
      order: 12,
      render: () => jsx(SpotifyBar, { ctx, player })
    })
  }
}
