/**
 * AI 助手动作执行器
 *
 * 统一执行两类来源的动作，让"说话驱动页面"走同一条代码路径：
 *   1) DeepSeek 函数调用（tool_calls）：map_action / fly_to / set_road_class /
 *      set_traffic_layer / set_control_center / goto_page / get_status
 *   2) agent.js 离线规则引擎动作：zoom / map / layer / road / charts / chart / reply
 *      （大模型 key 失效 / 断网 / 无 key 时的自动降级通道）
 *
 * 地图实例由调用方传入 ctx.map（App.vue 注入的 $scene_map.map），
 * 图层 / 道路分级 / 控制中心操作内部自带 scene 引用（对应 init*.js 模块）。
 */
import { store } from '../store'
import { DISTRICTS } from './mockData'
import { selectRoadClass } from './roadClassLayers'
import { setTrafficLayerVisible, isTrafficLayerVisible } from './initTrafficLayers'
import router from '../router'

const ZB_CENTER = [118.05, 36.81]

/* ---------------- 中文标签 ---------------- */
export const LAYER_LABEL = {
  camera: '监控探头', trafficLight: '信号灯', police: '警员分布', congestion: '道路拥堵',
  heat: '热力图', busRoute: '公交线路', busStop: '公交站点', building: '城市建筑', mainRoad: '道路图层'
}
export const ROAD_LABEL = { total: '总道路', highway: '高速公路', first: '一级道路', second: '二级道路', third: '三级道路' }
const PAGE_LABEL = {
  home: '首页', rotation: '地球自转', cityview: '城市视角', eventinfo: '事件信息',
  areasearch: '区域搜索', navigation: '导航', changestyle: '切换风格'
}

/* 可飞往地点：八区县（mockData）+ 常用地标 */
export const PLACES = [
  ...DISTRICTS.map((d) => ({ name: d.name, center: d.center })),
  { name: '淄博站', center: [118.062, 36.778] },
  { name: '火车站', center: [118.062, 36.778] },
  { name: '淄博北站', center: [118.058, 36.862] },
  { name: '海岱楼', center: [118.032, 36.844] },
  { name: '齐盛湖公园', center: [118.03, 36.842] },
  { name: '人民公园', center: [118.055, 36.817] },
  { name: '淄博市政府', center: [118.055, 36.813] }
]
const findPlace = (kw = '') => {
  const k = String(kw).trim()
  if (!k) return null
  // 区县名去 区/县 后缀后按前两字匹配（张店区 ↔ 张店）
  const short = k.replace(/[区县]$/, '')
  return PLACES.find(
    (p) => p.name.includes(k) || k.includes(p.name) || k.includes(p.name.replace(/[区县]$/, '')) || p.name.includes(short)
  )
}

/* ---------------- 地图操作 ---------------- */
function mapOp(map, kind, payload = {}) {
  if (!map) return '地图尚未就绪，请稍后再试'
  switch (kind) {
    case 'zoom_in':
      map.easeTo({ zoom: map.getZoom() + 1, duration: 600 })
      return '已放大地图一级'
    case 'zoom_out':
      map.easeTo({ zoom: map.getZoom() - 1, duration: 600 })
      return '已缩小地图一级'
    case 'reset':
      map.flyTo({ center: ZB_CENTER, zoom: 9.5, pitch: 0, bearing: 0, duration: 1500 })
      return '已复位到淄博全景'
    case 'rotate':
      map.rotateTo(map.getBearing() + 360, { duration: 20000 })
      return '开始旋转视角（20 秒转一圈）'
    case 'top':
      map.setPitch(0)
      return '已切换俯视视角'
    case 'tilt':
      map.setPitch(55)
      return '已切换到斜视视角'
    case 'fly': {
      const p = findPlace(payload.place)
      if (!p) return `未找到「${payload.place || ''}」的位置，试试：张店区、临淄区、淄博站、海岱楼`
      map.flyTo({ center: p.center, zoom: 12, pitch: 45, duration: 2000 })
      return `正在飞往 ${p.name}`
    }
    default:
      return `不支持的地图操作：${kind}`
  }
}

/* ---------------- LLM 工具执行（返回给大模型的纯文本结果） ---------------- */
const LLM_ACTION_KIND = {
  zoom_in: 'zoom_in', zoom_out: 'zoom_out', reset_view: 'reset',
  rotate_view: 'rotate', top_view: 'top', tilt_view: 'tilt'
}

