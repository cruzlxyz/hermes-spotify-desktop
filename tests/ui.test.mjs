// Mounts the real spotify-desktop plugin.js with real React + jsdom, stubbed SDK
// primitives and a fake /api backend, then drives every view and control.
import fs from 'node:fs'
import path from 'node:path'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', { pretendToBeVisual: true })
Object.assign(globalThis, { window: dom.window, document: dom.window.document, HTMLElement: dom.window.HTMLElement, Node: dom.window.Node, getComputedStyle: dom.window.getComputedStyle })
globalThis.IS_REACT_ACT_ENVIRONMENT = true
globalThis.requestAnimationFrame = f => setTimeout(f, 0)

const React = await import('react')
const { createRoot } = await import('react-dom/client')
const { act } = React
const { jsx, jsxs } = await import('react/jsx-runtime')

// ---- SDK stub ---------------------------------------------------------------
const atom = v => { let x = v; const subs = new Set(); return { get: () => x, set: n => { x = n; subs.forEach(f => f()) }, subscribe: f => (subs.add(f), () => subs.delete(f)) } }
const useValue = a => React.useSyncExternalStore(a.subscribe, a.get)
const cache = new Map()
function useQuery({ enabled = true, queryKey, queryFn }) {
  const key = JSON.stringify(queryKey)
  const [, force] = React.useState(0)
  React.useEffect(() => {
    if (!enabled || cache.has(key)) return
    cache.set(key, { loading: true })
    Promise.resolve(queryFn()).then(data => { cache.set(key, { data }); force(n => n + 1) })
  }, [key, enabled])
  const entry = cache.get(key) || {}
  return { data: entry.data, isLoading: enabled && !entry.data, isFetching: false, refetch: () => { cache.delete(key); force(n => n + 1) } }
}
const Btn = ({ children, size, variant, ...p }) => jsx('button', { type: 'button', ...p, children })
const Pass = ({ children }) => children ?? null
const icon = name => props => jsx('svg', { 'data-icon': name, ...props })
const icons = new Proxy({}, { get: (_, k) => icon(String(k)) })
const sdk = {
  atom, useValue, useQuery, icons,
  Button: Btn, Tip: Pass, GlyphSpinner: () => jsx('span', { 'data-spinner': true }),
  Popover: ({ children, onOpenChange }) => { React.useEffect(() => { onOpenChange(true) }, []); return children },
  PopoverTrigger: Pass, PopoverContent: ({ children, onMouseEnter, onMouseLeave, align, side, ...p }) => jsx('div', { ...p, children }),
  SearchField: ({ value, onChange, placeholder, inputRef }) => jsx('input', { ref: inputRef, placeholder, value, onChange: e => onChange(e.target.value) }),
  createBudgetedLoop: fn => { const id = setInterval(fn, 1000); return { dispose: () => clearInterval(id) } },
  STATUSBAR_AREAS: { right: 'statusbar.right' }, PALETTE_AREA: 'palette', KEYBINDS_AREA: 'keybinds'
}
globalThis.__sdk = sdk; globalThis.__react = React; globalThis.__jsx = { jsx, jsxs }

const src = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/^import \{([^}]*)\} from '@hermes\/plugin-sdk'$/m, 'const {$1} = globalThis.__sdk')
  .replace(/^import \{([^}]*)\} from 'react'$/m, 'const {$1} = globalThis.__react')
  .replace(/^import \{([^}]*)\} from 'react\/jsx-runtime'$/m, 'const {$1} = globalThis.__jsx')
const modPath = path.join(fs.mkdtempSync(path.join((await import('node:os')).tmpdir(), 'spd-')), 'plugin.under-test.mjs')
fs.writeFileSync(modPath, src)
const plugin = (await import(modPath + '?' + Date.now())).default

