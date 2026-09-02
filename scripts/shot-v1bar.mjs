// V1 风格顶/底栏视觉验证：1440x900 截图首页 + 控制中心浮层，检查 DOM 结构
import { writeFileSync } from 'node:fs'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = await (await fetch('http://localhost:9222/json')).json()
const page = list.find((t) => t.type === 'page' && t.url.includes('localhost:5173'))
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
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value || a.description || '').join(' ').slice(0, 200))
  }
}
const ev = (expression) =>
  send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }).then((r) => r.result.value)
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  if (s.data) { writeFileSync(`logs/${name}`, Buffer.from(s.data, 'base64')); console.log('SHOT:', name) }
}

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: 'http://localhost:5173/' })
  await sleep(10000)
  const home = await ev(`(() => {
    const t = document.querySelector('.header-title')
    const clock = document.querySelector('.timer').getBoundingClientRect()
    const cc = document.querySelector('.header-center').getBoundingClientRect()
    const tc = t.getBoundingClientRect()
    return {
      title: t?.textContent || '',
      sub: document.querySelector('.header-sub')?.textContent || '',
      titleCenter: +(tc.left + tc.width / 2).toFixed(1),
      groupCenter: +(cc.left + cc.width / 2).toFixed(1),
      vpCenter: +(window.innerWidth / 2).toFixed(1),
      clockLeft: +clock.left.toFixed(1),
      clockRight: +clock.right.toFixed(1),
      clock: [...document.querySelectorAll('.timer p')].map(p => p.textContent),
      items: [...document.querySelectorAll('.btn-groups .item p')].map(p => p.textContent),
      dividers: document.querySelectorAll('.btn-groups .tb-divider').length,
      btnSize: (() => { const b = document.querySelector('.btn-groups button'); return b ? [b.offsetWidth, b.offsetHeight] : null })(),
      footerBox: (() => { const f = document.querySelector('.footer').getBoundingClientRect(); return [+f.left.toFixed(1), +f.width.toFixed(1)] })()
    }
  })()`)
  console.log(JSON.stringify(home, null, 1))
  const bad = []
  if (!(home.title || '').includes('智慧交通')) bad.push('标题缺失')
  if (Math.abs(home.groupCenter - home.vpCenter) > 3) bad.push('标题组不在正中: ' + home.groupCenter + ' vs ' + home.vpCenter)
  if (home.clockLeft > 60 || home.clockRight > 300) bad.push('时钟不在左侧: ' + home.clockLeft)
  if (home.items.length !== 9) bad.push('按钮数=' + home.items.length)
  if (home.dividers !== 2) bad.push('分隔线数=' + home.dividers)
  if (home.clock.length !== 2) bad.push('时钟缺')
  if (!home.btnSize || home.btnSize[0] < 30) bad.push('按钮尺寸=' + JSON.stringify(home.btnSize))
  if (!home.footerBox || Math.abs(home.footerBox[0] + home.footerBox[1] / 2 - 720) > 3) bad.push('底部栏不居中')
  console.log(bad.length ? 'BAD: ' + bad.join('; ') : 'DOM 全部符合新布局')
  await shot('v1bar-home.png')
  // 打开「控制中心」浮层看一眼
  await ev(`(() => {
    const items = [...document.querySelectorAll('.btn-groups .item')]
    const t = items.find(i => i.textContent.includes('控制中心'))
    if (t) t.click()
  })()`)
  await sleep(2500)
  const overlay = await ev(`document.querySelectorAll('.g2-chart').length`)
  console.log('浮层面板数:', overlay)
  await shot('v1bar-charts.png')
  console.log('console errors:', errors.length ? errors.slice(0, 3).join(' || ') : '无')
  process.exit(0)
}
