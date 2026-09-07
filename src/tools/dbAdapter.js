/**
 * 数据库行 → 地图图层 / 事件检索消费结构 适配器
 *
 * 后端 /api/mapdata 返回的是 DB 原样行（snake_case 列名），
 * 而图层工厂 / 弹窗读的是旧 mock 字段语义（p.id、p.onDuty…）。
 * 统一在此做「列名别名 + 类型归位 + 行 → GeoJSON」，图层代码不需要感知 DB 命名；
 * 增删改查后整层重建时，行会重新经过这里，改动即可上图层。
 */
/* 业务编号列 → 前台沿用 p.id 显示（INT 主键已剔除，避免冲突） */
const ID_COL = {
  cameras: 'cam_id',
  traffic_lights: 'tl_id',
  police: 'pol_id',
  bus_stops: 'stop_id',
  alerts: 'alert_id',
  events: 'event_num'
}

/* DB snake_case → 图层弹窗沿用的旧 mock 驼峰字段（其余同名列天然一致） */
const EXTRA_ALIAS = {
  congestion: { level_name: 'levelName', avg_speed: 'avgSpeed' }
}

/** 行 → 图层 Feature.properties（去掉 INT 主键；按表做别名归位） */
export function layerProps(table, row) {
  const p = { ...row }
  delete p.id
  const ic = ID_COL[table]
  if (ic && p[ic] != null) p.id = p[ic]
  if (table === 'police') {
    p.onDuty = !!p.on_duty
    delete p.on_duty
  }
  const alias = EXTRA_ALIAS[table]
  if (alias) {
    for (const [from, to] of Object.entries(alias)) {
      if (p[from] != null) p[to] = p[from]
    }
  }
  return p
}

/** 点位行（含 lng/lat 列的表）→ GeoJSON FeatureCollection */
export function pointFC(table, rows) {
  const feats = (rows || [])
    .filter((r) => Number.isFinite(Number(r.lng)) && Number.isFinite(Number(r.lat)))
    .map((r) => ({
      type: 'Feature',
      properties: layerProps(table, r),
      geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] }
    }))
  return { type: 'FeatureCollection', features: feats }
}

/** 公交线路行（geometry 为服务端解析好的 LineString 对象）→ GeoJSON FeatureCollection */
export function routeFC(rows) {
  const feats = (rows || [])
    .filter((r) => r.geometry && r.geometry.coordinates && r.geometry.coordinates.length)
    .map((r) => ({
      type: 'Feature',
      properties: layerProps('bus_routes', r),
      geometry: r.geometry
    }))
  return { type: 'FeatureCollection', features: feats }
}
