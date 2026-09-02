/**
 * 道路分级图层模块（L7）
 *
 * 顶部「道路分级栏」5 个按钮 → 4 个等级 LineLayer 懒创建注册表：
 *   高速公路 motorway(+link)  一级道路 trunk(+link)  二级道路 primary(+link)
 *   三级道路 secondary/tertiary(+link) 及以下支路
 *   总道路 = 直接复用基础图层「淄博道路」（全路网动画流线），分级时隐藏之
 *
 * 导出于 store.roadClass：'total' | 'highway' | 'first' | 'second' | 'third'
 *   selectRoadClass(null)  = 总道路（显示基础全路网）
 *   selectRoadClass(key)   = 隐藏基础路网，只显示该等级
 * DEV 下挂 window.__roads 供 CDP 验证断言
 */
import { LineLayer } from '@antv/l7'
import roadData from '@/assets/GIS_Data/Zibo_roads.json'

/* ---------------- 等级定义 ---------------- */
// 三级 = 县乡道(secondary/tertiary) + 城市支路(residential/unclassified)，同 v1 灰网口径（实测 808 长段）
export const CLASSES = [
  { key: 'highway', label: '高速公路', types: ['motorway', 'motorway_link'], color: '#ff3b30', width: 3.4 },
  { key: 'first', label: '一级道路', types: ['trunk', 'trunk_link'], color: '#ff9500', width: 3 },
  { key: 'second', label: '二级道路', types: ['primary', 'primary_link'], color: '#ffd60a', width: 2.6 },
  { key: 'third', label: '三级道路', types: ['secondary', 'tertiary', 'secondary_link', 'tertiary_link', 'residential', 'unclassified'], color: '#00e5ff', width: 2.2 },
]

// 基础全路网图层（initLayer.js 创建），总道路模式复用
import { baseLayerMap } from './initLayer'
const BASE_ROAD_LAYER = '淄博道路'

/* ---------------- 数据切分（模块加载时一次） ---------------- */
// 按等级过滤出各自 FeatureCollection
const splitFC = (types) => ({
  type: 'FeatureCollection',
  features: roadData.features.filter(
    (f) => types.includes(f.properties.type) && f.geometry.coordinates.length >= 8
  )
})
const classFC = Object.fromEntries(CLASSES.map((c) => [c.key, splitFC(c.types)]))

/* ---------------- 图层注册表（懒创建） ---------------- */
const registry = {}
const ensure = (key) => {
  if (!registry[key]) registry[key] = { visible: false, layer: null }
  return registry[key]
}

let sceneRef = null

/** 初始化（App.vue 地图就绪后调用一次，只保存 scene 引用） */
export function initRoadClassLayers(scene) {
  sceneRef = scene
  if (import.meta.env.DEV) {
    window.__roads = {
      select: (k) => selectRoadClass(k),
      visible: (k) => isRoadClassVisible(k),
      // 基础全路网图层可见性（scene.getLayerByName 在 L7 2.15 不可用，走注册表）
      baseVisible: () => !!baseLayerMap[BASE_ROAD_LAYER]?.isVisible(),
      classes: CLASSES
    }
  }
}

const showBaseRoads = (visible) => {
  const base = baseLayerMap[BASE_ROAD_LAYER]
  if (base) (visible ? base.show() : base.hide())
}

const showClassLayer = (key, visible) => {
  const item = ensure(key)
  if (visible) {
    if (!item.layer) {
      const def = CLASSES.find((c) => c.key === key)
      item.layer = new LineLayer({ id: '道路-' + def.label, zIndex: 4 })
      item.layer.source(classFC[key])
        .size(def.width)
        .shape('line')
        .color(def.color)
      sceneRef.addLayer(item.layer)
    } else {
      item.layer.show()
    }
  } else if (item.layer) {
    item.layer.hide()
  }
  item.visible = visible
}

/**
 * 道路分级选择
 * @param {string|null} key null/'total' = 总道路；否则 highway/first/second/third
 */
export function selectRoadClass(key) {
  if (!sceneRef) return
  if (!key || key === 'total') {
    for (const c of CLASSES) showClassLayer(c.key, false)
    showBaseRoads(true)
    return
  }
  if (!CLASSES.some((c) => c.key === key)) return
  showBaseRoads(false)
  for (const c of CLASSES) showClassLayer(c.key, c.key === key)
}

export const isRoadClassVisible = (key) => !!ensure(key).visible
