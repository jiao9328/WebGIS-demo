/**
 * 淄博智慧交通 - 业务数据层（前端入口）
 *
 * 生成逻辑统一收敛在 generators.js（纯逻辑，Node/浏览器双可用）：
 * 入库脚本（scripts/gen-seed-sql.mjs）与这里共用同一套代码 + 同一种子，
 * 保证「SQL Server 里的数据」与「界面渲染/图表现有口径」完全一致。
 * 本文件仅负责：喂入本地 GIS_Data → 模块加载时预生成单例（导出名与旧版一致）。
 */
import roadData from '@/assets/GIS_Data/Zibo_roads.json'
import trafficLightPoints from '@/assets/GIS_Data/traffic_lights.json'
import { generateAllBusinessData, DISTRICTS, ZIBO_CENTER, MAIN_ROAD_TYPES } from './generators'

const d = generateAllBusinessData({ roadData, trafficLightPoints })

/* ---- 与旧版同名单例导出（各页面/Hooks 引用点不变） ---- */
export const cameras = d.cameras
export const trafficLights = d.trafficLights
export const police = d.police
export const alerts = d.alerts
export const vehicleDensity = d.vehicleDensity
export const heatPoints = d.heatPoints
export const congestion = d.congestion
export const broadcastEvents = d.broadcastEvents
export const ROAD_NAMES = d.ROAD_NAMES

/* ---- 常量原样转发 ---- */
export { DISTRICTS, ZIBO_CENTER, MAIN_ROAD_TYPES }