// ---- fake backend -----------------------------------------------------------
const track = (id, name, extra = {}) => ({ id, uri: `spotify:track:${id}`, name, duration_ms: 180000, artists: [{ name: 'MF DOOM', uri: 'spotify:artist:doom' }], album: { name: 'The Mouse and the Mask', uri: 'spotify:album:mm', images: [{ url: 'https://i/a.jpg', width: 64 }] }, ...extra })
let playing = false, libraryCalls = [], calls = [], searchTypes = [], authBroken = false
const saved = new Set(['spotify:track:t2'])
const routes = {
  'GET /player': () => authBroken ? { ok: false, error: 'Spotify authentication failed or expired.', status_code: 401, auth_required: true } : playing ? { ok: true, data: { is_playing: true, progress_ms: 1000, item: track('t1', 'Benzi Box'), device: { id: 'd1', name: 'Laptop', type: 'Computer', is_active: true, volume_percent: 70 }, shuffle_state: false, repeat_state: 'off', context: { uri: 'spotify:album:mm' } } } : { ok: true, data: { status_code: 204, empty: true } },
  'GET /devices': () => ({ ok: true, data: { devices: [{ id: 'd1', name: 'Laptop', type: 'Computer', is_active: false, volume_percent: 100 }] } }),
  'GET /recent': () => ({ ok: true, data: { items: [{ track: track('t1', 'Benzi Box'), played_at: new Date(Date.now() - 600000).toISOString(), context: { uri: 'spotify:artist:doom' } }, { track: track('t2', 'Sofa King'), played_at: new Date().toISOString(), context: null }] } }),
  'GET /playlists': () => ({ ok: true, data: { items: [{ id: 'pl1', uri: 'spotify:playlist:pl1', name: 'Doom Mix', items: { total: 2 }, owner: { display_name: 'Amit' }, images: [] }, { id: 'pl2', uri: 'spotify:playlist:pl2', name: 'Locked', items: { total: 9 }, owner: { display_name: 'Spotify' }, images: [] }] } }),
  'GET /playlists/pl1/items': () => ({ ok: true, data: { total: 2, items: [{ item: track('t3', 'Vats of Urine') }, { item: track('t4', 'Crosshairs') }, { item: null }] } }),
  'GET /playlists/pl2/items': () => ({ ok: false, error: 'Spotify rejected the request.' }),
  'GET /search': q => {
    searchTypes.push(q.get('type'))
    const all = { tracks: { items: [track('t5', 'Mince Meat', { explicit: true }), track('t6', 'Basket Case')] }, artists: { items: [{ id: 'doom', uri: 'spotify:artist:doom', name: 'MF DOOM', images: [] }] }, albums: { items: [{ id: 'mm', uri: 'spotify:album:mm', name: 'MM..FOOD', release_date: '2004-11-16', artists: [{ name: 'MF DOOM' }], images: [] }] }, playlists: { items: [null, { id: 'pl9', uri: 'spotify:playlist:pl9', name: 'Doom Radio', owner: { display_name: 'Spotify' }, images: [] }] } }
    const out = {}
    for (const t of q.get('type').split(',')) out[t + 's'] = all[t + 's']
    return { ok: true, data: out }
  },
  'GET /albums/mm': () => ({ ok: true, data: { name: 'MM..FOOD', uri: 'spotify:album:mm', release_date: '2004-11-16', total_tracks: 2, artists: [{ name: 'MF DOOM' }], images: [], tracks: { items: [track('a1', 'Beef Rapp', { track_number: 1 }), track('a2', 'Hoe Cakes', { track_number: 2 })] } } }),
  'GET /artists/doom/albums': () => ({ ok: true, data: { items: [{ id: 'mm', uri: 'spotify:album:mm', name: 'MM..FOOD', album_type: 'album', release_date: '2004', images: [] }] } }),
  'GET /saved': () => ({ ok: true, data: { total: 1, items: [{ track: track('t2', 'Sofa King') }] } }),
  'GET /me': () => ({ ok: true, data: { id: 'amit', display_name: 'Amit' } }),
  'GET /queue': () => ({ ok: true, data: { currently_playing: track('t1', 'Benzi Box'), queue: [track('t7', 'El Chupa Nibre')] } }),
  'GET /library/contains': q => ({ ok: true, data: q.get('uris').split(',').map(u => saved.has(u)) }),
  'PUT /library': (q, b) => { libraryCalls.push(['save', b.uris]); b.uris.forEach(u => saved.add(u)); return { ok: true, data: {} } },
  'DELETE /library': (q, b) => { libraryCalls.push(['remove', b.uris]); b.uris.forEach(u => saved.delete(u)); return { ok: true, data: {} } },
  'POST /play': () => { playing = true; return { ok: true, data: {} } },
  'POST /pause': () => { playing = false; return { ok: true, data: {} } },
  'POST /next': () => ({ ok: true, data: {} }), 'POST /previous': () => ({ ok: true, data: {} }),
  'PUT /volume': () => ({ ok: true, data: {} }), 'PUT /shuffle': () => ({ ok: true, data: {} }), 'PUT /repeat': () => ({ ok: true, data: {} }), 'PUT /seek': () => ({ ok: true, data: {} }), 'POST /queue': () => ({ ok: true, data: {} }), 'PUT /transfer': () => ({ ok: true, data: {} })
}
async function rest(p, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase()
  const [pathname, qs] = p.split('?')
  calls.push(`${method} ${pathname}` + (opts.body ? ' ' + JSON.stringify(opts.body) : ''))
  const h = routes[`${method} ${pathname}`]
  if (!h) throw new Error('no route ' + method + ' ' + pathname)
  return h(new URLSearchParams(qs || ''), opts.body || {})
}

