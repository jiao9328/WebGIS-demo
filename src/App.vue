<template>
  <div id="map"></div>
  <Header></Header>
  <EventWarning />
  <BottomTools v-if="loadMap"></BottomTools>
  <RouterView></RouterView>
</template>
<script setup>
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { onMounted, onUnmounted, provide, reactive, ref } from "vue";
import { Scene } from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";
import { RouterView } from 'vue-router'
import initControl from './tools/initControl'
import initLayer from './tools/initLayer'
import { initTrafficLayers } from './tools/initTrafficLayers'
import Header from './components/Header.vue'
import EventWarning from './components/EventWarning.vue'
import BottomTools from './components/BottomTools.vue'
import { store, startTicker, injectStore } from './store'
import { fetchWeather } from './tools/weather'
import { speak } from './tools/speech'
import { DISTRICTS, ROAD_NAMES } from './tools/mockData'
const loadMap = ref(false);

// 坑1修复：setup 同步 provide 响应式容器（Vue3 子组件 onMounted 先于父组件执行，
// 子组件在 mounted 里 inject 的是容器引用，等 initMap 完成后赋值即拿到实例）
const sceneMap = reactive({ scene: null, map: null });
provide('$scene_map', sceneMap);
provide('$store', injectStore);

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

const initMap = () => {
  const map = new mapboxgl.Map({
    container: "map",
    style: "mapbox://styles/mapbox/streets-v12", //地图风格
    center: [118.05, 36.81], //地图中心坐标
    zoom: 9.5, //缩放比例
  });

  // 汉化
  map.addControl(new MapboxLanguage({
    defaultLanguage: 'zh-Hans' // 设置默认语⾔
  }))

  const scene = new Scene({
    id: "map",
    map: new Mapbox({
      mapInstance: map,
    }),
  });
  map.on("style.load", () => {
    map.setFog({});
    // 消除边界
    map.setFilter("admin-0-boundary-disputed", [
      "all",
      ["==", ["get", "disputed"], "true"],
      ["==", ["get", "admin_level"], 0],
      ["==", ["get", "maritime"], "false"],
      ["match", ["get", "worldview"], ["all", "CN"], true, false],
    ]);
    map.setFilter("admin-0-boundary", [
      "all",
      ["==", ["get", "admin_level"], 0],
      ["==", ["get", "disputed"], "false"],
      ["==", ["get", "maritime"], "false"],
      ["match", ["get", "worldview"], ["all", "CN"], true, false],
    ]);
    map.setFilter("admin-0-boundary-bg", [
      "all",
      ["==", ["get", "admin_level"], 0],
      ["==", ["get", "maritime"], "false"],
      ["match", ["get", "worldview"], ["all", "CN"], true, false],
    ]);
  });
  initControl(scene, map)
  initLayer(scene)
  initTrafficLayers(scene)
  loadMap.value = true
  // 响应式容器赋值（子组件 mounted 时注入的引用同步生效）
  sceneMap.scene = scene
  sceneMap.map = map
  if (import.meta.env.DEV) {
    // 调试桥仅开发环境暴露（供 CDP 验证脚本断言）
    window.__scene = scene
    window.__map = map
  }
};

// 定时模拟新事件 → 语音播报 + 事件警告（v1 App.vue 移植）
const EVENT_TYPES = [
  ['交通事故', '发生一起追尾事故，请过往车辆减速慢行'],
  ['交通管制', '实施临时交通管制，请提前绕行'],
  ['设备故障', '监测到道路监控设备故障，已派单处置'],
  ['道路施工', '道路施工占道，请注意避让']
]
let eventTimer = null

onMounted(async () => {
  initMap();
  startTicker()
  // 天气（真实抓取，失败自动回退占位数据）
  store.weather = await fetchWeather()
  // 开场播报
  speak('淄博智慧交通管理系统已就绪，实时监控全市道路运行状态')

  // 定时器：每 45s 随机一条新警情
  eventTimer = setInterval(() => {
    const i = Math.floor(Math.random() * EVENT_TYPES.length)
    const d = DISTRICTS[Math.floor(Math.random() * DISTRICTS.length)]
    // 事件路名取自真实 OSM 路网（Zibo_roads.json 带名称的主干道）
    const road = ROAD_NAMES[Math.floor(Math.random() * ROAD_NAMES.length)]
    const ev = {
      id: 'EV' + Date.now(),
      type: ['事故', '管制', '故障', '施工'][i],
      title: `${EVENT_TYPES[i][0]}｜${d.name}${road}路段`,
      desc: EVENT_TYPES[i][1],
      time: new Date(),
      read: false
    }
    store.events.unshift(ev)
    store.unreadCount = store.events.filter((e) => !e.read).length
    speak(`请注意！${d.name}${road}路段${EVENT_TYPES[i][1]}`)
  }, 45000)
});

onUnmounted(() => {
  if (eventTimer) clearInterval(eventTimer)
  eventTimer = null
})
</script>
<style>
#map {
  width: 100vw;
  height: 100vh;
  position: absolute;
  left: 0;
  top: 0;
}

.mapboxgl-ctrl-attrib-inner {
  display: none;
}

.mapboxgl-popup .mapboxgl-popup-content {
  background: rgba(255, 255, 255, 0.3) !important;
  color: rgb(255, 255, 255) !important;
  padding: 30px !important;
  border-radius: 0px !important;
  /* box-shadow: 0 0 10px 2px #003399 !important; */
}

.mapboxgl-popup {
  background: url("assets/images/frame3.png") no-repeat !important;
  background-size: cover !important;
  background-position: center center !important;
}

.mapboxgl-popup-content__panel {
  font-size: 12px !important;
}

.mapboxgl-popup svg {
  display: none !important;
}

.mapboxgl-ctrl-directions {
  position: fixed;
  top: 10%;
  left: 1%;
}
</style>
