/**
 * 智慧交通图层模块（L7）
 *
 * 7 类交通图层懒创建注册表：首次显示才 scene.addLayer，之后 show/hide 复用实例。
 *   camera       监控探头（摄像头图标，正常 #7C4DFF 紫 / 故障 #F04438 红）
 *   trafficLight 信号灯（红绿灯图标，state 四色 green/red/yellow/fault）
 *   police       警员分布（警员图标 #E2447E，onDuty 在勤/休班）
 *   busRoute     公交线路（LineLayer 青绿，无动画）
 *   congestion   道路拥堵（真实路名 → 本地路网几何匹配，三色分级）
 *   heat         交通热力（HeatmapLayer 绿→黄→橙→红）
 *   busStop      公交站点（公交车图标 #EF6820）
 * building/mainRoad 为桥接别名：控制基础图层（城市建筑/道路流线）
 *
 * 数据源：SQL Server（后端 /api/mapdata → store.dbData），不再是本地 JSON/mock。
 * 图层工厂在「创建/重建」瞬间从 store.dbData 读最新行并经 dbAdapter 转 GeoJSON，
 * 因此数据管理面板增删改后调用 refreshTrafficLayer(name) 重建即可实时上图层。
 *
 * 导出：
 *   setTrafficLayerVisible(name, visible) / toggleTrafficLayer(name) / isTrafficLayerVisible(name)
 *   refreshTrafficLayer(name) / refreshVisibleTrafficLayers()
 *   DEV 下挂 window.__traffic 供 CDP 验证断言
 */
import { PointLayer, LineLayer, HeatmapLayer, Popup } from '@antv/l7'
import roadData from '@/assets/GIS_Data/Zibo_roads.json'
import { baseLayerMap } from './initLayer'
import { TRAFFIC_ICONS, BADGE_IMAGES, iconUrl } from './trafficIcons'
import { store } from '../store'
import { pointFC, routeFC, layerProps } from './dbAdapter'
import { setVehicleVisible } from './vehicleSim' // 动态车辆为前端模拟层（marker），开关委托它统一管理

/* ---------------- 本地路网索引（仅供拥堵按路名匹配几何，模块加载时一次） ---------------- */
const roadByName = new Map()
for (const f of roadData.features) {
  const name = f.properties.name
  if (name && !roadByName.has(name)) roadByName.set(name, f)
}

/* 当前行的简写（图层创建瞬间读取最新 DB 数据） */
const rows = (t) => (store.dbData && store.dbData[t]) || []

/* 拥堵层 FC：行 + 路网几何匹配（找不到的退化为短线段占位） */
const congestionFC = () => ({
  type: 'FeatureCollection',
  features: rows('congestion').map((c) => {
    const rf = roadByName.get(c.name)
    return {
      type: 'Feature',
      properties: layerProps('congestion', c),
      geometry: rf ? rf.geometry
        : { type: 'LineString', coordinates: [[c.lng, c.lat], [c.lng + 0.01, c.lat + 0.005]] }
    }
  })
})

/* ---------------- 共享 Popup ---------------- */
const popup = new Popup({ closeButton: true, offsets: [0, -10] })
let sceneRef = null

// 统一弹窗：已打开则复用更新，已关闭/首次则 addPopup（重复 add 同一实例会重复入栈）
const showPopup = (lngLat, html) => {
  popup.setLnglat(lngLat).setHTML(html)
  if (!popup.isOpen()) sceneRef.addPopup(popup)
}
const evLngLat = (e) => (e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : [118.05, 36.81])