// ---- mount ------------------------------------------------------------------
const contributions = []
const opened = []
const notes = []
const mem = new Map([['last', null]])
const ctx = {
  rest, onDispose() {}, register: c => contributions.push(c), registerMany: cs => cs.forEach(c => contributions.push(c)),
  os: { openExternal: async url => { opened.push(url); return true }, notify: n => notes.push(n), writeClipboard: async () => true },
  storage: { get: (k, f) => (mem.has(k) && mem.get(k) != null ? mem.get(k) : f), set: (k, v) => mem.set(k, v), remove: k => mem.delete(k) }
}
const realTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...a) => realTimeout(fn, (ms || 0) <= 1200 ? Math.min(ms || 0, 5) : ms, ...a) // speed up debounces/waits
plugin.register(ctx)
const bar = contributions.find(c => c.area === 'statusbar.right')
const player = bar.render().props.player
const root = document.createElement('div'); document.body.append(root)
const r = createRoot(root)
const flush = async (n = 6) => { for (let i = 0; i < n; i++) await act(async () => { await new Promise(res => realTimeout(res, 15)) }) }
await act(async () => r.render(bar.render()))
await flush()

let pass = 0, fail = 0
const check = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✓', name) } else { fail++; console.log('  ✗', name, extra) } }
const $ = sel => root.querySelector(sel)
const $$ = sel => [...root.querySelectorAll(sel)]
const byLabel = l => root.querySelector(`[aria-label="${l}"]`)
const click = async el => { await act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))); await flush() }
const key = async (k, target = $('.hermes-spotify-body')) => { await act(async () => target.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k, bubbles: true }))); await flush() }
const tab = name => $$('.hermes-spotify-tab').find(b => b.textContent === name)
const text = () => root.textContent

console.log('Player tab (idle)')
check('shows last played track', text().includes('Benzi Box'))
check('idle device line', text().includes('Last played · ready on Laptop'))
check('real device volume', text().includes('100%'))
check('seek + volume sliders are native ranges', $$('input.hsp-range').length === 2)
check('artist links to Spotify', $$('.hermes-spotify-link').length === 2)

console.log('Like current track')
await click(byLabel('Save to Liked Songs'))
check('PUT /library sent', libraryCalls.some(([k, u]) => k === 'save' && u[0] === 'spotify:track:t1'), JSON.stringify(libraryCalls))
check('heart now filled', Boolean(byLabel('Remove from Liked Songs')))
check('confirmation shown', text().includes('Saved to Liked Songs'))

console.log('Play from idle → resumes last track')
calls = []
await click(byLabel('Play'))
const playCall = calls.find(c => c.startsWith('POST /play'))
check('play sends the remembered track', playCall && playCall.includes('spotify:track:t1') && playCall.includes('"device_id":"d1"'), playCall)
check('now shows playing state', text().includes('Playing on Laptop'), text().slice(0, 200))

console.log('Keyboard shortcuts')
calls = []
await key('n'); check('N → next', calls.some(c => c.startsWith('POST /next')))
await key('m'); await flush(); check('M → mute (volume 0)', calls.some(c => c.startsWith('PUT /volume') && c.includes('"volume_percent":0')), calls.join('|'))
await key('2'); check('2 → Library tab', tab('Library').getAttribute('data-active') === 'true')

console.log('Library tab')
await flush()
check('recently played listed', text().includes('Recently played') && text().includes('Sofa King'))
check('relative time shown', /\dm ago|just now/.test(text()))
check('playlists listed', text().includes('Doom Mix') && text().includes('2 tracks'))
await click($$('.hermes-spotify-row').find(el => el.textContent.includes('Doom Mix')))
check('drill-down shows playlist tracks', text().includes('Vats of Urine') && text().includes('Crosshairs'))
check('null (unavailable) entries skipped', $$('.hermes-spotify-index').length === 2)
calls = []
await click(byLabel('Play Crosshairs'))
const ctxPlay = calls.find(c => c.startsWith('POST /play'))
check('track plays inside its playlist context', ctxPlay && ctxPlay.includes('"context_uri":"spotify:playlist:pl1"') && ctxPlay.includes('"offset":"spotify:track:t4"'), ctxPlay)
await click(byLabel('Open in Spotify'))
check('open in Spotify uses spotify: link', opened.includes('spotify:playlist:pl1'), opened.join(','))
await click(byLabel('Back to playlists'))
await click($$('.hermes-spotify-row').find(el => el.textContent.includes('Locked')))
check('non-owned playlist explains why', text().includes('Tracks unavailable'))
await click(byLabel('Back to playlists'))

