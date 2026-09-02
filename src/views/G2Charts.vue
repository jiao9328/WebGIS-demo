<template>
  <div>
    <div class="g2-left">
      <div class="g2-chart g2-chart-left">
        <div class="people-sum">淄博各区县车辆密度指数</div>
        <ColumnChart v-bind="config" :data="data" />
      </div>
      <div class="g2-chart g2-chart-left">
        <div class="people-sum">淄博各区县拥堵路段流量排行</div>
        <BarChart v-bind="bus_config" :data="bus_data" />
      </div>
    </div>
    <div class="g2-right">
      <div class="g2-chart" style="height: 35%">
        <div class="people-sum">近期警情类型分布</div>
        <PieChart v-bind="people_config" />
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
import { ColumnChart, BarChart, PieChart } from "@opd/g2plot-vue";
/* 出行人口 */
import { useLeftTop } from "@/Hooks/useLeftTop";
import { useLeftBottom } from "@/Hooks/useLeftBottom";
import { useRightTop } from "@/Hooks/useRightTop";
import { cameras, trafficLights, police } from '@/tools/mockData'
import busRoutes from '@/assets/GIS_Data/bus_routes.json'
import busStops from '@/assets/GIS_Data/bus_stops_amap.json'
const { config, data } = useLeftTop();
const { bus_config, bus_data } = useLeftBottom();
const { people_config } = useRightTop();

// 交通设施统计（真实数据计算）
const stat = {
  cameraTotal: cameras.length,
  cameraFault: cameras.filter((c) => c.status === 'fault').length,
  lightTotal: trafficLights.length,
  lightFault: trafficLights.filter((l) => l.state === 'fault').length,
  policeTotal: police.length,
  policeOnDuty: police.filter((p) => p.onDuty).length,
  busRoutes: busRoutes.features.length,
  busStops: busStops.features.length
}
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

/* 统计卡说明小字 */
.item-sub {
  margin-top: 6px;
  font-size: 11px;
  color: rgba(200, 220, 255, 0.75);
}
</style>
