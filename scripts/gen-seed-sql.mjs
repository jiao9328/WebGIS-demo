#!/usr/bin/env node
/**
 * 生成 db/seed.sql —— 业务数据入库脚本（供用户在 SSMS 执行）
 *
 * 数据与前端同源同种子：业务模拟数据走 generators.js（与 src/tools/mockData.js
 * 同一套生成逻辑），真实数据直读 src/assets/GIS_Data/*.json，保证入库内容
 * 与页面渲染口径一致。脚本只负责把 JS 对象拼成 T-SQL（TRUNCATE + INSERT），
 * 幂等可重复执行。
 *
 * 用法：node scripts/gen-seed-sql.mjs   （输出到 db/seed.sql，UTF-8 带 BOM，
 *       SSMS 打开中文不乱码；字符串全部单引号转义 + N'' 前缀，任意代码页安全）
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateAllBusinessData, DISTRICTS } from '../src/tools/generators.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const data = (p) => JSON.parse(readFileSync(join(root, 'src/assets/GIS_Data', p), 'utf8'))

/* ---------- 数据源（与前端同一份 GIS_Data） ---------- */
const roadData = data('Zibo_roads.json')
const lightPoints = data('traffic_lights.json')
const busRoutes = data('bus_routes.json')
const busStops = data('bus_stops_amap.json')
const eventsJson = data('Zibo_events.json')

// 业务模拟数据：与 mockData.js 完全同种子同路径
const biz = generateAllBusinessData({ roadData, trafficLightPoints: lightPoints })

