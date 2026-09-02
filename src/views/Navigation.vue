<template>
    <div></div>
</template>
<script setup>
import { onMounted, inject, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
const route = useRoute()
let map, directionControl, ready = false, pollTimer = null

// 由路由 query 规划路线：起终点按地名交给导航控件内部解析
// （与手动在导航面板输入起终点同一套流程：自动定位到该地并填入输入框，随后控件自动缩放至整条线路）
const plan = () => {
    const to = String(route.query.to || '').trim()
    if (!to || !directionControl || !ready) return
    try { directionControl.setOrigin(String(route.query.from || '淄博站').trim()) } catch (e) { /* 起点解析失败不阻塞 */ }
    try { directionControl.setDestination(to) } catch (e) { /* 终点解析失败不阻塞 */ }
}

// 地图就绪且插件 directions 数据源已建好后才允许规划：
// 路线请求若早于数据源创建，插件会静默跳过画线（source 永远为空）
const mapSettled = () => !!map && !!map.loaded && map.loaded() && !!map.getSource && !!map.getSource('directions')
const tryPlan = () => { if (mapSettled()) { ready = true; plan() } }

onMounted(() => {
    map = inject("$scene_map").map
    directionControl = new MapboxDirections({
        accessToken: import.meta.env.VITE_MAPBOX_TOKEN,
        // 导航指令用中文；geocoder 命名空间会原样拼进地理编码请求参数，
        // 让起终点解析结果显示中文地名（否则默认英文 "Boshan Qu, Zibo Shi, ..."）
        language: 'zh-Hans',
        unit: 'metric',
        geocoder: {
            language: 'zh-Hans',
            country: 'cn',
            proximity: [118.05, 36.81]
        }
    })
    map.addControl(directionControl)
    map.on('load', tryPlan)
    pollTimer = setInterval(tryPlan, 300)
    setTimeout(() => { clearInterval(pollTimer); pollTimer = null }, 20000)
})
// 同路由下 query 变化（AI 换起终点）再规划一次
watch(() => [route.query.from, route.query.to], () => { if (mapSettled()) plan() })

onUnmounted(() => {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
    if (directionControl && map) {
        map.removeControl(directionControl)
        map.off('load', tryPlan)
    }
})
</script>
<style>
</style>
