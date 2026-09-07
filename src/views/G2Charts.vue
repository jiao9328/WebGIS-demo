<template>
  <div>
    <div class="g2-left">
      <div class="g2-chart g2-chart-left">
        <div class="people-sum">淄博各区县车辆密度指数</div>
        <ColumnChart v-bind="config" :data="data" />
      </div>
      <div class="g2-chart g2-chart-left">
        <div class="people-sum">淄博各区县拥堵路段流量排行</div>
        <BarChart v-bind="busChart.bus_config" :data="busChart.bus_data" />
      </div>
    </div>
    <div class="g2-right">
      <div class="g2-chart" style="height: 35%">
        <div class="people-sum">近期警情类型分布</div>
        <PieChart v-bind="peopleChart.people_config" />
      </div>
      <div class="g2-chart" style="height: 12%">
        <div class="people-sum">道路感知设备</div>
        <div class="hospital">
          <div class="item">
            <h4>监控探头 <span class="screen-num">{{ stat.cameraTotal }}台</span></h4>
            <p class="item-sub">故障 <span class="screen-num" style="color:#ff6b6b;background:none;-webkit-text-fill-color:#ff6b6b">{{ stat.cameraFault }}</span></p>
          </div>
          <div class="item">
            <h4>信号灯 <span class="screen-num">{{ stat.lightTotal }}处</span></h4>
            <p class="item-sub">故障 <span class="screen-num" style="color:#ff6b6b;background:none;-webkit-text-fill-color:#ff6b6b">{{ stat.lightFault }}</span></p>
          </div>
        </div>
      </div>
      <div class="g2-chart" style="height: 12%">
        <div class="people-sum">警力与公交运力</div>
        <div class="hospital">
          <div class="item">
            <h4>在线警员 <span class="screen-num">{{ stat.policeOnDuty }}/{{ stat.policeTotal }}</span></h4>
            <p class="item-sub">全市部署警力</p>
          </div>
          <div class="item">
            <h4>公交运力 <span class="screen-num">{{ stat.busRoutes }}线/{{ stat.busStops }}站</span></h4>
            <p class="item-sub">高德真实线路数据</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed } from 'vue'
import { ColumnChart, BarChart, PieChart } from "@opd/g2plot-vue";
/* 出行人口 */
import { useLeftTop } from "@/Hooks/useLeftTop";
import { useLeftBottom } from "@/Hooks/useLeftBottom";
import { useRightTop } from "@/Hooks/useRightTop";
import { store } from '../store'
/* DB 未就绪时的兜底源：mock 单例与入库数据同种子同口径；JSON 为公交真实数据 */
import { cameras as mockCameras, trafficLights as mockLights, police as mockPolice } from '@/tools/mockData'
import busRoutes from '@/assets/GIS_Data/bus_routes.json'
import busStops from '@/assets/GIS_Data/bus_stops_amap.json'

// DB 就绪（后端可达且已拉取）→ 读 SQL Server；否则回退本地兜底源
const rowsOf = (name) => (store.dbStatus === 'ok' ? store.dbData[name] : undefined)

/* 车辆密度柱状图：派生计算值（人口比例），非 DB 表，保持静态 */
const { config, data } = useLeftTop();

/* 拥堵流量条形图 / 警情饼图：读 DB congestion / alerts，随增删改响应式刷新 */
const busChart = computed(() => useLeftBottom(rowsOf('congestion')));
const peopleChart = computed(() => useRightTop(rowsOf('alerts')));

// 交通设施统计卡（DB 行实时统计；故障数/在勤数按各自状态列）
const stat = computed(() => {
  const cam = rowsOf('cameras') || mockCameras
  const light = rowsOf('traffic_lights') || mockLights
  const pol = rowsOf('police') || mockPolice
  const routes = rowsOf('bus_routes') || busRoutes.features
  const stops = rowsOf('bus_stops') || busStops.features
  return {
    cameraTotal: cam.length,
    cameraFault: cam.filter((c) => c.status === 'fault').length,
    lightTotal: light.length,
    lightFault: light.filter((l) => l.state === 'fault').length,
    policeTotal: pol.length,
    policeOnDuty: pol.filter((p) => p.onDuty === true || p.on_duty === true).length,
    busRoutes: routes.length,
    busStops: stops.length
  }
})
</script>
<style>
.g2-left,
.g2-right {
  position: absolute;
  z-index: 100; /* 全局浮层：盖过页内栏（实时数据栏等），且不被路由页面遮挡 */
  width: 25vw;
  top: 160px;
  height: 75vh;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.g2-right {
  right: 60px;
}

.g2-left {
  left: 20px;
}

.g2-chart {
  border-radius: 20px;
  padding: 20px;
  width: 100%;

  background: #53697670;
  /* fallback for old browsers */
  background: -webkit-linear-gradient(to bottom, #292e494f, #53697650);
  /* Chrome 10-25, Safari 5.1-6 */
  background: linear-gradient(to bottom, #292e4968, #5369766a);
  position: relative;
  /* W3C, IE 10+/ Edge, Firefox 16+, Chrome 26+, Opera 12+, Safari 7+ */
}

.g2-chart:before {
  display: block;
  position: absolute;
  top: -5px;
  left: -2px;
  content: "";
  width: 111px;
  height: 35px;
  background-image: url("../assets/images/border.png");
  transform: rotate(180deg);
}

.g2-chart:after {
  display: block;
  position: absolute;
  bottom: -5px;
  right: -2px;
  content: "";
  width: 111px;
  height: 35px;
  background-image: url("../assets/images/border.png");
}

.g2-chart-left {
  height: 38%;
}

.hospital {
  display: flex;
  justify-content: space-evenly;
  color: #fff;
  align-items: flex-start;
  text-align: center;
}

.hospital .item {
  text-align: center;
  display: flex;
  flex-direction: column;
  /* justify-content: space-between; */
  align-items: center;
  /* flex: 1; */
  height: 80px;
}

.people-sum {
  top: -58px;
  line-height: 46px;
  color: white;
  width: 100%;
  height: 46px;
  text-align: center;
  position: absolute;
  background: url(../assets/images/chart-item.png) no-repeat;
  z-index: 1;
}


.item-sub {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(200, 220, 255, 0.75);
}
</style>