/* ---------------- 图层图标规范 ----------------
 * 一个图层一套「专属图标 + 专属色」，目标是扫一眼地图就知道那是什么图层：
 *
 *   图层        图标                主色       怎么认
 *   监控探头    摄像头（机身+镜头）  #7C4DFF    故障转 #F04438 红
 *   信号灯      红绿灯（三灯箱）    #12B76A    状态四色 绿/红/黄/故障灰
 *   警员分布    警徽（盾+星）       #E2447E
 *   公交站点    公交车（车身+轮）   #EF6820
 *   公交线路    线                 #0E9AA7    青绿实线
 *   道路拥堵    线                 红/橙/黄   语义三色（分严重/中度/轻度，不改）
 *   动态车辆    —                  专属色     车形 SVG（vehicleSim 用 DOM marker 单独渲染）
 *
 * 图标本体（圆角方块徽章）在 tools/trafficIcons.js，这里只放「用哪个图标 + 什么颜色 + 多大 + 聚合成什么样」。
 *   · 尺寸 9~10（L7 的 size 是半径，屏幕上 = size×2，即 18~20px）：徽章本体画满 64 的 viewBox，
 *     所以 size 基本等于徽章半径；外面还有 1.5px 白描边、再外面是阴影，视觉总宽约 size×2+4。
 *     信号灯多给 1（20px 才分得出三盏灯）。原来是 4.5~6px 的几何点，现在再大就盖住路网了。
 *   · 颜色的选择理由照旧：紫/品红/橙/青绿，与底图路网蓝（initLayer 的 #1990FF）redmean 色差 ≥120，
 *     彼此也拉开 ≥60。以下是实测过的老账：源数据里警员 #3d7bff、公交站 #00c2ff、公交线路 #2b8cff
 *     都是这一族蓝，照数据着色就与路网糊成一片（CDP 截图 + 识图复核确认），所以本模块按图层统一给色。
 *   · 聚合气泡用**主色的同族深色**（同色相、压暗），一眼看出这个气泡属于哪一层。
 */
const ICON = {
  camera: { shape: 'camera', color: '#7C4DFF', faulty: '#F04438', bubble: '#5E35B1', title: '监控', z: 20, size: 9 },
  trafficLight: {
    shape: 'trafficLight',
    size: 10, // 三盏灯在 20px 里才分得出上下（18px 会糊成一根柱子）
    // 四色与弹窗 stateMap 同源（green/red/yellow/fault），按状态取色而不是按数组下标
    state: { green: '#12B76A', red: '#F04438', yellow: '#F79009', fault: '#8C9AB0' },
    bubble: '#0E9B57', title: '信号灯', z: 25
  },
  police: { shape: 'police', color: '#E2447E', bubble: '#C02B63', title: '警员', z: 30, size: 9 },
  busStop: { shape: 'busStop', color: '#EF6820', bubble: '#C9530C', title: '公交站', z: 15, size: 9 },
  /* 公交线路：源数据 50 条线路的 color 列全是 #2b8cff（≈ 底图路网蓝），
   * 照数据着色就等于把线路藏进路网里，故本层统一用青绿（图层视觉决策，不读 color 列）。 */
  busRoute: { color: '#0E9AA7', width: 2.2 },
  /** 悬停高亮色：原来的 #fff 是给深色底图配的，亮色底图上白点=原地消失 */
  active: '#1A2233'
}

/* ---------------- 聚合（L7 自带 cluster，内部就是 supercluster） ----------------
 * 用图层自带的 `source(data, {cluster:true})` 而不是自己分桶：DataSourcePlugin 会在缩放变化时
 * 自动重算（zoom 空间 = floor(mapZoom-1)），不需要任何 zoom 监听——全项目现在也确实一个都没有。
 *
 * radius 是**屏幕像素**：四类点疏密差得远，按层调。数值来自实测
 * （scripts/cdp-l7cluster-probe.mjs / 早期的 tmp-cluster-tune 测量）：
 *   监控 220 点铺满全城，22；信号灯 231 点较散，12；警员 62 点稀疏，16；公交站 225 点挤在
 *   默认视图 83×98 像素里，16（再大就并成一个桶，再小就散成一片）。
 * maxZoom 取 11 是刻意的：
 *   · 由 zoom 空间定义（mapZoom-1）⇒ map zoom ≥ 12 时**全部散开**，默认视图 9.5 出气泡、
 *     区县视图 12 过渡、放大到 13+ 全是个体图标；
 *   · 大屏/巡检的定位用的是 zoom 16~17（TrafficScreen.vue），不会出现「飞过去了却只有一个
 *     气泡、图标不见了」；
 *   · 顺带保住 cdp-probe14 的取样缩放（首次 15、回退 13.5/12 —— 都 ≥12，图标照常画出来）。
 */
const CLUSTER = { camera: 22, trafficLight: 12, police: 16, busStop: 16, maxZoom: 11 }

/* 桶内点数 → 气泡半径（屏幕像素）。散点返回 0 —— L7 的 size 回调没有 0 的特判，0 就是不画
 * （逐点连通块判定过：散点位置上零墨迹，见 cdp-l7cluster-probe 的 E1）。
 * 用 log 而不是线性：桶内点数从 2 到 223 跨两个数量级，线性会让小桶看不出、大桶盖掉半屏。 */
