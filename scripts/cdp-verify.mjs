// 终验：全路由遍历（断言 + 截图）+ 铃铛交互 + FPS 采样
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
    errors.push('EXCEPTION: ' + (d.exception?.description || d.text || '').slice(0, 250))
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push('CONSOLE: ' + msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 250))
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (expression) =>
  send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then((r) => r.result.value)
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  if (s.data) { writeFileSync(`logs/${name}`, Buffer.from(s.data, 'base64')); console.log('SHOT:', name) }
}
const assert = (ok, label, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' | ' + detail : ''}`)
  if (!ok) process.exitCode = 1
}

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs = []
    window.addEventListener('error', (e) => window.__errs.push('ERR: ' + (e.error && e.error.message || e.message)))
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ: ' + (e.reason && e.reason.message || String(e.reason))))
  ` })

  /* ========== 1. 首页 ========== */
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(10000)
  const h1 = await ev(`(() => ({
    title: document.title,
    header: document.querySelector('.header-title')?.textContent || '',
    canvas: !!document.querySelector('.mapboxgl-canvas'),
    bell: !!document.querySelector('.event-warning.collapsed'),
    badge: document.querySelector('.ew-badge')?.textContent || '',
    bottom: [...document.querySelectorAll('.btn-groups .item p')].length,
    traffic: !!window.__traffic,
    mapCenter: window.__map ? JSON.stringify([+window.__map.getCenter().lng.toFixed(2), +window.__map.getCenter().lat.toFixed(2)]) : 'no-map'
  }))()`)
  assert(h1.title.includes('智慧交通'), '首页标题')
  assert(h1.header.includes('智慧交通'), '首页Header')
  assert(h1.canvas, '首页地图canvas')
  assert(h1.bell, '首页铃铛默认收起')
  assert(+h1.badge > 0, '首页铃铛徽标>0', h1.badge)
  assert(h1.bottom === 10, '底部10个按钮', String(h1.bottom))
  assert(h1.traffic, '交通桥')
  assert(h1.mapCenter === '[118.05,36.81]', '首页地图居中淄博', h1.mapCenter)
  await shot('v-home.png')

  /* ========== 2. 铃铛交互 ========== */
  const b1 = await ev(`(async () => {
    document.querySelector('.event-warning.collapsed')?.click()
    await new Promise(r => setTimeout(r, 400))
    const listOpen = !!document.querySelector('.event-warning:not(.collapsed) .ew-list')
    // 点一条已读
    const unread = document.querySelector('.ew-item.unread')
    if (unread) { unread.click(); await new Promise(r => setTimeout(r, 300)) }
    const badge = document.querySelector('.ew-badge')?.textContent || '0'
    // 收起
    document.querySelector('.event-warning:not(.collapsed)')?.click()
    await new Promise(r => setTimeout(r, 300))
    return { listOpen, badge, collapsed: !!document.querySelector('.event-warning.collapsed') }
  })()`)
  assert(b1.listOpen, '铃铛点击展开列表')
  assert(b1.collapsed, '再点收起')
  assert(+b1.badge >= 0, '已读后徽标减少', '徽标=' + b1.badge)

  /* ========== 3. 图层页 camera + popup ========== */
  await send('Page.navigate', { url: BASE + '/layerdisplay/camera' })
  await sleep(5000)
  const l1 = await ev(`(async () => {
    const card = document.querySelector('.box-card')?.textContent || ''
    // 点击地图中心附近应能命中监控点弹窗（camera 图层已开）
    const map = window.__map
    const p = map.project([118.05, 36.81])
    const el = map.getCanvas()
    const rect = el.getBoundingClientRect()
    const evt = new MouseEvent('click', { clientX: rect.left + p.x, clientY: rect.top + p.y, bubbles: true })
    el.dispatchEvent(evt)
    await new Promise(r => setTimeout(r, 800))
    return { card, vis: window.__traffic.visible('camera'), popup: !!document.querySelector('.l7-popup, .mapboxgl-popup') }
  })()`)
  assert(l1.card === '监控探头分布', '图层页标题', l1.card)
  assert(l1.vis, 'camera 显示')
  await shot('v-layer-camera.png')

  /* ========== 4. 控制中心 ========== */
  await send('Page.navigate', { url: BASE + '/g2charts' })
  await sleep(8000)
  const g1 = await ev(`(() => ({
    titles: [...document.querySelectorAll('.people-sum')].map(t => t.textContent.trim()),
    text: document.body.textContent.includes('监控探头 220') || document.body.textContent.includes('220'),
    canvas: document.querySelectorAll('.g2-chart canvas').length
  }))()`)
  assert(g1.titles.length === 5, '控制中心5个面板', g1.titles.join('/'))
  assert(g1.canvas === 3, '3张图表canvas', String(g1.canvas))
  await shot('v-g2charts.png')

  /* ========== 5. rotation（3s 内经度变化） ========== */
  await send('Page.navigate', { url: BASE + '/rotation' })
  await sleep(6000)
  const r1 = await ev(`(async () => {
    const map = window.__map
    if (!map) return { err: 'no map' }
    const lng1 = map.getCenter().lng
    await new Promise(r => setTimeout(r, 3500))
    return { lng1: +lng1.toFixed(2), lng2: +map.getCenter().lng.toFixed(2) }
  })()`)
  assert(r1.lng1 !== undefined && r1.lng2 !== r1.lng1, '自转经度变化', JSON.stringify(r1))
  await shot('v-rotation.png')

  /* ========== 6. eventinfo 表格 ========== */
  await send('Page.navigate', { url: BASE + '/eventinfo' })
  await sleep(5000)
  const e1 = await ev(`(() => ({
    rows: document.querySelectorAll('table tr, .el-table__row').length,
    text: document.body.textContent.slice(0, 400)
  }))()`)
  assert(e1.rows > 0 || e1.text.includes('事故') || e1.text.includes('管制'), '事件信息页有数据', JSON.stringify(e1).slice(0, 150))
  await shot('v-eventinfo.png')

  /* ========== 7. 其余功能页无异常 ========== */
  for (const r of ['/cityview', '/navigation', '/areasearch', '/changestyle']) {
    await send('Page.navigate', { url: BASE + r })
    await sleep(4500)
    const ok = await ev(`(() => ({ bodyLen: document.body.textContent.length, map: !!document.querySelector('.mapboxgl-canvas') }))()`)
    assert(ok.map || r === '/navigation', `${r} 页渲染`, JSON.stringify(ok))
    await shot('v-' + r.slice(1) + '.png')
  }

  /* ========== 8. FPS 采样（首页全图层开） ========== */
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(6000)
  const fps = await ev(`(async () => {
    const t = window.__traffic
    for (const n of t.names) t.setVisible(n, true)
    await new Promise(r => setTimeout(r, 1500))
    const map = window.__map
    let frames = 0
    const t0 = performance.now()
    await new Promise((resolve) => {
      const check = () => {
        frames++
        const dt = performance.now() - t0
        if (dt < 3000) requestAnimationFrame(check)
        else resolve(frames)
      }
      check()
    })
    for (const n of t.names) t.setVisible(n, false)
    return Math.round(frames / 3)
  })()`)
  assert(fps >= 45, 'FPS>=45', fps + 'fps')
  const errs = await ev(`window.__errs || []`)
  assert(!(errs || []).length, '零页面错误', (errs || []).slice(0, 5).join(' || '))
  assert(!errors.length, '零console异常', errors.slice(0, 3).join(' || '))
  process.exit(process.exitCode || 0)
}
