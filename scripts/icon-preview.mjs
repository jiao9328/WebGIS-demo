/* 图标预览图：把 trafficIcons.js 的「三层徽章」按 L7 的**两条着色分支**合成出来，
 * 渲染成「64 倍合成图 + 分解图 + 实际大小 + 聚合气泡 + 面板小图标」，写 logs/icon-preview.png。
 *
 * 为什么要单独做这个：真机上验证要跑 cdp-probe14/16（打开地图、找取样点、截图，几分钟），
 * 改一笔图形就得等一轮。这个脚本只起一个空白页，用 canvas 复刻 L7 的着色结果，几秒钟出图，
 * 用来迭代「缩到 18px 还看不看得出来」。上真机前的最后一道验证仍然是 probe14 + probe16 + 识图。
 *
 * 与 L7 的差异（看细节时要知道）：
 *   · 两条分支都是等效复刻：遮罩分支用 canvas 的 source-in（白色不透明处填图层色），
 *     原色分支直接画纹理（自己的颜色 + alpha）。抗锯齿边缘的差别在 1px 内，看图够用。
 *   · L7 片元着色器末尾有一条 `dist(gl_PointCoord,0.5) >= 0.5 ⇒ 纹理 alpha ×= 亮度` 的圆角裁剪，
 *     只作用在原色分支（即本图的影子/底板两层）。本图没复刻：影子的深色（#101828）亮度只有 0.09，
 *     被裁的那点转角本来就已经被模糊糊掉了。
 *   · 真实渲染的图标来自纹理图集，可能被缩放采样；本图按原始 64 网格画，边缘略干净一点。
 *
 * 用法：node scripts/icon-preview.mjs   （需先起 headless Chrome，见 cdp-probe14.mjs 注释）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { TRAFFIC_ICONS, BADGE_IMAGES, TRAFFIC_GLYPHS, iconUrl } from '../src/tools/trafficIcons.js'
import { decodePNG } from './lib/png.mjs'
import { encodePNG } from './lib/png-write.mjs'

const CDP = process.env.CDP_PORT || '9223'

/* ↓↓↓ 以下四项与 src/tools/initTrafficLayers.js 的 ICON / CLUSTER / bubbleR 是同一份口径，
 *       改那边必须同步这里（这里只是画图，不参与运行） ↓↓↓ */
const SIZES = { camera: 9, trafficLight: 10, police: 9, busStop: 9 } // ICON[].size
const COLORS = { camera: '#7C4DFF', trafficLight: '#12B76A', police: '#E2447E', busStop: '#EF6820' }
const BUBBLE = { camera: '#5E35B1', trafficLight: '#0E9B57', police: '#C02B63', busStop: '#C9530C' }
const LABEL = { camera: '监控探头', trafficLight: '信号灯', police: '警员分布', busStop: '公交站点' }
const bubbleR = (n) => (n > 1 ? 12 + 10 * Math.min(1, Math.log10(n) / 1.8) : 0)
const COUNTS = [2, 6, 25, 140]
/* ↑↑↑ 以上四项与 initTrafficLayers 同口径 ↑↑↑ */

const KEYS = Object.keys(SIZES)
const ZOOM = 8 // 放大倍数（最近邻）

/* 面板小图标（RealtimeBar 的 15px 行图标）：与 TrafficGlyph.vue 用**同一份** d + scale，
 * 只是把 currentColor 换成实色（SVG 里没法继承 canvas 的颜色） */