console.log('Search tab')
await key('/')
check('/ → Search tab', tab('Search').getAttribute('data-active') === 'true')
const input = $('.hermes-spotify-search input')
await act(async () => { const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set; setter.call(input, 'doom'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })) })
await flush(10)
check('results render', text().includes('Mince Meat') && text().includes('Basket Case'))
calls = []
await key('n', input)
check('typing in search does not trigger shortcuts', !calls.some(c => c.startsWith('POST /next')))
await click(byLabel('Add to queue'))
check('add to queue', text().includes('Added to queue'))
check('all result types requested', searchTypes.includes('track,artist,album,playlist'), searchTypes.join('|'))
check('grouped sections + explicit badge', text().includes('Artists') && text().includes('Albums') && text().includes('Doom Radio') && $$('.hermes-spotify-e').length === 1)
await click($$('.hermes-spotify-chip-btn').find(b => b.textContent === 'Albums'))
check('filter chip narrows type', searchTypes[searchTypes.length - 1] === 'album', searchTypes.join('|'))
await click($$('.hermes-spotify-row').find(el => el.textContent.includes('MM..FOOD')))
check('album opens in Library with tracks', tab('Library').getAttribute('data-active') === 'true' && text().includes('Beef Rapp') && text().includes('2004'))
calls = []
await click(byLabel('Play Hoe Cakes'))
check('album track plays in album context', calls.some(c => c.includes('"context_uri":"spotify:album:mm"') && c.includes('"offset":"spotify:track:a2"')), calls.join('|'))
await key('Escape')
check('Esc goes back from album', text().includes('Doom Mix'))
await click(tab('Search'))
check('search text kept across tabs', $('.hermes-spotify-search input').value === 'doom')

console.log('Artist + Liked Songs')
await click(tab('Player'))
await click($$('.hermes-spotify-link').find(b => b.textContent === 'MF DOOM'))
check('artist link browses releases', text().includes('Artist') && text().includes('MM..FOOD'))
await click(tab('Library'))
check('re-selecting Library resets to root', text().includes('Liked Songs') && text().includes('Doom Mix'))
await click($$('.hermes-spotify-row').find(el => el.textContent.includes('Your saved tracks')))
check('liked songs list', text().includes('1 songs') && text().includes('Sofa King'))
calls = []
await click($$('.hermes-spotify-pill')[0])
check('liked plays as collection context', calls.some(c => c.includes('spotify:user:amit:collection')), calls.join('|'))

console.log('Queue tab')
await click(tab('Queue'))
check('now playing + next up', text().includes('Now playing') && text().includes('El Chupa Nibre'))

console.log('Command palette + keybinds')
const palette = contributions.filter(c => c.area === 'palette')
const keybinds = contributions.filter(c => c.area === 'keybinds')
check('8 palette commands', palette.length === 8, palette.length)
check('3 global shortcuts', keybinds.map(k => k.data.defaults[0]).join(',') === 'mod+alt+space,mod+alt+],mod+alt+[')
calls = []
await act(async () => palette.find(c => c.data.id.endsWith('.next')).data.run()); await flush()
check('palette Next works', calls.some(c => c.startsWith('POST /next')))
check('palette detail shows track', palette[0].data.detail().includes('Benzi Box'))

console.log('Persistence, notifications, auth')
check('last track persisted', mem.get('last') && mem.get('last').track === 'Benzi Box')
await click(byLabel('Song-change notifications: off'))
check('notify toggle persisted', mem.get('notify') === true)
playing = true
await act(async () => { await player.refresh(true) }); await flush()
check('no duplicate notification for same track', notes.length === 0)
routes['GET /player'] = () => ({ ok: true, data: { is_playing: true, progress_ms: 0, item: track('t9', 'Rhymes Like Dimes'), device: { id: 'd1', name: 'Laptop', type: 'Computer', is_active: true, volume_percent: 70 } } })
await act(async () => { await player.refresh(true) }); await flush()
check('song change → native notification', notes.length === 1 && notes[0].title === 'Rhymes Like Dimes' && notes[0].actions[0].label === 'Next', JSON.stringify(notes))
authBroken = true
routes['GET /player'] = () => ({ ok: false, error: 'expired', status_code: 401, auth_required: true })
await act(async () => { await player.refresh(true) }); await flush()
check('auth banner shown', text().includes('hermes spotify login'))
routes['GET /player'] = () => ({ ok: false, error: 'Spotify rate limit exceeded. Retry after 40 seconds.', status_code: 429 })
await act(async () => { await player.refresh(true) }); await flush()
calls = []
await act(async () => { await player.refresh() }); await flush()
check('429 backs off polling', !calls.some(c => c.startsWith('GET /player')), calls.join('|'))

console.log(`\n${pass} passed, ${fail} failed`)
await act(async () => r.unmount())
process.exit(fail ? 1 : 0)
