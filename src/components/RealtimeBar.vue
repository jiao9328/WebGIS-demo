<template>
  <!-- 展开态：左上实时数据栏 -->
  <div class="rt-panel" v-show="show">
    <div class="rt-title">
      <i class="iconfont icon-supervision-full"></i>
      <span>实时数据</span>
      <span class="rt-close" title="收起实时数据栏" @click="show = false">✕</span>
    </div>
    <div class="rt-list">
      <div
        v-for="row in rows"
        :key="row.key"
        class="rt-item"
        :class="{ on: store.trafficOn[row.key] }"
        @click="toggle(row)"
      >
        <i class="iconfont" :class="row.icon"></i>
        <span class="rt-name">{{ row.label }}</span>
        <span class="rt-switch">
          <span class="rt-dot"></span>
        </span>
      </div>
    </div>
  </div>
  <!-- 收起态：仅剩一个小标签，可再点开 -->
  <div class="rt-tab" v-if="!show" title="打开实时数据栏" @click="show = true">
    <i class="iconfont icon-supervision-full"></i>
    <span>实时数据</span>
  </div>
</template>
<script setup>
import { inject, ref } from 'vue'
import { setTrafficLayerVisible } from '../tools/initTrafficLayers'

// 开态以 store.trafficOn 为唯一来源：手动点击与 AI 助手调图层都会同步点亮
const { store } = inject('$store')
const show = ref(true)

// 图层行：复用交通图层注册表（initTrafficLayers 7 类）
const rows = [
  { key: 'camera', label: '监控探头', icon: 'icon-supervision-full', dot: '#00e5ff' },
  { key: 'trafficLight', label: '信号灯', icon: 'icon-icon-test', dot: '#22c55e' },
  { key: 'police', label: '警员分布', icon: 'icon-shouye-copy', dot: '#3d7bff' },
  { key: 'congestion', label: '道路拥堵', icon: 'icon-daolu', dot: '#ff3b30' },
  { key: 'heat', label: '热力图', icon: 'icon-paint', dot: '#ff9500' },
  { key: 'busRoute', label: '公交线路', icon: 'icon-daohang', dot: '#00c2ff' },
  { key: 'busStop', label: '公交站点', icon: 'icon-shoucang', dot: '#4dd8ff' },
]

// 打开/关闭对应图层（首次打开懒建，实例保留复用）；store 镜像随后自动更新
const toggle = (row) => {
  setTrafficLayerVisible(row.key, !store.trafficOn[row.key])
}
</script>
<style scoped>
/* ===== 左上实时数据栏（原「图层显示」卡片位置，页面玻璃风格） ===== */
.rt-panel {
  position: fixed;
  left: 1%;
  top: 11%;
  z-index: 46;
  width: 168px;
  box-sizing: border-box;
  padding: 10px 12px;
  color: #fff;
  background: rgba(5, 18, 42, 0.62);
  border: 1px solid rgba(56, 148, 255, 0.3);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
}

.rt-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  letter-spacing: 2px;
  font-weight: bold;
  color: #7dd3ff;
  padding-bottom: 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid rgba(56, 148, 255, 0.25);
}

/* 右上角关闭按钮 */
.rt-close {
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
.rt-close:hover {
  background: rgba(255, 90, 90, 0.55);
  color: #fff;
}

/* 收起后的小标签（同一位置） */
.rt-tab {
  position: fixed;
  left: 1%;
  top: 11%;
  z-index: 46;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  color: #7dd3ff;
  font-size: 13px;
  letter-spacing: 2px;
  font-weight: bold;
  cursor: pointer;
  user-select: none;
  background: rgba(5, 18, 42, 0.62);
  border: 1px solid rgba(56, 148, 255, 0.3);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  transition: all 0.15s;
}
.rt-tab:hover {
  background: rgba(0, 90, 200, 0.5);
  border-color: rgba(120, 200, 255, 0.6);
  color: #fff;
}
.rt-tab .iconfont {
  font-size: 15px;
}

.rt-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rt-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 7px;
  font-size: 13px;
  color: rgba(210, 230, 255, 0.9);
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: all 0.15s;
}

.rt-item:hover {
  background: rgba(0, 120, 255, 0.18);
  color: #fff;
}

.rt-item .iconfont {
  font-size: 15px;
  color: rgba(125, 211, 255, 0.8);
}

.rt-name {
  flex: 1;
}

/* 开关指示点 */
.rt-switch {
  width: 22px;
  height: 12px;
  border-radius: 6px;
  background: rgba(120, 150, 200, 0.25);
  border: 1px solid rgba(160, 200, 255, 0.3);
  display: flex;
  align-items: center;
  padding: 1px;
  box-sizing: border-box;
}

.rt-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(150, 180, 220, 0.6);
  transition: all 0.2s;
}

/* 点亮态 */
.rt-item.on {
  background: rgba(0, 140, 255, 0.3);
  border-color: rgba(120, 200, 255, 0.6);
}

.rt-item.on .rt-name {
  color: #fff;
}

.rt-item.on .rt-switch {
  background: rgba(0, 200, 255, 0.35);
  border-color: rgba(120, 220, 255, 0.7);
  justify-content: flex-end;
}

.rt-item.on .rt-dot {
  background: #7dd3ff;
  box-shadow: 0 0 6px rgba(125, 211, 255, 0.9);
}
</style>