/* ---------- SQL 转义 ---------- */
const esc = (s) => String(s ?? '').replace(/'/g, "''")
const S = (s) => `N'${esc(s)}'`          // 字符串字面量（NVARCHAR 安全前缀）
const num = (n) => (n === null || n === undefined ? 'NULL' : Number(n))
const bit = (b) => (b ? '1' : '0')
const coords = (f) => f.geometry.coordinates // [lng, lat]

/* ---------- 按表组 INSERT（>400 行自动拆多条 VALUES） ---------- */
const inserts = []
function addInsert(table, cols, rows) {
  if (!rows.length) return
  const head = `INSERT INTO dbo.${table} (${cols}) VALUES `
  for (let i = 0; i < rows.length; i += 400) {
    const chunk = rows.slice(i, i + 400)
    inserts.push(head + chunk.join(',\n') + ';')
  }
}

// 1) 区县
addInsert('districts', 'name, lng, lat, population',
  DISTRICTS.map((d) => `(${S(d.name)}, ${num(d.center[0])}, ${num(d.center[1])}, ${num(d.population)})`))

// 2) 监控探头
addInsert('cameras', 'cam_id, name, road, status, area, lng, lat',
  biz.cameras.map((c) => `(${S(c.id)}, ${S(c.name)}, ${S(c.road)}, ${S(c.status)}, ${S(c.area)}, ${num(c.lng)}, ${num(c.lat)})`))

// 3) 信号灯（OSM 真实点位 + 模拟状态）
addInsert('traffic_lights', 'tl_id, name, state, area, lng, lat',
  biz.trafficLights.map((t) => `(${S(t.id)}, ${S('')}, ${S(t.state)}, ${S(t.area)}, ${num(t.lng)}, ${num(t.lat)})`))

// 4) 警员
addInsert('police', 'pol_id, name, badge, district, on_duty, location, lng, lat',
  biz.police.map((p) => `(${S(p.id)}, ${S(p.name)}, ${S(p.badge)}, ${S(p.district)}, ${bit(p.onDuty)}, ${S(p.location)}, ${num(p.lng)}, ${num(p.lat)})`))

// 5) 实时警情
addInsert('alerts', 'alert_id, type, level, area, road, lng, lat, minutes_ago, status, car_num',
  biz.alerts.map((a) => `(${S(a.id)}, ${S(a.type)}, ${num(a.level)}, ${S(a.area)}, ${S(a.road)}, ${num(a.lng)}, ${num(a.lat)}, ${num(a.time)}, ${S(a.status)}, ${S(a.carNum)})`))

// 6) 事件记录（GIS_Data Zibo_events.json）
addInsert('events', 'event_num, name, area, car_num, phone, level, lng, lat',
  eventsJson.features.map((f) => {
    const p = f.properties
    const [lng, lat] = coords(f)
    return `(${S(p.event_num)}, ${S(p.name)}, ${S(p.area)}, ${S(p.car_num)}, ${S(p.phone)}, ${num(p.level)}, ${num(lng)}, ${num(lat)})`
  }))

// 7) 拥堵路段（真实路名，几何仍走前端本地路网匹配，表内存中心点）
addInsert('congestion', 'name, level, level_name, avg_speed, flow, area, lng, lat',
  biz.congestion.map((c) => `(${S(c.name)}, ${num(c.level)}, ${S(c.levelName)}, ${num(c.avgSpeed)}, ${num(c.flow)}, ${S(c.area)}, ${num(c.lng)}, ${num(c.lat)})`))

// 8) 热力点（只读展示数据）
addInsert('heat_points', 'lng, lat, value',
  biz.heatPoints.map((h) => `(${num(h.lng)}, ${num(h.lat)}, ${num(h.value)})`))

// 9) 公交线路（真实高德线路 + LineString 几何 JSON 文本）
addInsert('bus_routes', 'ref, name, dep_stop, arr_stop, via, color, geometry',
  busRoutes.features.map((f) => {
    const p = f.properties
    const geom = JSON.stringify(f.geometry) // {"type":"LineString","coordinates":[...]}
    return `(${S(p.ref)}, ${S(p.name)}, ${S(p.dep_stop)}, ${S(p.arr_stop)}, ${num(p.via)}, ${S(p.color)}, ${S(geom)})`
  }))

// 10) 公交站点（真实高德点位）
addInsert('bus_stops', 'stop_id, name, lng, lat',
  busStops.features.map((f) => {
    const p = f.properties
    const [lng, lat] = coords(f)
    return `(${S(p.id)}, ${S(p.name)}, ${num(lng)}, ${num(lat)})`
  }))

/* ---------- 汇总（供核对） ---------- */
const COUNT = {
  districts: DISTRICTS.length,
  cameras: biz.cameras.length,
  traffic_lights: biz.trafficLights.length,
  police: biz.police.length,
  alerts: biz.alerts.length,
  events: eventsJson.features.length,
  congestion: biz.congestion.length,
  heat_points: biz.heatPoints.length,
  bus_routes: busRoutes.features.length,
  bus_stops: busStops.features.length
}

/* ---------- 组装文件（带 BOM，SSMS 打开中文正常） ---------- */
const lines = [
  '/* ============================================================',
  ' * ZiboSmartTraffic - seed data (run in SSMS AFTER db/setup.sql)',
  ' * HOW TO RUN: open this file in SSMS (connect to ZiboSmartTraffic)',
  ' *             and Execute (F5). Idempotent: TRUNCATE + INSERT.',
  ' * Generated by: node scripts/gen-seed-sql.mjs',
  ' * Row counts expected:',
  ...Object.entries(COUNT).map(([t, n]) => ` *   ${t.padEnd(14)} ${n}`),
  ' * ============================================================ */',
  '',
  'USE ZiboSmartTraffic;',
  'GO',
  'SET NOCOUNT ON;',
  'BEGIN TRANSACTION;',
  '',
  'TRUNCATE TABLE dbo.districts;',
  'TRUNCATE TABLE dbo.cameras;',
  'TRUNCATE TABLE dbo.traffic_lights;',
  'TRUNCATE TABLE dbo.police;',
  'TRUNCATE TABLE dbo.alerts;',
  'TRUNCATE TABLE dbo.events;',
  'TRUNCATE TABLE dbo.congestion;',
  'TRUNCATE TABLE dbo.heat_points;',
  'TRUNCATE TABLE dbo.bus_routes;',
  'TRUNCATE TABLE dbo.bus_stops;',
  '',
  ...inserts,
  '',
  `PRINT 'seed.sql done: inserted ${Object.values(COUNT).reduce((a, b) => a + b, 0)} rows total.';`,
  'COMMIT TRANSACTION;',
  'GO'
]

const out = join(root, 'db', 'seed.sql')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, '﻿' + lines.join('\r\n') + '\r\n', 'utf8')
console.log('written:', out)
for (const [t, n] of Object.entries(COUNT)) console.log('  ' + t.padEnd(14), n)
