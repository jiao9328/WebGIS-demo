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
import { TRAFFIC_ICONS, iconUrl } from './trafficIcons'
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
 *   监控探头    摄像头（云台+立杆）  #7C4DFF    故障转 #F04438 红
 *   信号灯      红绿灯（三灯箱）    #12B76A    状态四色 绿/红/黄/故障灰
 *   警员分布    警员（警帽+肩）     #E2447E
 *   公交站点    公交车（车身+轮）   #EF6820
 *   公交线路    线                 #0E9AA7    青绿实线
 *   道路拥堵    线                 红/橙/黄   语义三色（分严重/中度/轻度，不改）
 *   动态车辆    —                  专属色     车形 SVG（vehicleSim 用 DOM marker 单独渲染）
 *
 * 图标本体（白色单色符号）在 tools/trafficIcons.js，这里只放「用哪个图标 + 什么颜色 + 多大」。
 * 形状与颜色的选择理由：
 *   · 图标要跟图层主题对应（监控就该是摄像头、警员就该是警察），比几何形状好认；
 *   · 但图标在 16px 上下会糊，所以颜色仍然一图层一色，形状认不出的距离靠颜色补；
 *   · 尺寸 8~9（L7 的 size 是半径，屏幕上 = size×2，即 16~18px）：图标本体画满了 64 的
 *     viewBox（见 trafficIcons.js 文件头），所以 size 基本等于实际墨迹半径。信号灯多给 1，
 *     因为三盏灯挤在 18px 里才勉强分得出上下。原来是 4.5~6px 的几何点，现在再大就盖住路网了。
 *
 * 颜色一律避开底图总道路的蓝：initLayer 的「淄博道路」是 #1990FF，而原来
 * 警员 #3d7bff、公交站 #00c2ff、公交线路 #2b8cff（源数据 color 列）都落在这一族蓝里，
 * 高倍缩放下与路网糊成一片（CDP 截图 + 识图复核确认）。现在用的紫/品红/橙/青绿
 * 与路网蓝全部拉开（redmean 色差 ≥120），彼此之间也拉开（≥60）。
 */
const ICON = {
  camera: { shape: 'camera', color: '#7C4DFF', faulty: '#F04438', size: 8 },
  trafficLight: {
    shape: 'trafficLight',
    size: 9, // 三盏灯在 18px 里才分得出上下（16px 会糊成一根柱子）
    // 四色与弹窗 stateMap 同源（green/red/yellow/fault），按状态取色而不是按数组下标
    state: { green: '#12B76A', red: '#F04438', yellow: '#F79009', fault: '#8C9AB0' }
  },
  police: { shape: 'police', color: '#E2447E', size: 8 },
  busStop: { shape: 'busStop', color: '#EF6820', size: 8 },
  /* 公交线路：源数据 50 条线路的 color 列全是 #2b8cff（≈ 底图路网蓝），
   * 照数据着色就等于把线路藏进路网里，故本层统一用青绿（图层视觉决策，不读 color 列）。 */
  busRoute: { color: '#0E9AA7', width: 2.2 },
  /** 悬停高亮色：原来的 #fff 是给深色底图配的，亮色底图上白点=原地消失 */
  active: '#1A2233'
}

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

// 每个条目：{ visible: 当前显示状态, layer: L7 实例（懒创建） }
const ensure = (name) => {
  if (!registry[name]) registry[name] = { visible: false, layer: null }
  return registry[name]
}

