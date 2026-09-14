/* 图标预览图：把 trafficIcons.js 里的 SVG 按 L7 的方式（白色符号被图层色染色）渲染成
 * 「实际大小 + 8 倍放大」，写 logs/icon-preview.png。
 *
 * 为什么要单独做这个：真机上验证要跑 cdp-probe14.mjs（打开地图、找取样点、截图，几分钟），
 * 改一笔图形就得等一轮。这个脚本只起一个空白页，用 canvas 复刻 L7 的着色结果，几秒钟出图，
 * 用来迭代「缩到 16px 还看不看得出来」。上真机前的最后一道验证仍然是 probe14 + icon-sheet。
 *
 * 与 L7 的差异：真实渲染是「纹理蓝通道当遮罩 × 图层色」，这里用 canvas 的 source-in
 * （白色不透明处填图层色）等效 —— 两者在抗锯齿边缘的差别只在 1px 内，看图够用。
 *
 * 用法：node scripts/icon-preview.mjs   （需先起 headless Chrome，见 cdp-probe14.mjs 注释）
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { TRAFFIC_ICONS, iconUrl } from '../src/tools/trafficIcons.js'
import { decodePNG } from './lib/png.mjs'
import { encodePNG, cropZoom } from './lib/png-write.mjs'

const CDP = process.env.CDP_PORT || '9223'

/* 预览清单：每列一个「图层 × 状态色 × 尺寸候选」，px 是屏幕实际像素（L7 的 size×2）。
 * 尺寸列成候选是为了在图上直接比「再小一号还认不认得出」——
 * 底图路网中位宽 2px（量过），16px 图标相当于 8 条路宽，用户要的是「醒目但不能太大」，
 * 所以两个诉求打架时靠这张图定，而不是拍脑袋。 */
const VARIANTS = [
  { name: '监控', icon: 'camera', px: 16, color: '#7C4DFF' },
  { name: '监控小一号', icon: 'camera', px: 14, color: '#7C4DFF' },
  { name: '信号灯', icon: 'trafficLight', px: 18, color: '#12B76A' },
  { name: '信号灯小一号', icon: 'trafficLight', px: 16, color: '#12B76A' },
  { name: '警员', icon: 'police', px: 16, color: '#E2447E' },
  { name: '警员小一号', icon: 'police', px: 14, color: '#E2447E' },
  { name: '公交站', icon: 'busStop', px: 16, color: '#EF6820' },
  { name: '公交站小一号', icon: 'busStop', px: 14, color: '#EF6820' }
]

/* 版面尺寸（与页面里写死的格子一致，用来裁图） */
const BIG = 64
const CELL = 48
const ZOOM = 8
const GAP = 4
const COL = 164
const HEAD = 92
const BIG_ROW = 76
const colH = 18 + CELL + GAP + CELL + GAP + 18 * ZOOM
const W = 8 + VARIANTS.length * COL
const H = HEAD + colH + 8