const bubbleR = (n) => {
  const pc = Number(n) || 0
  return pc > 1 ? 12 + 10 * Math.min(1, Math.log10(pc) / 1.8) : 0
}

/* 桶内数量文字的样式。textAllowOverlap 必须开：L7 默认会做文字避让（filterGlyphs），
 * 密集处会把数字整批丢掉，看起来就是「有的桶没数字」（探针 E3 实测）。 */
const COUNT_STYLE = { textAllowOverlap: true, textAnchor: 'center', textOffset: [0, 0], fontWeight: 700 }

/* 取图标名还是退回几何形状：
 * 图标是异步注册的（scene.addImage 内部 new Image + 解码），若在图标就绪前建图层，
 * L7 找不到这个名字会**静默退化成文字渲染**（point/index.js: iconMap 里没有就当 text），
 * 所以没就绪时先用 shape2d 名顶上，注册完成后再重建一次（见 initTrafficLayers 末尾）。 */
const shapeOf = (key) => {
  const icon = TRAFFIC_ICONS[key]
  return sceneRef && icon && sceneRef.hasImage(icon.id) ? icon.id : icon.fallbackShape
}

/* ---------------- 图层注册表 ---------------- */
const registry = {}

/* 每个条目：{ visible: 当前显示状态, layer: 主图层实例, group: 该点位的一套图层 }
 * ★ `layer` 必须始终指向**主图标层**：cdp-probe13 / probe14 / probe16 / shot-readme / cdp-l7*.mjs
 *   都直接读它（读 size/shape/颜色、取 originData、取样计数），字段名与语义不能变。
 *   `group` 是本次新增的：符号升级后一套点位是 5 个 L7 图层，显示/隐藏/销毁要整组来。 */
const ensure = (name) => {
  if (!registry[name]) registry[name] = { visible: false, layer: null, group: [] }
  return registry[name]
}

/* 把一套图层挂进场景。工厂可能返回：单个 layer（线/热力）、图层数组、或 { main, layers }（点位的一套）。
 * ★ 裸图层**没有** `.layers` 属性 —— 这里一度写成 `built.layers[0]`，于是公交线路/拥堵/热力
 *   一开就抛 "Cannot read properties of undefined (reading '0')"，图层/面板开关全哑
 *   （实测：三层的 setVisible 全部抛错、registry 里 layer 永远为 null）。
 *   统一用 group[0] 兜底，三种返回形态都能挂上。 */
const mount = (item, built) => {
  const group = Array.isArray(built) ? built : (built.layers || [built])
  item.layer = Array.isArray(built) ? built[0] : (built.main || group[0])
  item.group = group
  for (const l of group) sceneRef.addLayer(l)
}

