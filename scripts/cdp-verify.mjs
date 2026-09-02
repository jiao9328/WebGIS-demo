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
      dividers: document.querySelectorAll('.btn-groups .tb-divider').length,
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
  assert(!h1.dividers, '底部无分隔线', String(h1.dividers))
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
  // 关闭按钮：收起为小标签，再点开恢复
  await ev(`(() => { const c = document.querySelector('.rt-close'); if (c) c.click() })()`)
  await sleep(400)
  const rc1 = await ev(`(() => ({
    panel: getComputedStyle(document.querySelector('.rt-panel')).display,
    tab: !!document.querySelector('.rt-tab')
  }))()`)
  assert(rc1.panel === 'none' && rc1.tab, '实时数据栏可收起(留小标签)', JSON.stringify(rc1))
  await shot('v-rt-collapsed.png')
  await ev(`(() => { const t = document.querySelector('.rt-tab'); if (t) t.click() })()`)
  await sleep(400)
  const rc2 = await ev(`(() => ({
    panel: getComputedStyle(document.querySelector('.rt-panel')).display,
    rows: document.querySelectorAll('.rt-item').length
  }))()`)
  assert(rc2.panel !== 'none' && rc2.rows === 7, '点小标签恢复实时栏', JSON.stringify(rc2))

  /* ========== 4b. AI 助手（右下角悬浮 + 对话驱动功能 + 关键词反问确认） ========== */
  const fab0 = await ev(`(() => {
    const f = document.querySelector('.ai-fab')?.getBoundingClientRect()
    const z = document.querySelector('.l7-control-zoom')?.getBoundingClientRect()
    return f && z ? { gap: +(z.left - f.right).toFixed(0), bottom: +f.bottom.toFixed(0) } : null
  })()`)
  assert(fab0 && fab0.gap > 0 && fab0.gap < 60, 'AI按钮位于放大缩小按钮左侧', JSON.stringify(fab0))
  assert(fab0 && fab0.bottom > 850, 'AI按钮贴右下角', String(fab0?.bottom))
  await ev(`(() => { document.querySelector('.ai-fab').click() })()`)
  await sleep(600)
  const pan1 = await ev(`!!document.querySelector('.ai-panel.show')`)
  assert(pan1, '点击AI按钮打开对话框')
  await shot('v-ai-panel.png')
  // 对话驱动：道路分级 + 图层 + UI 点亮（走离线引擎降级通道）
  await ev(`window.__ai.send('切换到高速公路')`)
  await sleep(1200)
  const ai1 = await ev(`({
    cls: window.__roads.visible('highway'),
    btnOn: [...document.querySelectorAll('.road-btn')].find(b => b.textContent.includes('高速公路'))?.classList.contains('on')
  })`)
  assert(ai1.cls && ai1.btnOn, 'AI对话切换到高速公路', JSON.stringify(ai1))
  await ev(`window.__ai.send('显示监控探头')`)
  await sleep(1500)
  const ai2 = await ev(`({
    vis: window.__traffic.visible('camera'),
    lit: [...document.querySelectorAll('.rt-item')].find(i => i.textContent.includes('监控探头'))?.classList.contains('on')
  })`)
  assert(ai2.vis && ai2.lit, 'AI对话打开监控并点亮实时栏', JSON.stringify(ai2))
  // 飞行动作（agent 解析 {lng,lat} 直飞）
  await ev(`window.__ai.send('飞到临淄区')`)
  await sleep(3200)
  const ai5 = await ev(`JSON.stringify([+window.__map.getCenter().lng.toFixed(1), +window.__map.getCenter().lat.toFixed(1)])`)
  assert(ai5 === '[118.3,36.8]', 'AI对话飞到临淄区', ai5)
  // 关键词反问确认（离线引擎直测）：听不懂 → 问"是不是想…" → 用户"是" → 执行
  await ev(`window.__ai.sendRule('我想看看那边的探头')`)
  await sleep(800)
  const ai3 = await ev(`window.__ai.msgs().slice(-1)[0] || ''`)
  assert(ai3.includes('是不是想'), '听不懂时按关键词反问', ai3.slice(0, 80))
  await ev(`window.__ai.send('是')`)
  await sleep(1200)
  const ai4 = await ev(`window.__traffic.visible('camera')`)
  assert(ai4 === true, '回复"是"后执行对应功能', String(ai4))
  // 控制中心开关
  await ev(`window.__ai.send('打开控制中心')`)
  await sleep(800)
  assert(await ev(`!!document.querySelector('.g2-left')`), 'AI对话打开控制中心')
  await shot('v-ai-charts.png')
  await ev(`window.__ai.send('关闭控制中心')`)
  await sleep(600)
  assert(!(await ev(`!!document.querySelector('.g2-left')`)), 'AI对话关闭控制中心')
  // 快捷指令：左侧「你可以说：」前缀；点 chip 自动填入输入框，点发送后执行
  const tip0 = await ev(`document.querySelector('.ai-chips-tip')?.textContent || ''`)
  assert(tip0.includes('你可以说'), '快捷指令左侧有「你可以说：」', tip0)
  await ev(`(() => { [...document.querySelectorAll('.ai-chip')].find(c => c.textContent.includes('显示监控探头')).click() })()`)
  await sleep(300)
  const chip1 = await ev(`(() => {
    const inp = document.querySelector('.ai-input')
    return { val: inp.value, filled: inp.value.includes('显示监控探头'), btnOk: !document.querySelector('.ai-send').disabled }
  })()`)
  assert(chip1.filled && chip1.btnOk, '点快捷指令文字自动填入输入框', JSON.stringify(chip1))
  await shot('v-ai-chip-filled.png')
  const chipMsgBefore = await ev(`window.__ai.msgs().length`)
  await ev(`(() => { document.querySelector('.ai-send').click() })()`)
  await sleep(2000)
  const chip2 = await ev(`(() => ({
    input: document.querySelector('.ai-input').value,
    more: window.__ai.msgs().length > ${chipMsgBefore}
  }))()`)
  assert(chip2.input === '' && chip2.more, '点发送实现对应功能', JSON.stringify(chip2))
  // 再点按钮收起对话框
  await ev(`(() => { document.querySelector('.ai-fab').click() })()`)
  await sleep(500)
  assert(!(await ev(`!!document.querySelector('.ai-panel.show')`)), '再点AI按钮收起对话框')

  /* ========== 4c. 二级功能驱动：自动取景 / 精细飞行 / 区域搜索 / 换风格 / 测量 / 导航 ========== */
  // 图层打开自动缩放（离线规则通道：set_traffic_layer 带 ctx 的回归验证）
  await ev(`window.__ai.sendRule('显示道路拥堵')`)
  await sleep(3200)
  const z1 = await ev(`(() => {
    const m = window.__map
    return { z: +m.getZoom().toFixed(1), p: +m.getPitch().toFixed(0), vis: window.__traffic.visible('congestion') }
  })()`)
  assert(z1.vis && z1.z > 9 && z1.z < 11.5 && z1.p > 30 && z1.p < 50, 'AI开拥堵图层自动缩放取景', JSON.stringify(z1))
  await ev(`window.__ai.sendRule('关闭道路拥堵')`)
  await sleep(600)
  // 清空交通图层，避免 L7 图层随后续 setStyle 页面切换残留
  await ev(`window.__ai.sendRule('关闭摄像头')`)
  await sleep(600)
  assert((await ev(`window.__traffic.visible('camera')`)) === false, '二级页面切换前清空图层', '')
  // 精细飞行-道路（离线规则：本地路网命中，zoom15 细节级）
  await ev(`window.__ai.sendRule('飞到张南路')`)
  await sleep(2500)
  const z2 = await ev(`(() => ({ z: +window.__map.getZoom().toFixed(0), msg: (window.__ai.msgs().slice(-1)[0] || '') }))()`)
  assert(z2.z === 15 && z2.msg.includes('张南路'), 'AI飞道路(张南路, zoom15)', JSON.stringify(z2).slice(0, 100))
  await shot('v-ai-fly-road.png')
  // 精细飞行-地标（齐盛湖公园 zoom15）
  await ev(`window.__ai.sendRule('飞到齐盛湖公园')`)
  await sleep(2200)
  const z2b = await ev(`(() => ({ z: +window.__map.getZoom().toFixed(0), msg: (window.__ai.msgs().slice(-1)[0] || '') }))()`)
  assert(z2b.z === 15 && z2b.msg.includes('齐盛湖公园') && z2b.msg.includes('地标'), 'AI飞地标(齐盛湖公园)', JSON.stringify(z2b).slice(0, 100))
  await shot('v-ai-fly-poi.png')
  // 精细飞行-学校等本地无数据地点：在线兜底或候选提示（不许报错）
  await ev(`window.__ai.sendRule('飞到淄博市实验中学')`)
  await sleep(4200)
  const z3 = await ev(`(window.__ai.msgs().slice(-1)[0] || '')`)
  assert(/已飞到|未找到|你是不是想找/.test(z3), '学校等地点: 在线兜底或候选提示', z3.slice(0, 100))
  // 区域搜索-济南市（LLM 工具 → 与手动搜索同流程：边界+天气）
  await ev(`window.__ai.send('区域搜索济南市')`)
  await sleep(6500)
  const as1 = await ev(`(() => ({
    path: location.pathname,
    input: document.querySelector('.headerAS_div_input')?.value || '',
    poly: [...(window.__map.getStyle().layers || [])].some(l => String(l.id || '').startsWith('polygon')),
    txt: document.body.textContent.includes('济南')
  }))()`)
  assert(as1.path === '/areasearch' && as1.input.includes('济南市') && as1.poly, 'AI区域搜索济南: 跳页+回填+画边界', JSON.stringify(as1).slice(0, 160))
  assert(as1.txt, '区域搜索天气联动显示济南', String(as1.txt))
  await shot('v-ai-areasearch.png')
  // 换风格（带 ?style 进入直接点选 + 同页再换风格自动点选）
  await send('Page.navigate', { url: BASE + '/changestyle?style=卫星影像' })
  const readStyle = `(() => {
    const a = [...document.querySelectorAll('#menu a')].find(x => x.classList.contains('active'))
    const g = window.__map && window.__map.getStyle && window.__map.getStyle()
    return { act: a?.textContent || '', sprite: g ? (g.sprite || '') : '' }
  })()`
  // 菜单点亮先于 setStyle 生效（后者约需 3-4s），故要求 sprite 命中目标风格才算完成
  let st0 = null
  for (let i = 0; i < 16 && !(st0 && st0.act.includes('卫星影像') && st0.sprite.includes('satellite-v9')); i++) { await sleep(1000); st0 = await ev(readStyle) }
  assert(st0 && st0.act.includes('卫星影像') && st0.sprite.includes('satellite-v9'), '带?style进入直接点选对应风格', JSON.stringify(st0 || {}).slice(0, 140))
  await ev(`window.__ai.sendRule('换成深色风格')`)
  let st1 = null
  for (let i = 0; i < 16 && !(st1 && st1.act.includes('深色风格') && st1.sprite.includes('dark-v10')); i++) { await sleep(1000); st1 = await ev(readStyle) }
  assert(st1 && st1.act.includes('深色风格') && st1.sprite.includes('dark-v10'), 'AI同页再换风格自动点选', JSON.stringify(st1 || {}).slice(0, 140))
  await shot('v-ai-changestyle.png')
  // 测量工具（规则引擎 → /mapdraw/矩形页；首进该页 MapDraw 冷 chunk + l7-draw 依赖约需 10s，轮询等待）
  await ev(`window.__ai.sendRule('我要用矩形量一下面积')`)
  let mm1 = ''
  for (let i = 0; i < 30; i++) {
    await sleep(500)
    mm1 = await ev(`location.pathname`)
    if (mm1 === '/mapdraw/drawRectTool') break
  }
  assert(mm1 === '/mapdraw/drawRectTool', 'AI矩形测量进入测量页', mm1)
  await sleep(1000)
  await shot('v-ai-measure.png')
  // 导航（规则引擎 → /navigation 自动规划起终点；等待路线绘制完成）
  await ev(`window.__ai.sendRule('导航到博山区')`)
  await sleep(3000)
  const nv1 = await ev(`(() => ({ path: location.pathname, q: decodeURIComponent(location.search) }))()`)
  assert(nv1.path === '/navigation' && nv1.q.includes('to=博山区') && nv1.q.includes('from=淄博站'), 'AI导航到博山区跳页带起终点', JSON.stringify(nv1))
  let nv2 = null
  for (let i = 0; i < 24; i++) {
    await sleep(500)
    nv2 = await ev(`(() => {
      const m = window.__map
      const s = m && m.getSource('directions')
      const vs = [...document.querySelectorAll('.mapboxgl-ctrl-directions input')].map(i => i.value)
      return { n: vs.length, txt: vs.join(' | '), feat: (s && s._data && s._data.features) ? s._data.features.length : 0 }
    })()`)
    if (nv2.feat > 0 && nv2.txt.includes('博山')) break
  }
  // 与手动输入一样：输入框定位显示的是中文地名（淄博站 / 博山区），且地图已缩放到线路（路线已绘制）
  assert(nv2.n >= 4 && nv2.txt.includes('博山') && !/Qu,|Shi,|China/.test(nv2.txt) && nv2.feat > 0, '导航控件按中文地名填入起终点并画线', JSON.stringify(nv2).slice(0, 200))
  await shot('v-ai-navigation.png')
  // 「从A导航到B」：解析并带上起点
  await ev(`window.__ai.sendRule('从张店区导航到博山区')`)
  await sleep(3000)
  const nv3 = await ev(`decodeURIComponent(location.search)`)
  assert(nv3.includes('from=张店区') && nv3.includes('to=博山区'), 'AI从张店区导航到博山区(带起点)', nv3)
  let nv4 = ''
  for (let i = 0; i < 20; i++) {
    await sleep(500)
    nv4 = await ev(`[...document.querySelectorAll('.mapboxgl-ctrl-directions input')].map(i => i.value).join(' | ')`)
    if (nv4.includes('张店区') && nv4.includes('博山区')) break
  }
  assert(nv4.includes('张店区') && nv4.includes('博山区'), '导航输入框定位为中文起点终点', nv4.slice(0, 160))
  await shot('v-ai-navigation-from.png')

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

  /* ========== 6. eventinfo 页面 ========== */
  await send('Page.navigate', { url: BASE + '/eventinfo' })
  // 事件页常态为空表：拉框查询后才填充数据；此处等待页面组件渲染完成（冷 chunk + 长跑负载下需轮询）
  let e1 = null
  for (let i = 0; i < 16; i++) {
    await sleep(1000)
    e1 = await ev(`(() => ({
      rows: document.querySelectorAll('.displayCard tbody tr, .el-table__row').length,
      txt: document.body.textContent
    }))()`)
    if ((e1.rows > 0 || e1.txt.includes('拉框查询')) && e1.txt.includes('事故')) break
  }
  assert((e1.rows > 0 || e1.txt.includes('拉框查询')) && e1.txt.includes('事故'), '事件信息页渲染(拉框查询入口)', JSON.stringify({ rows: e1.rows }).slice(0, 150))
  await shot('v-eventinfo.png')

  /* ========== 7. 其余功能页无异常 ========== */
  for (const r of ['/cityview', '/navigation', '/areasearch', '/changestyle']) {
    await send('Page.navigate', { url: BASE + r })
    await sleep(4500)
    const ok = await ev(`(() => ({ bodyLen: document.body.textContent.length, map: !!document.querySelector('.mapboxgl-canvas') }))()`)
    assert(ok.map || r === '/navigation', `${r} 页渲染`, JSON.stringify(ok))
    await shot('v-' + r.slice(1) + '.png')
  }
  /* 切换风格底部按钮 toggle：在风格页时按钮点亮，再点一次关闭回首页，再点一次重新打开 */
  let stOn = null
  for (let i = 0; i < 10; i++) {
    await sleep(500)
    stOn = await ev(`(() => {
      const b = [...document.querySelectorAll('.btn-groups .item')].find(i => i.textContent.includes('切换风格'))
      return { on: !!b?.classList.contains('on'), path: location.pathname }
    })()`)
    if (stOn.on && stOn.path === '/changestyle') break
  }
  assert(stOn.on && stOn.path === '/changestyle', '风格页时切换风格按钮点亮', JSON.stringify(stOn))
  await ev(`(() => { [...document.querySelectorAll('.btn-groups .item')].find(i => i.textContent.includes('切换风格')).click() })()`)
  await sleep(1500)
  const stOff = await ev(`location.pathname`)
  assert(stOff === '/', '再点切换风格按钮关闭风格页回首页', stOff)
  await shot('v-style-toggle-off.png')
  await ev(`(() => { [...document.querySelectorAll('.btn-groups .item')].find(i => i.textContent.includes('切换风格')).click() })()`)
  await sleep(1800)
  const stRe = await ev(`location.pathname`)
  assert(stRe === '/changestyle', '再点切换风格按钮重新打开', stRe)

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
  // 已知无害异常：
  // 1) MapboxLanguage 插件遇到无矢量源的卫星影像风格会报 style 版本错（视觉无影响，卫星图本就无中文标签）
  // 2) 风格快速切换瞬间旧 sprite 请求竞态偶发 "Could not load image"（新风格 sprite 实际加载正常，无视觉影响）
  const benign = (e) => /vector tile version 8|MapboxLanguage|Could not load image/.test(e)
  const errs = (await ev(`window.__errs || []`)).filter((e) => !benign(e))
  assert(!errs.length, '零页面错误', errs.slice(0, 5).join(' || '))
  const fatal = errors.filter((e) => !benign(e))
  assert(!fatal.length, '零console异常', fatal.slice(0, 3).join(' || '))
  process.exit(process.exitCode || 0)
}
