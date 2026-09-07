<template>
  <!-- 左下角动态车辆迷你面板：随「动态车辆」图层开关同开同关（store.trafficOn.vehicle 唯一镜像） -->
  <div class="vp-panel" v-show="store.trafficOn.vehicle">
    <div class="vp-title">
      <span class="vp-car">🚗</span>
      <span>动态车辆·信号灯联动</span>
      <span class="vp-close" title="关闭面板并隐藏车辆图层" @click="turnOff">✕</span>
    </div>
    <div class="vp-stat">
      <span>行驶 <b class="ok">{{ stats.running }}</b></span>
      <span>红灯停 <b class="warn">{{ stats.waiting }}</b></span>
      <span>拥堵缓行 <b class="warn">{{ stats.onCongested }}</b></span>
      <span>均速 <b>{{ stats.avgSpeed }}</b> km/h</span>
    </div>
    <div class="vp-list">
      <div v-for="v in vehicles" :key="v.plate" class="vp-row">
        <span class="vp-dot" :class="v.state" :title="v.state === 'waiting' ? '红灯等待中' : '行驶中'"></span>
        <span class="vp-plate">{{ v.plate }}</span>
        <span class="vp-road" :title="v.road">{{ v.road }}</span>
        <span class="vp-light" :class="v.lightColor"
          :title="v.lightColor === 'none' ? '前方无信号灯' : `前方${lightName[v.lightColor]}（模拟相位，距 ${v.lightDist} m）`">
          {{ v.lightColor === 'none' ? '·' : '◉' }}
        </span>
        <span class="vp-speed"><b>{{ kmh(v) }}</b> km/h</span>
      </div>
    </div>
  </div>
</template>
<script setup>
import { computed, inject } from 'vue'
import { setTrafficLayerVisible } from '../tools/initTrafficLayers'
import { vehicles } from '../tools/vehicleSim'

const { store } = inject('$store')
const stats = computed(() => store.vehicleStats)
const kmh = (v) => Math.round(v.speed * 3.6)
const lightName = { green: '绿灯', yellow: '黄灯', red: '红灯' }
const turnOff = () => setTrafficLayerVisible('vehicle', false)
</script>
<style scoped>
/* 玻璃风格与实时数据栏一致（见 RealtimeBar.vue），左下角让开底部按钮条（bottom:16px 高 ~66px） */
.vp-panel {
  position: fixed;
  left: 1%;
  bottom: 92px;
  z-index: 45; /* 低于底部工具条(90)与控制中心(100)，避免遮挡核心操作 */
  width: 320px;
  box-sizing: border-box;
  padding: 10px 12px;
  color: #fff;
  background: rgba(5, 18, 42, 0.68);
  border: 1px solid rgba(56, 148, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}

.vp-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  letter-spacing: 1px;
  font-weight: bold;
  color: #7dd3ff;
  padding-bottom: 8px;
  margin-bottom: 4px;
  border-bottom: 1px solid rgba(56, 148, 255, 0.25);
}

.vp-car {
  font-size: 15px;
}

.vp-close {
  margin-left: auto;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: normal;
  letter-spacing: 0;
  color: rgba(200, 225, 255, 0.8);
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition: all 0.15s;
}
.vp-close:hover {
  background: rgba(255, 90, 90, 0.55);
  color: #fff;
}

/* 汇总行 */
.vp-stat {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: rgba(180, 205, 240, 0.85);
  padding: 6px 2px 8px;
  gap: 4px;
  flex-wrap: wrap;
}
.vp-stat b {
  font-weight: normal;
  color: #9fe3ff;
}
.vp-stat b.ok { color: #22c55e; }
.vp-stat b.warn { color: #ff6b6b; }

/* 车辆列表 */
.vp-list {
  max-height: 296px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-right: -4px;
  padding-right: 4px;
}
.vp-list::-webkit-scrollbar {
  width: 4px;
}
.vp-list::-webkit-scrollbar-thumb {
  background: rgba(125, 211, 255, 0.35);
  border-radius: 2px;
}

.vp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 12px;
  color: rgba(210, 230, 255, 0.92);
  background: rgba(255, 255, 255, 0.03);
}
.vp-row:hover {
  background: rgba(0, 120, 255, 0.15);
}

.vp-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex: none;
}
.vp-dot.running { background: #22c55e; box-shadow: 0 0 4px rgba(34, 197, 94, 0.8); }
.vp-dot.waiting { background: #ff3b30; box-shadow: 0 0 4px rgba(255, 59, 48, 0.9); }

.vp-plate {
  color: #fff;
  letter-spacing: 0.5px;
  flex: none;
}

.vp-road {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: rgba(180, 205, 240, 0.75);
}

/* 前方信号灯模拟相位徽标 */
.vp-light {
  flex: none;
  font-size: 9px;
  width: 12px;
  text-align: center;
}
.vp-light.green { color: #22c55e; }
.vp-light.yellow { color: #ffd60a; }
.vp-light.red { color: #ff3b30; text-shadow: 0 0 5px rgba(255, 59, 48, 0.7); }
.vp-light.none { color: rgba(160, 190, 230, 0.4); }

.vp-speed {
  flex: none;
  font-size: 11px;
  color: rgba(180, 205, 240, 0.85);
  min-width: 62px;
  text-align: right;
}
.vp-speed b {
  color: #7dd3ff;
  font-weight: normal;
  font-size: 13px;
}
</style>
