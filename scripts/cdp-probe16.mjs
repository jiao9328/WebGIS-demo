/* 定向回归：任务2「聚合标注 —— 缩小之后密密麻麻」+ 任务1 的符号升级（三层徽章）。
 *
 * 五块：
 *   A 聚合账目 —— 直接从 supercluster 取当前缩放的桶集做**对账**（不吞点）：
 *     Σ桶内点数 + 散点数 == 原始要素数，且逐桶 getLeaves == 桶上的 point_count；
 *   B 互斥显示 —— 读 `layer.getEncodedData()`（**过滤之后**真正交给渲染管线的那批记录，
 *     DataMappingPlugin 的 filterData 就是它的来源）：图标层只剩散点、数字层只剩桶。
 *     这比数像素硬得多 —— 记录数对不上就是没生效，没有中间地带。
 *   C 屏幕像素 —— 气泡真的画出来了（气泡色成块）、桶中间真的有数字（气泡色里的"墨"）；
 *   D 交互 —— 点气泡飞到该桶并放大、放大到 zoom≥13 气泡归零；
 *   E 徽章细节 —— 白环用 **A/B 隔离**判（藏掉底板层前后同一点比亮度：环位 A−B≥40 ⇒ 这圈白是底板画的），
 *     投影判下缘比上缘暗、且不是徽章色（投影层真的画在下面，没被白底板整块盖住）。
 *
 * 前置：pnpm dev(:5180)、Chrome headless --remote-debugging-port=9223
 * 用法：node scripts/cdp-probe16.mjs
 */
import { writeFileSync } from 'node:fs'
import { decodePNG, classifyPixels, colorBlobs } from './lib/png.mjs'
import { TRAFFIC_ICONS } from '../src/tools/trafficIcons.js'

const CDP = process.env.CDP_PORT || '9223'
const PORT = process.env.APP_PORT || '5180'
const BASE = `http://127.0.0.1:${PORT}`

/* 四类点图层 + 气泡色（主色的同族深色）。气泡色写死当独立预期，不 import —— 抄成同一份就验不出漂移。 */
const POINTS = ['camera', 'trafficLight', 'police', 'busStop']
const BUBBLE = { camera: '#5E35B1', trafficLight: '#0E9B57', police: '#C02B63', busStop: '#C9530C' }
const MAIN = { camera: '#7C4DFF', trafficLight: '#12B76A', police: '#E2447E', busStop: '#EF6820' }
const SIZE = { camera: 9, trafficLight: 10, police: 9, busStop: 9 } // L7 的 size 是半径，屏幕上 = size×2

/* 地图可视区（避开左侧「实时数据」栏与底部工具栏）—— 与 cdp-l7cluster-probe 同一块，像素统计都只在这里算 */
const CLIP = { x: 340, y: 110, width: 1230, height: 700 }
const PAD = 16 // 徽章类判据要留出图标自身的外扩（影子 24px），否则会被裁边

const created = await (await fetch(`http://localhost:${CDP}/json/new?about:blank`, { method: 'PUT' })).json()
if (!created?.webSocketDebuggerUrl) { console.log('无法创建标签页'); process.exit(1) }
const ws = new WebSocket(created.webSocketDebuggerUrl)
let msgId = 0
const pending = {}
const send = (m, p = {}) =>
  new Promise((r) => { const i = ++msgId; pending[i] = r; ws.send(JSON.stringify({ id: i, method: m, params: p })) })
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending[m.id]) {
    // CDP 命令失败时只有 m.error、result 是 undefined：静默吞掉就会变成「读到一堆 undefined」的假失败
    if (m.error) console.log(`  ! CDP ${m.error.message}`)
    pending[m.id](m.result); delete pending[m.id]
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const ev = (x) =>
  send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }).then((r) =>
    r?.exceptionDetails ? '<<' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text) + '>>'
      : r?.result?.value)
const evj = (x) => ev(x).then((s) => { try { return typeof s === 'string' ? JSON.parse(s) : s } catch { return s } })

let pass = 0, fail = 0
const fails = []
const check = (ok, label, detail) => {
  if (ok) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; fails.push(label); console.log(`  ❌ ${label}${detail !== undefined ? ' → ' + JSON.stringify(detail) : ''}`) }
}
const info = (l, v) => console.log(`  ·  ${l}${v !== undefined ? ' → ' + JSON.stringify(v) : ''}`)
const waitFor = async (expr, ms = 40000, step = 400) => {
  for (let t = 0; t < ms; t += step) { if (await ev(expr)) return true; await sleep(step) }
  return false
}
const shot = async (tag) => {
  const s = await send('Page.captureScreenshot', { format: 'png' })
  const buf = Buffer.from(s.data, 'base64')
  writeFileSync(`logs/probe16-${tag}.png`, buf)
  return decodePNG(buf)
}

/* 聚合账目：直接从 supercluster 取当前缩放的桶集（不依赖渲染管线），逐桶对账。
 * zoom 空间 = floor(mapZoom - 1)，与 DataSourcePlugin 里那行一致（探针 E0 验过）。
 * 散点的 point_count 是 source 补的 1，不算 cluster，所以 leaves 只能加在桶上。 */