const glyphUrl = (k) => {
  const g = TRAFFIC_GLYPHS[k]
  const body = `<g transform="translate(32 32) scale(${g.scale}) translate(-32 -32)"><path d="${g.d}" fill="#475467"/></g>`
  return 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`)
}

const DATA = KEYS.map((k) => ({
  k,
  label: LABEL[k],
  size: SIZES[k],
  color: COLORS[k],
  bubble: BUBBLE[k],
  shadow: iconUrl(BADGE_IMAGES.shadow),
  backing: iconUrl(BADGE_IMAGES.backing),
  badge: iconUrl(TRAFFIC_ICONS[k]),
  glyph: glyphUrl(k)
}))
const BUBBLES = KEYS.map((k) => ({ k, label: LABEL[k], color: BUBBLE[k], items: COUNTS.map((n) => ({ n, r: bubbleR(n) })) }))

const created = await (await fetch(`http://localhost:${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
const ws = new WebSocket(created.webSocketDebuggerUrl)
let msgId = 0
const pending = {}
const send = (m, p = {}) =>
  new Promise((r) => { const i = ++msgId; pending[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending[m.id]) {
    if (m.error) console.log(`  ! CDP ${m.error.message}`)
    pending[m.id](m.result); delete pending[m.id]
  }
}
const ev = (x) => send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true })
  .then((r) => r?.exceptionDetails ? '<<' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '>>' : r?.result?.value)

