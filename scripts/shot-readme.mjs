// README 系统截图重截脚本（1440x900 真实运行捕获 → screenshots/*.png）
// 步骤：登录页 → 主界面(开三图层) → 控制中心 → 旋转 → 各分析页（每次先回主页等地图就绪，避免冷加载竞态）
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch('http://localhost:9333/json')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0; const pending = {}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const mid = ++id
    const timer = setTimeout(() => { delete pending[mid]; resolve(null) }, 15000)
    pending[mid] = (r) => { clearTimeout(timer); resolve(r) }
    try { ws.send(JSON.stringify({ id: mid, method, params })) } catch { clearTimeout(timer); delete pending[mid]; resolve(null) }
  })
}
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data)
  if (msg.id && pending[msg.id]) { pending[msg.id](msg.result); delete pending[msg.id] }
}
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return r && r.result ? r.result.value : undefined
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  if (s && s.data) { writeFileSync(`screenshots/${name}`, Buffer.from(s.data, 'base64')); console.log('SHOT', name) }
  else console.log('FAIL', name)
}
// 回主页等地图就绪（每张截图前）
const homeReady = async () => {
  await send('Page.navigate', { url: 'http://localhost:5173/' })
  for (let i = 0; i < 30; i++) {
    await sleep(1000)
    const ok = await ev(`!!window.__map && window.__map.loaded && window.__map.loaded()`)
    if (ok) { await sleep(2000); return true }
  }
  return false
}
const clickText = (sel, txt) => ev(`(() => {
  const els = [...document.querySelectorAll('${sel}')]
  const t = els.find(i => (i.textContent || '').includes('${txt}'))
  if (t) { t.click(); return true }
  return false
})()`)

ws.onopen = async () => {
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  console.log('home ready:', await homeReady())
  // 空间测量
  await send('Page.navigate', { url: 'http://localhost:5173/mapdraw/drawPolygonTool' }); await sleep(6000)
  await shot('mapdraw.png')
  // 风格切换（深色）
  await homeReady()
  await send('Page.navigate', { url: 'http://localhost:5173/changestyle' }); await sleep(5000)
  await clickText('#menu a', '深色风格'); await sleep(8000)
  await shot('changestyle.png')
  // 驾车导航
  await homeReady()
  await send('Page.navigate', { url: 'http://localhost:5173/navigation?from=%E6%B7%84%E5%8D%9A%E7%AB%99&to=%E5%B1%B1%E4%B8%9C%E7%90%86%E5%B7%A5%E5%A4%A7%E5%AD%A6' }); await sleep(18000)
  await shot('navigation.png')
  // 区域搜索
  await homeReady()
  await send('Page.navigate', { url: 'http://localhost:5173/areasearch?area=%E5%BC%A0%E5%BA%97%E5%8C%BA' }); await sleep(12000)
  await shot('areasearch.png')
  console.log('done')
  process.exit(0)
}
setTimeout(() => { console.log('TIMEOUT'); process.exit(1) }, 180000)