/* ---------------- 点位符号的通用装配（3 层徽章 + 2 层聚合） ----------------
 * 一套点位 = 5 个 L7 图层（自下而上，zIndex 递增）：
 *   影  z+0  深色模糊图，配 .color('#FFFFFF') 走原色分支 —— 只有这一支保留纹理 alpha（柔和投影）
 *   底  z+1  纯白实心圆角方块（比徽章大 1.5px）⇒ 徽章外侧的白描边 + 镂空处透出来的真白
 *   本体 z+2  徽章（状态色/主色），只画散点
 *   泡  z+3  聚合气泡（主色同族深色，半径随桶内点数 12→22）
 *   数  z+4  桶内数量（白字）
 * 为什么必须拆成 5 个而不是 1 个：见 trafficIcons.js 文件头（着色器只能染一个颜色、且丢纹理 alpha）。
 * 5 个图层共用同一份 FC：各自建 supercluster 索引（几百个点，开销可忽略），换来的是
 * 气泡/图标/数字永远同源同缩放，不会出现「气泡和图标对不上」的中间态。
 *
 * 互斥显示（关键）：桶上不画图标、散点上不画气泡。三条路线实测：
 *   三层徽章 .size('point_count', 回调)：桶返回 0（gl_PointSize=0 不产生像素）。
 *     ★ 原先这三层用的是 .filter('point_count', 单散点)，**它是坏的**，根因在 L7：
 *       filter 会把被滤掉的记录清成 {}（getEncodedData 里一条带 shape 的记录都不剩），
 *       于是 PointLayer.getModelType()（point/index.js:190）走到「空数据」分支
 *       getModelTypeWillEmptyData()（同文件 :122）—— 那个分支只认 values 数组 / 'text' /
 *       shape2d，认不出我们这种 { field: 'zb-icon-*' } 的图标名 ⇒ 返回 'normal'
 *       ⇒ 建出来的是**普通方块模型**（且 normal 默认 additive 混合），根本不是图片模型。
 *       现场症状：zoom15 图标位置取色 = 255,255,255（紫徽章叠在饱和的白底板上做加法还是白），
 *       把底板层藏掉才看到徽章的紫（6099 px）；此时 getModelType() 仍报 'image'，
 *       因为它是**按当前数据**算的，而绑定的是当初用空数据建的那个方块模型 —— 所以断言
 *       getModelType() 抓不住这个 bug（cdp-probe14 一直是假通过）。
 *       触发条件正好是默认视图：建层时 zoom9.5，camera 全是桶、散点 0 个 ⇒ 三层 filter 结果全空。
 *       改成 size 回调后每条记录都留着 shape 键 ⇒ 模型恒为 image，缩放来回穿也不会退化
 *       （实测 15→9.5→15：徽章紫像素 8918 → 19 → 8918，模型类型始终 image）。
 *       代价：cdp-probe14 读 size 要按 point_count 取样（已同步改成读散点值与桶值两个数）。
 *   气泡 .size('point_count', 回调)：半径本来就要随点数变，顺带让散点返回 0 即不画。
 *   数字 .filter()：与探针 E3 的原始用法一致（text 模型两条分支都是 'text'，不受上面那个坑影响）。
 */