ws.onopen = async () => {
  await send('Runtime.enable'); await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'about:blank' })

  const js = `
  window.__pv = async function (DATA, BUBBLES, ZOOM) {
    const load = async (url) => { const i = new Image(); i.src = url; await i.decode(); return i }

    /* 单层渲染：mode='orig' 走 L7 原色分支（.color('#FFFFFF') ⇒ gl_FragColor = textureColor，保留 alpha）
     *           mode='mask' 走遮罩分支（step(0.01, 蓝通道) × 图层色，**丢纹理 alpha**） */
    const one = (src, px, color, mode, scale) => {
      const c = document.createElement('canvas')
      c.width = c.height = Math.max(1, Math.round(px * scale))
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = scale <= 1
      g.drawImage(src, 0, 0, c.width, c.height)
      if (mode === 'mask') { g.globalCompositeOperation = 'source-in'; g.fillStyle = color; g.fillRect(0, 0, c.width, c.height) }
      return c
    }
    /* 三层合成（自下而上，与 initTrafficLayers 的 z+0/+1/+2 一致）。各层都是同一个锚点的点精灵，
     * 所以都居中摆放；层间大小差（影 size+3 / 底 size+1.5 / 本体 size）= 投影片 + 白描边的宽度来源。 */
    const stack = async (t, scale, only) => {
      const box = (t.size + 3) * 2 // 最大那层（影子 size+3）决定画布
      const c = document.createElement('canvas')
      c.width = c.height = Math.max(1, Math.round(box * scale))
      const g = c.getContext('2d')
      const put = (cv) => g.drawImage(cv, ((c.width - cv.width) / 2) | 0, ((c.height - cv.height) / 2) | 0)
      const parts = [
        ['sh', t.shadow, (t.size + 3) * 2, '#FFFFFF', 'orig'],
        ['bg', t.backing, (t.size + 1.5) * 2, '#FFFFFF', 'orig'],
        ['badge', t.badge, t.size * 2, t.color, 'mask']
      ]
      for (const [tag, url, px, color, mode] of parts) {
        if (only && tag !== only) continue
        put(one(await load(url), px, color, mode, scale))
      }
      return c
    }
    /* 聚合气泡：圆 + 白字（文字层是独立的 L7 图层，这里画在一起看观感） */
    const bubble = (n, r, color, scale) => {
      const c = document.createElement('canvas')
      c.width = c.height = Math.ceil(r * 2 * scale) + 2 * scale
      const g = c.getContext('2d')
      g.scale(scale, scale)
      g.translate(1 / scale, 1 / scale)
      g.beginPath(); g.arc(r, r, r, 0, Math.PI * 2); g.fillStyle = color; g.globalAlpha = 0.92; g.fill()
      g.globalAlpha = 1
      if (scale <= 1) { g.fillStyle = '#fff'; g.font = '700 13px -apple-system,sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(n), r, r + 0.5) }
      return c
    }

    document.body.style.cssText = 'margin:0;background:#fff'
    const root = document.createElement('div')
    root.style.cssText = 'display:inline-block;background:#fff;padding:12px 14px 16px;font:11px/14px -apple-system,"Microsoft YaHei",sans-serif;color:#344054'
    document.body.appendChild(root)

    const cell = (bg, w, h) => { const d = document.createElement('div')
      d.style.cssText = 'display:flex;align-items:center;justify-content:center;background:' + bg + ';border-radius:4px;width:' + w + 'px;height:' + h + 'px;overflow:hidden;position:relative'
      return d }
    const item = (cv, cap, bg, pad) => {
      const w = cv.width + (pad || 0) * 2, h = cv.height + (pad || 0) * 2
      const box = cell(bg || '#eef2f7', w, h)
      box.appendChild(cv)
      const col = document.createElement('div')
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px'
      col.appendChild(box)
      if (cap) { const t = document.createElement('div')
        t.style.cssText = 'font-size:10px;line-height:12px;color:#667085;text-align:center;white-space:nowrap'
        t.textContent = cap; col.appendChild(t) }
      return col
    }
    const row = (title, nodes, note) => {
      const r = document.createElement('div')
      r.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:10px'
      const lb = document.createElement('div')
      lb.style.cssText = 'width:96px;flex:none;text-align:right;color:#475467;line-height:15px'
      lb.textContent = title
      r.appendChild(lb)
      const bx = document.createElement('div')
      bx.style.cssText = 'display:flex;align-items:flex-start;gap:12px'
      for (const n of nodes) bx.appendChild(n)
      r.appendChild(bx)
      if (note) { const nt = document.createElement('div')
        nt.style.cssText = 'color:#98a2b3;font-size:10px;line-height:13px;max-width:300px'; nt.textContent = note; r.appendChild(nt) }
      root.appendChild(r)
      return r
    }

    /* ① 8× 合成图（看徽章本身：彩底 + 白图形 + 白描边 + 柔影） */
    row('徽章 8×', await Promise.all(DATA.map(async (t) => item(await stack(t, ZOOM), t.label + ' size=' + t.size, '#eef2f7', 6))))

    /* ② 实际大小：浅底 / 路网蓝底（底图总道路 #1990FF 的 6px 带，判断会不会糊进路网） */
    const realLight = []
    const realRoad = []
    for (const t of DATA) {
      const cv = await stack(t, 1)
      realLight.push(item(cv, t.label, '#e9edf2', 12))
      const box = cell('#dfe6ee', cv.width + 24, cv.height + 24)
      const band = document.createElement('div')
      band.style.cssText = 'position:absolute;left:0;right:0;top:50%;height:6px;margin-top:-3px;background:#1990FF;opacity:.85'
      box.appendChild(band)
      cv.style.position = 'relative'; cv.style.zIndex = '1' // 压在蓝路带**上面**（模拟图标盖住路网）
      const col = document.createElement('div')
      col.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px'
      col.appendChild(box)
      const t2 = document.createElement('div')
      t2.style.cssText = 'font-size:10px;line-height:12px;color:#667085'
      t2.textContent = t.label; col.appendChild(t2)
      realRoad.push(col)
    }
    row('实际大小', realLight, '屏幕像素 = size×2（9→18px / 10→20px），外面 1.5px 白描边 + 阴影')
    row('压在路网上', realRoad, '底图主路 #1990FF；徽章是深色外框 + 白圈，压在蓝路上仍分得开')

    /* ③ 分解（监控探头）：影子 / 白底板 / 徽章本体 / 合成 —— 证明三层各自在干什么 */
    const cam = DATA[0]
    row('三层分解', await Promise.all([
      item(await stack(cam, ZOOM, 'sh'), '① 影子（原色分支，自带 alpha）'),
      item(await stack(cam, ZOOM, 'bg'), '② 白底板（纯白无洞）'),
      item(await stack(cam, ZOOM, 'badge'), '③ 徽章（遮罩分支，状态色）'),
      item(await stack(cam, ZOOM), '合成：白描边来自 ②比③大、真白来自 ②从③的镂空透出')
    ]))

    /* ④ 聚合气泡（实际大小 / 4×）：数字是独立文字图层，字号 13 */
    row('聚合气泡', BUBBLES.map((b) => {
      const col = document.createElement('div')
      col.style.cssText = 'display:flex;justify-content:center;gap:6px;align-items:flex-end'
      for (const it of b.items) col.appendChild(item(bubble(it.n, it.r, b.color, 1), String(it.n) + ' 点 r=' + Math.round(it.r), '#eef2f7', 4))
      const t = document.createElement('div')
      t.style.cssText = 'font-size:10px;line-height:12px;color:#475467;text-align:center;margin-top:2px'
      t.textContent = b.label
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center'
      wrap.appendChild(col); wrap.appendChild(t)
      return wrap
    }), '半径 12→22px（桶内点数取 log）；桶上不画图标、散点上不画气泡（filter/size 两条互斥路线）')
    row('气泡 4×', BUBBLES.map((b) => {
      const col = document.createElement('div')
      col.style.cssText = 'display:flex;gap:6px'
      for (const it of b.items.slice(0, 3)) col.appendChild(item(bubble(it.n, it.r, b.color, 4), '', '#eef2f7', 2))
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px'
      wrap.appendChild(col)
      const t = document.createElement('div')
      t.style.cssText = 'font-size:10px;line-height:12px;color:#667085'; t.textContent = b.label
      wrap.appendChild(t)
      return wrap
    }))

    /* ⑤ 面板小图标（左下「实时数据」栏 15px 行图标）：与地图徽章同源，细节是洞 */
    row('面板图标', await Promise.all(DATA.map(async (t) => {
      const g = await load(t.glyph)
      const small = document.createElement('canvas'); small.width = small.height = 15
      const sg = small.getContext('2d'); sg.imageSmoothingEnabled = true; sg.drawImage(g, 0, 0, 15, 15)
      const big = document.createElement('canvas'); big.width = big.height = 15 * 6
      const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false; bg.drawImage(small, 0, 0, 90, 90)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'display:flex;align-items:center;gap:8px'
      wrap.appendChild(item(small, '15px', '#eef2f7', 5))
      wrap.appendChild(item(big, '6×', '#eef2f7', 4))
      const cap = document.createElement('div')
      cap.style.cssText = 'font-size:10px;line-height:12px;color:#667085;width:52px'
      cap.textContent = t.label
      wrap.appendChild(cap)
      return wrap
    }), '#475467 = --text-mute（选中时 --primary）；与地图符号同一份图形数据（去外壳 → 单色）'))

    const r = root.getBoundingClientRect()
    return { w: Math.ceil(r.width), h: Math.ceil(r.height) }
  }`
  console.log('注入渲染函数：', await ev(js))
  const geo = await ev(`window.__pv(${JSON.stringify(DATA)}, ${JSON.stringify(BUBBLES)}, ${ZOOM})`)
  if (!geo || typeof geo !== 'object') { console.log('渲染失败：', geo); process.exit(1) }
  console.log(`内容尺寸：${geo.w}×${geo.h}`)
  await new Promise((r) => setTimeout(r, 500))

  await send('Emulation.setDeviceMetricsOverride', { width: Math.max(1600, geo.w + 20), height: geo.h + 24, deviceScaleFactor: 1, mobile: false })
  await new Promise((r) => setTimeout(r, 200))
  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('logs/icon-preview-full.png', Buffer.from(s.data, 'base64'))
  // clip 参数在本机 CDP 下会返回空结果，所以在 Node 侧裁（同 cdp-probe14）
  const img = decodePNG(readFileSync('logs/icon-preview-full.png'))
  const crop = { width: Math.min(geo.w, img.width), height: Math.min(geo.h, img.height) }
  const out = { width: crop.width, height: crop.height, rgba: new Uint8Array(crop.width * crop.height * 4) }
  for (let y = 0; y < crop.height; y++) {
    const from = (y * img.width) * 4
    out.rgba.set(img.rgba.subarray(from, from + crop.width * 4), y * crop.width * 4)
  }
  writeFileSync('logs/icon-preview.png', encodePNG(out))
  console.log(`\n预览图：logs/icon-preview.png (${crop.width}×${crop.height})`)
  console.log('版面：徽章 8× / 实际大小（浅底·路网底）/ 三层分解 / 聚合气泡（1×·4×）/ 面板图标')

  try { await fetch(`http://localhost:${CDP}/json/close/${created.id}`) } catch (e) { /* 关不掉也不影响 */ }
  ws.close()
  process.exitCode = 0
}
