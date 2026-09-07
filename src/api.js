/**
 * 数据服务 REST 客户端（Express :3001）
 *  - 开发模式：vite dev（:5173）把 /api 代理到 :3001（见 vite.config.js server.proxy）
 *  - 生产模式：Express 同源托管 dist + /api
 *
 * 服务端返回统一结构：{ ok:true, ... } / { ok:false, error:'中文原因' }
 */
import axios from 'axios'

const http = axios.create({ baseURL: '/api', timeout: 20000 })

/* 业务表（与后端 server/index.js TABLES 白名单同名同序；图层/面板共用） */
export const DB_TABLES = [
  'cameras', 'traffic_lights', 'police', 'alerts', 'events',
  'congestion', 'bus_routes', 'bus_stops', 'districts', 'heat_points'
]

export const TABLE_LABEL = {
  cameras: '监控探头', traffic_lights: '信号灯', police: '警员分布', alerts: '实时警情',
  events: '事件记录', congestion: '拥堵路段', bus_routes: '公交线路', bus_stops: '公交站点',
  districts: '区县', heat_points: '热力点（只读）'
}

export const api = {
  /** 登录校验（后端比对 dbo.users 的 scrypt 哈希；成功返回 { username, display_name }） */
  async login(username, password) {
    try {
      const d = (await http.post('/auth/login', { username, password })).data
      if (!d.ok) throw new Error(d.error)
      return d.user
    } catch (e) {
      // 无 response = 后端没起来（axios 网络层错误）；有 response 用服务端中文文案
      throw new Error(e?.response?.data?.error || '无法连接登录服务（后端未启动？请先执行 pnpm server）')
    }
  },
  /** 健康自检（后端通不通 / 库连没连上） */
  async health() {
    try { return (await http.get('/health')).data } catch (e) { throw new Error(e?.response?.data?.error || '后端服务未启动') }
  },
  /** 一次拉取全部业务表 → { 表名: 行数组 } */
  async fetchMapData() {
    try {
      const d = (await http.get('/mapdata')).data
      if (!d.ok) throw new Error(d.error)
      return d.data
    } catch (e) { throw new Error(e?.response?.data?.error || e?.message || '请求失败') }
  },
  async table(t) {
    try {
      const d = (await http.get(`/tables/${t}`)).data
      if (!d.ok) throw new Error(d.error)
      return d.rows
    } catch (e) { throw new Error(e?.response?.data?.error || e?.message || '请求失败') }
  },
  async create(t, row) {
    try {
      const d = (await http.post(`/tables/${t}`, row)).data
      if (!d.ok) throw new Error(d.error)
      return d
    } catch (e) { throw new Error(e?.response?.data?.error || e?.message || '请求失败') }
  },
  async update(t, id, row) {
    try {
      const d = (await http.put(`/tables/${t}/${id}`, row)).data
      if (!d.ok) throw new Error(d.error)
      return d
    } catch (e) { throw new Error(e?.response?.data?.error || e?.message || '请求失败') }
  },
  async remove(t, id) {
    try {
      const d = (await http.delete(`/tables/${t}/${id}`)).data
      if (!d.ok) throw new Error(d.error)
      return d
    } catch (e) { throw new Error(e?.response?.data?.error || e?.message || '请求失败') }
  }
}
