// Browser harness: real React, stubbed SDK, fake backend, the real plugin.js.
import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { createPortal } from 'react-dom'
import { jsx, jsxs } from 'react/jsx-runtime'

const atom = v => { let x = v; const subs = new Set(); return { get: () => x, set: n => { x = n; subs.forEach(f => f()) }, subscribe: f => (subs.add(f), () => subs.delete(f)) } }
const useValue = a => React.useSyncExternalStore(a.subscribe, a.get)
const cache = new Map()
function useQuery({ enabled = true, queryKey, queryFn }) {
  const key = JSON.stringify(queryKey)
  const [, force] = React.useState(0)
  React.useEffect(() => {
    if (!enabled || cache.has(key)) return
    cache.set(key, {})
    Promise.resolve(queryFn()).then(data => { cache.set(key, { data }); force(n => n + 1) })
  }, [key, enabled])
  const e = cache.get(key) || {}
  return { data: e.data, isLoading: enabled && !e.data, isFetching: false, refetch() {} }
}
const svg = d => props => jsx('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', style: { width: 14, height: 14 }, ...props, children: jsx('path', { d }) })
const ICONS = { Play: svg('M7 4v16l13-8z'), Pause: svg('M7 4v16M17 4v16'), Plus: svg('M12 5v14M5 12h14'), RefreshCw: svg('M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5'), Volume2: svg('M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7'), VolumeX: svg('M11 5 6 9H2v6h4l5 4zM22 9l-6 6M16 9l6 6'), Monitor: svg('M3 4h18v12H3zM8 20h8M12 16v4'), Search: svg('M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM21 21l-5-5'), Bell: svg('M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4'), ExternalLink: svg('M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'), Check: svg('m5 12 5 5L20 7'), AlertCircle: svg('M12 8v4M12 16h.01M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z') }
const icons = new Proxy(ICONS, { get: (t, k) => t[k] || svg('M4 4h16v16H4z') })
const Btn = ({ children, size, variant, ...p }) => jsx('button', { type: 'button', ...p, children })
const Pass = ({ children }) => children ?? null
window.__sdk = {
  atom, useValue, useQuery, icons, Button: Btn, Tip: Pass, GlyphSpinner: () => jsx('span', { children: '…' }),
  Popover: ({ children, onOpenChange }) => { React.useEffect(() => { onOpenChange(true) }, []); return children },
  PopoverTrigger: Pass,
  PopoverContent: ({ children, onMouseEnter, onMouseLeave, align, side, className, ...p }) => createPortal(jsx('div', { className: 'panel ' + className, ...p, children }), document.getElementById('portal')),
  SearchField: ({ value, onChange, placeholder, inputRef }) => jsx('input', { ref: inputRef, placeholder, value, onChange: e => onChange(e.target.value), style: { width: '100%', padding: '6px 8px', background: 'rgba(255,255,255,.06)', border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, color: 'inherit' } }),
  createBudgetedLoop: fn => { const id = setInterval(fn, 1000); return { dispose: () => clearInterval(id) } },
  STATUSBAR_AREAS: { right: 'r' }, PALETTE_AREA: 'p', KEYBINDS_AREA: 'k'
}
window.__react = React; window.__jsx = { jsx, jsxs }

// Cover: a generated gradient image (data URL, same-origin so the accent sampler works)
const cover = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#d23b2a'); gr.addColorStop(1, '#5a1a78'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); g.fillStyle = '#fff'; g.font = 'bold 30px sans-serif'; g.fillText('DOOM', 18, 74); return c.toDataURL() })()
const track = (id, name, extra = {}) => ({ id, uri: `spotify:track:${id}`, name, duration_ms: 180000, artists: [{ name: 'DANGERDOOM', uri: 'spotify:artist:dd' }], album: { name: 'The Mouse and the Mask', uri: 'spotify:album:mm', images: [{ url: cover, width: 128 }] }, ...extra })
window.__playing = true
window.__track = track('t1', 'Benzi Box')
const routes = {
  'GET /player': () => window.__playing !== null ? { ok: true, data: { is_playing: window.__playing, progress_ms: 48000, item: window.__track, device: { id: 'd1', name: 'amit-Vivobook', type: 'Computer', is_active: true, volume_percent: 80 }, shuffle_state: false, repeat_state: 'off' } } : { ok: true, data: { empty: true } },
  'GET /devices': () => ({ ok: true, data: { devices: [{ id: 'd1', name: 'amit-Vivobook', type: 'Computer', is_active: true, volume_percent: 80 }] } }),
  'GET /recent': () => ({ ok: true, data: { items: ['Sofa King', 'Benzi Box', 'Old School', 'Crosshairs'].map((n, i) => ({ track: track('r' + i, n), played_at: new Date(Date.now() - i * 900000).toISOString() })) } }),
  'GET /playlists': () => ({ ok: true, data: { items: ['Doom Mix', 'מקלחת', 'Late Night', 'Gym'].map((n, i) => ({ id: 'p' + i, uri: 'spotify:playlist:p' + i, name: n, items: { total: 9 + i }, owner: { display_name: 'Amit' }, images: [{ url: cover, width: 128 }] })) } }),
  'GET /library/contains': q => ({ ok: true, data: q.get('uris').split(',').map(() => false) }),
  'PUT /library': () => ({ ok: true, data: {} }),
  'POST /next': () => { window.__track = track('t2', 'Sofa King'); return { ok: true, data: {} } },
  'POST /pause': () => { window.__playing = false; return { ok: true, data: {} } },
  'POST /play': () => { window.__playing = true; return { ok: true, data: {} } }
}
async function rest(p, opts = {}) {
  const m = (opts.method || 'GET').toUpperCase(); const [path, qs] = p.split('?')
  const h = routes[`${m} ${path}`]
  return h ? h(new URLSearchParams(qs || ''), opts.body || {}) : { ok: true, data: {} }
}

window.__mount = async src => {
  const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }))
  const plugin = (await import(url)).default
  const contribs = []
  plugin.register({ rest, onDispose() {}, register: c => contribs.push(c), registerMany: cs => contribs.push(...cs), os: { openExternal: async () => true }, storage: { get: (_k, f) => f, set() {}, remove() {} } })
  const bar = contribs.find(c => c.area === 'r')
  window.__player = bar.render().props.player
  createRoot(document.getElementById('root')).render(bar.render())
}
