/**
 * 全局状态（Vue reactive 单例，供所有面板共享）
 * 通过 provide/inject 注入：$store
 */
import { reactive } from 'vue'

export const store = reactive({
  /* ---- 控制中心浮层（底部按钮开关，点其它按钮不关闭） ---- */
  chartsOpen: false,

  /* ---- 道路分级栏当前选中（null=总道路） ---- */
  roadClass: null, // highway | first | second | third

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
