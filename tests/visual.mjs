// Renders the plugin in headless Chrome and captures animation frames.
import fs from 'node:fs'
import { build } from 'esbuild'
import { chromium } from 'playwright-core'

const pluginSrc = fs.readFileSync(process.argv[2], 'utf8')
  .replace(/^import \{([^}]*)\} from '@hermes\/plugin-sdk'$/m, 'const {$1} = window.__sdk')
  .replace(/^import \{([^}]*)\} from 'react'$/m, 'const {$1} = window.__react')
  .replace(/^import \{([^}]*)\} from 'react\/jsx-runtime'$/m, 'const {$1} = window.__jsx')
const out = await build({ entryPoints: [(await import('node:url')).fileURLToPath(new URL('./visual-entry.mjs', import.meta.url))], bundle: true, write: false, format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } })
const html = `<!doctype html><html><head><style>
:root{--ui-text-primary:#ececec;--ui-text-secondary:#b4b4b4;--ui-text-tertiary:#8a8a8a;--ui-accent:#4c8dff;--ui-bg-elevated:#1f1f1f;--ui-bg-tertiary:rgba(255,255,255,.06);--ui-stroke-secondary:rgba(255,255,255,.12);--ui-stroke-tertiary:rgba(255,255,255,.08);--ui-control-hover-background:rgba(255,255,255,.06)}
body{margin:0;background:#161616;color:var(--ui-text-primary);font:13px system-ui,sans-serif;padding:16px}
.panel{background:var(--ui-bg-elevated);border:1px solid rgba(255,255,255,.08);border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);margin-top:10px}
button{font:inherit;color:inherit}
.hermes-spotify-action{background:none;border:0;padding:4px;display:inline-flex;cursor:pointer}
</style></head><body><div id="root"></div><div id="portal"></div><script>${out.outputFiles[0].text}</script></body></html>`
fs.writeFileSync('visual.html', html)

const exe = process.env.CHROME || '/usr/bin/google-chrome'
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 420, height: 640 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', e => errors.push(String(e)))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('file://' + process.cwd() + '/visual.html')
await page.evaluate(src => window.__mount(src), pluginSrc)
const panel = page.locator('.panel')
const shot = async name => { await panel.screenshot({ path: `shots/${name}.png`, animations: 'allow' }) }
fs.mkdirSync('shots', { recursive: true })

// Freeze/scrub animations via the Web Animations API for deterministic mid-frames.
const scrub = async ms => page.evaluate(t => { for (const a of document.getAnimations()) { if (a.effect && a.effect.getTiming().iterations !== Infinity) { a.pause(); a.currentTime = t } } }, ms)
const resume = async () => page.evaluate(() => { for (const a of document.getAnimations()) a.play() })
const running = () => page.evaluate(() => document.getAnimations().map(a => a.animationName || a.transitionProperty).filter(Boolean))

await page.waitForTimeout(60)
const openAnims = await running()
await scrub(70); await shot('1-panel-open-mid')
await resume(); await page.waitForTimeout(900); await shot('2-panel-settled')

// Like → heart pop
await page.getByLabel('Save to Liked Songs').first().click()
await page.waitForTimeout(20)
const likeAnims = await running()
await scrub(140); await shot('3-heart-pop-mid')
await resume(); await page.waitForTimeout(700)

// Next track → art + text swap, chip swap, nudge
await page.getByLabel('Next', { exact: true }).click()
await page.waitForTimeout(400)
const nextAnims = await running()
await scrub(120); await shot('4-track-change-mid')
await resume(); await page.waitForTimeout(800); await shot('5-track-change-settled')

// Tab switch → sliding indicator + list stagger
await page.getByRole('tab', { name: 'Library' }).click()
await page.waitForTimeout(30)
const tabAnims = await running()
await scrub(110); await shot('6-tab-switch-mid')
await resume(); await page.waitForTimeout(900); await shot('7-library-settled')

// Reduced motion → no animations
await page.emulateMedia({ reducedMotion: 'reduce' })
await page.getByRole('tab', { name: 'Player' }).click()
await page.waitForTimeout(30)
const reduced = await running()

console.log(JSON.stringify({ openAnims: [...new Set(openAnims)], likeAnims: [...new Set(likeAnims)], nextAnims: [...new Set(nextAnims)], tabAnims: [...new Set(tabAnims)], reducedMotion: reduced.filter(n => n !== 'hermes-spotify-eq'), errors }, null, 1))
await browser.close()
