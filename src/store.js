/**
 * 全局状态（Vue reactive 单例，供所有面板共享）
 * 通过 provide/inject 注入：$store
 */
import { reactive } from 'vue'
import { cameras, trafficLights, police, alerts, congestion, DISTRICTS, vehicleDensity, broadcastEvents } from './tools/mockData'

export const store = reactive({
  viewer: null,

  /* ---- 顶部：道路类型 ---- */
  roadType: 'traffic', // traffic | rail | bus

  /* ---- 顶部：智能操作界面 ---- */
  smartOpen: false,

  /* ---- 左侧：交通情况 ---- */
  congestionVisible: false,
  selectedCongestion: null,
  heatDistrict: null, // 当前热力钻取的区县

  /* ---- 左下角：业务面板 ---- */
  bottomTab: 'police', // police | camera | fault | signal
  policeExpanded: false, // 是否展开警员分布

  /* ---- 右上角 ---- */
  availablePolice: 26,
  pendingEvents: 8,

  /* ---- 右下角：天气 ---- */
  weather: {
    city: '淄博市',
    weather: '—',
    temperature: '—',
    humidity: '—',
    windDirection: '—',
    windPower: '—',
    reportTime: '—'
  },

  /* ---- 事件警告 ---- */
  events: broadcastEvents,
  warningVisible: false, // 默认收起（右下角小铃铛）
  unreadCount: broadcastEvents.filter((e) => !e.read).length,

  /* ---- 图表 ---- */
  charts: []
})

/** 定时刷新"实时"字段（警情数、待处理事件、可调度警力） */
export function startTicker() {
  setInterval(() => {
    store.pendingEvents = 6 + Math.round(Math.random() * 8)
    store.availablePolice = 22 + Math.round(Math.random() * 10)
  }, 5000)
}

export const injectStore = { store }