const pointStack = (key, data) => {
  const c = ICON[key]
  const cluster = { cluster: true, clusterOptions: { radius: CLUSTER[key], maxZoom: CLUSTER.maxZoom } }
  const mk = (suffix, dz) => new PointLayer({ id: `交通-${c.title}${suffix}`, zIndex: c.z + dz }).source(data, cluster)
  /* 徽章的两张共用件是异步注册的，图没就绪时先不建这两层 —— L7 找不到图名会**静默退化成文字渲染**
   * （point/index.js 的 iconMap 兜底是 text），比不画还难看。注册完成后会重建（见文件末尾）。 */
  const ready = (part) => sceneRef && sceneRef.hasImage(part.id)
  const layers = []
  /* 影子层比底板大 1.5、比徽章大 3：差量就是白描边（1.5）和投影片（外面那圈）的宽度。
   * 影子图形本身接近满框（见 trafficIcons.js 的 SHADOW），所以 size+3 才有地方露出来。
   * ★ 这三层必须和本体用**同一套「桶上归零」**：它们只服务于徽章，桶上不该有徽章、
   *   也就不该有影子和白底板。实测漏掉时，桶位置会留下一块白底板 + 深色影子，而气泡是 0.92
   *   半透明的 —— 透过气泡能看到中间那块白底和深影，气泡看起来是「中间发暗的一块脏圆」（截图取色复核）。
   * （为什么不是 filter 而是 size 回调：见上面 pointStack 的注释 —— filter 会让模型退化成方块。） */
  const iconSize = (size) => (n) => (n > 1 ? 0 : size)
  if (ready(BADGE_IMAGES.shadow)) {
    layers.push(mk('-影', 0).shape(BADGE_IMAGES.shadow.id).size('point_count', iconSize(c.size + 3)).color('#FFFFFF'))
  }
  if (ready(BADGE_IMAGES.backing)) {
    layers.push(mk('-底', 1).shape(BADGE_IMAGES.backing.id).size('point_count', iconSize(c.size + 1.5)).color('#FFFFFF'))
  }
  const main = mk('', 2).shape(shapeOf(key)).size('point_count', iconSize(c.size))
  const bubble = mk('-泡', 3).shape('circle').size('point_count', bubbleR).color(c.bubble).style({ opacity: 0.92 })
  const count = mk('-数', 4)
    .shape('point_count', 'text')
    .size(13)
    .color('#FFFFFF')
    .filter('point_count', (n) => n > 1)
    .style(COUNT_STYLE)
  layers.push(main, bubble, count)
  /* 点气泡 → 飞到该桶并放大（聚合点的用途就是「放大看细节」）。展开级别优先用 supercluster 的
   * getClusterExpansionZoom（保证这桶真的散开），拿不到就退化成 +2；上限 15，免得一路飞到楼顶。
   * 气泡层的点击载荷与图标层一样是**扁平记录**（开聚合后没有 .properties，探针 E6 实测）。
   *
   * ★ 同一个处理器必须**同时挂在数字层上**：数字正好画在气泡中心、又比气泡高一层（z+4），
   *   L7 的拾取是按点精灵的方框走的 —— 只有气泡层接事件的话，用户在正中间那一下点到的
   *   其实是数字层，什么都不会发生（probe16 的「点气泡」一条会直接失败）。 */
  const onBubbleClick = (e) => {
    const p = e.feature.properties || e.feature
    const center = p.coordinates || (p.lng != null ? [p.lng, p.lat] : null)
    if (!center || center[0] == null) return
    const map = sceneRef.map // L7 场景里就是 mapbox-gl 的 Map（有 easeTo/getZoom）
    if (!map || !map.easeTo) return
    /* ★ 展开级别要 **+1**（probe16 实测出来的 bug）：点气泡时中心精确落到了桶上、zoom 却纹丝不动。
   * 原因是两套 zoom 口径差 1：
   *   · supercluster 的 getClusterExpansionZoom 返回的是**它自己那棵树的** zoom E（`getClusters(E)`
   *     就会散开，看 supercluster@7.1.5 源码就是 originZoom-1 往上试）；
   *   · 而 DataSourcePlugin 是按 `Math.floor(mapZoom - 1)` 建树的（见 l7-layers/plugins/
   *     DataSourcePlugin.js:104/110），所以树 zoom E 对应的地图 zoom 是 **E+1**。
   * 之前写成 `ex + 0.5`：实测那桶的 ex 正好是 9 → 目标 9.5 = 当前 zoom（默认视图就是 9.5），
   * `easeTo` 于是只挪了中心、一级都没放大 —— 看起来像"点了没反应"。改成 +1.5 才是真正上一级。
   * 另加一道有限性兜底：拿不到数字时退化成「当前 +2」（+1 的口径下这是保守值），至少点了有反应。
   * 上限 15 不会截断展开：maxZoom=11 ⇒ 地图 zoom ≥ 12 必定全散。 */
  const go = (z) => {
    const zz = Number(z)
    const target = Number.isFinite(zz) ? zz : map.getZoom() + 2
    map.easeTo({ center, zoom: Math.min(target, 15), duration: 600 })
  }
  let ex = null
  try {
    const idx = bubble.layerSource && bubble.layerSource.clusterIndex
    if (idx && p.cluster_id !== undefined) ex = idx.getClusterExpansionZoom(p.cluster_id)
  } catch (err) { ex = null }
  if (ex && typeof ex.then === 'function') ex.then((z) => go(Number(z) + 1.5)).catch(() => go())
  else if (typeof ex === 'number') go(ex + 1.5)
  else go()
}
  bubble.on('click', onBubbleClick)
  count.on('click', onBubbleClick)
  return { main, layers }
}

