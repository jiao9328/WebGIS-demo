/**
 * AI 飞行目的地解析库（越查越细，多级命中）：
 *   1) 区县 / 地标（快表）
 *   2) 真实路网道路名（Zibo_roads.json：7557 段 → 306 个唯一路名，取首段中点）
 *   3) POI 点数据：医院 / 博物馆 / 景点 / 商场 / 小区（GIS_Data，Point + name）
 *   4) 以上都没命中 → 在线地理编码兜底（学校等本地无数据的任意地点）
 *   5) 仍失败 → 返回本地候选名，供提示「你是不是想找…」
 *
 * roads / Buildings 等大 JSON 已被 mockData/initLayer 静态引用，此处复用不增加打包体积；
 * 路名与 POI 索引按首次调用懒构建，避免拖慢页面启动。
 */
import roadData from '@/assets/GIS_Data/Zibo_roads.json'
import hospitalJson from '@/assets/GIS_Data/hospital.json'
import museumJson from '@/assets/GIS_Data/museum.json'
import scenicSpotJson from '@/assets/GIS_Data/scenicSpot.json'
import shoppingMallJson from '@/assets/GIS_Data/shoppingMall.json'
import residentialAreaJson from '@/assets/GIS_Data/residentialArea.json'
import { DISTRICTS } from './mockData'

/* ---------------- 1) 区县 + 地标快表 ---------------- */
export const PLACES = [
  ...DISTRICTS.map((d) => ({ name: d.name, center: d.center, kind: '区县' })),
  { name: '淄博站', center: [118.062, 36.778], kind: '地标' },
  { name: '火车站', center: [118.062, 36.778], kind: '地标' },
  { name: '淄博北站', center: [118.058, 36.862], kind: '地标' },
  { name: '海岱楼', center: [118.032, 36.844], kind: '地标' },
  { name: '齐盛湖公园', center: [118.03, 36.842], kind: '地标' },
  { name: '人民公园', center: [118.055, 36.817], kind: '地标' },
  { name: '淄博市政府', center: [118.055, 36.813], kind: '地标' }
]

/* ---------------- 懒索引（首次查找时构建） ---------------- */
let roadIndex = null // Map: 路名 → 首段中点坐标
let poiIndex = null // [{ name, center, kind }]

const lineMid = (coords) => {
  if (!coords || !coords.length) return null
  return coords[Math.floor(coords.length / 2)]
}

function ensureRoadIndex() {
  if (roadIndex) return
  roadIndex = new Map()
  for (const f of roadData.features || []) {
    const name = (f.properties && f.properties.name || '').trim()
    if (!name || roadIndex.has(name)) continue
    const mid = lineMid(f.geometry && f.geometry.coordinates)
    if (mid) roadIndex.set(name, mid)
  }
}

const POI_CATEGORY = [
  [hospitalJson, '医院'],
  [museumJson, '博物馆'],
  [scenicSpotJson, '景点'],
  [shoppingMallJson, '商场'],
  [residentialAreaJson, '小区']
]

function ensurePoiIndex() {
  if (poiIndex) return
  poiIndex = []
  for (const [json, kind] of POI_CATEGORY) {
    for (const f of json.features || []) {
      const name = (f.properties && f.properties.name || '').trim()
      const c = f.geometry && f.geometry.coordinates
      if (name && c) poiIndex.push({ name, center: c, kind })
    }
  }
}

/* ---------------- 匹配与建议 ---------------- */
// 关键字 ↔ 名字双向包含（去掉 区/县 后缀的简写也认）
const hit = (name, kw) => {
  const short = String(kw).replace(/[区县]$/, '')
  return name.includes(kw) || kw.includes(name) || kw.includes(name.replace(/[区县]$/, '')) || name.includes(short)
}

/**
 * 精确找地点：区县地标 → 道路 → POI
 * @returns { name, center, kind, zoom } | null
 */
export function resolvePlace(kw) {
  const k = String(kw || '').trim()
  if (!k) return null
  // 1) 区县 / 地标（优先整名）：点状地标给足细节级别，区县拉开与全景的级别差，确保「飞哪都缩放过去」
  let p = PLACES.find((x) => x.name === k) || PLACES.find((x) => hit(x.name, k))
  if (p) return { ...p, zoom: p.kind === '地标' ? 15 : 12.5 }
  // 2) 道路
  ensureRoadIndex()
  const roadNames = [...roadIndex.keys()]
  const road = roadNames.find((n) => n === k) || roadNames.find((n) => n.includes(k)) || roadNames.find((n) => k.includes(n.replace(/[路大道街巷]$/, '')))
  if (road) return { name: road, center: roadIndex.get(road), kind: '道路', zoom: 15 }
  // 3) POI（医院 / 博物馆 / 景点 / 商场 / 小区）
  ensurePoiIndex()
  const poi = poiIndex.find((x) => x.name === k) || poiIndex.find((x) => x.name.includes(k))
  if (poi) return { ...poi, zoom: 15 }
  return null
}

/**
 * 本地没命中时按关键字收集候选（最多 4 个），给用户确认用
 */
export function suggestPlaces(kw) {
  const k = String(kw || '').trim()
  if (!k || k.length < 2) return []
  ensureRoadIndex()
  ensurePoiIndex()
  const out = []
  const add = (name, kind) => {
    if (out.length >= 4) return
    if (!out.some((x) => x.name === name)) out.push({ name, kind })
  }
  for (const r of roadIndex.keys()) if (r.includes(k)) add(r, '道路')
  if (out.length >= 4) return out
  for (const p of poiIndex) if (p.name.includes(k)) add(p.name, p.kind)
  if (out.length < 4) for (const p of PLACES) if (hit(p.name, k)) add(p.name, p.kind)
  return out
}

/**
 * 在线地理编码兜底（学校等本地没有的点数据；3.5s 超时）
 * @returns { center, kind } | null
 */
export async function geocodeOnline(kw) {
  const k = String(kw || '').trim()
  if (!k || !import.meta.env.VITE_MAPBOX_TOKEN) return null
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 3500)
  try {
    const r = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(k)}.json?access_token=${import.meta.env.VITE_MAPBOX_TOKEN}&limit=1&country=cn&language=zh-Hans&proximity=118.05,36.81`,
      { signal: ctl.signal }
    )
    const d = await r.json()
    const f = d.features && d.features[0]
    return f && f.center ? { center: f.center, kind: '在线地点' } : null
  } catch (e) {
    return null
  } finally {
    clearTimeout(timer)
  }
}