const payload = VARIANTS.map((v) => ({ ...v, url: iconUrl(TRAFFIC_ICONS[v.icon]) }))
const bigs = [...new Set(VARIANTS.map((v) => v.icon))].map((k) => ({ k, url: iconUrl(TRAFFIC_ICONS[k]) }))

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

  /* 页面里注入：paint() = 白色符号按图层色染色（等效 L7 着色器） */
  const js = `
  window.__pv = async function (variants, bigs, GEO) {
    const { BIG, CELL, ZOOM, GAP, COL, HEAD, BIG_ROW } = GEO
    const paint = async (url, px, color, scale) => {
      const img = new Image(); img.src = url; await img.decode()
      const small = document.createElement('canvas'); small.width = small.height = px
      const sg = small.getContext('2d')
      sg.drawImage(img, 0, 0, px, px)
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = color; sg.fillRect(0, 0, px, px)
      if (!scale) return small
      const big = document.createElement('canvas'); big.width = big.height = px * scale
      const bg = big.getContext('2d'); bg.imageSmoothingEnabled = false
      bg.drawImage(small, 0, 0, px * scale, px * scale)
      return big
    }
    const box = (bg, w, h) => { const d = document.createElement('div')
      d.style.cssText = 'display:flex;align-items:center;justify-content:center;border-radius:3px;background:' + bg
      d.style.width = w + 'px'; d.style.height = h + 'px'; return d }
    const label = (t) => { const d = document.createElement('div')
      d.style.cssText = 'font:11px/14px sans-serif;color:#333;text-align:center;width:' + COL + 'px'; d.textContent = t; return d }

    document.body.style.cssText = 'margin:0;background:#fff;font:11px sans-serif'
    const root = document.createElement('div')
    root.style.cssText = 'position:relative;width:' + (8 + variants.length * COL) + 'px;height:' + (HEAD + 18 + CELL * 2 + GAP * 2 + 18 * ZOOM + 8) + 'px'
    document.body.appendChild(root)

    /* 第一行：每种图标 64px 原样（看图形本身） */
    for (let i = 0; i < bigs.length; i++) {
      const c = await paint(bigs[i].url, BIG, '#2b3440', 1)
      const wrap = box('#eef2f7', BIG, BIG)
      wrap.style.position = 'absolute'; wrap.style.left = (8 + i * (BIG + 16)) + 'px'; wrap.style.top = '8px'
      wrap.appendChild(c); root.appendChild(wrap)
      const t = document.createElement('div')
      t.style.cssText = 'position:absolute;left:' + (8 + i * (BIG + 16)) + 'px;top:' + (8 + BIG + 2) + 'px;font:10px/12px sans-serif;color:#666;width:' + BIG + 'px;text-align:center'
      t.textContent = bigs[i].k; root.appendChild(t)
    }

    /* 下面每列一个变体：实际大小（浅底 / 路网蓝底）+ 8 倍放大 */
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i]
      const x = 8 + i * COL, y = HEAD
      const put = (node, dy) => { node.style.position = 'absolute'; node.style.left = x + 'px'; node.style.top = (y + dy) + 'px'; root.appendChild(node) }
      put(label(v.name + ' ' + v.px + 'px'), 0)
      const a = box('#e9edf2', CELL, CELL); a.appendChild(await paint(v.url, v.px, v.color, 0)); put(a, 18)
      /* 路网蓝底：底图总道路 #1990FF，6px 宽带子，用来判断图标会不会糊进路网 */
      const b = box('#dfe6ee', CELL, CELL)
      const band = document.createElement('div')
      band.style.cssText = 'position:absolute;width:' + CELL + 'px;height:6px;background:#1990FF;opacity:.85'
      b.style.position = 'relative'; b.appendChild(band)
      b.appendChild(await paint(v.url, v.px, v.color, 0)); put(b, 18 + CELL + GAP)
      const z = await paint(v.url, v.px, v.color, ZOOM); put(z, 18 + CELL + GAP + CELL + GAP)
    }
    return 'ok'
  }`
  console.log('注入渲染函数：', await ev(js))
  console.log('渲染：', await ev(`window.__pv(${JSON.stringify(payload)}, ${JSON.stringify(bigs)}, ${JSON.stringify({
    BIG, CELL, ZOOM, GAP, COL, HEAD, BIG_ROW
  })})`))
  await new Promise((r) => setTimeout(r, 600))

  const s = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync('logs/icon-preview-full.png', Buffer.from(s.data, 'base64'))
  // clip 参数在本机 CDP 下会返回空结果，所以在 Node 侧裁（同 cdp-probe14）
  const img = decodePNG(readFileSync('logs/icon-preview-full.png'))
  const crop = { width: Math.min(W, img.width), height: Math.min(H, img.height) }
  const out = { width: crop.width, height: crop.height, rgba: new Uint8Array(crop.width * crop.height * 4) }
  for (let y = 0; y < crop.height; y++) {
    const from = (y * img.width) * 4
    out.rgba.set(img.rgba.subarray(from, from + crop.width * 4), y * crop.width * 4)
  }
  writeFileSync('logs/icon-preview.png', encodePNG(out))
  console.log(`\n预览图：logs/icon-preview.png (${crop.width}×${crop.height})`)
  console.log('版面：顶部一行是 64px 原样图形；下面每列 = 标签 / 浅底实际大小 / 路网蓝底实际大小 / 8×放大')

  try { await fetch(`http://localhost:${CDP}/json/close/${created.id}`) } catch (e) { /* 关不掉也不影响 */ }
  ws.close()
  process.exitCode = 0
}
