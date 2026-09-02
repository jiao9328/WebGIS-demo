// 阶段冒烟验证：导航到首页 → 断言标题/canvas/无异常 → 截图
import { writeFileSync } from 'node:fs'

const PORT = process.env.PORT || '5173'
const BASE = `http://localhost:${PORT}`
const list = await (await fetch('http://localhost:9222/json')).json()
const page = list.find((t) => t.type === 'page')
if (!page) { console.log('NO PAGE TARGET'); process.exit(1) }
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = {}
const errors = []
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id
    pending[mid] = resolve
    ws.send(JSON.stringify({ id: mid, method, params }))
  })
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id]; return }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text || '') + (d.exception?.stack ? '\n  STACK: ' + d.exception.stack.split('\n').slice(0, 2).join('\n  ') : ''))
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200))
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (expression) =>
  send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then((r) => r.result.value)
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  if (s.data) { writeFileSync(`logs/${name}`, Buffer.from(s.data, 'base64')); console.log('SHOT:', name) }
}

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs = []
    window.addEventListener('error', (e) => window.__errs.push('ERR: ' + (e.error && e.error.message || e.message)))
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ: ' + (e.reason && e.reason.message || String(e.reason))))
  ` })
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(12000)

  const s1 = await ev(`(() => {
    const canvases = [...document.querySelectorAll('canvas')].map(c => c.width + 'x' + c.height)
    const title = document.querySelector('.header-title')?.textContent || document.title
    return {
      title: document.title,
      headerText: title,
      canvases,
      l7: !!document.querySelector('.l7-container, .l7-map'),
      mapbox: !!document.querySelector('.mapboxgl-canvas'),
      bottomBtns: [...document.querySelectorAll('.btn-groups .item p')].map(p => p.textContent.trim()),
      footerText: document.querySelector('.footer') ? 'footer-ok' : 'no-footer',
      mapDivs: [...document.querySelectorAll('[class*=map]')].length
    }
  })()`)
  console.log('S1 首页:', JSON.stringify(s1, null, 1))
  await shot('smoke-home.png')

  const s2 = await ev(`(() => {
    const bell = document.querySelector('.event-warning')
    return {
      bell: bell ? (bell.classList.contains('collapsed') ? 'collapsed' : 'expanded') : 'none',
      badge: document.querySelector('.ew-badge')?.textContent || 'no-badge',
      trafficBridge: !!window.__traffic,
      trafficNames: window.__traffic ? window.__traffic.names.join(',') : ''
    }
  })()`)
  console.log('S2 铃铛+桥:', JSON.stringify(s2))


  const r = await ev(`(async () => {
    const t = window.__traffic
    const names = t.names
    const results = {}
    for (const n of names) {
      t.setVisible(n, true)
      await new Promise(r2 => setTimeout(r2, 600))
      const reg = t.registry[n]
      results[n] = { visible: t.visible(n), layer: reg && reg.layer ? "created" : "no" }
    }
    // 全关再全开一次验证复用
    for (const n of names) t.setVisible(n, false)
    await new Promise(r2 => setTimeout(r2, 400))
    t.setVisible("heat", true)
    await new Promise(r2 => setTimeout(r2, 800))
    return results
  })()`)
  console.log("T1 图层创建:", JSON.stringify(r, null, 1))
  await shot("layers-all.png")
  const errs2 = await ev(`window.__errs || []`)
  console.log("T1 ERRS:", (errs2 || []).slice(0, 8).join(" || ") || "none")

  const injected = await ev(`window.__errs || []`)
  console.log('INJECTED ERRS:', (injected || []).slice(0, 10).join(' || ') || 'none')
  console.log('ERRORS:', errors.length ? errors.slice(0, 6) : 'none')
  process.exit(0)
}
