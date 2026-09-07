/**
 * 淄博智慧交通 - 业务数据生成器（纯逻辑层）
 *
 * 与浏览器/Vite 解耦：本文件不 import 任何 JSON / 别名模块，
 * Node 脚本（scripts/gen-seed-sql.mjs）与前端（mockData.js）共用同一套生成逻辑，
 * 保证「入库数据」与「界面渲染数据」出自同一种子、同一条代码路径，完全一致。
 *
 * 数据来源（真实优先，抓取不到才模拟）：
 *   真实 - 道路/建筑：GIS_Data（OSM 真实路网几何）
 *   真实 - 信号灯点位：OSM Overpass 抓取
 *   真实 - 公交线路/公交站：高德 Web 服务 API
 *   模拟 - 摄像头点位：沿真实 OSM 路网每 ~1km 布设（几何真实）
 *   模拟 - 警员/警情：公安数据不公开，位置基于真实区县中心与真实路名
 *   模拟 - 拥堵：等级模拟但道路名取自真实 OSM 路网
 *   统一固定种子伪随机（mulberry32），保证每次生成一致。
 */

/* ---------------- 基础地理信息（区县常量） ---------------- */
export const ZIBO_CENTER = [118.05, 36.81]

export const DISTRICTS = [
  { name: '张店区', center: [118.06, 36.81], population: 79.58 },
  { name: '临淄区', center: [118.31, 36.82], population: 64.92 },
  { name: '淄川区', center: [117.97, 36.64], population: 61.42 },
  { name: '博山区', center: [117.86, 36.49], population: 41.06 },
  { name: '周村区', center: [117.87, 36.8], population: 35.38 },
  { name: '桓台县', center: [118.1, 36.96], population: 48.95 },
  { name: '高青县', center: [117.83, 37.17], population: 31.31 },
  { name: '沂源县', center: [118.17, 36.18], population: 51.51 }
]

/* 主道路类型（一级道路 = 高速/快速路/主干道） */
export const MAIN_ROAD_TYPES = ['motorway', 'trunk', 'primary', 'motorway_link', 'trunk_link', 'primary_link']
const ALL_ROAD_TYPES = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'residential', 'service', 'unclassified']

