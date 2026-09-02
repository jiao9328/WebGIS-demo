/**
 * AI 地图助手 - 自然语言指令解析引擎（前端规则引擎，可替换为 LLM API）
 * 支持：
 *   - 地图控制：缩放 / 平移 / 飞行 / 视角
 *   - 图层开关：摄像头、信号灯、警员、拥堵、热力、公交、建筑、道路
 *   - 图表生成：18 种图表类型 × 数据主题
 */
import { DISTRICTS, congestion } from './mockData'

/* ================= 18 种图表类型 ================= */
export const CHART_TYPES = [
  { key: 'bar', name: '柱状图' },
  { key: 'bar-h', name: '横向柱状图' },
  { key: 'line', name: '折线图' },
  { key: 'area', name: '面积图' },
  { key: 'pie', name: '饼图' },
  { key: 'doughnut', name: '环形图' },
  { key: 'scatter', name: '散点图' },
  { key: 'bubble', name: '气泡图' },
  { key: 'radar', name: '雷达图' },
  { key: 'heatmap', name: '热力图' },
  { key: 'funnel', name: '漏斗图' },
  { key: 'waterfall', name: '瀑布图' },
  { key: 'boxplot', name: '箱线图' },
  { key: 'gauge', name: '仪表盘' },
  { key: 'tree', name: '树状图' },
  { key: 'sunburst', name: '旭日图' },
  { key: 'sankey', name: '桑基图' },
  { key: 'candlestick', name: 'K线图' }
]

/* 数据主题（从淄博业务数据生成） */
const THEMES = {
  population: { name: '淄博各区常住人口（万人）', data: () => DISTRICTS.map((d) => ({ name: d.name, value: d.population })) },
  vehicle: { name: '淄博各区车辆数量（辆）', data: () => DISTRICTS.map((d) => ({ name: d.name, value: Math.round(d.population * 130) })) },
  congestion: { name: '淄博拥堵路段流量指数', data: () => congestion.map((c) => ({ name: c.name, value: c.flow })).slice(0, 10) },
  alert: { name: '淄博各区警情数量', data: () => DISTRICTS.map((d) => ({ name: d.name, value: 10 + Math.round(Math.random() * 20) })) },
  camera: { name: '淄博各区摄像头数量', data: () => DISTRICTS.map((d) => ({ name: d.name, value: 18 + Math.round(Math.random() * 30) })) }
}

const THEME_ALIAS = [
  ['人口', 'population'],
  ['车辆', 'vehicle'],
  ['车流', 'vehicle'],
  ['拥堵', 'congestion'],
  ['警情', 'alert'],
  ['摄像头', 'camera'],
  ['监控', 'camera']
]

/* ================= 图层开关 ================= */
const LAYER_ALIAS = [
  ['摄像头', 'camera'],
  ['监控', 'camera'],
  ['信号灯', 'trafficLight'],
  ['信号', 'trafficLight'],
  ['警员', 'police'],
  ['拥堵', 'congestion'],
  ['热力', 'heat'],
  ['公交', 'busRoute'],
  ['建筑', 'building'],
  ['道路', 'mainRoad']
]

/* ================= 解析入口 ================= */
export function parseCommand(text, ctx) {
  const t = text.trim()
  if (!t) return null
  // 地图控制
  if (/(放大|拉近|靠近|zoom in|进一点)/.test(t)) return zoomAction('in')
  if (/(缩小|拉远|zoom out|退一点)/.test(t)) return zoomAction('out')
  if (/(回到淄博|淄博全景|复位|重置视角)/.test(t)) return mapAction('reset')
  if (/(旋转|环绕|转一圈)/.test(t)) return mapAction('rotate')
  if (/(俯视|俯视角)/.test(t)) return mapAction('top')
  if (/(斜视|倾斜|45)/.test(t)) return mapAction('tilt')
  if (/(飞到|定位|去|前往)(.+)/.test(t)) {
    // $1 是动词，地名在第二个捕获组
    const target = RegExp.$2.trim()
    const d = DISTRICTS.find((x) => target.includes(x.name.replace('区', '').replace('县', '')) || target.includes(x.name.slice(0, 2)))
    if (d) return mapAction('fly', { lng: d.center[0], lat: d.center[1], name: d.name })
    return replyAction(`暂未找到 "${target}" 的位置，试试「飞到张店区」`)
  }
  // 图层开关
  const layerHit = LAYER_ALIAS.find(([alias]) => t.includes(alias))
  if (layerHit && /(打开|显示|开启|查看|展示|显示一下)/.test(t)) {
    return layerAction(layerHit[1], true)
  }
  if (layerHit && /(关闭|隐藏|关掉|去掉|隐藏一下)/.test(t)) {
    return layerAction(layerHit[1], false)
  }
  // 图表生成
  const chartHit = CHART_TYPES.find((c) => t.includes(c.name) || t.includes(c.key))
  if (chartHit && /(画|绘制|生成|做个|来一个|创建一个)/.test(t)) {
    const theme = THEME_ALIAS.find(([alias]) => t.includes(alias))
    return chartAction(chartHit, theme ? theme[1] : 'vehicle')
  }
  if (/(画|绘制|生成|做个|来一个|创建一个).*(图|表)/.test(t)) {
    return chartAction(CHART_TYPES[0], 'vehicle')
  }
  // 默认回复
  return replyAction('可以这样对我说：「放大地图」「飞到临淄区」「显示摄像头」「关闭信号灯」「画一个环形图 统计各区车辆」')
}

/* ================= 动作构造 ================= */
function zoomAction(dir) {
  return { type: 'zoom', dir, reply: dir === 'in' ? '好的，放大地图' : '好的，缩小地图' }
}
function mapAction(kind, payload = {}) {
  const replys = {
    reset: '已复位到淄博全景',
    rotate: '开始旋转视角',
    top: '已切换俯视视角',
    tilt: '已切换到斜视视角',
    fly: `正在飞往 ${payload.name}`
  }
  return { type: 'map', kind, payload, reply: replys[kind] }
}
function layerAction(name, visible) {
  return { type: 'layer', name, visible, reply: `${visible ? '已打开' : '已关闭'}${name}` }
}
function chartAction(chart, theme) {
  const th = THEMES[theme]
  return {
    type: 'chart',
    chart: {
      id: 'CH' + Date.now(),
      type: chart.key,
      title: th.name,
      data: th.data()
    },
    reply: `已生成「${chart.name}」：${th.name}`
  }
}
function replyAction(text) {
  return { type: 'reply', reply: text }
}