const ACC = (n, raw) => `(()=>{const it=window.__traffic.registry[${JSON.stringify(n)}]
  const l=it&&it.layer; if(!l||!l.layerSource||!l.layerSource.clusterIndex) return JSON.stringify({err:'no-cluster-index'})
  const idx=l.layerSource.clusterIndex
  const z=Math.floor(window.__map.getZoom()-1)
  const all=idx.getClusters([-180,-90,180,90], z)
  const B=(f)=>!!(f.properties&&(f.properties.cluster===true||(f.properties.point_count||0)>1))
  let cl=0,sg=0,sum=0,leaves=0,mismatch=[],inClip=0,big=null
  const C=${JSON.stringify(CLIP)}, PAD=${PAD}
  const inC=(x,y)=>x>=C.x+PAD&&x<=C.x+C.width-PAD&&y>=C.y+PAD&&y<=C.y+C.height-PAD
  for(const f of all){
    const s=window.__map.project(f.geometry.coordinates)
    if(B(f)){ cl++; sum+=f.properties.point_count
      let lv=null; try{ lv=idx.getLeaves(f.properties.cluster_id,Infinity).length }catch(e){}
      if(lv===null||lv!==f.properties.point_count) mismatch.push({pc:f.properties.point_count,leaves:lv})
      leaves+=lv||0
      if(inC(s.x,s.y)){ inClip++
        const r=12+10*Math.min(1,Math.log10(f.properties.point_count)/1.8)
        const rec={id:f.properties.cluster_id, pc:f.properties.point_count, r:+r.toFixed(1),
          c:[+f.geometry.coordinates[0].toFixed(5),+f.geometry.coordinates[1].toFixed(5)], 屏:[Math.round(s.x),Math.round(s.y)]}
        if(!big||rec.pc>big.pc) big=rec } }
    else { sg++; sum+=1 } }
  return JSON.stringify({zoom空间:z, mapZoom:+window.__map.getZoom().toFixed(2), 原始:${raw},
    桶数:cl, 散点数:sg, 合计:sum, getLeaves:leaves, 桶内点数对不上:mismatch.slice(0,4), 屏内桶:inClip, 最大屏内桶:big})})()`