const layerFactories = {
  camera() {
    const c = ICON.camera
    const st = pointStack('camera', pointFC('cameras', rows('cameras')))
    // 按状态取色（不靠数组下标对号入座，避免分类顺序变了之后故障点变紫）
    st.main.color('status', (s) => (s === 'fault' ? c.faulty : c.color)).active({ color: ICON.active })
    st.main.on('click', (e) => {
      /* 开聚合后点击载荷是**扁平记录**（L7 把 cluster 的要素摊平了，没有 .properties；
       * 探针 E6 用真鼠标事件验过 payload 里 lng/lat/name 都直接可取）。兼容两种形态，弹窗逻辑不变。 */
      const p = e.feature.properties || e.feature
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>🎥 ${p.name}</b><br/>
          道路：${p.road}<br/>
          状态：${p.status === 'normal' ? '<span style="color:#22c55e">正常</span>' : '<span style="color:#ff3b30">故障</span>'}<br/>
          区县：${p.area}
        </div>`)
    })
    return st
  },
  trafficLight() {
    const c = ICON.trafficLight
    const st = pointStack('trafficLight', pointFC('traffic_lights', rows('traffic_lights')))
    st.main.color('state', (s) => c.state[s] || c.state.fault).active({ color: ICON.active })
    st.main.on('click', (e) => {
      const p = e.feature.properties || e.feature
      const stateMap = { green: '绿灯', red: '红灯', yellow: '黄灯', fault: '故障' }
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>🚦 信号灯 ${p.id}</b><br/>
          状态：${stateMap[p.state] || p.state}<br/>
          区县：${p.area}
        </div>`)
    })
    return st
  },
  police() {
    const c = ICON.police
    const st = pointStack('police', pointFC('police', rows('police')))
    st.main.color(c.color).active({ color: ICON.active })
    st.main.on('click', (e) => {
      const p = e.feature.properties || e.feature
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>👮 ${p.name}</b><br/>
          警号：${p.badge}<br/>
          状态：${p.onDuty ? '<span style="color:#22c55e">在勤</span>' : '<span style="color:#ff9500">休班</span>'}<br/>
          位置：${p.location}
        </div>`)
    })
    return st
  },
  busRoute() {
    const c = ICON.busRoute
    const layer = new LineLayer({ id: '交通-公交线路', zIndex: 5 })
    layer.source(routeFC(rows('bus_routes')))
      .size(c.width)
      .shape('line')
      .color(c.color) // 图层固定青绿：数据里的 color 列与底图路网同蓝，见 ICON.busRoute 注释
      .style({ opacity: 0.85 }) // 静态美化：压一点透明度，与底图路网叠在一起时不抢眼（用户选了不做动效）

    layer.on('click', (e) => {
      const p = e.feature.properties
      showPopup(evLngLat(e), `
        <div style="min-width:180px">
          <b>🚌 ${p.ref || p.name || '公交线路'}</b><br/>
          起讫：${p.dep_stop || '—'} → ${p.arr_stop || '—'}<br/>
          途经：${p.via || 0} 站
        </div>`)
    })
    return layer
  },
  congestion() {
    const layer = new LineLayer({ id: '交通-拥堵', zIndex: 6 })
    layer.source(congestionFC())
      // 静态美化：按等级分粗细（严重最粗），原来一律 4px 看不出差别。没有任何脚本断言本层宽度，安全。
      .size('level', [6.5, 3])
      .shape('line')
      .color('level', ['#ff3b30', '#ff9500', '#ffd60a']) // 0严重/1中度/2轻度
    layer.on('click', (e) => {
      const p = e.feature.properties
      showPopup(evLngLat(e), `
        <div style="min-width:160px">
          <b>🚧 ${p.name}</b><br/>
          拥堵：${p.levelName}<br/>
          均速：${p.avgSpeed} km/h<br/>
          流量指数：${p.flow}
        </div>`)
    })
    return layer
  },
  heat() {
    const layer = new HeatmapLayer({ id: '交通-热力', zIndex: 2 })
    layer.source(pointFC('heat_points', rows('heat_points')))
      .shape('heatmap')
      .size('value', [0, 1])
      .style({
        intensity: 3,
        radius: 24,
        opacity: 0.75,
        rampColors: {
          colors: ['#1443ff', '#00e5ff', '#00ffa3', '#ffd60a', '#ff3b30'],
          positions: [0, 0.25, 0.5, 0.75, 1]
        }
      })
    return layer
  },
  busStop() {
    const c = ICON.busStop
    const st = pointStack('busStop', pointFC('bus_stops', rows('bus_stops')))
    st.main.color(c.color).active({ color: ICON.active })
    st.main.on('click', (e) => {
      const p = e.feature.properties || e.feature
      showPopup(evLngLat(e), `
        <div style="min-width:140px">
          <b>🚏 ${p.name}</b><br/>
          公交站点
        </div>`)
    })
    return st
  }
}

// 桥接：building/mainRoad 别名映射到基础图层（城市建筑 / 道路流线）
const BRIDGE_NAMES = { building: '淄博市', mainRoad: '淄博道路' }

/** 初始化（App.vue 地图就绪后调用一次：注册图标 + 保存 scene 引用，不建任何图层） */
export function initTrafficLayers(scene) {
  sceneRef = scene
  /* 注册主题图标。走 scene.addImage 而不是直接给 .shape 传 URL：L7 只认注册过的图片名。
   * 注册是异步的，所以注册完要重建一次已显示的图层 —— 否则开着图层时刷新页面，
   * 图层会停在「图标还没注册好」那一刻建的几何形状版（fallback），再也不换回来。
   * 徽章的两张共用件（阴影/白底板）也要注册，否则那两层会被跳过（见 pointStack 的 ready）。 */
  const pending = [...Object.values(TRAFFIC_ICONS), ...Object.values(BADGE_IMAGES)]
    .filter((i) => !scene.hasImage(i.id)) // HMR 会重复调 initTrafficLayers，重复注册 L7 只会告警
    .map((i) => scene.addImage(i.id, iconUrl(i)))
  if (pending.length) {
    Promise.all(pending)
      .then(() => refreshVisibleTrafficLayers())
      .catch((e) => console.warn('[traffic] 主题图标注册失败，图层暂用几何形状兜底：', e))
  }
  if (import.meta.env.DEV) {
    // 调试桥：CDP 验证用
    window.__traffic = {
      names: Object.keys(layerFactories),
      setVisible: (n, v) => setTrafficLayerVisible(n, v),
      toggle: (n) => toggleTrafficLayer(n),
      visible: (n) => isTrafficLayerVisible(n),
      refresh: (n) => refreshTrafficLayer(n),
      registry
    }
    /* 图层构造器（仅 DEV）：给实验脚本临时建图层用 —— 聚合/文字/阴影这些 L7 能力
     * 必须先在真地图上实测（scripts/cdp-l7cluster-probe.mjs），不能靠读压缩过的 dist 猜。
     * 生产构建里没有这个字段。 */
    window.__l7 = { PointLayer }
  }
}

/** 显示/隐藏交通图层（懒创建：首次显示时才 addLayer） */
export function setTrafficLayerVisible(name, visible) {
  if (name === 'vehicle') {
    // 动态车辆：DOM marker 由模拟器统一管理（store 镜像也只在 vehicleSim 内写入，避免双写漂移）
    setVehicleVisible(visible)
    return true
  }
  if (BRIDGE_NAMES[name]) {
    // 桥接基础图层（按实例注册表取，scene.getLayerByName 在 L7 2.15 不可用）
    const base = baseLayerMap[BRIDGE_NAMES[name]]
    if (base) {
      visible ? base.show() : base.hide()
      return true
    }
    return false
  }
  if (!layerFactories[name] || !sceneRef) return false
  const item = ensure(name)
  if (visible) {
    if (!item.layer) {
      mount(item, layerFactories[name]())
    } else {
      for (const l of item.group) l.show() // 点位层是一组 5 个，整组显隐
    }
  } else {
    for (const l of item.group) l.hide()
  }
  item.visible = visible
  // 同步到 store.trafficOn 镜像（实时数据栏 UI 与 AI 助手状态查询共用同一来源）
  if (store && store.trafficOn) store.trafficOn[name] = visible
  return true
}

export const toggleTrafficLayer = (name) => {
  const cur = BRIDGE_NAMES[name]
    ? !!baseLayerMap[BRIDGE_NAMES[name]]?.isVisible()
    : name === 'vehicle'
      ? !!store.trafficOn.vehicle
      : ensure(name).visible
  setTrafficLayerVisible(name, !cur)
  return !cur
}

export const isTrafficLayerVisible = (name) => {
  if (BRIDGE_NAMES[name]) {
    return !!baseLayerMap[BRIDGE_NAMES[name]]?.isVisible()
  }
  if (name === 'vehicle') return !!store.trafficOn.vehicle
  return !!ensure(name).visible
}

/**
 * 数据变更后重建图层（数据管理增删改 → store.dbData 已更新 → 调本函数）：
 * 销毁旧实例并从 store.dbData 重读数据建新实例；当前不可见只清缓存，下次显示自然拿到新数据。
 * @returns {boolean} 是否真的发生了重建
 */
export function refreshTrafficLayer(name) {
  if (BRIDGE_NAMES[name] || !layerFactories[name] || !sceneRef) return false
  const item = ensure(name)
  if (item.layer) {
    for (const l of item.group) {
      try { sceneRef.removeLayer(l) } catch (e) { /* 图层可能已不在 scene */ }
    }
    item.layer = null
    item.group = []
  }
  if (item.visible) mount(item, layerFactories[name]())
  return true
}

/** 全部已显示图层重建（App 拉取 DB 全量成功后调用） */
export function refreshVisibleTrafficLayers() {
  for (const name of Object.keys(layerFactories)) refreshTrafficLayer(name)
}
