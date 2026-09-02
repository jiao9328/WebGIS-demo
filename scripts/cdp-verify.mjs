// 终验：全路由遍历（断言 + 截图）+ 控制中心浮层/道路分级栏/实时数据栏交互 + FPS 采样
import { writeFileSync } from 'node:fs'

const PORT = process.env.PORT || '5173'
const BASE = `http://localhost:${PORT}`
const list = await (await fetch('http://localhost:9222/json')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes(`localhost:${PORT}`))
if (!page) { console.log('NO PAGE TARGET at ' + BASE); process.exit(1) }
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
const clickItem = async (label) => {
  await ev(`(() => {
    const items = [...document.querySelectorAll('.btn-groups .item')]
    const it = items.find(i => i.textContent.includes('${label}'))
    if (it) it.click()
  })()`)
  await sleep(1200)
}

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__errs = []
    window.addEventListener('error', (e) => window.__errs.push('ERR: ' + (e.error && e.error.message || e.message)))
    window.addEventListener('unhandledrejection', (e) => window.__errs.push('REJ: ' + (e.reason && e.reason.message || String(e.reason))))
  ` })

  /* ========== 1. 首页 ========== */
  await send('Page.navigate', { url: BASE + '/' })
  await sleep(10000)
  const h1 = await ev(`(() => {
    const rb = document.querySelector('.road-bar')?.getBoundingClientRect()
    const ft = document.querySelector('.footer')?.getBoundingClientRect()
    const rt = document.querySelector('.rt-panel')?.getBoundingClientRect()
    return {
      title: document.title,
      vpW: window.innerWidth,
      header: document.querySelector('.header-title')?.textContent || '',
      canvas: !!document.querySelector('.mapboxgl-canvas'),
      bottom: [...document.querySelectorAll('.btn-groups .item p')].length,
      roadBtns: [...document.querySelectorAll('.road-btn')].map(b => b.textContent.trim()),
      rtItems: [...document.querySelectorAll('.rt-item')].map(i => i.textContent.trim()),
      chartsOpen: !!document.querySelector('.g2-left'),
      roadBar: rb ? { w: +rb.width.toFixed(0), h: +rb.height.toFixed(0), centerX: +(rb.left + rb.width / 2).toFixed(0) } : null,
      footerH: ft ? +ft.height.toFixed(0) : null,
      rtBox: rt ? [+rt.left.toFixed(0), +rt.top.toFixed(0)] : null,
      traffic: !!window.__traffic,
      roads: !!window.__roads,
      mapCenter: window.__map ? JSON.stringify([+window.__map.getCenter().lng.toFixed(2), +window.__map.getCenter().lat.toFixed(2)]) : 'no-map'
    }
  })()`)
  assert(h1.title.includes('智慧交通'), '首页标题')
  assert(h1.header.includes('智慧交通'), '首页Header')
  assert(h1.canvas, '首页地图canvas')
  assert(h1.bottom === 9, '底部9个按钮', String(h1.bottom))
  assert(!h1.chartsOpen, '控制中心默认收起')
  assert(h1.traffic && h1.roads, '交通/道路调试桥')
  assert(h1.mapCenter === '[118.05,36.81]', '首页地图居中淄博', h1.mapCenter)
  // 道路分级栏：5 个按钮，宽约 1/3 页宽，高与底部栏一致，水平居中
  assert(h1.roadBtns.length === 5, '分级栏5个按钮', h1.roadBtns.join('/'))
  assert(h1.roadBtns[0] === '总道路' && h1.roadBtns[4] === '三级道路', '按钮文案', h1.roadBtns.join('/'))
  assert(h1.roadBar && Math.abs(h1.roadBar.w - h1.vpW / 3) < 90, '分级栏宽约1/3页', h1.roadBar ? h1.roadBar.w + 'px' : '缺')
  assert(h1.roadBar && Math.abs(h1.roadBar.h - h1.footerH) <= 4, '分级栏与底部栏同高', h1.roadBar ? h1.roadBar.h + ' vs ' + h1.footerH : '缺')
  assert(h1.roadBar && Math.abs(h1.roadBar.centerX - h1.vpW / 2) <= 3, '分级栏水平居中', String(h1.roadBar?.centerX))
  // 实时数据栏：左上角，7 类图层行
  assert(h1.rtItems.length === 7, '实时数据栏7行', h1.rtItems.join('/'))
  assert(h1.rtBox && h1.rtBox[0] < 40 && h1.rtBox[1] < 200, '实时数据栏位于左上', JSON.stringify(h1.rtBox))
  await shot('v-home.png')

  /* ========== 2. 控制中心浮层开关 ========== */
  await clickItem('控制中心')
  const g1 = await ev(`(() => ({
    titles: [...document.querySelectorAll('.people-sum')].map(t => t.textContent.trim()),
    canvas: document.querySelectorAll('.g2-chart canvas').length,
    on: !!document.querySelector('.btn-groups .item.on')
  }))()`)
  assert(g1.on, '控制中心按钮高亮(on)')
  assert(g1.titles.length === 5, '浮层5个面板', g1.titles.join('/'))
  assert(g1.canvas === 3, '3张图表canvas', String(g1.canvas))
  await shot('v-charts-open.png')
  // 点其它按钮（首页）不应关闭浮层
  await clickItem('首页')
  const still = await ev(`!!document.querySelector('.g2-left')`)
  assert(still, '点首页后浮层仍在')
  await shot('v-charts-open2.png')
  // 再点一次控制中心才关闭
  await clickItem('控制中心')
  const closed = await ev(`!document.querySelector('.g2-left') && !document.querySelector('.btn-groups .item.on')`)
  assert(closed, '再点控制中心关闭浮层')

  /* ========== 3. 道路分级栏切换 ========== */
  const clickRoadBtn = async (label) => {
    await ev(`(() => {
      const b = [...document.querySelectorAll('.road-btn')].find(x => x.textContent.includes('${label}'))
      if (b) b.click()
      return !!b
    })()`)
    await sleep(1800)
  }
  const r20 = await ev(`window.__roads.baseVisible()`)
  assert(r20 === true, '初始基础路网显示')
  await clickRoadBtn('高速公路')
  const r21 = await ev(`({ cls: window.__roads.visible('highway'), base: window.__roads.baseVisible() })`)
  assert(r21.cls === true && r21.base === false, '高速: 只显高速层', JSON.stringify(r21))
  await shot('v-road-highway.png')
  await clickRoadBtn('三级道路')
  const r22 = await ev(`({ cls: window.__roads.visible('third'), highway: window.__roads.visible('highway') })`)
  assert(r22.cls === true && r22.highway === false, '三级: 切换互斥', JSON.stringify(r22))
  await shot('v-road-third.png')
  await clickRoadBtn('总道路')
  const r23 = await ev(`({ base: window.__roads.baseVisible(), any: ['highway','first','second','third'].some(k => window.__roads.visible(k)) })`)
  assert(r23.base === true && r23.any === false, '总道路恢复基础路网', JSON.stringify(r23))
  await shot('v-road-class.png')

  /* ========== 4. 实时数据栏图层开关 ========== */
  const t1 = await ev(`(async () => {
    const rows = [...document.querySelectorAll('.rt-item')]
    const cam = rows.find(i => i.textContent.includes('监控探头'))
    cam.click()
    await new Promise(r => setTimeout(r, 1500))
    const on = { vis: window.__traffic.visible('camera'), lit: cam.classList.contains('on') }
    cam.click()
    await new Promise(r => setTimeout(r, 800))
    const off = { vis: window.__traffic.visible('camera'), lit: cam.classList.contains('on') }
    return { on, off, count: rows.length }
  })()`)
  assert(t1.count === 7, '实时数据栏7行')
  assert(t1.on.vis && t1.on.lit, '监控图层开启且点亮', JSON.stringify(t1.on))
  assert(!t1.off.vis && !t1.off.lit, '再点监控图层关闭', JSON.stringify(t1.off))
  await shot('v-realtime-on.png')

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
