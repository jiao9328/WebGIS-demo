/**
 * 智慧交通图层模块（L7）
 *
 * 7 类交通图层懒创建注册表：首次显示才 scene.addLayer，之后 show/hide 复用实例。
 *   camera       监控探头（220，status 着色：正常 #00e5ff / 故障 #ff3b30）
 *   trafficLight 信号灯（231，state 四色 green/red/yellow/fault）
 *   police       警员分布（60，#3d7bff）
 *   busRoute     公交线路（50 条真实线路，LineLayer 按线路 color，无动画）
 *   congestion   道路拥堵（22 条真实路名，按路网几何匹配，三色分级）
 *   heat         交通热力（336 点，HeatmapLayer 绿→黄→橙→红）
 *   busStop      公交站点（225，真实高德点位）
 * building/mainRoad 为桥接别名：控制参考程序基础图层（城市建筑/道路流线）
 *
 * 导出：
 *   setTrafficLayerVisible(name, visible) / toggleTrafficLayer(name) / isTrafficLayerVisible(name)
 *   DEV 下挂 window.__traffic 供 CDP 验证断言
 */
import { PointLayer, LineLayer, HeatmapLayer, Popup } from '@antv/l7'
import { cameras, trafficLights, police, congestion, heatPoints } from './mockData'
import busRoutes from '@/assets/GIS_Data/bus_routes.json'
import busStops from '@/assets/GIS_Data/bus_stops_amap.json'
import roadData from '@/assets/GIS_Data/Zibo_roads.json'

/* ---------------- 数据预处理（模块加载时一次） ---------------- */
// 数组 {lng,lat,...} → GeoJSON FeatureCollection
const toFC = (arr) => ({
  type: 'FeatureCollection',
  features: arr.map((p) => ({
    type: 'Feature',
    properties: p,
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
  }))
})

// 拥堵：按真实路名匹配 OSM 路网几何（一次建索引，O(1) 查询）
const roadByName = new Map()
for (const f of roadData.features) {
  const name = f.properties.name
  if (name && !roadByName.has(name)) roadByName.set(name, f)
}
const congestionFC = {
  type: 'FeatureCollection',
  features: congestion.map((c) => {
    const rf = roadByName.get(c.name)
    return {
      type: 'Feature',
      properties: { name: c.name, level: c.level, levelName: c.levelName, avgSpeed: c.avgSpeed, flow: c.flow },
      geometry: rf ? rf.geometry : { type: 'LineString', coordinates: [[c.lng, c.lat], [c.lng + 0.01, c.lat + 0.005]] }
    }
  })
}

const cameraFC = toFC(cameras)
const lightFC = toFC(trafficLights)
const policeFC = toFC(police)
const heatFC = {
  type: 'FeatureCollection',
  features: heatPoints.map((p) => ({
    type: 'Feature',
    properties: { value: p.value },
    geometry: { type: 'Point', coordinates: [p.lng, p.lat] }
  }))
}

/* ---------------- 共享 Popup ---------------- */
const popup = new Popup({ closeButton: true, offsets: [0, -10] })
let sceneRef = null

// 统一弹窗：已打开则复用更新，已关闭/首次则 addPopup（重复 add 同一实例会重复入栈）
const showPopup = (lngLat, html) => {
  popup.setLnglat(lngLat).setHTML(html)
  if (!popup.isOpen()) sceneRef.addPopup(popup)
}
const evLngLat = (e) => (e.lngLat ? [e.lngLat.lng, e.lngLat.lat] : [118.05, 36.81])

/* ---------------- 图层注册表 ---------------- */
const registry = {}

// 每个条目：{ visible: 当前显示状态, layer: L7 实例（懒创建） }
const ensure = (name) => {
  if (!registry[name]) registry[name] = { visible: false, layer: null }
  return registry[name]
}

const layerFactories = {
  camera() {
    const layer = new PointLayer({ id: '交通-监控', zIndex: 10 })
    layer.source(cameraFC)
      .shape('circle')
      .size(4)
      .color('status', ['#00e5ff', '#ff3b30'])
      .active({ color: '#fff' })
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
    const layer = new PointLayer({ id: '交通-信号灯', zIndex: 10 })
    layer.source(lightFC)
      .shape('circle')
      .size(4)
      .color('state', ['#22c55e', '#ff3b30', '#ffd60a', '#8e8e93'])
      .active({ color: '#fff' })
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
    const layer = new PointLayer({ id: '交通-警员', zIndex: 10 })
    layer.source(policeFC)
      .shape('circle')
      .size(4)
      .color('#3d7bff')
      .active({ color: '#fff' })
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
    const layer = new LineLayer({ id: '交通-公交线路', zIndex: 5 })
    layer.source(busRoutes)
      .size(2)
      .shape('line')
      .color('color', (c) => c) // 线路自身颜色
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
    layer.source(congestionFC)
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
    layer.source(heatFC)
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
    const layer = new PointLayer({ id: '交通-公交站', zIndex: 9 })
    layer.source(busStops)
      .shape('circle')
      .size(5)
      .color('#00c2ff')
      .active({ color: '#fff' })
    layer.on('click', (e) => {
      const p = e.feature.properties
      // 站点数据无 lng/lat 属性，用事件坐标
      showPopup(evLngLat(e), `
        <div style="min-width:140px">
          <b>🚏 ${p.name}</b><br/>
          公交站点
        </div>`)
    })
    return layer
  }
}

// 桥接：building/mainRoad 别名映射到参考程序基础图层（城市建筑 / 道路流线）
const BRIDGE_NAMES = { building: '淄博市', mainRoad: '淄博道路' }

/** 初始化（App.vue 地图就绪后调用一次，只保存 scene 引用，不建任何图层） */
export function initTrafficLayers(scene) {
  sceneRef = scene
  if (import.meta.env.DEV) {
    // 调试桥：CDP 验证用
    window.__traffic = {
      names: Object.keys(layerFactories),
      setVisible: (n, v) => setTrafficLayerVisible(n, v),
      toggle: (n) => toggleTrafficLayer(n),
      visible: (n) => isTrafficLayerVisible(n),
      registry
    }
  }
}

/** 显示/隐藏交通图层（懒创建：首次显示时才 addLayer） */
export function setTrafficLayerVisible(name, visible) {
  if (BRIDGE_NAMES[name]) {
    // 桥接基础图层
    const base = sceneRef.getLayerByName(BRIDGE_NAMES[name])
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
  return true
}

export const toggleTrafficLayer = (name) => {
  const cur = BRIDGE_NAMES[name]
    ? sceneRef.getLayerByName(BRIDGE_NAMES[name])?.isVisible()
    : ensure(name).visible
  setTrafficLayerVisible(name, !cur)
  return !cur
}

export const isTrafficLayerVisible = (name) => {
  if (BRIDGE_NAMES[name]) {
    return !!sceneRef?.getLayerByName(BRIDGE_NAMES[name])?.isVisible()
  }
  return !!ensure(name).visible
}