const layerFactories = {
  camera() {
    const c = ICON.camera
    const layer = new PointLayer({ id: '交通-监控', zIndex: 10 })
    layer.source(pointFC('cameras', rows('cameras')))
      .shape(shapeOf('camera'))
      .size(c.size)
      // 按状态取色（不靠数组下标对号入座，避免分类顺序变了之后故障点变紫）
      .color('status', (s) => (s === 'fault' ? c.faulty : c.color))
      .active({ color: ICON.active })
      .style({ opacity: 0.9 })
    layer.on('click', (e) => {
      const p = e.feature.properties
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>🎥 ${p.name}</b><br/>
          道路：${p.road}<br/>
          状态：${p.status === 'normal' ? '<span style="color:#22c55e">正常</span>' : '<span style="color:#ff3b30">故障</span>'}<br/>
          区县：${p.area}
        </div>`)
    })
    return layer
  },
  trafficLight() {
    const c = ICON.trafficLight
    const layer = new PointLayer({ id: '交通-信号灯', zIndex: 10 })
    layer.source(pointFC('traffic_lights', rows('traffic_lights')))
      .shape(shapeOf('trafficLight'))
      .size(c.size)
      .color('state', (s) => c.state[s] || c.state.fault)
      .active({ color: ICON.active })
    layer.on('click', (e) => {
      const p = e.feature.properties
      const stateMap = { green: '绿灯', red: '红灯', yellow: '黄灯', fault: '故障' }
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>🚦 信号灯 ${p.id}</b><br/>
          状态：${stateMap[p.state] || p.state}<br/>
          区县：${p.area}
        </div>`)
    })
    return layer
  },
  police() {
    const c = ICON.police
    const layer = new PointLayer({ id: '交通-警员', zIndex: 10 })
    layer.source(pointFC('police', rows('police')))
      .shape(shapeOf('police'))
      .size(c.size)
      .color(c.color)
      .active({ color: ICON.active })
    layer.on('click', (e) => {
      const p = e.feature.properties
      showPopup([p.lng, p.lat], `
        <div style="min-width:150px">
          <b>👮 ${p.name}</b><br/>
          警号：${p.badge}<br/>
          状态：${p.onDuty ? '<span style="color:#22c55e">在勤</span>' : '<span style="color:#ff9500">休班</span>'}<br/>
          位置：${p.location}
        </div>`)
    })
    return layer
  },
  busRoute() {
    const c = ICON.busRoute
    const layer = new LineLayer({ id: '交通-公交线路', zIndex: 5 })
    layer.source(routeFC(rows('bus_routes')))
      .size(c.width)
      .shape('line')
      .color(c.color) // 图层固定青绿：数据里的 color 列与底图路网同蓝，见 ICON.busRoute 注释
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
      .size(4)
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
    const layer = new PointLayer({ id: '交通-公交站', zIndex: 9 })
    layer.source(pointFC('bus_stops', rows('bus_stops')))
      .shape(shapeOf('busStop'))
      .size(c.size)
      .color(c.color)
      .active({ color: ICON.active })
    layer.on('click', (e) => {
      const p = e.feature.properties
      showPopup(evLngLat(e), `
        <div style="min-width:140px">
          <b>🚏 ${p.name}</b><br/>
          公交站点
        </div>`)
    })
    return layer
  }
}

// 桥接：building/mainRoad 别名映射到基础图层（城市建筑 / 道路流线）
const BRIDGE_NAMES = { building: '淄博市', mainRoad: '淄博道路' }

/** 初始化（App.vue 地图就绪后调用一次：注册图标 + 保存 scene 引用，不建任何图层） */
export function initTrafficLayers(scene) {
  sceneRef = scene
  /* 注册主题图标。走 scene.addImage 而不是直接给 .shape 传 URL：L7 只认注册过的图片名。
   * 注册是异步的，所以注册完要重建一次已显示的图层 —— 否则开着图层时刷新页面，
   * 图层会停在「图标还没注册好」那一刻建的几何形状版（fallback），再也不换回来。 */
  const pending = Object.values(TRAFFIC_ICONS)
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
      item.layer = layerFactories[name]()
      sceneRef.addLayer(item.layer)
    } else {
      item.layer.show()
    }
  } else if (item.layer) {
    item.layer.hide()
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
    try { sceneRef.removeLayer(item.layer) } catch (e) { /* 图层可能已不在 scene */ }
    item.layer = null
  }
  if (item.visible) {
    item.layer = layerFactories[name]()
    sceneRef.addLayer(item.layer)
  }
  return true
}

/** 全部已显示图层重建（App 拉取 DB 全量成功后调用） */
export function refreshVisibleTrafficLayers() {
  for (const name of Object.keys(layerFactories)) refreshTrafficLayer(name)
}
