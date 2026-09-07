/**
 * 全局状态（Vue reactive 单例，供所有面板共享）
 * 通过 provide/inject 注入：$store
 */
import { reactive } from 'vue'

/* ================= 登录态（localStorage 持久化，只存用户名/显示名，绝不存密码） ================= */
const AUTH_KEY = 'zb_auth_user'

/** 同步读取当前登录用户（守卫/Header 用）；localStorage 损坏时容错返回 null */
export function getAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? JSON.parse(raw) : null
  } catch (e) {
    return null
  }
}
/** 登录成功：写响应式 store + localStorage */
export function setAuthUser(user) {
  store.user = user
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
}
/** 退出登录：清 store + localStorage */
export function clearAuthUser() {
  store.user = null
  localStorage.removeItem(AUTH_KEY)
}

export const store = reactive({
  /* ---- 当前登录用户（{ username, display_name } | null），刷新后从 localStorage 恢复 ---- */
  user: getAuthUser(),

  /* ---- 控制中心浮层（底部按钮开关，点其它按钮不关闭） ---- */
  chartsOpen: false,

  /* ---- 数据管理面板（底部「数据管理」按钮开关，浮层不随路由消失） ---- */
  dataPanelOpen: false,

  /* ---- SQL Server 业务数据（后端 /api/mapdata 全量拉取后填充） ----
   * dbStatus: idle(未拉取) | loading | ok | fail(含 dbError 原因)
   * dbData：表名 → 行数组，图层工厂 / 控制中心 / 事件检索实时读取 */
  dbStatus: 'idle',
  dbError: '',
  dbData: {
    districts: [],
    cameras: [],
    traffic_lights: [],
    police: [],
    alerts: [],
    events: [],
    congestion: [],
    heat_points: [],
    bus_routes: [],
    bus_stops: []
  },

  /* ---- 道路分级栏当前选中（null=总道路） ---- */
  roadClass: null, // highway | first | second | third

  /* ---- 7 类交通图层开态镜像（实时数据栏 UI 与 AI 助手共用） ---- */
  trafficOn: {
    camera: false,
    trafficLight: false,
    police: false,
    congestion: false,
    heat: false,
    busRoute: false,
    busStop: false
  },

  /* ---- 天气（App 挂载时真实抓取） ---- */
  weather: {
    city: '淄博市',
    weather: '—',
    temperature: '—',
    humidity: '—',
    windDirection: '—',
    windPower: '—',
    reportTime: '—'
  }
})

export const injectStore = { store }
