// 分析 Zibo_roads.json：按 properties.type 统计段数 / 坐标点数 / 不同长度过滤后的余量
import roadData from '../src/assets/GIS_Data/Zibo_roads.json' with { type: 'json' }

const features = roadData.features
const byType = {}
for (const f of features) {
  const t = f.properties.type || '(none)'
  if (!byType[t]) byType[t] = { count: 0, pts: 0, long: 0 }
  const n = f.geometry.coordinates.length
  byType[t].count++
  byType[t].pts += n
  if (n >= 8) byType[t].long++
}
const order = Object.entries(byType).sort((a, b) => b[1].count - a[1].count)
console.log('feature 总数:', features.length)
console.log('type       段数    长段(>=8pt)  总坐标点')
for (const [t, s] of order) {
  console.log(t.padEnd(12), String(s.count).padEnd(7), String(s.long).padEnd(12), s.pts)
}
// 各分级组合的段数/长段数
const cls = {
  highway: ['motorway', 'motorway_link'],
  first: ['trunk', 'trunk_link'],
  second: ['primary', 'primary_link'],
  third: ['secondary', 'tertiary', 'secondary_link', 'tertiary_link'],
  thirdExt: ['secondary', 'tertiary', 'secondary_link', 'tertiary_link', 'residential', 'unclassified'],
}
console.log('\n--- 拟分级组合（全部 / 长段>=8pt） ---')
for (const [name, types] of Object.entries(cls)) {
  let c = 0, l = 0
  for (const f of features) {
    if (types.includes(f.properties.type)) {
      c++
      if (f.geometry.coordinates.length >= 8) l++
    }
  }
  console.log(name.padEnd(9), '段数', String(c).padEnd(6), '长段', l)
}