/* ---------------- 工具：可复现伪随机（同种子同序列） ---------------- */
export function mulberry32(a) {
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const DEFAULT_SEED = 20260902 // 与 v1 模拟数据同种子，保证可复现

/* 警员姓名 / 警情类型 / 播报文案（常量池） */
const POLICE_NAMES = ['张伟', '王芳', '李强', '赵磊', '刘洋', '陈静', '杨帆', '黄旭', '周凯', '吴敏', '徐亮', '孙磊', '马超', '朱婷', '胡军', '郭涛', '林峰', '何娟', '高翔', '罗成']
const ALERT_TYPES = [
  { name: '交通事故', level: [2, 3, 4] },
  { name: '交通管制', level: [2, 3] },
  { name: '设备故障', level: [1, 2] },
  { name: '道路施工', level: [1, 2] },
  { name: '天气影响', level: [1, 2, 3] }
]
const EVENT_TYPES = [
  { name: '交通事故', msg: '发生一起追尾事故，请过往车辆减速慢行' },
  { name: '交通管制', msg: '实施临时交通管制，请绕行' },
  { name: '设备故障', msg: '监测到道路监控设备故障，已派单处置' },
  { name: '道路施工', msg: '道路施工占道，请注意避让' }
]
const CONGESTION_LEVEL = [
  { name: '严重拥堵', color: '#ff3b30', speed: 12 },
  { name: '中度拥堵', color: '#ff9500', speed: 22 },
  { name: '轻度拥堵', color: '#ffd60a', speed: 32 }
]

/**
 * 一次生成全部业务数据（共享同一条随机流，调用顺序固定 → 结果可复现）。
 *
 * @param {object} deps
 * @param {object} deps.roadData            OSM 路网 GeoJSON（FeatureCollection）
 * @param {object} [deps.trafficLightPoints] 信号灯点位 GeoJSON（缺失时沿路网兜底布点）
 * @param {number} [deps.seed]              伪随机种子，默认 20260902
 * @returns {{
 *   cameras: Array, trafficLights: Array, police: Array, alerts: Array,
 *   vehicleDensity: Array, heatPoints: Array, congestion: Array,
 *   broadcastEvents: Array, ROAD_NAMES: Array
 * }}
 */
export function generateAllBusinessData({ roadData, trafficLightPoints, seed = DEFAULT_SEED } = {}) {
  const rand = mulberry32(seed)
  const roadFeatures = (roadData && roadData.features) || []

  /* ---- 从路网抽取带名称的主干道路（供拥堵/警员/播报定位用） ---- */
  const namedRoads = roadFeatures.filter((f) => {
    const t = f.properties.type
    const name = f.properties.name
    return name && MAIN_ROAD_TYPES.includes(t)
  })

  /* 真实道路名（去重） */
  const ROAD_NAMES = [...new Set(namedRoads.map((f) => f.properties.name))]

  /* 道路中心点预计算 */
  const roadCenters = namedRoads.map((f) => {
    const c = f.geometry.coordinates
    const mid = c[Math.floor(c.length / 2)]
    return { name: f.properties.name, center: mid }
  })

  /* ---- 内部工具 ---- */
  function nearestDistrict([lng, lat]) {
    let best = DISTRICTS[0]
    let min = Infinity
    for (const d of DISTRICTS) {
      const dist = (d.center[0] - lng) ** 2 + (d.center[1] - lat) ** 2
      if (dist < min) {
        min = dist
        best = d
      }
    }
    return best
  }

  function nearestRoadName([lng, lat]) {
    let best = ''
    let min = Infinity
    for (const r of roadCenters) {
      const d = (r.center[0] - lng) ** 2 + (r.center[1] - lat) ** 2
      if (d < min) {
        min = d
        best = r.name
      }
    }
    return best
  }

  function randomPlate() {
    const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
    const nums = '0123456789'
    let s = ''
    for (let i = 0; i < 5; i++) s += rand() < 0.5 ? letters[Math.floor(rand() * letters.length)] : nums[Math.floor(rand() * nums.length)]
    return s
  }

  /* ---- 摄像头（道路视频监控）：沿主道路每约 1km 布设一个 ---- */
  function genCameras() {
    const cams = []
    let id = 0
    const mainRoads = roadFeatures.filter((f) => MAIN_ROAD_TYPES.includes(f.properties.type))
    for (const f of mainRoads) {
      const coords = f.geometry.coordinates
      for (let i = 0; i < coords.length; i += 3) {
        if (cams.length >= 220) break
        cams.push({
          id: 'CAM' + String(1000 + id++),
          name: (f.properties.name || '主干道') + '监控' + (id % 9 + 1),
          lng: coords[i][0],
          lat: coords[i][1],
          road: f.properties.name || '无名称道路',
          status: rand() < 0.05 ? 'fault' : 'normal', // 5% 故障
          area: nearestDistrict(coords[i]).name
        })
      }
      if (cams.length >= 220) break
    }
    return cams
  }

  /* ---- 交通信号灯（真实点位 + 模拟状态） ---- */
  function genTrafficLights() {
    const lights = []
    const states = ['green', 'green', 'green', 'green', 'red', 'red', 'yellow']
    const pts = (trafficLightPoints && trafficLightPoints.features) || []
    let id = 0
    const list = pts.length ? pts : []
    for (const f of list) {
      if (lights.length >= 240) break
      const [lng, lat] = f.geometry.coordinates
      lights.push({
        id: 'TL' + String(100 + id++),
        lng,
        lat,
        state: rand() < 0.05 ? 'fault' : states[Math.floor(rand() * states.length)],
        area: nearestDistrict([lng, lat]).name
      })
    }
    // 兜底：点位不足时沿路网补充
    if (lights.length < 60) {
      const roads = roadFeatures.filter((f) => ALL_ROAD_TYPES.includes(f.properties.type))
      for (let k = 0; k < roads.length && lights.length < 60; k += 2) {
        const coords = roads[k].geometry.coordinates
        const idx = Math.floor(rand() * (coords.length - 2)) + 1
        const p = coords[idx]
        lights.push({
          id: 'TL' + String(100 + id++),
          lng: p[0] + (rand() - 0.5) * 0.004,
          lat: p[1] + (rand() - 0.5) * 0.004,
          state: rand() < 0.05 ? 'fault' : states[Math.floor(rand() * states.length)],
          area: nearestDistrict(p).name
        })
      }
    }
    return lights
  }

  /* ---- 勤务警员 ---- */
  function genPolice() {
    const police = []
    for (let i = 0; i < 60; i++) {
      const d = DISTRICTS[i % DISTRICTS.length]
      const lng = d.center[0] + (rand() - 0.5) * 0.25
      const lat = d.center[1] + (rand() - 0.5) * 0.2
      police.push({
        id: 'POL' + (100 + i),
        name: POLICE_NAMES[i % POLICE_NAMES.length] + String(100 + i).slice(-2),
        badge: '鲁C' + String(104000 + i * 17).slice(3),
        lng,
        lat,
        district: d.name,
        onDuty: rand() > 0.2, // 80% 在勤
        location: d.name + nearestRoadName([lng, lat]) + '路段'
      })
    }
    return police
  }

  /* ---- 实时警情 ---- */
  function genAlerts() {
    const alerts = []
    for (let i = 0; i < 28; i++) {
      const t = ALERT_TYPES[Math.floor(rand() * ALERT_TYPES.length)]
      const d = DISTRICTS[Math.floor(rand() * DISTRICTS.length)]
      const lng = d.center[0] + (rand() - 0.5) * 0.4
      const lat = d.center[1] + (rand() - 0.5) * 0.3
      alerts.push({
        id: 'JQ' + (20260000 + i * 137),
        type: t.name,
        level: t.level[Math.floor(rand() * t.level.length)],
        area: d.name,
        road: nearestRoadName([lng, lat]),
        lng,
        lat,
        time: Math.floor(rand() * 60), // 分钟前
        status: rand() < 0.7 ? 'handling' : 'pending', // 处置中/待处置
        carNum: '鲁C' + randomPlate()
      })
    }
    return alerts
  }

  /* ---- 区域车辆密度 ---- */
  function genVehicleDensity() {
    return DISTRICTS.map((d, i) => ({
      name: d.name,
      center: d.center,
      // 按人口比例 + 市中心偏高
      value: Math.round(d.population * 130 * (0.85 + rand() * 0.3)),
      online: Math.round(d.population * 6 * (0.9 + rand() * 0.2))
    }))
  }

  /* ---- 道路热力点（车辆密度热力） ---- */
  function genHeatPoints() {
    const points = []
    for (const d of DISTRICTS) {
      const n = 42
      for (let i = 0; i < n; i++) {
        const r = rand() * 0.16
        const a = rand() * Math.PI * 2
        points.push({
          lng: d.center[0] + Math.cos(a) * r,
          lat: d.center[1] + Math.sin(a) * r * 0.8,
          value: Math.round(15 + rand() * 85)
        })
      }
    }
    return points
  }

  /* ---- 拥堵路段（22 条不同真实路名，三色分级） ---- */
  function genCongestion() {
    const segs = []
    const pool = namedRoads.filter((f) => f.properties.name)
    const picked = []
    // 挑 22 条不同道路
    while (picked.length < 22 && pool.length) {
      const i = Math.floor(rand() * pool.length)
      if (!picked.includes(pool[i])) picked.push(pool[i])
    }
    picked.forEach((f, i) => {
      const lv = i < 6 ? 0 : i < 14 ? 1 : 2
      const coords = f.geometry.coordinates
      const mid = coords[Math.floor(coords.length / 2)]
      segs.push({
        id: 'CD' + (100 + i),
        name: f.properties.name,
        level: lv,
        levelName: CONGESTION_LEVEL[lv].name,
        color: CONGESTION_LEVEL[lv].color,
        avgSpeed: CONGESTION_LEVEL[lv].speed + Math.floor(rand() * 6),
        lng: mid[0],
        lat: mid[1],
        area: nearestDistrict(mid).name,
        // 拥堵聚合度（车流量指数）
        flow: Math.round(60 + rand() * 40)
      })
    })
    return segs
  }

  /* ---- 事件播报队列（仅前端用，不入库） ---- */
  function genBroadcastEvents() {
    const list = []
    const types = ['事故', '管制', '故障', '施工', '拥堵']
    for (let i = 0; i < 8; i++) {
      const d = DISTRICTS[Math.floor(rand() * DISTRICTS.length)]
      const t = EVENT_TYPES[Math.floor(rand() * EVENT_TYPES.length)]
      list.push({
        id: 'EV' + (1000 + i),
        type: types[i % types.length],
        title: t.name + '｜' + d.name + nearestRoadName([d.center[0] + (rand() - 0.5) * 0.2, d.center[1] + (rand() - 0.5) * 0.2]) + '路段',
        desc: t.msg,
        time: new Date(Date.now() - (i + 1) * 40 * 1000 + Math.floor(rand() * 30000)),
        read: false
      })
    }
    return list
  }

  /* ---- 按固定顺序生成（调用顺序 = 随机流消耗顺序，勿调整） ---- */
  return {
    cameras: genCameras(),
    trafficLights: genTrafficLights(),
    police: genPolice(),
    alerts: genAlerts(),
    vehicleDensity: genVehicleDensity(),
    heatPoints: genHeatPoints(),
    congestion: genCongestion(),
    broadcastEvents: genBroadcastEvents(),
    ROAD_NAMES
  }
}
