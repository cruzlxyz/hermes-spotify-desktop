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

import { atom, Button, createBudgetedLoop, GlyphSpinner, icons, KEYBINDS_AREA, PALETTE_AREA, Popover, PopoverContent, PopoverTrigger, SearchField, STATUSBAR_AREAS, Tip, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useRef, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'spotify-desktop'

/** ctx.rest is bound here at register time. */
let api = async () => {
  throw new Error('Spotify plugin not initialized')
}

/** Poll cadence, served by the backend from plugins.entries settings. */
let pollOpenMs = 4000
let pollClosedMs = 12000

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
.hermes-spotify-chip{display:inline-flex;align-items:center;gap:6px;min-width:0}
.hermes-spotify-chip-art{width:14px;height:14px;border-radius:3px;object-fit:cover;flex-shrink:0}
.hermes-spotify-name{max-width:200px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-eq{display:inline-flex;align-items:flex-end;gap:1.5px;height:10px;flex-shrink:0}
.hermes-spotify-eq>i{display:block;width:2px;height:100%;border-radius:1px;background:var(--ui-accent);transform-origin:bottom;animation:hermes-spotify-eq 1s ease-in-out infinite}
.hermes-spotify-eq>i:nth-child(2){animation-delay:-.35s}
.hermes-spotify-eq>i:nth-child(3){animation-delay:-.7s}
.hermes-spotify-eq[data-paused=true]>i{animation-play-state:paused;transform:scaleY(.35)}
@keyframes hermes-spotify-eq{0%,100%{transform:scaleY(.3)}50%{transform:scaleY(1)}}
/* ---- motion ---- */
@property --hsp-pct{syntax:'<percentage>';inherits:false;initial-value:0%}
@property --hsp-accent{syntax:'<color>';inherits:true;initial-value:transparent}
@keyframes hsp-pop-in{from{opacity:0;transform:translateY(6px) scale(.97)}to{opacity:1;transform:none}}
@keyframes hsp-view-fwd{from{opacity:0;transform:translateX(14px)}to{opacity:1;transform:none}}
@keyframes hsp-view-back{from{opacity:0;transform:translateX(-14px)}to{opacity:1;transform:none}}
@keyframes hsp-view-fade{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes hsp-row-in{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:none}}
@keyframes hsp-art-in{from{opacity:0;transform:scale(.86) rotate(-3deg);filter:blur(6px)}to{opacity:1;transform:none;filter:none}}
@keyframes hsp-text-in{from{opacity:0;transform:translateY(7px)}to{opacity:1;transform:none}}
@keyframes hsp-icon-in{from{opacity:0;transform:scale(.4) rotate(-90deg)}to{opacity:1;transform:none}}
@keyframes hsp-heart-pop{0%{transform:scale(1)}30%{transform:scale(1.45)}55%{transform:scale(.88)}80%{transform:scale(1.08)}100%{transform:scale(1)}}
@keyframes hsp-ring{from{opacity:.7;transform:scale(.4)}to{opacity:0;transform:scale(1.9)}}
@keyframes hsp-note-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@keyframes hsp-shake{0%,100%{transform:none}20%{transform:translateX(-3px)}40%{transform:translateX(3px)}60%{transform:translateX(-2px)}80%{transform:translateX(2px)}}
@keyframes hsp-spin{to{transform:rotate(360deg)}}
@keyframes hsp-chip-in{from{opacity:0;transform:translateY(60%)}to{opacity:1;transform:none}}
@keyframes hsp-pulse{0%,100%{box-shadow:0 0 0 0 color-mix(in srgb,var(--hsp-accent,var(--ui-accent)) 45%,transparent)}50%{box-shadow:0 0 0 7px transparent}}
@keyframes hsp-bounce-r{0%,100%{transform:none}50%{transform:translateX(3px)}}
@keyframes hsp-bounce-l{0%,100%{transform:none}50%{transform:translateX(-3px)}}
.hermes-spotify-shell{animation:hsp-pop-in .22s cubic-bezier(.2,.9,.3,1.2) both;transform-origin:bottom right}
.hsp-view{animation:hsp-view-fade .22s ease-out both}
.hsp-view[data-dir=fwd]{animation-name:hsp-view-fwd}
.hsp-view[data-dir=back]{animation-name:hsp-view-back}
.hermes-spotify-list>*{animation:hsp-row-in .28s ease-out both;animation-delay:calc(min(var(--i,0),14) * 22ms)}
.hsp-art-img{animation:hsp-art-in .45s cubic-bezier(.2,.8,.2,1) both}
.hermes-spotify-art{transition:transform .5s cubic-bezier(.2,.8,.2,1.3),box-shadow .5s}
.hermes-spotify-art[data-playing=false]{transform:scale(.93);box-shadow:0 2px 8px rgba(0,0,0,.25)}
.hermes-spotify-art[data-playing=true]{box-shadow:0 8px 22px color-mix(in srgb,var(--hsp-accent,#000) 45%,rgba(0,0,0,.35))}
.hsp-text-swap{animation:hsp-text-in .35s ease-out both}
.hsp-text-swap+.hsp-text-swap,.hermes-spotify-meta>.hsp-text-swap:nth-child(2){animation-delay:50ms}
.hsp-icon-swap{display:inline-flex;animation:hsp-icon-in .25s cubic-bezier(.2,.9,.3,1.4) both}
.hermes-spotify-play[data-playing=true]{animation:hsp-pulse 2.4s ease-in-out infinite}
.hsp-like{position:relative;display:inline-flex}
.hsp-like[data-pop=true] .hermes-spotify-action svg{animation:hsp-heart-pop .5s cubic-bezier(.2,.9,.3,1.3)}
.hsp-like[data-pop=true]::after{content:'';position:absolute;inset:0;margin:auto;width:18px;height:18px;border-radius:50%;border:2px solid var(--hsp-accent,var(--ui-accent));pointer-events:none;animation:hsp-ring .5s ease-out forwards}
.hermes-spotify-note-text{animation:hsp-note-in .25s ease-out both}
.hermes-spotify-note[data-tone=error] .hermes-spotify-note-text{animation:hsp-note-in .25s ease-out both,hsp-shake .4s .05s ease-in-out}
.hermes-spotify-action[data-spin=true] svg{animation:hsp-spin .7s linear infinite}
.hermes-spotify-transport [data-nudge=next] svg{animation:hsp-bounce-r .3s ease-out}
.hermes-spotify-transport [data-nudge=previous] svg{animation:hsp-bounce-l .3s ease-out}
.hermes-spotify-name>span{display:inline-block;animation:hsp-chip-in .35s cubic-bezier(.2,.8,.2,1) both}
.hermes-spotify-tabs{position:relative}
.hsp-tab-ind{position:absolute;top:2px;bottom:2px;left:2px;width:calc((100% - 4px - 6px) / 4);border-radius:calc(var(--radius-md,8px) - 2px);background:var(--ui-bg-elevated,rgba(127,127,127,.18));box-shadow:0 1px 2px rgba(0,0,0,.25);transform:translateX(calc(var(--tab,0) * (100% + 2px)));transition:transform .28s cubic-bezier(.3,.9,.3,1.1);z-index:0}
.hermes-spotify-tabs>.hermes-spotify-tab{position:relative;z-index:1}
.hermes-spotify-tabs>.hermes-spotify-tab[data-active=true]{background:transparent;box-shadow:none}
.hermes-spotify-chip-btn{transition:background .18s,color .18s,border-color .18s,transform .12s}
.hermes-spotify-chip-btn:active{transform:scale(.94)}
.hermes-spotify-row{transition:background .12s,transform .12s}
.hermes-spotify-row:active{transform:scale(.985)}
.hermes-spotify-row-actions{transform:translateX(4px);transition:opacity .15s,transform .15s}
.hermes-spotify-row:hover .hermes-spotify-row-actions,.hermes-spotify-row:focus-within .hermes-spotify-row-actions{transform:none}
.hermes-spotify-thumb-sm img{transition:transform .25s}
.hermes-spotify-row:hover .hermes-spotify-thumb-sm img{transform:scale(1.08)}
.hsp-range{transition:--hsp-pct .9s linear}
.hsp-range:active,.hsp-range[data-snap=true]{transition:none}
.hermes-spotify-banner{animation:hsp-note-in .3s ease-out both}
.hermes-spotify-empty{animation:hsp-view-fade .3s ease-out both}
.hermes-spotify-empty>svg{animation:hsp-icon-in .4s .05s cubic-bezier(.2,.9,.3,1.4) both}
.hermes-spotify-shell::before{transition:--hsp-accent .8s}
@media (prefers-reduced-motion:reduce){
  .hermes-spotify-eq>i{animation:none;transform:scaleY(.6)}
  .hermes-spotify-shell,.hermes-spotify-shell *,.hermes-spotify-bar *{animation:none!important;transition:none!important}
}
.hermes-spotify-action{display:inline-flex;align-items:center;justify-content:center;color:inherit}
.hermes-spotify-action[data-on=true]{color:var(--ui-accent)}

.hermes-spotify-panel{width:360px;padding:0;overflow:hidden}
.hermes-spotify-shell{--hsp-accent:var(--ui-accent);position:relative;isolation:isolate}
.hermes-spotify-shell::before{content:'';position:absolute;inset:0 0 auto 0;height:220px;z-index:-1;pointer-events:none;background:linear-gradient(to bottom,color-mix(in srgb,var(--hsp-accent) 26%,transparent),transparent);transition:background .6s}
.hermes-spotify-banner{display:flex;align-items:center;gap:8px;margin:8px 8px 0;padding:7px 8px 7px 10px;border-radius:var(--radius-sm,6px);background:color-mix(in srgb,var(--ui-yellow,#c08532) 18%,transparent);color:var(--ui-text-primary);font-size:11px}
.hermes-spotify-banner>svg{width:14px;height:14px;flex-shrink:0;color:var(--ui-yellow,#c08532)}
.hermes-spotify-banner>span{flex:1;min-width:0}
.hermes-spotify-banner code{font-size:10.5px;padding:1px 4px;border-radius:3px;background:rgba(127,127,127,.18)}
.hermes-spotify-chips{display:flex;gap:4px;flex-wrap:wrap;margin:0 0 10px}
.hermes-spotify-chip-btn{border:1px solid var(--ui-stroke-secondary,rgba(127,127,127,.3));border-radius:999px;background:transparent;color:var(--ui-text-secondary);font-size:10.5px;padding:3px 9px;cursor:pointer}
.hermes-spotify-chip-btn:hover{color:var(--ui-text-primary)}
.hermes-spotify-chip-btn[data-active=true]{background:var(--ui-text-primary);border-color:transparent;color:var(--ui-bg-elevated,#111)}
.hermes-spotify-thumb-sm[data-round=true]{border-radius:50%}
.hermes-spotify-liked-art{background:linear-gradient(135deg,#4b2bd6,#9fc3e0);color:#fff}
.hermes-spotify-e{display:inline-grid;place-items:center;width:13px;height:13px;margin-right:5px;border-radius:2px;background:var(--ui-text-tertiary);color:var(--ui-bg-elevated,#111);font-size:8.5px;font-weight:700;vertical-align:1px}
.hermes-spotify-note-text{flex:1;min-width:0}
.hermes-spotify-tabs{display:flex;gap:2px;margin:8px 8px 0;padding:2px;border-radius:var(--radius-md,8px);background:var(--ui-bg-tertiary,rgba(127,127,127,.1))}
.hermes-spotify-tab{flex:1;border:0;border-radius:calc(var(--radius-md,8px) - 2px);background:transparent;color:var(--ui-text-tertiary);font-size:11px;font-weight:500;padding:5px 0;cursor:pointer;transition:color .12s,background .12s}
.hermes-spotify-tab:hover{color:var(--ui-text-primary)}
.hermes-spotify-tab[data-active=true]{color:var(--ui-text-primary);background:var(--ui-bg-elevated,rgba(127,127,127,.18));box-shadow:0 1px 2px rgba(0,0,0,.25)}
.hermes-spotify-tab:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.hermes-spotify-body{min-height:300px;max-height:420px;overflow-x:hidden;overflow-y:auto;padding:12px;scrollbar-width:thin}

.hermes-spotify-now{display:flex;gap:12px;align-items:center}
.hermes-spotify-art{width:72px;height:72px;border-radius:var(--radius-sm,6px);background:var(--ui-bg-tertiary,rgba(127,127,127,.14));display:grid;place-items:center;color:var(--ui-text-quaternary,var(--ui-text-tertiary));flex-shrink:0;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,.3)}
.hermes-spotify-art img{width:100%;height:100%;object-fit:cover;display:block}
.hermes-spotify-art svg{width:26px;height:26px}
.hermes-spotify-meta{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px}
.hermes-spotify-title-row{display:flex;align-items:center;gap:2px;min-width:0}
.hermes-spotify-title-row>.hermes-spotify-track{flex:1;min-width:0}
.hermes-spotify-link{display:block;border:0;padding:0;background:none;text-align:left;font:inherit;cursor:pointer;max-width:100%}
.hermes-spotify-link.hermes-spotify-track{font-size:13px;font-weight:600}
.hermes-spotify-link.hermes-spotify-artist{font-size:11.5px}
.hermes-spotify-link:hover{text-decoration:underline;text-underline-offset:2px}
.hermes-spotify-link:focus-visible{outline:2px solid var(--ui-accent);outline-offset:1px;border-radius:2px}
.hermes-spotify-detail-head{display:flex;align-items:center;gap:8px;margin-bottom:8px;min-width:0}
.hermes-spotify-pill{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;border:0;border-radius:999px;padding:5px 11px 5px 9px;background:var(--ui-text-primary);color:var(--ui-bg-elevated,#111);font-size:11px;font-weight:600;cursor:pointer}
.hermes-spotify-pill svg{width:12px;height:12px;fill:currentColor}
.hermes-spotify-pill:hover{opacity:.9}
.hermes-spotify-track{font-size:13px;font-weight:600;color:var(--ui-text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-artist{font-size:11.5px;color:var(--ui-text-secondary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-device{display:flex;align-items:center;gap:5px;margin-top:3px;font-size:10.5px;color:var(--ui-text-tertiary);min-width:0}
.hermes-spotify-device>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-device[data-live=true]{color:var(--ui-accent)}
.hermes-spotify-device svg{width:12px;height:12px;flex-shrink:0}

.hermes-spotify-progress{display:flex;align-items:center;gap:8px;margin-top:14px}
.hermes-spotify-time{font-size:10px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums;flex-shrink:0;min-width:28px}
.hermes-spotify-time:last-child{text-align:right}
.hsp-range{flex:1;min-width:0;height:14px;margin:0;padding:0;background:transparent;-webkit-appearance:none;appearance:none;cursor:pointer}
.hsp-range:disabled{cursor:default;opacity:.5}
.hsp-range::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:linear-gradient(to right,var(--ui-text-secondary) var(--hsp-pct,0%),color-mix(in srgb,var(--ui-text-primary) 18%,transparent) var(--hsp-pct,0%))}
.hsp-range:hover::-webkit-slider-runnable-track{background:linear-gradient(to right,var(--hsp-accent,var(--ui-accent)) var(--hsp-pct,0%),color-mix(in srgb,var(--ui-text-primary) 18%,transparent) var(--hsp-pct,0%))}
.hsp-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:10px;height:10px;margin-top:-3px;border:0;border-radius:50%;background:var(--ui-text-primary);opacity:0;transition:opacity .12s}
.hsp-range:hover::-webkit-slider-thumb,.hsp-range:focus-visible::-webkit-slider-thumb,.hsp-range:active::-webkit-slider-thumb{opacity:1}
.hsp-range:focus-visible{outline:2px solid var(--ui-accent);outline-offset:3px;border-radius:2px}

.hermes-spotify-transport{display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px}
.hermes-spotify-transport .hermes-spotify-action{color:var(--ui-text-secondary)}
.hermes-spotify-transport .hermes-spotify-action:hover{color:var(--ui-text-primary)}
.hermes-spotify-transport .hermes-spotify-action[data-on=true]{color:var(--ui-accent)}
.hermes-spotify-play{width:36px;height:36px;border:0;border-radius:50%;display:grid;place-items:center;background:var(--ui-text-primary);color:var(--ui-bg-elevated,#111);cursor:pointer;transition:transform .1s,opacity .12s}
.hermes-spotify-play:hover{transform:scale(1.06)}
.hermes-spotify-play:active{transform:scale(.96)}
.hermes-spotify-play:disabled{opacity:.6;cursor:default;transform:none}
.hermes-spotify-play:focus-visible{outline:2px solid var(--ui-accent);outline-offset:2px}
.hermes-spotify-play svg{width:16px;height:16px;color:inherit;fill:currentColor;stroke:currentColor}
.hermes-spotify-play[data-playing=false] svg{margin-left:2px}

.hermes-spotify-volume{display:flex;align-items:center;gap:8px;margin-top:10px;color:var(--ui-text-tertiary)}
.hermes-spotify-volume-pct{font-size:10px;font-variant-numeric:tabular-nums;min-width:26px;text-align:right}

.hermes-spotify-section{margin-top:16px}
.hermes-spotify-section:first-child{margin-top:0}
.hermes-spotify-heading{display:flex;align-items:center;justify-content:space-between;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.08em;color:var(--ui-text-tertiary);margin:0 0 6px 2px}
.hermes-spotify-hint{font-size:10.5px;color:var(--ui-text-tertiary);padding:6px 2px}
.hermes-spotify-list{display:flex;flex-direction:column;gap:1px}
.hermes-spotify-row{display:flex;align-items:center;gap:10px;width:100%;min-width:0;border:0;border-radius:var(--radius-sm,6px);background:transparent;color:var(--ui-text-secondary);font-size:12px;padding:6px;cursor:pointer;text-align:left;transition:background .1s}
.hermes-spotify-row:hover{background:var(--ui-control-hover-background,rgba(127,127,127,.1));color:var(--ui-text-primary)}
.hermes-spotify-row:focus-visible{outline:2px solid var(--ui-accent);outline-offset:-2px}
.hermes-spotify-row[data-static=true]{cursor:default}
.hermes-spotify-row[data-active=true] .hermes-spotify-row-title{color:var(--hsp-accent,var(--ui-accent))}
.hermes-spotify-thumb-sm{width:36px;height:36px;border-radius:4px;flex-shrink:0;overflow:hidden;display:grid;place-items:center;background:var(--ui-bg-tertiary,rgba(127,127,127,.14));color:var(--ui-text-tertiary)}
.hermes-spotify-thumb-sm img{width:100%;height:100%;object-fit:cover;display:block}
.hermes-spotify-thumb-sm svg{width:16px;height:16px}
.hermes-spotify-index{width:18px;flex-shrink:0;text-align:center;font-size:10.5px;color:var(--ui-text-tertiary);font-variant-numeric:tabular-nums}
.hermes-spotify-row-main{display:flex;flex-direction:column;gap:1px;min-width:0;flex:1}
.hermes-spotify-row-title{display:block;color:var(--ui-text-primary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-row-sub{display:block;font-size:10.5px;color:var(--ui-text-tertiary);overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-row-actions{display:flex;gap:2px;flex-shrink:0;opacity:0;transition:opacity .1s}
.hermes-spotify-row:hover .hermes-spotify-row-actions,.hermes-spotify-row:focus-within .hermes-spotify-row-actions{opacity:1}
.hermes-spotify-badge{flex-shrink:0;font-size:9.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ui-accent)}

.hermes-spotify-empty{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;padding:16px 12px;border:1px dashed var(--ui-stroke-secondary,rgba(127,127,127,.3));border-radius:var(--radius-md,8px);color:var(--ui-text-tertiary);font-size:11px;line-height:1.45}
.hermes-spotify-empty svg{width:20px;height:20px}
.hermes-spotify-empty strong{color:var(--ui-text-secondary);font-size:12px;font-weight:600}
.hermes-spotify-empty button{margin-top:4px}
.hermes-spotify-skeleton{height:48px;border-radius:var(--radius-sm,6px);background:linear-gradient(90deg,rgba(127,127,127,.08),rgba(127,127,127,.16),rgba(127,127,127,.08));background-size:200% 100%;animation:hermes-spotify-shimmer 1.2s linear infinite}
@keyframes hermes-spotify-shimmer{to{background-position:-200% 0}}
.hermes-spotify-search{margin-bottom:8px}

.hermes-spotify-note{display:flex;align-items:center;gap:6px;font-size:10.5px;color:var(--ui-text-tertiary);padding:7px 12px;border-top:1px solid var(--ui-stroke-tertiary,rgba(127,127,127,.18));min-height:14px}
.hermes-spotify-note>span{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.hermes-spotify-note[data-filled=true]{color:var(--ui-text-secondary)}
.hermes-spotify-note[data-tone=error]{color:var(--ui-red,#e5534b)}
.hermes-spotify-note svg{width:12px;height:12px;flex-shrink:0}
`

function createPlayer(ctx) {
  const store = ctx.storage || { get: (_k, f) => f, set() {}, remove() {} }
  // Last track survives restarts so the idle player isn't blank on launch.
  const state = atom(store.get('last', null) ? { ...store.get('last', null), idle: true, is_playing: false, is_active: false } : null)
  const authRequired = atom(false)
  const accent = atom(null)
  const settings = atom({ notify: Boolean(store.get('notify', false)) })
  const devices = atom([])
  const note = atom('')
  const noteTone = atom('error')
  const open = atom(false)
  const view = atom('now')
  const busy = atom(false)
  const devicesLoading = atom(false)
  // track_uri -> boolean, from /me/library/contains
  const saved = atom({})
  let lastVolume = 50
  let noteTimer = null

  function flash(message) {
    clearTimeout(noteTimer)
    noteTone.set('ok')
    note.set(message)
    noteTimer = setTimeout(() => { note.set(''); noteTone.set('error') }, 2500)
  }

  let backoffUntil = 0
  let lastNotified = null

  function handleFailure(res) {
    if (!res) return
    if (res.auth_required) authRequired.set(true)
    if (res.status_code === 429) {
      const wait = Number(String(res.error || '').match(/after (\d+)/)?.[1] || 30)
      backoffUntil = Date.now() + Math.min(300, Math.max(5, wait)) * 1000
    }
  }

  function remember(next) {
    if (!next || !next.track) return
    const { track, artist, album_img, album_name, album_uri, artist_uri, track_uri, context_uri, duration_ms, progress_ms, device_id, device_name, device_type, volume } = next
    store.set('last', { track, artist, album_img, album_name, album_uri, artist_uri, track_uri, context_uri, duration_ms, progress_ms, device_id, device_name, device_type, volume })
  }

  function maybeNotify(next, prev) {
    if (!settings.get().notify || !next.is_playing || !next.track_uri) return
    if (next.track_uri === lastNotified || (prev && prev.track_uri === next.track_uri)) return
    lastNotified = next.track_uri
    if (ctx.os && typeof ctx.os.notify === 'function') {
      ctx.os.notify({ title: next.track, body: next.artist, silent: true, actions: [{ id: 'next', label: 'Next', onAction: () => { void transport('next') } }] })
    }
  }

  async function refresh(force = false, keepNote = false) {
    if (force) lastFetch = 0
    if (!force && Date.now() < backoffUntil) return
    try {
      const res = await api('/player')
      if (res && !res.ok) handleFailure(res)
      if (res && res.ok) {
        authRequired.set(false)
        if (res.settings) {
          if (Number(res.settings.poll_interval_open) > 0) pollOpenMs = Number(res.settings.poll_interval_open) * 1000
          if (Number(res.settings.poll_interval_closed) > 0) pollClosedMs = Number(res.settings.poll_interval_closed) * 1000
        }
        const d = res.data || {}
        const item = d.item
        if (!item) {
          setIdle()
          if (!keepNote) note.set('')
          return
        }
        const prevForNotify = state.get()
        state.set({
          idle: false,
          track: item ? item.name : null,
          artist: item ? (item.artists || []).map(a => a.name).join(', ') : '',
          album_img: item && item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : null,
          is_playing: !!d.is_playing,
          progress_ms: d.progress_ms || 0,
          duration_ms: item ? item.duration_ms || 0 : 0,
          device_id: d.device ? d.device.id : null,
          device_name: d.device ? d.device.name : '',
          device_type: d.device ? d.device.type : '',
          context_uri: d.context ? d.context.uri : null,
          is_active: !!(d.device && d.device.is_active),
          volume: d.device && typeof d.device.volume_percent === 'number' ? d.device.volume_percent : 50,
          track_uri: item.uri,
          album_name: item.album ? item.album.name : '',
          album_uri: item.album ? item.album.uri : null,
          artist_uri: item.artists && item.artists[0] ? item.artists[0].uri : null,
          shuffle: !!d.shuffle_state,
          repeat: d.repeat_state || 'off'
        })
        if (item.uri) void checkSaved([item.uri])
        const nextState = state.get()
        maybeNotify(nextState, prevForNotify)
        remember(nextState)
        if (!keepNote) note.set('')
      } else if (!keepNote) {
        note.set((res && res.error) || 'Spotify unavailable')
      }
    } catch (err) {
      if (!keepNote) note.set(err && err.message ? err.message : String(err))
    }
  }

  // Spotify drops the playback session a while after pausing: /me/player goes
  // 204 even though the app is open. Keep showing the last track (or the most
  // recently played one) so "Play" has something to resume.
  let recentLoaded = false
  let recentTriedAt = 0
  function setIdle() {
    const current = state.get()
    const list = devices.get()
    const device = list.find(d => d.active) || list[0]
    const base = current && current.track
      ? { ...current }
      : { track: null, artist: '', album_img: null, progress_ms: 0, duration_ms: 0, context_uri: null, shuffle: false, repeat: 'off' }
    state.set({
      ...base,
      idle: true,
      is_playing: false,
      is_active: false,
      device_id: device ? device.id : null,
      device_name: device ? device.name : '',
      device_type: device ? device.type : '',
      volume: device && typeof device.volume === 'number' ? device.volume : (current && current.volume) ?? 50
    })
    if (!recentLoaded && !base.track_uri && Date.now() - recentTriedAt > 15000) {
      recentTriedAt = Date.now()
      void loadRecent()
    }
  }

  async function loadRecent() {
    try {
      const res = await api('/recent?limit=1')
      if (!res || !res.ok) {
        console.debug('[spotify-desktop] /recent failed:', JSON.stringify(res))
        return
      }
      recentLoaded = true
      const entry = res.data && res.data.items && res.data.items[0]
      const item = entry && entry.track
      const current = state.get()
      if (!item || (current && !current.idle)) return
      void checkSaved([item.uri])
      state.set({
        ...current,
        track: item.name,
        artist: (item.artists || []).map(a => a.name).join(', '),
        album_img: item.album && item.album.images && item.album.images[0] ? item.album.images[0].url : null,
        track_uri: item.uri,
        album_name: item.album ? item.album.name : '',
        album_uri: item.album ? item.album.uri : null,
        artist_uri: item.artists && item.artists[0] ? item.artists[0].uri : null,
        context_uri: entry.context ? entry.context.uri : null,
        progress_ms: 0,
        duration_ms: item.duration_ms || 0
      })
    } catch (err) {
      console.debug('[spotify-desktop] /recent threw:', err)
    }
  }

  async function refreshDevices(manual = false) {
    if (manual) devicesLoading.set(true)
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
        const current = state.get()
        if (current && current.idle) setIdle()
      }
    } catch {
      // Device refresh is best-effort.
    } finally {
      devicesLoading.set(false)
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
    // Re-poll right after the current track should have ended so the next
    // track shows up immediately instead of up to one poll interval late.
    const trackEnded = current && current.is_playing && current.duration_ms && current.progress_ms >= current.duration_ms && now - lastFetch > 1500
    // Idle sessions change rarely; back off to save Spotify quota.
    const interval = open.get() ? pollOpenMs : current && current.idle ? pollClosedMs * 2 : pollClosedMs
    if (inFlight || (!trackEnded && now - lastFetch < interval)) return
    inFlight = true
    lastFetch = now
    void refresh().finally(() => { inFlight = false })
  }, { fps: 1, pauseWhenUnfocused: false })

  async function targetDevice() {
    // Pick a device that can actually take playback, in priority order:
    // 1. the currently active device (Spotify reports it),
    // 2. any device the Connect list reports,
    // 3. the last-known device id as a final fallback.
    // Pinning blindly to the last-known id transfers playback to devices
    // that may be offline, silencing everything.
    const s = state.get()
    if (s && s.device_id && s.is_active) return s.device_id
    await refreshDevices()
    const list = devices.get()
    const active = list.find(d => d.active)
    if (active) return active.id
    if (list.length) return list[0].id
    return s ? s.device_id : undefined
  }

  async function transport(action) {
    note.set('')
    busy.set(true)
    try {
      const current = state.get()
      // Optimistic play/pause so the button reacts instantly.
      if (current && (action === 'play' || action === 'pause')) state.set({ ...current, is_playing: action === 'play' })
      const device_id = await targetDevice()
      let body = { device_id }
      // With no live session, a bare "play" has nothing to resume — restart the
      // last track (in its playlist/album when known) at the remembered spot.
      if (action === 'play' && current && current.idle && current.track_uri) {
        body = current.context_uri && !current.context_uri.includes(':artist:')
          ? { device_id, context_uri: current.context_uri, offset: current.track_uri, position_ms: current.progress_ms || 0 }
          : { device_id, uri: current.track_uri, position_ms: current.progress_ms || 0 }
      }
      const res = await api('/' + action, { method: 'POST', body })
      if (!res || !res.ok) { handleFailure(res); note.set((res && res.error) || 'Command failed') }
      await refresh(true, true)
    } finally {
      busy.set(false)
    }
  }

  async function playPayload(payload) {
    try {
      note.set('')
      // Resolve a playable device (see targetDevice) so starting a track from
      // Search/Playlists/Queue works while idle without hijacking playback to
      // an offline device.
      const device_id = await targetDevice()
      const res = await api('/play', { method: 'POST', body: { ...payload, device_id } })
      if (!res || !res.ok) {
        note.set((res && res.error) || 'Could not start playback')
      } else {
        // Spotify can answer 204 while a zombie Connect session ignores the
        // command — surface that instead of failing silently.
        await new Promise(r => setTimeout(r, 1200))
        await refresh(true, true)
        const s = state.get()
        if (!s || !s.is_playing) note.set('Spotify accepted the command but the device ignored it — fully quit and reopen the Spotify app, then try again.')
      }
    } catch (err) {
      // Without this the rejection is unhandled and the click dies silently.
      console.error('[spotify-desktop] playPayload failed:', err)
      note.set(err && err.message ? err.message : 'Play request failed')
    }
  }

  async function toggleMute() {
    const current = state.get()
    const volume = current ? current.volume : 50
    if (volume > 0) {
      lastVolume = volume
      await setVolume(0)
    } else {
      await setVolume(lastVolume || 50)
    }
  }

  let volumeTimer = null
  function setVolume(pct) {
    const current = state.get()
    if (current) state.set({ ...current, volume: pct })
    // Debounce slider drags into one request.
    clearTimeout(volumeTimer)
    return new Promise(resolve => { volumeTimer = setTimeout(() => resolve(sendVolume(pct)), 180) })
  }

  async function sendVolume(pct) {
    const current = state.get()
    if (current) state.set({ ...current, volume: pct })
    const device_id = await targetDevice()
    const res = await api('/volume', { method: 'PUT', body: { volume_percent: pct, device_id } })
    if (!res || !res.ok) note.set((res && res.error) || 'Volume failed')
  }

  async function seek(positionMs) {
    const current = state.get()
    if (current) state.set({ ...current, progress_ms: positionMs })
    const device_id = await targetDevice()
    const res = await api('/seek', { method: 'PUT', body: { position_ms: positionMs, device_id } })
    if (!res || !res.ok) note.set((res && res.error) || 'Seek failed')
    await refresh(true, true)
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

  async function checkSaved(uris) {
    const known = saved.get()
    const missing = uris.filter(u => u && !(u in known))
    if (!missing.length) return
    try {
      const res = await api(`/library/contains?uris=${encodeURIComponent(missing.join(','))}`)
      if (res && res.ok && Array.isArray(res.data)) {
        const next = { ...saved.get() }
        missing.forEach((u, i) => { next[u] = Boolean(res.data[i]) })
        saved.set(next)
      }
    } catch {
      // Best-effort; the heart just stays unfilled.
    }
  }

  async function toggleSaved(uri) {
    if (!uri) return
    const was = Boolean(saved.get()[uri])
    saved.set({ ...saved.get(), [uri]: !was })
    const res = await api('/library', { method: was ? 'DELETE' : 'PUT', body: { uris: [uri] } })
    if (!res || !res.ok) {
      saved.set({ ...saved.get(), [uri]: was })
      note.set((res && res.error) || 'Could not update your library')
    } else {
      flash(was ? 'Removed from Liked Songs' : 'Saved to Liked Songs')
    }
  }

  async function addToQueue(uri) {
    const device_id = await targetDevice()
    const res = await api('/queue', { method: 'POST', body: { uri, device_id } })
    if (res && res.ok) flash('Added to queue')
    else note.set((res && res.error) || 'Queue failed')
  }

  let closeTimer = null
  function cancelClose() {
    clearTimeout(closeTimer)
  }
  function onOpenChange(value) {
    // Radix closes the popover the instant the pointer crosses the gap
    // between the trigger and the panel — grace-period the close so the
    // hop stays lossless. Moving the pointer back into the panel cancels
    // the pending close (cancelClose is wired to onMouseEnter below).
    if (!value) {
      clearTimeout(closeTimer)
      closeTimer = setTimeout(() => open.set(false), 350)
      return
    }
    clearTimeout(closeTimer)
    open.set(true)
    void refresh(true)
    void refreshDevices()
  }

  ctx.onDispose(() => {
    loop.dispose()
    clearTimeout(noteTimer)
    clearTimeout(volumeTimer)
    clearTimeout(closeTimer)
  })

  function nudgeVolume(delta) {
    const current = state.get()
    const volume = current ? current.volume ?? 50 : 50
    return setVolume(Math.max(0, Math.min(100, volume + delta)))
  }

  function togglePlay() {
    const current = state.get()
    return transport(current && current.is_playing ? 'pause' : 'play')
  }

  async function copy(text) {
    const ok = ctx.os && typeof ctx.os.writeClipboard === 'function' ? await ctx.os.writeClipboard(text) : false
    if (ok) flash('Copied')
  }

  function setNotify(on) {
    settings.set({ ...settings.get(), notify: on })
    store.set('notify', on)
    flash(on ? 'Song-change notifications on (shown while Hermes is in the background)' : 'Song-change notifications off')
  }

  // Browse stack: [{ kind: 'album'|'artist'|'playlist'|'liked', id, name, uri, images }]
  const stack = atom([])
  const searchText = atom('')
  function browse(entry) {
    stack.set([...stack.get(), entry])
    view.set('playlists')
    if (!open.get()) open.set(true)
  }
  function back() { stack.set(stack.get().slice(0, -1)) }

  return { state, devices, devicesLoading, busy, note, noteTone, open, view, saved, authRequired, accent, settings, setNotify, copy, stack, browse, back, handleFailure, searchText, refresh, refreshDevices, transport, togglePlay, playPayload, setVolume, nudgeVolume, toggleMute, seek, toggleShuffle, cycleRepeat, transfer, addToQueue, checkSaved, toggleSaved, flash, onOpenChange, cancelClose }
}

function SmallAction({ label, icon, onClick, busy = false, on = false, disabled = false, spin = false }) {
  return jsx(Tip, {
    label,
    children: jsx(Button, {
      'aria-label': label,
      'aria-pressed': on || undefined,
      className: 'hermes-spotify-action',
      'data-on': on,
      'data-spin': spin || undefined,
      disabled,
      onClick,
      size: 'icon-xs',
      variant: 'ghost',
      children: jsx('span', { children: busy ? jsx(GlyphSpinner, { ariaLabel: label }) : jsx(icon, {}) })
    })
  })
}

const IcMusic = () =>
  jsxs('svg', { ...svgProps, strokeWidth: 1.6, children: [
    jsx('path', { d: 'M9 18V5l12-2v13' }),
    jsx('circle', { cx: 6, cy: 18, r: 3 }),
    jsx('circle', { cx: 18, cy: 16, r: 3 })
  ] })

const IcSpeaker = () =>
  jsxs('svg', { ...svgProps, children: [
    jsx('rect', { x: 5, y: 2, width: 14, height: 20, rx: 2 }),
    jsx('circle', { cx: 12, cy: 14, r: 4 }),
    jsx('path', { d: 'M12 6h.01' })
  ] })

const IcPhone = () =>
  jsxs('svg', { ...svgProps, children: [
    jsx('rect', { x: 6, y: 2, width: 12, height: 20, rx: 2 }),
    jsx('path', { d: 'M11 18h2' })
  ] })

const IcRepeatOne = () =>
  jsxs('svg', { ...svgProps, style: { width: 13, height: 13 }, children: [
    jsx('path', { d: 'm17 2 4 4-4 4' }),
    jsx('path', { d: 'M3 11v-1a4 4 0 0 1 4-4h14' }),
    jsx('path', { d: 'm7 22-4-4 4-4' }),
    jsx('path', { d: 'M21 13v1a4 4 0 0 1-4 4H3' }),
    jsx('path', { d: 'M11 10h1v4' })
  ] })

const IcHeart = ({ filled }) =>
  jsx('svg', { ...svgProps, style: { width: 14, height: 14 }, children: jsx('path', {
    d: 'M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.7a4.6 4.6 0 0 1 7.5 5.9z',
    fill: filled ? 'currentColor' : 'none'
  }) })
const IcHeartOff = () => jsx(IcHeart, { filled: false })
const IcHeartOn = () => jsx(IcHeart, { filled: true })

const IcBack = () =>
  jsx('svg', { ...svgProps, style: { width: 14, height: 14 }, children: jsx('path', { d: 'm15 18-6-6 6-6' }) })

const IcClock = () =>
  jsxs('svg', { ...svgProps, children: [jsx('circle', { cx: 12, cy: 12, r: 9 }), jsx('path', { d: 'M12 7v5l3 2' })] })

/** open.spotify.com URL for a spotify: URI (the OS hands spotify: links to the app). */
const spotifyLink = uri => {
  const parts = String(uri || '').split(':')
  return parts.length === 3 ? `spotify:${parts[1]}:${parts[2]}` : null
}

let openExternal = async () => false

function openInSpotify(uri) {
  const link = spotifyLink(uri)
  if (!link) return
  void openExternal(link).then(ok => {
    if (!ok) {
      const parts = link.split(':')
      void openExternal(`https://open.spotify.com/${parts[1]}/${parts[2]}`)
    }
  })
}

const relativeTime = iso => {
  const t = Date.parse(iso)
  if (!t) return ''
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000))
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h ago`
  return `${Math.round(hours / 24)}d ago`
}

const deviceIcon = type => {
  const t = String(type || '').toLowerCase()
  if (t === 'smartphone' || t === 'tablet') return IcPhone
  if (t === 'speaker' || t === 'avr' || t === 'stb' || t === 'audiodongle' || t === 'castaudio') return IcSpeaker
  return icons.Monitor
}

const artists = item => (item.artists || []).map(a => a.name).join(', ')
const smallImage = images => {
  if (!images || !images.length) return null
  const sorted = [...images].sort((a, b) => (a.width || 0) - (b.width || 0))
  return (sorted.find(img => (img.width || 0) >= 64) || sorted[sorted.length - 1]).url
}

/** Give each list child a --i for the staggered entrance (set once per node). */
const staggerRef = el => {
  if (!el) return
  let i = 0
  for (const child of el.children) {
    if (!child.style.getPropertyValue('--i')) child.style.setProperty('--i', String(i))
    i++
  }
}

const accentCache = new Map()
/** Average a downscaled album cover into a readable accent (null on failure). */
function extractAccent(url) {
  if (!url) return Promise.resolve(null)
  if (accentCache.has(url)) return accentCache.get(url)
  const job = new Promise(resolve => {
    if (typeof Image === 'undefined') return resolve(null)
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = canvas.height = 16
        const g = canvas.getContext('2d')
        g.drawImage(img, 0, 0, 16, 16)
        const px = g.getImageData(0, 0, 16, 16).data
        let r = 0, gr = 0, b = 0, w = 0
        for (let i = 0; i < px.length; i += 4) {
          const max = Math.max(px[i], px[i + 1], px[i + 2]), min = Math.min(px[i], px[i + 1], px[i + 2])
          const weight = 1 + (max - min) / 32 // favour saturated pixels
          r += px[i] * weight; gr += px[i + 1] * weight; b += px[i + 2] * weight; w += weight
        }
        resolve(`rgb(${Math.round(r / w)} ${Math.round(gr / w)} ${Math.round(b / w)})`)
      } catch {
        resolve(null)
      }
    }
    img.onerror = () => resolve(null)
    img.src = url
  })
  accentCache.set(url, job)
  return job
}

function useAccent(player) {
  const s = useValue(player.state)
  const url = s && s.album_img
  useEffect(() => {
    let live = true
    void extractAccent(url).then(color => { if (live) player.accent.set(color) })
    return () => { live = false }
  }, [url])
  return useValue(player.accent)
}

function LikeButton({ player, uri }) {
  const saved = useValue(player.saved)
  const [pop, setPop] = useState(false)
  if (!uri || uri.startsWith('spotify:local:')) return null
  const on = Boolean(saved[uri])
  return jsx('span', {
    className: 'hsp-like',
    'data-pop': pop,
    onAnimationEnd: event => { if (event.animationName === 'hsp-ring') setPop(false) },
    children: jsx(SmallAction, { icon: on ? IcHeartOn : IcHeartOff, label: on ? 'Remove from Liked Songs' : 'Save to Liked Songs', on, onClick: () => { if (!on) setPop(true); player.toggleSaved(uri) } })
  })
}

function Thumb({ src }) {
  return jsx('span', { className: 'hermes-spotify-thumb-sm', children: src ? jsx('img', { alt: '', loading: 'lazy', src }) : jsx(IcMusic, {}) })
}

function Equalizer({ paused }) {
  return jsxs('span', { 'aria-hidden': true, className: 'hermes-spotify-eq', 'data-paused': paused, children: [jsx('i', {}), jsx('i', {}), jsx('i', {})] })
}

function Empty({ icon, title, body, action }) {
  return jsxs('div', { className: 'hermes-spotify-empty', children: [
    icon ? jsx(icon, {}) : null,
    jsx('strong', { children: title }),
    body ? jsx('span', { children: body }) : null,
    action || null
  ] })
}

function Skeletons({ count = 4 }) {
  return jsx('div', { className: 'hermes-spotify-list', style: { gap: 6 }, children: Array.from({ length: count }, (_, i) => jsx('div', { className: 'hermes-spotify-skeleton' }, i)) })
}

function NowPlaying({ player }) {
  const s = useValue(player.state)
  const seekable = Boolean(s && s.duration_ms)
  const hasTrack = Boolean(s && s.track)

  // While dragging, show the drag position; commit a single seek on release.
  const [dragSec, setDragSec] = useState(null)
  const shownMs = dragSec != null ? dragSec * 1000 : (s && s.progress_ms) || 0
  const pct = seekable ? Math.min(100, (shownMs / s.duration_ms) * 100) : 0
  const commitSeek = () => {
    if (dragSec == null || !seekable) return
    player.seek(dragSec * 1000)
    setDragSec(null)
  }

  return jsxs('div', { children: [
    jsxs('div', { className: 'hermes-spotify-now', children: [
      jsx('div', { className: 'hermes-spotify-art', 'data-playing': Boolean(s && s.is_playing), children: s && s.album_img ? jsx('img', { alt: '', className: 'hsp-art-img', src: s.album_img }, s.album_img) : jsx(IcMusic, {}) }),
      jsxs('div', { className: 'hermes-spotify-meta', children: [
        jsxs('div', { className: 'hermes-spotify-title-row hsp-text-swap', children: [
          hasTrack && s.track_uri
            ? jsx('button', { className: 'hermes-spotify-track hermes-spotify-link', onClick: event => { if (event.shiftKey || event.metaKey || event.ctrlKey || !s.album_uri) openInSpotify(s.album_uri || s.track_uri); else player.browse({ kind: 'album', id: s.album_uri.split(':')[2], name: s.album_name, uri: s.album_uri, images: s.album_img ? [{ url: s.album_img }] : [] }) }, title: `Show ${s.album_name || 'album'} (Shift-click: open in Spotify)`, type: 'button', children: s.track })
            : jsx('div', { className: 'hermes-spotify-track', children: hasTrack ? s.track : 'Nothing playing' }),
          hasTrack ? jsx(LikeButton, { player, uri: s.track_uri }) : null
        ] }),
        hasTrack && s.artist_uri
          ? jsx('button', { className: 'hermes-spotify-artist hermes-spotify-link', onClick: event => { if (event.shiftKey || event.metaKey || event.ctrlKey) openInSpotify(s.artist_uri); else player.browse({ kind: 'artist', id: s.artist_uri.split(':')[2], name: s.artist.split(', ')[0], uri: s.artist_uri, images: [] }) }, title: `Show ${s.artist.split(', ')[0]} (Shift-click: open in Spotify)`, type: 'button', children: s.artist })
          : jsx('div', { className: 'hermes-spotify-artist', title: hasTrack ? s.artist : undefined, children: hasTrack ? s.artist : 'Press play, or pick a playlist' }),
        s && s.device_name
          ? jsxs('div', { className: 'hermes-spotify-device', 'data-live': s.is_playing, children: [
              s.is_playing ? jsx(Equalizer, { paused: false }) : jsx(deviceIcon(s.device_type), {}),
              jsx('span', { children: s.is_playing ? `Playing on ${s.device_name}` : s.idle ? (hasTrack ? `Last played · ready on ${s.device_name}` : `Ready on ${s.device_name}`) : `Paused on ${s.device_name}` })
            ] })
          : jsx('div', { className: 'hermes-spotify-device', children: jsx('span', { children: 'Open Spotify on any device' }) })
      ] }, (s && s.track_uri) || 'none')
    ] }),
    jsxs('div', { className: 'hermes-spotify-progress', children: [
      jsx('span', { className: 'hermes-spotify-time', children: fmtTime(shownMs) }),
      jsx('input', {
        'aria-label': 'Seek',
        'aria-valuetext': `${fmtTime(shownMs)} of ${fmtTime(s && s.duration_ms)}`,
        className: 'hsp-range',
        disabled: !seekable,
        max: s && s.duration_ms ? Math.round(s.duration_ms / 1000) : 1,
        min: 0,
        onBlur: commitSeek,
        onChange: event => setDragSec(Number(event.target.value)),
        onKeyUp: commitSeek,
        onPointerUp: commitSeek,
        step: 1,
        'data-snap': dragSec != null || !s || !s.is_playing || undefined,
        style: { '--hsp-pct': pct + '%' },
        type: 'range',
        value: Math.round(shownMs / 1000)
      }),
      jsx('span', { className: 'hermes-spotify-time', children: fmtTime(s && s.duration_ms) })
    ] })
  ] })
}

function Transport({ player }) {
  const s = useValue(player.state)
  const busy = useValue(player.busy)
  const playing = !!(s && s.is_playing)
  const repeat = (s && s.repeat) || 'off'
  const volume = (s && s.volume) ?? 50
  const muted = volume === 0
  const [nudge, setNudge] = useState(null)
  const skip = dir => {
    setNudge(null)
    requestAnimationFrame(() => setNudge(dir))
    player.transport(dir)
  }

  return jsxs('div', { children: [
    jsxs('div', { className: 'hermes-spotify-transport', onAnimationEnd: () => setNudge(null), children: [
      jsx(SmallAction, { icon: IcShuffle, label: s && s.shuffle ? 'Shuffle on' : 'Shuffle off', on: !!(s && s.shuffle), onClick: () => player.toggleShuffle() }),
      jsx('span', { 'data-nudge': nudge === 'previous' ? 'previous' : undefined, children: jsx(SmallAction, { icon: IcPrev, label: 'Previous', onClick: () => skip('previous') }) }),
      jsx(Tip, { label: playing ? 'Pause' : 'Play', children: jsx('button', {
        'aria-label': playing ? 'Pause' : 'Play',
        className: 'hermes-spotify-play',
        'data-playing': playing,
        disabled: busy,
        onClick: () => player.transport(playing ? 'pause' : 'play'),
        type: 'button',
        children: busy ? jsx(GlyphSpinner, { ariaLabel: 'Working' }) : jsx('span', { className: 'hsp-icon-swap', children: jsx(playing ? icons.Pause : icons.Play, {}) }, playing ? 'pause' : 'play')
      }) }),
      jsx('span', { 'data-nudge': nudge === 'next' ? 'next' : undefined, children: jsx(SmallAction, { icon: IcNext, label: 'Next', onClick: () => skip('next') }) }),
      jsx(SmallAction, { icon: repeat === 'track' ? IcRepeatOne : IcRepeat, label: repeat === 'off' ? 'Repeat off' : repeat === 'track' ? 'Repeat track' : 'Repeat all', on: repeat !== 'off', onClick: () => player.cycleRepeat() })
    ] }),
    jsxs('div', { className: 'hermes-spotify-volume', children: [
      jsx(SmallAction, { icon: muted ? icons.VolumeX : icons.Volume2, label: muted ? 'Unmute' : 'Mute', onClick: () => player.toggleMute() }),
      jsx('input', {
        'aria-label': 'Volume',
        className: 'hsp-range',
        style: { '--hsp-pct': volume + '%' },
        max: 100,
        min: 0,
        onChange: event => player.setVolume(Number(event.target.value)),
        type: 'range',
        value: volume
      }),
      jsx('span', { className: 'hermes-spotify-volume-pct', children: `${volume}%` })
    ] })
  ] })
}

function Devices({ player }) {
  const devices = useValue(player.devices)
  const loading = useValue(player.devicesLoading)
  const s = useValue(player.state)
  // Spotify quirk: /me/player/devices can come back empty while /me/player knows
  // the active device — fall back to it so the row shows up.
  const list = devices.length === 0 && s && s.device_id
    ? [{ active: true, id: s.device_id, name: s.device_name, type: s.device_type, volume: s.volume }]
    : devices

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsxs('div', { className: 'hermes-spotify-heading', children: [
      jsx('span', { children: 'Devices' }),
      jsx(SmallAction, { spin: loading, icon: icons.RefreshCw, label: 'Refresh devices', onClick: () => player.refreshDevices(true) })
    ] }),
    list.length === 0
      ? jsx(Empty, {
          body: 'Open Spotify on this computer or your phone and play any song once — it will show up here.',
          icon: IcSpeaker,
          title: 'No devices online'
        })
      : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: list.map(d => jsxs('button', {
          'aria-current': d.active || undefined,
          className: 'hermes-spotify-row',
          'data-active': d.active,
          onClick: () => { if (!d.active) player.transfer(d.id) },
          title: d.active ? 'Playing here' : `Move playback to ${d.name}`,
          type: 'button',
          children: [
            jsx('span', { className: 'hermes-spotify-thumb-sm', children: jsx(deviceIcon(d.type), {}) }),
            jsxs('span', { className: 'hermes-spotify-row-main', children: [
              jsx('span', { className: 'hermes-spotify-row-title', children: d.name }),
              jsx('span', { className: 'hermes-spotify-row-sub', children: `${d.type || 'Device'}${typeof d.volume === 'number' ? ` · ${d.volume}%` : ''}` })
            ] }),
            d.active ? jsx('span', { className: 'hermes-spotify-badge', children: 'Active' }) : null
          ]
        }, d.id || d.name)) })
  ] })
}

// Spotify renamed playlist `tracks` to `items` in the February 2026 API change.
const playlistCount = pl => {
  const ref = pl.items || pl.tracks
  return ref && typeof ref.total === 'number' ? ref.total : null
}

function Playlists({ player, open }) {
  const stack = useValue(player.stack)
  const top = stack[stack.length - 1]
  if (!top) return jsx(PlaylistList, { onOpen: pl => player.browse({ kind: 'playlist', ...pl }), open, player })
  if (top.kind === 'playlist') return jsx(PlaylistDetail, { open, player, playlist: top }, top.id)
  if (top.kind === 'album') return jsx(AlbumDetail, { entry: top, open, player }, top.id)
  if (top.kind === 'artist') return jsx(ArtistDetail, { entry: top, open, player }, top.id)
  if (top.kind === 'liked') return jsx(LikedDetail, { open, player })
  return null
}

function DetailHead({ player, title, sub, images, uri, playUri, round = false }) {
  return jsxs('div', { className: 'hermes-spotify-detail-head', children: [
    jsx(SmallAction, { icon: IcBack, label: 'Back', onClick: player.back }),
    jsx('span', { className: 'hermes-spotify-thumb-sm', 'data-round': round, children: smallImage(images) ? jsx('img', { alt: '', src: smallImage(images) }) : jsx(IcMusic, {}) }),
    jsxs('span', { className: 'hermes-spotify-row-main', children: [
      jsx('span', { className: 'hermes-spotify-row-title', title, children: title }),
      jsx('span', { className: 'hermes-spotify-row-sub', children: sub })
    ] }),
    uri ? jsx(SmallAction, { icon: icons.ExternalLink, label: 'Open in Spotify', onClick: () => openInSpotify(uri) }) : null,
    playUri ? jsx('button', { className: 'hermes-spotify-pill', onClick: () => player.playPayload({ context_uri: playUri }), type: 'button', children: [jsx(icons.Play, {}, 'i'), 'Play'] }) : null
  ] })
}

function CollectionRow({ item, kind, player, sub }) {
  const open = () => player.browse({ kind, id: item.id, name: item.name, uri: item.uri, images: item.images })
  return jsxs('div', {
    className: 'hermes-spotify-row',
    onClick: open,
    onKeyDown: event => { if (event.key === 'Enter') { event.preventDefault(); open() } },
    role: 'button',
    tabIndex: 0,
    title: `Open ${item.name}`,
    children: [
      jsx('span', { className: 'hermes-spotify-thumb-sm', 'data-round': kind === 'artist', children: smallImage(item.images) ? jsx('img', { alt: '', loading: 'lazy', src: smallImage(item.images) }) : jsx(IcMusic, {}) }),
      jsxs('span', { className: 'hermes-spotify-row-main', children: [
        jsx('span', { className: 'hermes-spotify-row-title', children: item.name }),
        jsx('span', { className: 'hermes-spotify-row-sub', children: sub })
      ] }),
      kind !== 'artist'
        ? jsx('span', { className: 'hermes-spotify-row-actions', onClick: event => event.stopPropagation(), children: jsx(SmallAction, { icon: icons.Play, label: `Play ${item.name}`, onClick: () => player.playPayload({ context_uri: item.uri }) }) })
        : null
    ]
  })
}

const yearOf = date => (date ? String(date).slice(0, 4) : '')

function AlbumDetail({ player, open, entry }) {
  const query = useQuery({ enabled: open, queryKey: [ID, 'album', entry.id], queryFn: () => api(`/albums/${encodeURIComponent(entry.id)}`), staleTime: 300000 })
  const album = query.data && query.data.ok ? query.data.data : null
  const tracks = album && album.tracks && album.tracks.items ? album.tracks.items.filter(Boolean) : []
  useEffect(() => { if (tracks.length) void player.checkSaved(tracks.slice(0, 40).map(t => t.uri)) }, [tracks.length])
  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx(DetailHead, { images: (album && album.images) || entry.images, player, playUri: entry.uri, sub: album ? [artists(album), yearOf(album.release_date), `${album.total_tracks} tracks`].filter(Boolean).join(' · ') : 'Album', title: (album && album.name) || entry.name, uri: entry.uri }),
    query.isLoading ? jsx(Skeletons, {})
      : !album ? jsx(Empty, { body: query.data && query.data.error, icon: icons.AlertCircle, title: 'Could not load album' })
        : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: tracks.map(t => jsx(TrackRow, { contextUri: entry.uri, index: t.track_number, player, showArt: false, track: t }, t.uri)) })
  ] })
}

function ArtistDetail({ player, open, entry }) {
  const query = useQuery({ enabled: open, queryKey: [ID, 'artist-albums', entry.id], queryFn: () => api(`/artists/${encodeURIComponent(entry.id)}/albums?limit=20`), staleTime: 300000 })
  const items = query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items.filter(Boolean) : []
  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx(DetailHead, { images: entry.images, player, playUri: entry.uri, round: true, sub: 'Artist', title: entry.name, uri: entry.uri }),
    query.isLoading ? jsx(Skeletons, {})
      : query.data && !query.data.ok ? jsx(Empty, { body: query.data.error, icon: icons.AlertCircle, title: 'Could not load releases' })
        : items.length === 0 ? jsx(Empty, { icon: IcMusic, title: 'No releases' })
          : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: items.map(a => jsx(CollectionRow, { item: a, kind: 'album', player, sub: [a.album_type === 'single' ? 'Single' : 'Album', yearOf(a.release_date)].filter(Boolean).join(' · ') }, a.id)) })
  ] })
}

function LikedDetail({ player, open }) {
  const query = useQuery({ enabled: open, queryKey: [ID, 'liked'], queryFn: () => api('/saved?limit=50'), staleTime: 30000 })
  const meQuery = useQuery({ enabled: open, queryKey: [ID, 'me'], queryFn: () => api('/me'), staleTime: Infinity })
  const tracks = (query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items : []).map(e => e && e.track).filter(Boolean)
  const total = query.data && query.data.ok && query.data.data ? query.data.data.total : null
  const me = meQuery.data && meQuery.data.ok ? meQuery.data.data : null
  // Liked Songs plays as its own context: spotify:user:<id>:collection.
  const contextUri = me && me.id ? `spotify:user:${me.id}:collection` : undefined
  useEffect(() => {
    if (!tracks.length) return
    const known = {}
    tracks.forEach(t => { known[t.uri] = true })
    player.saved.set({ ...player.saved.get(), ...known })
  }, [tracks.length])
  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx(DetailHead, { images: [], player, playUri: contextUri, sub: total != null ? `${total} songs` : 'Liked Songs', title: 'Liked Songs', uri: 'spotify:collection:tracks' }),
    query.isLoading ? jsx(Skeletons, {})
      : query.data && !query.data.ok ? jsx(Empty, { body: query.data.error, icon: icons.AlertCircle, title: 'Could not load Liked Songs' })
        : tracks.length === 0 ? jsx(Empty, { body: 'Tap ♥ on any song to save it here.', icon: IcHeartOff, title: 'No liked songs yet' })
          : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: tracks.map((t, i) => jsx(TrackRow, { contextUri, index: i + 1, player, track: t }, t.uri)) })
  ] })
}

function RecentList({ player, open }) {
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'recent'],
    queryFn: () => api('/recent?limit=20'),
    staleTime: 30000
  })
  const seen = new Set()
  const items = (query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items : [])
    .filter(entry => entry && entry.track && !seen.has(entry.track.uri) && seen.add(entry.track.uri))
    .slice(0, 6)
  useEffect(() => {
    if (items.length) void player.checkSaved(items.map(entry => entry.track.uri))
  }, [items.map(entry => entry.track.uri).join(',')])

  if (!query.isLoading && !items.length) return null
  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-heading', children: jsx('span', { children: 'Recently played' }) }),
    query.isLoading
      ? jsx(Skeletons, { count: 3 })
      : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: items.map(entry => jsx(TrackRow, {
          contextUri: entry.context && !String(entry.context.uri).includes(':artist:') ? entry.context.uri : undefined,
          player,
          sub: [artists(entry.track), relativeTime(entry.played_at)].filter(Boolean).join(' · '),
          track: entry.track
        }, entry.track.uri + entry.played_at)) })
  ] })
}

function PlaylistList({ player, open, onOpen }) {
  const s = useValue(player.state)
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'playlists'],
    queryFn: () => api('/playlists?limit=50'),
    staleTime: 120000
  })
  const items = query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items.filter(Boolean) : []

  return jsxs('div', { children: [
    jsx(RecentList, { open, player }),
    jsxs('div', { className: 'hermes-spotify-section', children: [
      jsx('div', { className: 'hermes-spotify-heading', children: jsx('span', { children: 'Your library' }) }),
      jsxs('div', {
        className: 'hermes-spotify-row',
        onClick: () => player.browse({ kind: 'liked', id: 'liked', name: 'Liked Songs' }),
        onKeyDown: event => { if (event.key === 'Enter') player.browse({ kind: 'liked', id: 'liked', name: 'Liked Songs' }) },
        role: 'button',
        tabIndex: 0,
        children: [
          jsx('span', { className: 'hermes-spotify-thumb-sm hermes-spotify-liked-art', children: jsx(IcHeartOn, {}) }),
          jsxs('span', { className: 'hermes-spotify-row-main', children: [
            jsx('span', { className: 'hermes-spotify-row-title', children: 'Liked Songs' }),
            jsx('span', { className: 'hermes-spotify-row-sub', children: 'Your saved tracks' })
          ] })
        ]
      })
    ] }),
    jsxs('div', { className: 'hermes-spotify-section', children: [
      jsx('div', { className: 'hermes-spotify-heading', children: jsx('span', { children: items.length ? `Your playlists · ${items.length}` : 'Your playlists' }) }),
      query.isLoading
        ? jsx(Skeletons, {})
        : query.data && !query.data.ok
          ? jsx(Empty, { body: query.data.error, icon: icons.AlertCircle, title: 'Could not load playlists' })
          : items.length === 0
            ? jsx(Empty, { icon: IcMusic, title: 'No playlists yet' })
            : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: items.map(pl => {
                const count = playlistCount(pl)
                const owner = pl.owner && pl.owner.display_name
                return jsxs('div', {
                  className: 'hermes-spotify-row',
                  'data-active': Boolean(s && s.context_uri && s.context_uri === pl.uri),
                  onClick: () => onOpen(pl),
                  onKeyDown: event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpen(pl) } },
                  role: 'button',
                  tabIndex: 0,
                  title: `Show tracks in ${pl.name}`,
                  children: [
                    jsx(Thumb, { src: smallImage(pl.images) }),
                    jsxs('span', { className: 'hermes-spotify-row-main', children: [
                      jsx('span', { className: 'hermes-spotify-row-title', children: pl.name }),
                      jsx('span', { className: 'hermes-spotify-row-sub', children: [count != null ? `${count} tracks` : 'Playlist', owner].filter(Boolean).join(' · ') })
                    ] }),
                    jsx('span', { className: 'hermes-spotify-row-actions', onClick: event => event.stopPropagation(), children: jsx(SmallAction, { icon: icons.Play, label: `Play ${pl.name}`, onClick: () => player.playPayload({ context_uri: pl.uri }) }) })
                  ]
                }, pl.id)
              }) })
    ] })
  ] })
}

function PlaylistDetail({ player, open, playlist }) {
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'playlist-items', playlist.id],
    queryFn: () => api(`/playlists/${encodeURIComponent(playlist.id)}/items?limit=50`),
    staleTime: 60000
  })
  // Feb 2026 API: entries are { item } (was { track }); local/unavailable ones are null.
  const tracks = (query.data && query.data.ok && query.data.data && query.data.data.items ? query.data.data.items : [])
    .map(entry => entry && (entry.item || entry.track))
    .filter(track => track && track.uri && track.type !== 'episode')
  const total = query.data && query.data.ok && query.data.data ? query.data.data.total : null
  useEffect(() => {
    if (tracks.length) void player.checkSaved(tracks.slice(0, 40).map(t => t.uri))
  }, [tracks.length])

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsxs('div', { className: 'hermes-spotify-detail-head', children: [
      jsx(SmallAction, { icon: IcBack, label: 'Back to playlists', onClick: player.back }),
      jsx(Thumb, { src: smallImage(playlist.images) }),
      jsxs('span', { className: 'hermes-spotify-row-main', children: [
        jsx('span', { className: 'hermes-spotify-row-title', children: playlist.name }),
        jsx('span', { className: 'hermes-spotify-row-sub', children: total != null ? `${total} tracks` : 'Playlist' })
      ] }),
      jsx(SmallAction, { icon: icons.ExternalLink, label: 'Open in Spotify', onClick: () => openInSpotify(playlist.uri) }),
      jsx('button', { className: 'hermes-spotify-pill', onClick: () => player.playPayload({ context_uri: playlist.uri }), type: 'button', children: [jsx(icons.Play, {}, 'i'), 'Play'] })
    ] }),
    query.isLoading
      ? jsx(Skeletons, {})
      : query.data && !query.data.ok
        ? jsx(Empty, {
            action: jsx(Button, { onClick: () => player.playPayload({ context_uri: playlist.uri }), size: 'sm', variant: 'outline', children: 'Play playlist' }),
            body: 'Spotify only lists tracks for playlists you own or collaborate on.',
            icon: icons.Lock,
            title: 'Tracks unavailable'
          })
        : tracks.length === 0
          ? jsx(Empty, { icon: IcMusic, title: 'This playlist is empty' })
          : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: tracks.map((t, index) => jsx(TrackRow, { contextUri: playlist.uri, index: index + 1, player, track: t }, t.uri + index)) })
  ] })
}

function TrackRow({ track, index, player, queueable = true, contextUri, sub, showArt = true }) {
  const s = useValue(player.state)
  const playing = Boolean(s && s.track_uri === track.uri && !s.idle)
  const play = () => player.playPayload(contextUri ? { context_uri: contextUri, offset: track.uri } : { uri: track.uri })
  return jsxs('div', { className: 'hermes-spotify-row', 'data-active': playing, 'data-static': true, onDoubleClick: play, children: [
    index != null ? jsx('span', { className: 'hermes-spotify-index', children: index }) : null,
    showArt ? jsx(Thumb, { src: smallImage(track.album && track.album.images) }) : null,
    jsxs('span', { className: 'hermes-spotify-row-main', children: [
      jsx('span', { className: 'hermes-spotify-row-title', title: track.name, children: [track.explicit ? jsx('span', { className: 'hermes-spotify-e', title: 'Explicit', children: 'E' }, 'e') : null, track.name] }),
      jsx('span', { className: 'hermes-spotify-row-sub', children: sub || [artists(track), track.duration_ms ? fmtTime(track.duration_ms) : null].filter(Boolean).join(' · ') })
    ] }),
    jsxs('span', { className: 'hermes-spotify-row-actions', children: [
      jsx(LikeButton, { player, uri: track.uri }),
      jsx(SmallAction, { icon: icons.Play, label: `Play ${track.name}`, onClick: play }),
      queueable ? jsx(SmallAction, { icon: icons.Plus, label: 'Add to queue', onClick: () => player.addToQueue(track.uri) }) : null
    ] })
  ] })
}

const SEARCH_FILTERS = [['all', 'All'], ['track', 'Songs'], ['artist', 'Artists'], ['album', 'Albums'], ['playlist', 'Playlists']]

function SearchPanel({ player, open }) {
  const [text, setText] = useState(() => player.searchText.get())
  const [query, setQuery] = useState(() => player.searchText.get().trim())
  const [filter, setFilter] = useState('all')
  const inputRef = useRef(null)
  useEffect(() => {
    const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 50)
    return () => clearTimeout(id)
  }, [])
  useEffect(() => {
    player.searchText.set(text)
    const timer = setTimeout(() => setQuery(text.trim()), 350)
    return () => clearTimeout(timer)
  }, [text])
  const types = filter === 'all' ? 'track,artist,album,playlist' : filter
  const result = useQuery({
    enabled: open && query.length >= 2,
    queryKey: [ID, 'search', query, types],
    queryFn: () => api(`/search?q=${encodeURIComponent(query)}&type=${types}&limit=${filter === 'all' ? 5 : 10}`),
    staleTime: 60000
  })
  const data = result.data && result.data.ok ? result.data.data || {} : {}
  const list = key => (data[key] && data[key].items ? data[key].items.filter(Boolean) : [])
  const tracks = list('tracks'), artistsFound = list('artists'), albums = list('albums'), playlists = list('playlists')
  const any = tracks.length + artistsFound.length + albums.length + playlists.length > 0
  useEffect(() => {
    if (tracks.length) void player.checkSaved(tracks.map(t => t.uri))
  }, [tracks.map(t => t.uri).join(',')])

  const section = (title, items, render) => items.length
    ? jsxs('div', { className: 'hermes-spotify-section', children: [
        filter === 'all' ? jsx('div', { className: 'hermes-spotify-heading', children: jsx('span', { children: title }) }) : null,
        jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: items.map(render) })
      ] }, title)
    : null

  return jsxs('div', { className: 'hermes-spotify-section', children: [
    jsx('div', { className: 'hermes-spotify-search', children: jsx(SearchField, { 'aria-label': 'Search Spotify', inputRef, loading: result.isFetching, onChange: setText, onClear: () => setText(''), placeholder: 'Songs, artists, albums, playlists', value: text, variant: 'box' }) }),
    jsx('div', { className: 'hermes-spotify-chips', role: 'radiogroup', 'aria-label': 'Result type', children: SEARCH_FILTERS.map(([key, label]) => jsx('button', {
      'aria-checked': filter === key, className: 'hermes-spotify-chip-btn', 'data-active': filter === key, onClick: () => setFilter(key), role: 'radio', type: 'button', children: label
    }, key)) }),
    query.length < 2
      ? jsx(Empty, { body: 'Hover a song to like, play or queue it. Open an artist or album to browse it.', icon: icons.Search, title: 'Search Spotify' })
      : result.isLoading
        ? jsx(Skeletons, {})
        : result.data && !result.data.ok
          ? jsx(Empty, { body: result.data.error, icon: icons.AlertCircle, title: 'Search failed' })
          : !any
            ? jsx(Empty, { body: `Nothing matched “${query}”.`, icon: icons.Search, title: 'No results' })
            : jsxs('div', { children: [
                section('Songs', tracks, t => jsx(TrackRow, { player, track: t }, t.id)),
                section('Artists', artistsFound, a => jsx(CollectionRow, { item: a, kind: 'artist', player, sub: 'Artist' }, a.id)),
                section('Albums', albums, a => jsx(CollectionRow, { item: a, kind: 'album', player, sub: [artists(a), yearOf(a.release_date)].filter(Boolean).join(' · ') }, a.id)),
                section('Playlists', playlists, pl => jsx(CollectionRow, { item: pl, kind: 'playlist', player, sub: ['Playlist', pl.owner && pl.owner.display_name].filter(Boolean).join(' · ') }, pl.id))
              ] })
  ] })
}

function QueuePanel({ player, open }) {
  const query = useQuery({
    enabled: open,
    queryKey: [ID, 'queue'],
    queryFn: () => api('/queue'),
    refetchInterval: open ? 10000 : false,
    staleTime: 5000
  })
  const data = query.data && query.data.ok ? query.data.data : null
  const current = data && data.currently_playing
  const upcoming = ((data && data.queue) || []).filter(Boolean).slice(0, 30)

  return jsxs('div', { children: [
    current
      ? jsxs('div', { className: 'hermes-spotify-section', children: [
          jsx('div', { className: 'hermes-spotify-heading', children: jsx('span', { children: 'Now playing' }) }),
          jsx(TrackRow, { player, queueable: false, track: current })
        ] })
      : null,
    jsxs('div', { className: 'hermes-spotify-section', children: [
      jsxs('div', { className: 'hermes-spotify-heading', children: [
        jsx('span', { children: 'Next up' }),
        jsx(SmallAction, { spin: query.isFetching, icon: icons.RefreshCw, label: 'Refresh queue', onClick: () => query.refetch() })
      ] }),
      query.isLoading
        ? jsx(Skeletons, {})
        : upcoming.length === 0
          ? jsx(Empty, { body: 'Use Search to add songs to the queue.', icon: IcMusic, title: 'Queue is empty' })
          : jsx('div', { className: 'hermes-spotify-list', ref: staggerRef, children: upcoming.map((t, index) => jsx(TrackRow, { index: index + 1, player, queueable: false, track: t }, (t.id || t.uri) + '-' + index)) })
    ] })
  ] })
}

const TABS = [
  ['now', 'Player'],
  ['playlists', 'Library'],
  ['search', 'Search'],
  ['queue', 'Queue']
]

function PanelBody({ player }) {
  const view = useValue(player.view)
  const open = useValue(player.open)
  const note = useValue(player.note)
  const tone = useValue(player.noteTone)
  const authRequired = useValue(player.authRequired)
  const accent = useAccent(player)
  const settings = useValue(player.settings)
  const stack = useValue(player.stack)
  const depth = view === 'playlists' ? stack.length : 0
  const viewIndex = TABS.findIndex(([k]) => k === view)
  const prev = useRef({ viewIndex, depth })
  // Slide forward/back for drill-downs and tab moves; fade on first paint.
  let dir = 'fade'
  if (prev.current.viewIndex !== viewIndex) dir = viewIndex > prev.current.viewIndex ? 'fwd' : 'back'
  else if (prev.current.depth !== depth) dir = depth > prev.current.depth ? 'fwd' : 'back'
  const dirRef = useRef(dir)
  if (prev.current.viewIndex !== viewIndex || prev.current.depth !== depth) dirRef.current = dir
  useEffect(() => { prev.current = { viewIndex, depth } })
  dir = dirRef.current

  // Panel-local shortcuts. Ignored while typing in the search field.
  const onKeyDown = event => {
    const target = event.target
    if (target && (target.tagName === 'INPUT' && target.type !== 'range' || target.isContentEditable)) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const keys = {
      ' ': () => player.togglePlay(),
      k: () => player.togglePlay(),
      n: () => player.transport('next'),
      p: () => player.transport('previous'),
      s: () => player.toggleShuffle(),
      r: () => player.cycleRepeat(),
      m: () => player.toggleMute(),
      l: () => { const st = player.state.get(); if (st && st.track_uri) player.toggleSaved(st.track_uri) },
      '+': () => player.nudgeVolume(10),
      '=': () => player.nudgeVolume(10),
      '-': () => player.nudgeVolume(-10),
      '/': () => player.view.set('search'),
      Escape: () => { if (player.stack.get().length) player.back() },
      Backspace: () => { if (player.stack.get().length) player.back() },
      1: () => player.view.set('now'),
      2: () => player.view.set('playlists'),
      3: () => player.view.set('search'),
      4: () => player.view.set('queue')
    }
    const run = keys[event.key]
    if (!run) return
    // Space on a focused button should still click it.
    if (event.key === ' ' && target && (target.tagName === 'BUTTON' || target.getAttribute('role') === 'button')) return
    event.preventDefault()
    run()
  }

  return jsxs('div', { className: 'hermes-spotify-shell', onKeyDown, style: accent ? { '--hsp-accent': accent } : undefined, children: [
    jsxs('div', { 'aria-label': 'Spotify views', className: 'hermes-spotify-tabs', role: 'tablist', style: { '--tab': Math.max(0, TABS.findIndex(([k]) => k === view)) }, children: [jsx('span', { 'aria-hidden': true, className: 'hsp-tab-ind' }, 'ind'), ...TABS.map(([key, label]) => jsx('button', {
      'aria-selected': view === key,
      className: 'hermes-spotify-tab',
      'data-active': view === key,
      onClick: () => { if (key === 'playlists' && view === 'playlists') player.stack.set([]); player.view.set(key) },
      role: 'tab',
      type: 'button',
      children: label
    }, key))] }),
    authRequired
      ? jsxs('div', { className: 'hermes-spotify-banner', role: 'alert', children: [
          jsx(icons.KeyRound, {}),
          jsxs('span', { children: ['Spotify sign-in expired. Run ', jsx('code', { children: 'hermes spotify login' }), ' on the gateway.'] }),
          jsx(SmallAction, { icon: icons.Copy, label: 'Copy command', onClick: () => { if (player.copy) player.copy('hermes spotify login') } })
        ] })
      : null,
    jsx('div', { className: 'hermes-spotify-body', role: 'tabpanel', children: jsxs('div', { className: 'hsp-view', 'data-dir': dir, children: [
      view === 'now' ? jsxs('div', { children: [jsx(NowPlaying, { player }), jsx(Transport, { player }), jsx(Devices, { player })] }) : null,
      view === 'playlists' ? jsx(Playlists, { open, player }) : null,
      view === 'search' ? jsx(SearchPanel, { open, player }) : null,
      view === 'queue' ? jsx(QueuePanel, { open, player }) : null
    ] }, `${view}:${depth}`) }),
    jsxs('div', { className: 'hermes-spotify-note', 'data-filled': Boolean(note), 'data-tone': note ? tone : undefined, role: 'status', children: [
      note ? jsx(tone === 'error' ? icons.AlertCircle : icons.Check, {}) : null,
      jsx('span', { className: 'hermes-spotify-note-text', title: note || 'Shortcuts: Space play/pause · N/P next/prev · L like · S shuffle · R repeat · M mute · +/- volume · 1–4 tabs · / search · Esc back', children: note || 'Remote control · audio plays in your Spotify app' }, note || 'idle'),
      jsx(SmallAction, { icon: icons.Bell, label: settings.notify ? 'Song-change notifications: on' : 'Song-change notifications: off', on: settings.notify, onClick: () => player.setNotify(!settings.notify) })
    ] })
  ] })
}

function SpotifyBar({ player, ctx }) {
  const s = useValue(player.state)
  const open = useValue(player.open)
  const hasTrack = Boolean(s && s.track)
  const label = hasTrack ? `${s.track} — ${s.artist}` : 'Spotify'

  return jsxs('div', { className: 'hermes-spotify-bar', 'data-tour': 'spotify-player', children: [
    jsxs(Popover, { onOpenChange: player.onOpenChange, open, children: [
      jsx(PopoverTrigger, { asChild: true, children: jsx(Button, {
        'aria-label': `Spotify: ${label}`,
        size: 'micro',
        style: { maxWidth: 240 },
        variant: 'ghost',
        children: jsxs('span', { className: 'hermes-spotify-chip', children: [
          hasTrack && !s.idle ? jsx(Equalizer, { paused: !s.is_playing }) : null,
          jsx('span', { className: 'hermes-spotify-name', children: jsx('span', { children: label }, label) })
        ] })
      }) }),
      jsx(PopoverContent, { 'aria-label': 'Spotify player', className: 'hermes-spotify-panel', side: 'top', align: 'end', onMouseEnter: () => player.cancelClose(), onMouseLeave: () => { if (open) player.onOpenChange(false) }, children: jsx(PanelBody, { player }) })
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
    if (ctx.os && typeof ctx.os.openExternal === 'function') openExternal = url => ctx.os.openExternal(url)
    const player = createPlayer(ctx)
    void player.refresh(true)
    void player.refreshDevices()

    ctx.register({
      area: STATUSBAR_AREAS.right,
      id: 'player',
      order: 12,
      render: () => jsx(SpotifyBar, { ctx, player })
    })

    const nowLabel = () => {
      const st = player.state.get()
      return st && st.track ? `${st.track} — ${st.artist}` : 'nothing playing'
    }
    const commands = [
      { id: 'toggle', label: 'Spotify: Play / Pause', keys: ['mod+alt+space'], icon: icons.Play, run: () => player.togglePlay(), detail: nowLabel, keywords: ['music', 'resume', 'pause'] },
      { id: 'next', label: 'Spotify: Next track', keys: ['mod+alt+]'], run: () => player.transport('next'), keywords: ['skip', 'music'] },
      { id: 'previous', label: 'Spotify: Previous track', keys: ['mod+alt+['], run: () => player.transport('previous'), keywords: ['back', 'music'] },
      { id: 'like', label: 'Spotify: Like current track', keys: [], run: () => { const st = player.state.get(); if (st && st.track_uri) player.toggleSaved(st.track_uri) }, detail: nowLabel, keywords: ['save', 'heart', 'liked songs'] },
      { id: 'volume-up', label: 'Spotify: Volume up', keys: [], run: () => player.nudgeVolume(10), keepOpen: true, detail: () => `${(player.state.get() || {}).volume ?? '?'}%` },
      { id: 'volume-down', label: 'Spotify: Volume down', keys: [], run: () => player.nudgeVolume(-10), keepOpen: true, detail: () => `${(player.state.get() || {}).volume ?? '?'}%` },
      { id: 'shuffle', label: 'Spotify: Toggle shuffle', keys: [], run: () => player.toggleShuffle(), detail: () => ((player.state.get() || {}).shuffle ? 'on' : 'off'), detailVariant: 'state', keepOpen: true },
      { id: 'open', label: 'Spotify: Open in Spotify app', keys: [], run: () => { const st = player.state.get(); openInSpotify((st && (st.album_uri || st.track_uri)) || 'spotify:app:home') } }
    ]
    const contributions = []
    for (const c of commands) {
      contributions.push({ id: `palette.${c.id}`, area: PALETTE_AREA, data: {
        id: `${ID}.${c.id}`, label: c.label, icon: c.icon, keywords: ['spotify', ...(c.keywords || [])],
        action: c.keys.length ? `${ID}.${c.id}` : undefined, run: c.run, detail: c.detail, detailVariant: c.detailVariant, keepOpen: c.keepOpen
      } })
      if (c.keys.length) contributions.push({ id: `key.${c.id}`, area: KEYBINDS_AREA, data: { id: `${ID}.${c.id}`, label: c.label, category: 'view', defaults: c.keys, run: c.run } })
    }
    if (typeof ctx.registerMany === 'function') ctx.registerMany(contributions)
    else contributions.forEach(c => ctx.register(c))
  }
}
