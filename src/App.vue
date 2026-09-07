<template>
  <div id="map"></div>
  <Header></Header>
  <RoadClassBar v-if="loadMap"></RoadClassBar>
  <RealtimeBar v-if="loadMap"></RealtimeBar>
  <BottomTools v-if="loadMap"></BottomTools>
  <!-- AI 助手：右下角悬浮按钮 + 对话框（全局浮层，跨路由可用） -->
  <AIAssistant v-if="loadMap"></AIAssistant>
  <RouterView></RouterView>
  <!-- 控制中心浮层：全局开关（再点控制中心才关闭），路由切换不消失 -->
  <G2Charts v-if="store.chartsOpen"></G2Charts>
  <!-- 数据管理面板：底部「数据管理」开关，增删改查 SQL Server 业务表 -->
  <DataManage v-if="store.dataPanelOpen"></DataManage>
</template>
<script setup>
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { onMounted, provide, reactive, ref } from "vue";
import { useRouter } from 'vue-router';
import { Scene } from "@antv/l7";
import { Mapbox } from "@antv/l7-maps";
import { RouterView } from 'vue-router'
import initControl from './tools/initControl'
import initLayer from './tools/initLayer'
import { initTrafficLayers, refreshVisibleTrafficLayers } from './tools/initTrafficLayers'
import { initRoadClassLayers } from './tools/roadClassLayers'
import Header from './components/Header.vue'
import RoadClassBar from './components/RoadClassBar.vue'
import RealtimeBar from './components/RealtimeBar.vue'
import BottomTools from './components/BottomTools.vue'
import AIAssistant from './components/AIAssistant.vue'
import G2Charts from './views/G2Charts.vue'
import DataManage from './components/DataManage.vue'
import { store, injectStore } from './store'
import { api as dbApi } from './api'
import { fetchWeather } from './tools/weather'
import { speak } from './tools/speech'
import { ElMessage } from 'element-plus'
const loadMap = ref(false);
const router = useRouter();

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
  // 坑：基础图层（道路流线/城市建筑）必须等 style 加载完成再 addLayer。
  // L7 在 style 未就绪时抢先建图层会撞 mapbox「Style is not done loading」，
  // 偶发打断样式加载（地图卡加载、导航/飞行全部失效），故统一推迟到 map load 后。
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
  // 等 style 真正加载完再建基础图层/挂载 UI（慢网时可能数秒）
  const boot = () => {
    initControl(scene, map)
    initLayer(scene)
    initTrafficLayers(scene)
    initRoadClassLayers(scene)
    loadMap.value = true
    // 响应式容器赋值（子组件 mounted 时注入的引用同步生效）
    sceneMap.scene = scene
    sceneMap.map = map
    if (import.meta.env.DEV) {
      // 调试桥仅开发环境暴露（供 CDP 验证脚本断言）
      window.__scene = scene
      window.__map = map
    }
  }
  if (map.loaded()) boot()
  else map.once('load', boot)
};

// 启动时拉取 SQL Server 业务数据（后端未启动/库未入库都不阻塞地图：
// 图层/图表在 DB 就绪前回退本地同源兜底数据，拉取成功后重建刷新）
const loadDbData = async () => {
  store.dbStatus = 'loading'
  try {
    const data = await dbApi.fetchMapData()
    for (const t of Object.keys(store.dbData)) {
      if (Array.isArray(data[t])) store.dbData[t] = data[t]
    }
    store.dbStatus = 'ok'
    // 拉取时若某些图层已开启，用库中数据重建
    refreshVisibleTrafficLayers()
  } catch (e) {
    store.dbStatus = 'fail'
    store.dbError = e.message || '后端数据服务不可用'
    console.warn('[db] 后端未连接，使用本地演示数据：', store.dbError)
    ElMessage.warning('未连接数据库服务（' + store.dbError + '）：已使用内置演示数据，可在底部「数据管理」查看/重试')
  }
}

onMounted(async () => {
  // 登录页阶段不播开场语音（初始导航可能尚未 resolve，先等路由就绪再判路径）
  await router.isReady()
  const isLogin = router.currentRoute.value.path === '/login'
  initMap();
  // SQL Server 业务数据全量拉取（不阻塞地图加载，失败自动回退演示数据）
  loadDbData();
  // 天气（真实抓取，失败自动回退占位数据）
  store.weather = await fetchWeather()
  // 开场播报（登录成功后的欢迎语音在 Login.vue 里播，此处仅进入主页后播）
  if (!isLogin) speak('淄博智慧交通管理系统已就绪，实时监控全市道路运行状态')
});
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
