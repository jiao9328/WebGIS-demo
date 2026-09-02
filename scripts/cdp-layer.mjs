// LayerDisplay 验证：/layerdisplay/camera → 单选显示 → 切 heat → 返回首页全隐藏
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
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text || '').slice(0, 200))
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
const visibility = () => ev(`(() => {
  const t = window.__traffic
  const out = {}
  for (const n of t.names) out[n] = t.visible(n)
  return out
})()`)

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs = []
    window.addEventListener('error', (e) => window.__errs.push('ERR: ' + (e.error && e.error.message || e.message)))
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ: ' + (e.reason && e.reason.message || String(e.reason))))
  ` })
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(10000)

  // 1) camera 页
  await ev(`location.href = '${BASE}/layerdisplay/camera'`)
  await sleep(4000)
  const l1 = await ev(`document.querySelector('.box-card')?.textContent || 'NO CARD'`)
  const v1 = await visibility()
  console.log('L1 camera 页标题:', l1, '| 可见性:', JSON.stringify(v1))
  await shot('layer-camera.png')

  // 2) 切 heat 页（onBeforeRouteUpdate / 重新导航）
  await ev(`location.href = '${BASE}/layerdisplay/heat'`)
  await sleep(4000)
  const l2 = await ev(`document.querySelector('.box-card')?.textContent || 'NO CARD'`)
  const v2 = await visibility()
  console.log('L2 heat 页标题:', l2, '| 可见性:', JSON.stringify(v2))
  await shot('layer-heat.png')

  // 3) 返回首页 → 全部隐藏
  await ev(`location.href = '${BASE}/'`)
  await sleep(3000)
  const v3 = await visibility()
  console.log('L3 回首页可见性:', JSON.stringify(v3))

  const injected = await ev(`window.__errs || []`)
  console.log('ERRS:', (injected || []).slice(0, 8).join(' || ') || 'none')
  console.log('ERRORS:', errors.length ? errors.slice(0, 6) : 'none')
  process.exit(0)
}
