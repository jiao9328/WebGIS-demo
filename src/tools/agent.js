/**
 * AI 地图助手 - 自然语言指令解析引擎（前端规则引擎，可替换为 LLM API）
 * 支持：
 *   - 地图控制：缩放 / 平移 / 飞行 / 视角
 *   - 图层开关：摄像头、信号灯、警员、拥堵、热力、公交、建筑、道路
 *   - 图表生成：18 种图表类型 × 数据主题
 */
import { DISTRICTS, congestion } from './mockData'
import { store } from '../store'

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
  ['公交站', 'busStop'], // 先于「公交」，避免 公交站点 误命中线路
  ['摄像头', 'camera'],
  ['监控', 'camera'],
  ['信号灯', 'trafficLight'],
  ['信号', 'trafficLight'],
  ['警员', 'police'],
  ['拥堵', 'congestion'],
  ['热力', 'heat'],
  ['公交', 'busRoute'],
  ['站点', 'busStop'],
  ['建筑', 'building'],
  ['道路', 'mainRoad']
]

// 图层英文 key → 中文名（回复用）
const LAYER_LABEL = {
  camera: '监控探头', trafficLight: '信号灯', police: '警员分布', congestion: '道路拥堵',
  heat: '热力图', busRoute: '公交线路', busStop: '公交站点', building: '城市建筑', mainRoad: '道路图层'
}