const toolImpl = {
  /** 查询页面状态（地图 / 图层 / 分级 / 控制中心 / 天气） */
  get_status({ map }) {
    const onLayers = Object.keys(LAYER_LABEL).filter(
      (k) => (k === 'building' || k === 'mainRoad') ? isTrafficLayerVisible(k) : !!store.trafficOn[k]
    )
    const parts = []
    if (map) {
      parts.push(`地图：淄博 zoom ${map.getZoom().toFixed(1)} 经度${map.getCenter().lng.toFixed(2)} 纬度${map.getCenter().lat.toFixed(2)}`)
    }
    parts.push(`当前道路分级：${ROAD_LABEL[store.roadClass] || '总道路（全部路网）'}`)
    parts.push(`已开图层：${onLayers.length ? onLayers.map((k) => LAYER_LABEL[k]).join('、') : '无'}`)
    parts.push(`控制中心：${store.chartsOpen ? '已打开' : '未打开'}`)
    const w = store.weather
    if (w && w.temperature !== '—') parts.push(`天气：${w.city} ${w.weather} ${w.temperature}℃ 湿度${w.humidity}`)
    return parts.join('；')
  },

  /** 地图动作 */
  map_action({ action }, ctx) {
    const kind = LLM_ACTION_KIND[action]
    if (!kind) return `未知地图动作：${action}`
    return mapOp(ctx.map, kind)
  },

  /** 飞到某地 */
  fly_to({ place }, ctx) {
    return mapOp(ctx.map, 'fly', { place })
  },

  /** 道路分级切换 */
  set_road_class({ level }) {
    const key = level === 'total' ? null : level
    selectRoadClass(key)
    store.roadClass = key || null
    return `道路已切换为：${ROAD_LABEL[level] || level}`
  },

  /** 交通图层开关 */
  set_traffic_layer({ layer, on }) {
    const ok = setTrafficLayerVisible(layer, !!on)
    if (!ok) return `未知图层：${layer}`
    return `${on ? '已打开' : '已关闭'}${LAYER_LABEL[layer] || layer}图层`
  },

  /** 控制中心（统计图表浮层）开关 */
  set_control_center({ open }) {
    store.chartsOpen = !!open
    return open ? '已打开控制中心' : '已收起控制中心'
  },

  /** 页面跳转 */
  goto_page({ page }) {
    const map = { home: '/', rotation: '/rotation', cityview: '/cityview', eventinfo: '/eventinfo', areasearch: '/areasearch', navigation: '/navigation', changestyle: '/changestyle' }
    if (!map[page]) return `未知页面：${page}`
    router.push(map[page])
    return `已跳转到「${PAGE_LABEL[page]}」页面`
  }
}

/** 执行一个 LLM 工具调用 */
export async function execTool(name, args, ctx) {
  const fn = toolImpl[name]
  if (!fn) return `未知工具：${name}`
  return String(await fn(args || {}, ctx))
}

/** 执行 agent.js 规则引擎动作（大模型不可用时的降级通道） */
export function execRuleAction(a, ctx) {
  switch (a.type) {
    case 'zoom':
      return mapOp(ctx.map, a.dir === 'in' ? 'zoom_in' : 'zoom_out')
    case 'map':
      // agent.js 飞行动作携带的是解析好的 {lng, lat, name}，直接飞
      if (a.kind === 'fly' && a.payload && a.payload.lng) {
        ctx.map?.flyTo({ center: [a.payload.lng, a.payload.lat], zoom: 12, pitch: 45, duration: 2000 })
        return `正在飞往 ${a.payload.name || '目的地'}`
      }
      return mapOp(ctx.map, a.kind, a.payload)
    case 'layer':
      return toolImpl.set_traffic_layer({ layer: a.name, on: a.visible })
    case 'road':
      return toolImpl.set_road_class({ level: a.level })
    case 'charts':
      store.chartsOpen = !!a.open
      return a.open ? '已打开控制中心' : '已收起控制中心'
    case 'chart':
      // 离线模式没有图表生成器：退化为打开控制中心查看统计图表
      store.chartsOpen = true
      return '已打开控制中心，可查看交通统计图表（离线模式暂不支持现场生成图表）'
    case 'reply':
    default:
      return a.reply || ''
  }
}

/** 当前是否大模型可用（供界面状态提示） */
export const llmConfigured = () => !!import.meta.env.VITE_DEEPSEEK_KEY