ws.onopen = async () => {
  await send('Runtime.enable')
  await send('Page.enable')
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__errs=[];addEventListener('error',e=>window.__errs.push('ERR '+(e.error?.message||e.message)));
      addEventListener('unhandledrejection',e=>window.__errs.push('REJ '+(e.reason?.message||e.reason)));
      try{sessionStorage.setItem('zb_auth_user',JSON.stringify({username:'admin',display_name:'核验'}))}catch(e){}`
  })
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false })
  await send('Page.navigate', { url: BASE + '/' })
  check(await waitFor(`!!(window.__map && window.__scene && window.__traffic)`), '地图 boot + __traffic 桥就绪')
  await sleep(2000)

  /* 默认视图：整个探针的基准（每次换层都跳回这里）。
   * 从页面上读而不是写死坐标 —— 应用改了默认视野，这里跟着走，断言才不会假通过。 */
  const VIEW = await evj(`JSON.stringify({c:[+window.__map.getCenter().lng.toFixed(5), +window.__map.getCenter().lat.toFixed(5)], z:+window.__map.getZoom().toFixed(2)})`)
  info('默认视图', VIEW)
  check(!!VIEW && VIEW.z < 12, '默认视图缩放 <12（这一屏本来就该出聚合气泡）', VIEW)
  const goView = async (zoom) => {
    await ev(`(()=>{window.__map.jumpTo({center:[${VIEW.c[0]},${VIEW.c[1]}], zoom:${zoom}, pitch:0, bearing:0});return 'ok'})()`)
    await sleep(1700)
  }
  const soleOn = async (n) => { for (const k of POINTS) await ev(`window.__traffic.setVisible(${JSON.stringify(k)}, ${k === n})`); await sleep(1200) }

  /* ================= A 默认视图：聚合账目（逐层） ================= */
  console.log('\n===== A 默认视图聚合对账 =====')
  const acc = {}
  for (const n of POINTS) {
    await soleOn(n)
    const raw = await ev(`(()=>{const d=window.__traffic.registry[${JSON.stringify(n)}].layer.layerSource.originData
      return (d&&d.features||[]).length})()`)
    const a = await evj(ACC(n, String(raw)))
    acc[n] = a
    info(n, a)
    check(!!a && !a.err, `${n} 聚合索引可用（clusterIndex 在）`, a && a.err)
    if (!a || a.err) continue
    check(a.桶数 > 0 && a.桶数 < a.原始, `${n} 聚合真的发生了（桶数 ${a.桶数} < 要素数 ${a.原始}）`, { 桶数: a.桶数, 原始: a.原始 })
    check(a.合计 === a.原始, `${n} Σ桶内点数 + 散点数 == 要素数（不吞点、不重复）`, { 合计: a.合计, 原始: a.原始 })
    check(a.getLeaves + a.散点数 === a.原始, `${n} 逐桶 getLeaves + 散点数 == 要素数（桶内明细可取）`, { leaves: a.getLeaves, 散点: a.散点数 })
    check(a.桶内点数对不上.length === 0, `${n} 每个桶上的 point_count == 该桶真实点数`, a.桶内点数对不上)
    check(a.屏内桶 >= 1 && !!a.最大屏内桶, `${n} 至少有 1 个桶落在取样区内（气泡看得见、点得到）`, { 屏内桶: a.屏内桶 })
  }

  /* ================= B 互斥显示：看 encode 之后的记录集 =================
   * `layer.getEncodedData()` 就是 DataMappingPlugin 里 `mapping(layer, attrs, filterData, …)` 的产物，
   * 而 filterData 正是「过滤之后」的那批 —— 这是「桶上不画图标、散点上不画气泡/数字」最直接的证据。
   *
   * ★ 口径不能取数组长度：被 filter 裁掉的记录**留在数组里**（首跑实测：busStop 数字层 3 条里
   *   只有 1 条有字段，另 2 条是 `{}`）—— 数组长度对不上是仪器的错，不是产品的错。
   * ★ 而且「非空」这个口径只对图标层成立：数字层（text）被裁掉的散点记录**仍带别的键**
   *   （实测 trafficLight 18 条非空 = 14 桶 + 4 散点），只是没了 `shape` —— 而 shape 正是要画的
   *   那个数。所以数字层用「**带 shape** 的记录数」，图标层用「非空记录数/带 shape 记录数」都行
   *   （图标层的 shape 是定值，永远在）。
   * ★ 「图标层里没有桶」也不能读 `r.point_count`：编码后的记录根本没有这个键（被折进 shape 了）。
   *   改成**几何判据**：剩下的图标记录投影到屏幕上，不能落在任何一个桶的 2px 内。
   * ★ 「数字 == 桶内点数」用数字层的 `shape` 当证据：`.shape('point_count','text')` 编码出来的
   *   就是这个数（首跑实测 busStop 桶 223 → shape 223、camera 桶 43/48/23 → shape 43/48/23），
   *   比之前的 shapeOption.values（永远是 `'text'`）硬得多。 */
  console.log('\n===== B 互斥显示（encode 后的记录集） =====')
  for (const n of POINTS) {
    const a = acc[n]
    if (!a || a.err) continue
    const d = await evj(`(()=>{const it=window.__traffic.registry[${JSON.stringify(n)}], g=it.group, l=it.layer
      const idx=l.layerSource.clusterIndex
      const all=idx.getClusters([-180,-90,180,90], Math.floor(window.__map.getZoom()-1))
      const B=(f)=>!!(f.properties&&(f.properties.cluster===true||(f.properties.point_count||0)>1))
      const buck=all.filter(B)
      const bpos=buck.map(f=>window.__map.project(f.geometry.coordinates))
      const arr=(x)=>{ try{ const e=x.getEncodedData(); return Array.isArray(e)?e:(e&&typeof e==='object'?Object.values(e):[]) }catch(err){ return null } }
      const live=(x)=>x?x.filter(r=>r&&typeof r==='object'&&Object.keys(r).length>0):[]
      const ic=arr(g[2]), bl=arr(g[3]), ct=arr(g[4])
      const icL=live(ic), blL=live(bl), ctL=live(ct)
      let onBucket=0, offBucket=0, 桶上尺寸非零=0, 散点尺寸零=0
      for(const r of icL){ if(!r.coordinates) continue
        const s=Number(r.size)
        const p=window.__map.project(r.coordinates)
        let near=false
        for(const b of bpos) if(Math.hypot(b.x-p.x,b.y-p.y)<2){ near=true; break }
        if(near){ onBucket++; if(s!==0) 桶上尺寸非零++ } else { offBucket++; if(!(s>0)) 散点尺寸零++ } }
      const num=(x)=>x.map(r=>Number(r.shape)).filter(v=>!isNaN(v)).sort((p,q)=>p-q)
      /* ★ 数字层（text）不能用「非空记录数」当口径：被 filter 掉的散点记录**仍然带别的键**
       *   （实测 trafficLight 18 条非空 = 14 桶 + 4 散点），但它们的 shape 是空的 —— 而 shape
       *   正是要画的那个数。所以口径取「带 shape 的记录数」：那才是真的会画出来的那批。
       *   证据：数字层取值里一个 1 都没有（散点没被画成「1」），逐个对得上桶内点数。 */
      const 有形=(x)=>x.filter(r=>r&&r.shape!==undefined&&r.shape!==null)
      const 无形状=ctL.filter(r=>r.shape===undefined||r.shape===null)
      return JSON.stringify({图标层数组:ic?ic.length:null, 图标层非空:icL.length, 图标层有形:有形(icL).length,
        气泡层数组:bl?bl.length:null, 气泡层非空:blL.length,
        数字层数组:ct?ct.length:null, 数字层非空:ctL.length, 数字层有形:有形(ctL).length,
        无形状记录的键:无形状.slice(0,2).map(r=>Object.keys(r).join('+')),
        图标层落在桶上:onBucket, 图标层不在桶上:offBucket,
        桶上尺寸非零, 散点尺寸零,
        数字层取值:num(ctL).slice(0,8), 桶内点数:buck.map(f=>f.properties.point_count).sort((p,q)=>p-q).slice(0,8),
        数字层字段:(g[4].shapeOption&&g[4].shapeOption.field)||null})})()`)
    info(`${n} encode 后`, d)
    /* ★ 图标层不再用 .filter() 裁掉桶（那样会让 L7 把模型退化成方块，见 initTrafficLayers.js
     *   的 pointStack 注释），改成 .size('point_count', 回调)：每条记录都留着，
     *   桶上给 0（gl_PointSize=0 ⇒ 不产生像素）、散点给真实尺寸。
     *   所以这里断言的是「记录全在 + 桶上尺寸归零」这条更硬的口径。 */
    check(!!d && d.图标层非空 === a.桶数 + a.散点数, `${n} 图标层记录 = 桶 + 散点（每条都留，靠尺寸归零隐藏桶）`, d && { 图标层非空: d.图标层非空, 数组: d.图标层数组, 桶数: a.桶数, 散点数: a.散点数 })
    check(!!d && d.图标层不在桶上 === a.散点数, `${n} 图标层里「不在桶上」的记录数 == 散点数`, d && { 不在桶上: d.图标层不在桶上, 散点数: a.散点数 })
    check(!!d && d.桶上尺寸非零 === 0 && d.图标层落在桶上 > 0, `${n} 落在桶上的 ${d && d.图标层落在桶上} 条图标记录 size 全为 0（桶上不画图标）`, d && { 落在桶上: d.图标层落在桶上, 桶上尺寸非零: d.桶上尺寸非零 })
    check(!!d && d.散点尺寸零 === 0, `${n} 散点上的图标记录 size 都 > 0（散点真的画得出来）`, d && { 散点尺寸零: d.散点尺寸零 })
    check(!!d && d.气泡层非空 === a.桶数 + a.散点数, `${n} 气泡层记录 = 桶 + 散点（${a.桶数}+${a.散点数}，散点靠 size 回调返回 0 不画）`, d && { 气泡层非空: d.气泡层非空 })
    check(!!d && d.数字层有形 === a.桶数, `${n} 数字层只剩聚合桶（带 shape 的记录 ${a.桶数} 条；散点上的数字不画）`, d && { 数字层有形: d.数字层有形, 数字层非空: d.数字层非空, 数组: d.数字层数组, 桶数: a.桶数, 无形状记录的键: d.无形状记录的键 })
    check(!!d && JSON.stringify(d.数字层取值) === JSON.stringify(d.桶内点数),
      `${n} 数字层画的数 == 各桶的真实点数（逐个对得上）`, d && { 数字: d.数字层取值, 桶: d.桶内点数 })
    check(!!d && d.数字层字段 === 'point_count', `${n} 数字取的就是 point_count 字段`, d && d.数字层字段)
  }

  /* ================= B2 低倍桶位置上不该有徽章像素 =================
   * 这是「图标层在空数据缩放上建出来 ⇒ L7 把模型退化成普通方块」那个 bug 的回归断言
   * （根因与实测见 src/tools/initTrafficLayers.js 里 pointStack 的注释）。
   * 症状很会骗人：方块模型默认 additive 混合，紫徽章叠在饱和的白底板上做加法还是纯白，
   * 肉眼看是「白方块 + 灰描边」，很容易当成「设计就这样」——所以这里必须用像素把它按住。
   * 判据：把气泡/数字层藏起来（它们在最上面，会正好盖住图标），在屏内最大桶的中心取
   * (size+4)×2 的方框，徽章色像素要 ≈0；紧接着**同位置对照**：把桶上的图标放出来（size 临时
   * 恒返回尺寸）必须能数到徽章色 —— 否则上一条可能只是「这块地方本来就画不出东西」的假通过。 */
  console.log('\n===== B2 低倍桶位置上不该有徽章像素 =====')
  await soleOn('camera')
  {
    const b = acc.camera && acc.camera.最大屏内桶
    if (!b) check(false, '能取到屏内最大桶（低倍徽章判据的前提）', b)
    else {
      const half = SIZE.camera + 4
      const box = { x: b.屏[0] - half, y: b.屏[1] - half, width: half * 2, height: half * 2 }
      const hook = `(()=>{const g=window.__traffic.registry.camera.group; g[3].hide(); g[4].hide(); return 'ok'})()`
      await ev(hook)
      await sleep(900)
      const img = await shot('lowzoom-桶上无徽章')
      const px = classifyPixels(img, box, [{ key: 'badge', hex: MAIN.camera, maxDist: 45 }])
      info(`低倍桶中心 ${box.width}×${box.height}`, { 徽章色: px.badge || 0, 桶: b })
      /* 容差 8px：底图/车辆偶尔有落进来的近色像素，而一个方块模型是 ~300px */
      check((px.badge || 0) <= 8, 'zoom 9.5（全是桶）桶位置上没有徽章像素（图标被 size 归零藏住）', { 徽章色: px.badge || 0 })
      const SZ = [SIZE.camera + 3, SIZE.camera + 1.5, SIZE.camera]
      await ev(`(()=>{const g=window.__traffic.registry.camera.group
        const SZ=${JSON.stringify(SZ)}
        g.slice(0,3).forEach((l,i)=>l.size(SZ[i])); return 'ok'})()`)
      await sleep(1300)
      const px2 = classifyPixels(await shot('lowzoom-对照-放出来'), box, [{ key: 'badge', hex: MAIN.camera, maxDist: 45 }])
      check((px2.badge || 0) >= 100, '同位置对照：把桶上的图标放出来后能数到徽章色（仪器确实看得见徽章）', { 徽章色: px2.badge || 0 })
      await ev(`(()=>{const g=window.__traffic.registry.camera.group
        const SZ=${JSON.stringify(SZ)}
        g.slice(0,3).forEach((l,i)=>l.size('point_count', (n)=> n > 1 ? 0 : SZ[i])); return 'ok'})()`)
      await ev(`(()=>{const g=window.__traffic.registry.camera.group; g[3].show(); g[4].show(); return 'ok'})()`)
      await sleep(900)
    }
  }

  /* ================= C 屏幕像素：气泡 + 桶里的数字 ================= */
  console.log('\n===== C 气泡与数字的像素 =====')
  for (const n of POINTS) {
    const a = acc[n]
    if (!a || a.err) continue
    /* ★ 截图前必须把这一层**重新点亮**：A 段末尾停在上一个图层上（soleOn 会把其余的关掉），
     *   首跑就是漏了这句，于是 C 段拍的「camera 气泡」其实是 busStop 那一层 —— 一张底图上
     *   当然找不出紫色，看上去像「camera 的气泡画不出来」，白查了半天。 */
    await soleOn(n)
    const img = await shot(`default-${n}`)
    const blobs = colorBlobs(img, { x: CLIP.x, y: CLIP.y, width: CLIP.width, height: CLIP.height }, BUBBLE[n], 70)
    const big = blobs.filter((b) => b.n >= 200)
    info(`${n} 气泡色块`, { 块数: blobs.length, 前3块: blobs.slice(0, 3).map((b) => b.n) })
    /* 半径 12~22px 的圆面积 450~1500px²；取 200 当下限（被别的气泡压掉一角也还算一个气泡） */
    check(big.length >= 1, `${n} 屏幕上真的有气泡（≥1 个 ≥200px 的 ${BUBBLE[n]} 色块）`, { 块数: blobs.length, 达标块: big.length })
    /* 桶里的数字：数字是画在气泡上的白字，所以在「完全落在气泡内」的小方框里，
     * 不属于气泡色的像素就是数字的墨。
     * ★ 先证明这个方框**确实是气泡**（气泡色占 ≥60%）：首跑少了这句，气泡没画出来时
     *   方框里全是底图，"墨 = 面积 - 气泡色" 直接等于整块面积，谁都能"通过"。 */
    const b = a.最大屏内桶
    if (b) {
      const half = Math.max(8, Math.round(b.r * 0.65)) // 0.65r 的方框，四角仍在圆内（0.65√2=0.92<1）
      const box = { x: b.屏[0] - half, y: b.屏[1] - half, width: half * 2, height: half * 2 }
      const px = classifyPixels(img, box, [{ key: 'bubble', hex: BUBBLE[n], maxDist: 90 }])
      const area = box.width * box.height
      const bubblePx = px.bubble || 0
      const ink = area - bubblePx
      const covered = bubblePx >= area * 0.6
      info(`${n} 最大桶中心 ${box.width}×${box.height}`, { 气泡色: bubblePx, 占比: +(bubblePx / area).toFixed(2), 墨: ink, 桶: b })
      check(covered, `${n} 最大桶中心那块是实心气泡（气泡色占 ≥60%，数字判据的前提）`, { 占比: +(bubblePx / area).toFixed(2), 位置: b.屏 })
      check(covered && ink >= 20, `${n} 最大桶中间真的画了数字（气泡色里数出 ≥20px 的墨）`, { 墨: ink, 覆盖: covered })
    }
  }

  /* ================= D 点气泡 → 飞到该桶并放大；放大后气泡归零 ================= */
  console.log('\n===== D 点气泡交互 + 放大归零 =====')
  await soleOn('camera')
  {
    const a = acc.camera
    const b = a && a.最大屏内桶
    if (!b) { check(false, '能取到屏内最大桶（点击前提）', b) } else {
      /* 先把这个桶的「展开级别」直接问出来，点击后拿它当预期 —— 断言才对得上代码里的 +1 换算：
       * supercluster 给的是**它那棵树的** zoom，而树是按 Math.floor(mapZoom-1) 建的，所以地图 zoom = 值+1，
       * 代码里再留 0.5 的余量（ex+1.5）、上限 15。 */
      const exz = await evj(`(()=>{const idx=window.__traffic.registry.camera.layer.layerSource.clusterIndex
        try{ const v=idx.getClusterExpansionZoom(${b.id}); return JSON.stringify({原值:v, 类型:typeof v}) }
        catch(e){ return JSON.stringify({err:String(e&&e.message)}) }})()`)
      const want = exz && !exz.err && typeof exz.原值 === 'number' ? Math.min(exz.原值 + 1.5, 15) : null
      info('桶的展开级别', { ...exz, 预期目标zoom: want, 当前zoom: a.mapZoom })
      const [bx, by] = b.屏
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: bx, y: by, button: 'none' })
      await sleep(80)
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: bx, y: by, button: 'left', clickCount: 1 })
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: bx, y: by, button: 'left', clickCount: 1 })
      await sleep(2200)
      const after = await evj(`JSON.stringify({c:[window.__map.getCenter().lng, window.__map.getCenter().lat], z:+window.__map.getZoom().toFixed(2)})`)
      const d = Math.hypot(after.c[0] - b.c[0], after.c[1] - b.c[1])
      info('点气泡后', { 桶: b.屏, 桶坐标: b.c, 视图: after, 中心偏差度: +d.toFixed(5), 缩放增量: +(after.z - a.mapZoom).toFixed(2) })
      check(d < 0.01, '点气泡后地图中心落到该桶上（±0.01°）', { 偏差: +d.toFixed(5) })
      check(want !== null && Math.abs(after.z - want) <= 0.15, '点气泡后 zoom 落到「该桶展开级别 +1.5」（首跑卡在这里：老写法 +0.5 正好等于当前 zoom ⇒ 一级都没放大）', { 预期: want, 实测: after.z })
      check(after.z - a.mapZoom >= 0.9, '点气泡确实放大了一档（≥0.9 级）', { 前: a.mapZoom, 后: after.z })
    }
  }
  await goView(13.5)
  for (const n of POINTS) {
    const raw = await ev(`(()=>{const d=window.__traffic.registry[${JSON.stringify(n)}].layer.layerSource.originData
      return (d&&d.features||[]).length})()`)
    const a = await evj(ACC(n, String(raw)))
    info(`${n} @13.5`, a && { 桶数: a.桶数, 散点数: a.散点数, 合计: a.合计, 原始: a.原始 })
    check(!!a && a.桶数 === 0 && a.散点数 === a.原始, `${n} zoom 13.5 全部散开（桶数 0、散点数 == 要素数）`, a && { 桶数: a.桶数, 散点: a.散点数, 原始: a.原始 })
  }
  {
    const img = await shot('zoom13')
    const px = classifyPixels(img, { x: CLIP.x, y: CLIP.y, width: CLIP.width, height: CLIP.height }, POINTS.map((n) => ({ key: n, hex: BUBBLE[n], maxDist: 70 })))
    const total = POINTS.reduce((s, n) => s + (px[n] || 0), 0)
    info('13.5 气泡色像素', Object.fromEntries(POINTS.map((n) => [n, px[n] || 0])))
    /* 不一定正好 0：容差 70 很宽，底图里偶尔有落进来的像素。要求「归零量级」。 */
    check(total <= 60, 'zoom 13.5 地图上没有气泡了（气泡色像素 ≤60）', { 合计: total })
  }

  /* ================= E 徽章细节：白描边 + 投影 ================= */
  console.log('\n===== E 徽章白描边 / 投影 =====')
  /* 选「孤立的摄像头」：邻居在屏幕上 >30px（否则会量到旁边的徽章头上）。
   * 【这套判据是怎么逼出来的 —— 三条都是当场量出来的，不是推理】
   *   ① 白环只有 ~2.3px（底板 21px − 本体 16.3px）：左右两侧再被本体的抗锯齿和影子的模糊各吃一口，
   *      贴边的那个像素常见 172~228（不是 255）。首跑按「逐像素 min≥210」判，把**画出来了的**环判成全灭
   *      —— 仪器的锅（tmp-ring 二维剖面复核）。
   *   ② 取样点可能压在 DOM 面板底下：默认视图右上角 DIV.road-bar（白色 fixed 条）盖到 y≈135，
   *      而现场最「孤立」（邻居距 291px）的那个摄像头正好在它下面 —— 那一行整片纯白、徽章色区间 null。
   *      所以选点先问 elementsFromPoint，被盖住的候选直接排除并列出来（不是产品 bug）。
   *   ③ 判白环不看绝对亮度，改判**它属不属于底板层**：整张图拍一次 A，藏掉 group[1] 再拍一次 B，
   *      环位置 A−B ≥ 40 ⇒ 这圈白确实是底板画的。A/B 之间用**离图标 18px 外的四个点**做稳定性对照
   *      （都 ≤18 才算背景没变），把「跨截图不可比」这条从根上关掉。
   *      反例检验：真要是底板层没画出来，藏它等于没藏 ⇒ delta≈0 ⇒ 判据失败（不是恒真的）。
   * 投影单独判：下缘比上缘暗 ≥6 且下缘颜色离徽章色 ≥120（同图内的相对关系，不跨截图）。
   *
   * ★ 取样中心不能写死 [118.05,36.81]：首跑就这么干的，跳过去 zoom 15 之后**屏内一个摄像头都没有**
   *   （「屏内点 0」），判据直接死掉。先按数据找几个点最密的格子（0.01°≈1km），
   *   逐个中心跳过去试，直到屏内出现 ≥2 个**没被面板遮住**的孤立图标为止 —— 用读数选中心，不用猜。 */
  const pick = (gap) => `(()=>{const it=window.__traffic.registry.camera
    const fs=(it.layer.layerSource.originData||{}).features||[]
    const pts=fs.map(f=>window.__map.project(f.geometry.coordinates)).map(p=>({x:Math.round(p.x),y:Math.round(p.y)}))
    const C=${JSON.stringify(CLIP)}, PAD=${PAD}
    const ok=(p)=>p.x>=C.x+PAD&&p.x<=C.x+C.width-PAD&&p.y>=C.y+PAD&&p.y<=C.y+C.height-PAD
    const 覆盖=(p)=>{const e=document.elementsFromPoint(p.x,p.y)[0]
      return !e?'无':(e.tagName==='CANVAS'||/l7-marker-container/.test(String(e.className)))?'画布':e.tagName+'.'+String(e.className||'').split(' ')[0]}
    const out=[]
    for(const p of pts){ if(!ok(p)) continue
      let d=1e9; for(const q of pts) if(q!==p) d=Math.min(d,Math.hypot(q.x-p.x,q.y-p.y))
      if(d>${gap}) out.push({x:p.x,y:p.y,邻居距:Math.round(d),最上层:覆盖(p)}) }
    out.sort((a,b)=>b.邻居距-a.邻居距)
    return JSON.stringify({屏内点:pts.filter(ok).length, 候选:out.slice(0,4),
      未遮数:out.filter(o=>o.最上层==='画布').length})})()`
  const centres = await evj(`(()=>{const fs=((window.__traffic.registry.camera.layer.layerSource.originData||{}).features)||[]
    const m=new Map()
    for(const f of fs){ const c=f.geometry.coordinates
      const k=Math.round(c[0]/0.01)+','+Math.round(c[1]/0.01); m.set(k,(m.get(k)||0)+1) }
    return JSON.stringify([...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([k,n])=>{const p=k.split(',').map(Number); return {c:[+(p[0]*0.01).toFixed(4), +(p[1]*0.01).toFixed(4)], 格内点数:n}}))})()`)
  let cand = null
  for (const ctr of (centres || [])) {
    await ev(`(()=>{window.__map.jumpTo({center:${JSON.stringify(ctr.c)}, zoom:15, pitch:0, bearing:0});return 'ok'})()`)
    await sleep(1700)
    let c = await evj(pick(30))
    if (!c || !c.未遮数 || c.未遮数 < 2) c = await evj(pick(26))
    info(`zoom15 取样中心 ${ctr.c}（该格 ${ctr.格内点数} 点）`, c && {
      屏内点: c.屏内点, 候选数: (c.候选 || []).length, 未被遮: c.未遮数,
      榜首: (c.候选 || [])[0], 被面板遮住的: (c.候选 || []).filter((o) => o.最上层 !== '画布').map((o) => o.最上层 + '@' + o.x + ',' + o.y) })
    cand = c
    if (c && c.未遮数 >= 2) break
  }

  const lum = (img, x, y) => { const i = (y * img.width + x) * 4; return 0.2126 * img.rgba[i] + 0.7152 * img.rgba[i + 1] + 0.0722 * img.rgba[i + 2] }
  const rgbAt = (img, x, y) => { const i = (y * img.width + x) * 4; return [img.rgba[i], img.rgba[i + 1], img.rgba[i + 2]] }
  const hex2 = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16))
  const redmean = (a, b) => { const rm = (a[0] + b[0]) / 2
    return Math.sqrt((2 + rm / 256) * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + (2 + (255 - rm) / 256) * (a[2] - b[2]) ** 2) }

  const 未遮 = (cand && Array.isArray(cand.候选)) ? cand.候选.filter((c) => c.最上层 === '画布') : []
  if (未遮.length < 2) {
    check(false, '能取到 ≥2 个没被 DOM 面板遮住的孤立图标（白环判据的前提）', cand)
  } else {
    const imgA = await shot('badge-zoom15')
    /* B 拍：藏掉白底板层。环位置「A−B」就是底板给那圈像素贡献的亮度 —— 这条把「白环到底是谁画的」钉死。
     * （跨了两张截图，所以下面每个候选都配一组稳定性对照；背景变了就不采信这个候选。） */
    await ev(`(()=>{window.__traffic.registry.camera.group[1].hide();return 'ok'})()`)
    await sleep(1000)
    const imgB = await shot('badge-zoom15-藏底板')
    await ev(`(()=>{window.__traffic.registry.camera.group[1].show();return 'ok'})()`)
    await sleep(800)
    /* 摄像头层是**状态取色**的（正常紫 / 故障红，见 ICON.camera），抽到的图标是哪种事先不知道：
     * 首跑只认紫色、正好抽到两个故障探头，于是报「徽章色区间 null」的假失败 —— 仪器自己的锅。
     * 这里按本层的用色集合判定。 */
    const CAM_COLORS = [MAIN.camera, '#F04438']
    const isMain = (p) => CAM_COLORS.some((h) => redmean(p, hex2(h)) <= 90)
    const detail = []
    /* 取样点上是哪种状态的探头：把 originData 投影后按 2px 匹配回来（读数用，不是断言） */
    const stMap = await evj(`(()=>{const fs=((window.__traffic.registry.camera.layer.layerSource.originData||{}).features)||[]
      const want=${JSON.stringify(未遮.slice(0, 3).map((c) => [c.x, c.y]))}
      const out=[]; for(const f of fs){ const p=window.__map.project(f.geometry.coordinates)
        for(const q of want) if(Math.hypot(p.x-q[0],p.y-q[1])<2) out.push({屏:q, 状态:(f.properties||{}).status}) }
      return JSON.stringify(out)})()`)
    info('候选取样点上的探头状态（读数用）', stMap)
    for (const { x, y, 邻居距, 最上层 } of 未遮.slice(0, 3)) {
      /* 稳定性对照：离图标 18px 外的四个点（影子最远 ±12）在两拍之间不该变 */
      const 对照 = [[x + 18, y], [x - 18, y], [x, y + 18], [x, y - 18]]
        .map(([px, py]) => Math.round(Math.abs(lum(imgA, px, py) - lum(imgB, px, py))))
      const 稳定 = 对照.every((d) => d <= 18)
      /* 徽章色的左右极值（本体在中心行上的着色像素） */
      let L = null, R = null
      for (let dx = -(SIZE.camera + 4); dx <= SIZE.camera + 4; dx++) {
        if (isMain(rgbAt(imgA, x + dx, y))) { if (L === null) L = dx; R = dx }
      }
      /* 一侧的剖面：从徽章色极值像素起、向外 8 个像素（k=0 是徽章自己，k≥1 是外侧） */
      const 侧 = (edge, dir) => {
        const A = [], B = []
        for (let k = 0; k <= 8; k++) {
          A.push(Math.round(lum(imgA, x + edge + dir * k, y)))
          B.push(Math.round(lum(imgB, x + edge + dir * k, y)))
        }
        /* 环位 = 紧外那两个像素里「藏掉底板变暗更多」的那个（抗锯齿会把环挤到 1 或 2 号位） */
        const d1 = A[1] - B[1], d2 = A[2] - B[2]
        const k = d2 > d1 ? 2 : 1
        const delta = k === 2 ? d2 : d1
        return { 侧: dir < 0 ? '左' : '右', A, B, 环位: k, 底板贡献: delta,
          环比徽章本体亮: A[k] - A[0], 过: delta >= 40 && A[k] >= A[0] + 45 }
      }
      const left = L === null ? null : 侧(L, -1)
      const right = R === null ? null : 侧(R, 1)
      /* 投影：影子层 24px、下移约 1px，所以下缘 ±11 处该有暗带、上缘同距没有。
       * 比的是**同一列**上 ±11 与 ±16 的明度差（同图内的相对关系，不跨截图）。 */
      const semi = SIZE.camera
      const dBottom = lum(imgA, x, y + semi + 2) - lum(imgA, x, y + semi + 7)
      const dTop = lum(imgA, x, y - semi - 2) - lum(imgA, x, y - semi - 7)
      const distToMain = Math.round(redmean(rgbAt(imgA, x, y + semi + 2), hex2(MAIN.camera)))
      const shadow = dBottom <= -8 && dBottom < dTop - 6 && distToMain >= 120
      const ring = !!(left && left.过) || !!(right && right.过)
      detail.push({ 图标: [x, y], 邻居距, 最上层, 稳定, 对照差: 对照, 环: ring, 影: shadow,
        徽章色区间: L === null ? null : [L, R],
        左: left, 右: right, 下缘暗差: +dBottom.toFixed(1), 上缘暗差: +dTop.toFixed(1), 影色离徽章色: distToMain })
    }
    info('每个候选的实测（A=三层全在，B=藏掉底板；「底板贡献」= A−B，就是这圈白由底板层贡献的亮度）', detail)
    /* 稳定性是**闸门**不是备注：背景在两拍之间动过的候选，它那圈白是不是底板画的就说不清了（run4 里
     *   有个候选的对照点变了 23 —— 旁边大概是开过去一辆车）。只认稳定候选，判据才不是恒真的。 */
    const 稳 = detail.filter((d) => d.稳定)
    check(稳.length >= 2, '≥2 个候选的背景在两拍之间没变（A/B 可比性的前提）', { 稳定数: 稳.length, 详: detail })
    check(稳.filter((d) => d.环).length >= 2,
      '≥2 个（背景稳定的）图标外侧紧邻的白环确实由底板层画出：藏掉底板那圈暗 ≥40、且比本体亮 ≥45',
      { 通过: 稳.filter((d) => d.环).length, 详: detail })
    check(稳.filter((d) => d.影).length >= 2,
      '≥2 个（背景稳定的）图标下缘比上缘暗 6 以上、且颜色不是徽章色（投影层真的在下面）',
      { 通过: 稳.filter((d) => d.影).length, 详: detail })
  }

  /* ================= F 图层开关整组显隐 ================= */
  console.log('\n===== F 图层组显隐 =====')
  for (const n of POINTS) {
    /* 尺寸有两种形态：数字（线/热力）与「按 point_count 取值」的回调（三层徽章 + 气泡）。
     * 回调要**喂样本再取**（values(1) = 散点、values(2) = 桶），不能读 .field（那是 'point_count'）。 */
    const st = await evj(`(()=>{const it=window.__traffic.registry[${JSON.stringify(n)}]
      const sz=(l)=>{const o=(l.configService.getAttributeConfig(l.id)||{}).size||{}
        if(typeof o.values==='function') return {field:o.field, 散点:o.values(1), 桶:o.values(2)}
        return {值:o.field}}
      return JSON.stringify({组数:it.group.length,
        主层是组里的图标层: it.layer===it.group.find(l=>String((l.shapeOption&&l.shapeOption.field)||'')===${JSON.stringify(TRAFFIC_ICONS[n].id)}),
        图标层形状: String((it.layer.shapeOption&&it.layer.shapeOption.field)||''), 尺寸: it.group.map(sz)})})()`)
    await ev(`window.__traffic.setVisible(${JSON.stringify(n)}, false)`); await sleep(500)
    const off = await evj(`JSON.stringify(window.__traffic.registry[${JSON.stringify(n)}].group.map(l=>l.isVisible()))`)
    await ev(`window.__traffic.setVisible(${JSON.stringify(n)}, true)`); await sleep(700)
    const on = await evj(`JSON.stringify(window.__traffic.registry[${JSON.stringify(n)}].group.map(l=>l.isVisible()))`)
    info(`${n} 图层组`, { ...st, 关后: off, 开后: on })
    check(!!st && st.组数 === 5, `${n} 一类点位 = 5 个 L7 图层（影/底/本体/泡/数）`, st && st.组数)
    check(!!st && st.主层是组里的图标层, `${n} registry.layer 仍指向图标层（probe14 等读的就是它）`, st && st.图标层形状)
    const sz = st && st.尺寸
    check(!!sz && sz[0].散点 === SIZE[n] + 3 && sz[1].散点 === SIZE[n] + 1.5 && sz[2].散点 === SIZE[n],
      `${n} 三层尺寸链 影 ${SIZE[n] + 3} > 底 ${SIZE[n] + 1.5} > 本体 ${SIZE[n]}（散点取值）`, sz)
    check(!!sz && sz[0].桶 === 0 && sz[1].桶 === 0 && sz[2].桶 === 0 && sz[0].field === 'point_count',
      `${n} 三层的桶取值都是 0（桶上不画徽章/白底/影子）`, sz)
    check(Array.isArray(off) && off.length === 5 && off.every((v) => v === false), `${n} 关一层 → 整组 5 个都消失`, off)
    check(Array.isArray(on) && on.length === 5 && on.every((v) => v === true), `${n} 再开 → 整组 5 个都回来`, on)
  }

  const errs = await evj(`JSON.stringify((window.__errs||[]).slice(0,5))`)
  check((errs || []).length === 0, '全程无运行时错误', errs)

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`)
  if (fail) console.log('失败项：\n - ' + fails.join('\n - '))
  /* 收尾别直接 process.exit：Windows 上 WebSocket 还在关闭中就退出，libuv 会抛
   * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)`，退出码被冲成 127。 */
  try { await fetch(`http://localhost:${CDP}/json/close/${created.id}`) } catch { /* 忽略 */ }
  ws.close()
  process.exitCode = fail ? 1 : 0
}