/* ================= 道路分级（须先于图层开关：一级道路 含「道路」字样） ================= */
const ROAD_ALIAS = [
  ['总道路', 'total'], ['所有道路', 'total'], ['全部道路', 'total'], ['全部路网', 'total'], ['所有路网', 'total'],
  ['高速公路', 'highway'], ['高速路', 'highway'],
  ['一级道路', 'first'], ['快速路', 'first'], ['主干道', 'first'], ['主干路', 'first'],
  ['二级道路', 'second'], ['次干道', 'second'], ['次干路', 'second'],
  ['三级道路', 'third'], ['支路', 'third']
]
const ROAD_ALIAS_LOOSE = [['高速', 'highway'], ['一级', 'first'], ['二级', 'second'], ['三级', 'third']]
const ROAD_LABEL = { total: '总道路', highway: '高速公路', first: '一级道路', second: '二级道路', third: '三级道路' }

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
  // 二级功能：导航到某地（须先于 fly 规则，防「去」字命中）
  const navHit = t.match(/(导航到|导航去|导航至|规划路线到)(.+)/)
  if (navHit) {
    const place = navHit[2].trim()
    if (place) {
      // 可带起点：「从张店区导航到博山区」→ origin=张店区；未提起点则执行器默认淄博站
      const fromHit = t.match(/(?:从|自)([^，。！？\s]{1,12}?)(?:出发|开始|走|去|到|前往|至|导航)/)
      return { type: 'navigate', place, origin: fromHit ? fromHit[1].trim() : '' }
    }
  }
  if (/(飞到|飞往|定位|去|前往)(.+)/.test(t)) {
    // $1 是动词，地名在第二个捕获组
    const target = RegExp.$2.replace(/[，。！？!?、\s]+$/, '').trim()
    if (!target) return replyAction('想飞到哪？告诉我地名，比如「飞到临淄区」「飞到张南路」')
    const d = DISTRICTS.find((x) => target.includes(x.name.replace('区', '').replace('县', '')) || target.includes(x.name.slice(0, 2)))
    if (d) return mapAction('fly', { lng: d.center[0], lat: d.center[1], name: d.name })
    // 非区县：交给执行器做多级解析（道路 → 医院商场小区等 POI → 在线地理编码兜底）
    return { type: 'map', kind: 'fly', payload: { place: target }, reply: `正在查找「${target}」…` }
  }
  // 道路分级：关闭/隐藏某等级 → 回到总道路；显示/切换/仅看某等级 → 该等级
  // （须先于图层开关，否则「一级道路」会命中别名「道路」；也先于 fly 之外的通用回复）
  const roadHit = [...ROAD_ALIAS, ...ROAD_ALIAS_LOOSE].find(([alias]) => t.includes(alias))
  if (roadHit && /(关闭|隐藏|关掉|去掉)/.test(t)) {
    return roadAction('total', '好的，已恢复显示总道路（全等级路网）')
  }
  if (roadHit && /(显示|打开|切换|只看|看看|恢复|回到|设置)/.test(t)) {
    return roadAction(roadHit[1])
  }
  // 控制中心（数据图表浮层开关）
  if (/(关闭|收起|隐藏|关掉).*(控制中心|图表|数据面板|数据中心|统计面板)/.test(t)) {
    return chartsAction(false, '好的，已收起控制中心')
  }
  if (/(打开|显示|看看|查看|开启|调出).*(控制中心|数据面板|数据中心|统计面板|实时图表)/.test(t)) {
    return chartsAction(true, '好的，已打开控制中心，可查看交通统计图表')
  }
  // 二级功能：切换地图风格（与切换风格页点选同一套）
  if (/(风格|地图|背景|换成|切换|变|调|用|搞成)/.test(t)) {
    const STYLE_RULES = [
      ['高对比', '高对比度街道风格'], ['夜间街道', '夜间街道风格'], ['夜间导航', '导航风格（夜间）'],
      ['导航风格', '导航风格（白天）'], ['卫星', '卫星影像'], ['影像', '卫星影像'],
      ['深色', '深色风格'], ['暗色', '深色风格'], ['海图', '海图风格'], ['地形', '地形风格'],
      ['高清', '高清街道风格'], ['街道', '街道风格']
    ]
    const sh = STYLE_RULES.find(([kw]) => t.includes(kw))
    if (sh) return { type: 'style', style: sh[1] }
  }
  // 二级功能：区域搜索（与区域搜索页同一套：行政边界 + 天气）
  const areaHit = t.match(/区域搜索(.+)|(?:搜索|查一下|查查|查)([^，。！？\s]{2,12})(?:的)?(?:区域|范围|边界|轮廓|行政区|市区|界)/)
  if (areaHit) {
    const kw = (areaHit[1] || areaHit[2] || '').trim()
    if (kw && kw.length >= 2) return { type: 'areasearch', keyword: kw }
  }
  // 二级功能：地图测量工具（与地图测量弹层同款）
  const TOOL_HIT = [['多边形', 'drawPolygonTool'], ['矩形', 'drawRectTool'], ['圆形', 'drawCircleTool'], ['线', 'line']]
  const th = TOOL_HIT.find(([kw]) => t.includes(kw))
  if (th && /(测量|测距|量一下|量一量|距离|长度)/.test(t)) return { type: 'measure', tool: th[1] }
  // 图层开关
  const layerHit = LAYER_ALIAS.find(([alias]) => t.includes(alias))
  if (layerHit && /(打开|显示|开启|查看|展示|显示一下)/.test(t)) {
    return layerAction(layerHit[1], true)
  }
  if (layerHit && /(关闭|隐藏|关掉|去掉|隐藏一下)/.test(t)) {
    return layerAction(layerHit[1], false)
  }
  // 图表生成（无 LLM 时退化为打开控制中心查看统计面板）
  const chartHit = CHART_TYPES.find((c) => t.includes(c.name) || t.includes(c.key))
  if (chartHit && /(画|绘制|生成|做个|来一个|创建一个)/.test(t)) {
    return chartAction(chartHit, THEME_ALIAS.find(([alias]) => t.includes(alias))?.[1] || 'vehicle')
  }
  if (/(画|绘制|生成|做个|来一个|创建一个).*(图|表)/.test(t)) {
    return chartAction(CHART_TYPES[0], 'vehicle')
  }
  // 天气问答（数据来自 App 挂载时真实抓取的 store.weather）
  if (/(天气|气温|温度|下雨|雨|雪|冷不冷|热不热|几度)/.test(t)) {
    const w = store.weather
    if (w && w.temperature && w.temperature !== '—') {
      return replyAction(`淄博市当前${w.weather}，${w.temperature}℃，湿度${w.humidity}，${w.windDirection}风${w.windPower}级（${w.reportTime}）`)
    }
    return replyAction('天气服务暂时不可用，不过我可以帮你操作地图，比如「显示监控探头」「飞到临淄区」')
  }
  // 默认回复
  return replyAction('可以这样对我说：「放大地图」「飞到临淄区」「显示监控探头」「切换到二级道路」「打开控制中心」')
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
  return { type: 'layer', name, visible, reply: `${visible ? '已打开' : '已关闭'}${LAYER_LABEL[name] || name}` }
}
function roadAction(level, reply) {
  return { type: 'road', level, reply: reply || `好的，已切换到${ROAD_LABEL[level] || '道路分级'}` }
}
function chartsAction(open, reply) {
  return { type: 'charts', open, reply }
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
