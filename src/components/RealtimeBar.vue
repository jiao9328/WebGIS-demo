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
        <i v-if="row.icon" class="iconfont" :class="row.icon"></i>
        <!-- 动态车辆没有对应的 iconfont 字形，原来用 🚗 emoji 占位（彩色位图、无法着色） -->
        <CarIcon v-else class="rt-car" />
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
import CarIcon from './CarIcon.vue'

// 开态以 store.trafficOn 为唯一来源：手动点击与 AI 助手调图层都会同步点亮
const { store } = inject('$store')
const show = ref(true)

// 图层行：复用交通图层注册表（initTrafficLayers 7 类 L7 图层）+ 前端动态车辆模拟层（emoji 无 iconfont 字形）
const rows = [
  { key: 'camera', label: '监控探头', icon: 'icon-supervision-full' },
  { key: 'trafficLight', label: '信号灯', icon: 'icon-icon-test' },
  { key: 'police', label: '警员分布', icon: 'icon-shouye-copy' },
  { key: 'congestion', label: '道路拥堵', icon: 'icon-daolu' },
  { key: 'heat', label: '热力图', icon: 'icon-paint' },
  { key: 'busRoute', label: '公交线路', icon: 'icon-daohang' },
  { key: 'busStop', label: '公交站点', icon: 'icon-shoucang' },
  { key: 'vehicle', label: '动态车辆' }, // 该行图标由模板里的 <CarIcon> 渲染
]

// 打开/关闭对应图层（首次打开懒建，实例保留复用）；store 镜像随后自动更新
const toggle = (row) => {
  setTrafficLayerVisible(row.key, !store.trafficOn[row.key])
}
</script>
<style scoped>
/* ===== 左上实时数据栏：白卡片（原为藏青玻璃） ===== */
.rt-panel {
  position: fixed;
  /* 位置与宽度走公共 token：左上角其它浮层按 --rt-clear 避让，从这里改一处全局跟着变 */
  left: var(--rt-x);
  top: var(--rt-top);
  z-index: var(--z-panel);
  width: var(--rt-w);
  box-sizing: border-box;
  padding: 10px 12px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
}

.rt-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  padding-bottom: 8px;
  margin-bottom: 6px;
  border-bottom: 1px solid var(--border);
}
.rt-title .iconfont {
  color: var(--primary);
}

/* 右上角关闭按钮：与全站 .ui-close 同一套观感 */
.rt-close {
  margin-left: auto;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: normal;
  color: var(--text-mute);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.rt-close:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

/* 收起后的小标签（同一位置） */
.rt-tab {
  position: fixed;
  left: var(--rt-x);
  top: var(--rt-top);
  z-index: var(--z-panel);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 9px 13px;
  color: var(--text);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  transition: border-color 0.15s, color 0.15s;
}
.rt-tab:hover {
  border-color: var(--primary);
  color: var(--primary);
}
.rt-tab .iconfont {
  font-size: 15px;
  color: var(--primary);
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
  border-radius: var(--radius-sm);
  font-size: 13px;
  color: var(--text-sub);
  cursor: pointer;
  user-select: none;
  border: 1px solid transparent;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}

.rt-item:hover {
  background: var(--bg-hover);
  color: var(--text);
}

.rt-item .iconfont {
  font-size: 15px;
  color: var(--text-mute);
}

/* 动态车辆行的图标（无 iconfont 字形，用 CarIcon 组件） */
.rt-item .rt-car {
  width: 15px;
  height: 15px;
  color: var(--text-mute);
  transition: color 0.15s;
}

.rt-name {
  flex: 1;
}

/* iOS 风格开关：灰底滑块 → 点亮时蓝底滑块右移 */
.rt-switch {
  flex: none;
  width: 26px;
  height: 14px;
  border-radius: 7px;
  background: var(--border-strong);
  display: flex;
  align-items: center;
  padding: 2px;
  box-sizing: border-box;
  transition: background 0.2s;
}

.rt-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 24, 40, 0.25);
  transition: transform 0.2s;
}

/* 点亮态 */
.rt-item.on {
  background: var(--primary-soft);
  border-color: var(--primary);
}

.rt-item.on .rt-name {
  color: var(--primary);
  font-weight: 600;
}

.rt-item.on .iconfont,
.rt-item.on .rt-car {
  color: var(--primary);
}

.rt-item.on .rt-switch {
  background: var(--primary);
}

.rt-item.on .rt-dot {
  transform: translateX(12px);
}
</style>
