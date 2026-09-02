<template>
  <div class="road-bar">
    <!-- 总道路：显示全路网（基础图层），其余：只显示对应等级 -->
    <div
      v-for="b in buttons"
      :key="b.key"
      class="road-btn"
      :class="{ on: active === b.key }"
      @click="pick(b.key)"
    >
      {{ b.label }}
    </div>
  </div>
</template>
<script setup>
import { computed, inject } from 'vue'
import { selectRoadClass } from '../tools/roadClassLayers'

const { store } = inject('$store')

// 'total' = 总道路；其余与 roadClassLayers.CLASSES 一一对应
const buttons = [
  { key: 'total', label: '总道路' },
  { key: 'highway', label: '高速公路' },
  { key: 'first', label: '一级道路' },
  { key: 'second', label: '二级道路' },
  { key: 'third', label: '三级道路' },
]
const active = computed(() => store.roadClass || 'total')

const pick = (key) => {
  // 重复点当前等级 = 回到总道路
  const next = active.value === key && key !== 'total' ? 'total' : key
  store.roadClass = next === 'total' ? null : next
  selectRoadClass(next === 'total' ? null : next)
}
</script>
<style scoped>
/* ===== 顶部道路分级栏：透明玻璃条 + 5 个圆角矩形按钮（参考图：深蓝底/选中青绿高亮） ===== */
.road-bar {
  position: fixed;
  top: 76px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 45;
  display: flex;
  align-items: center;
  width: 33.33vw; /* 占页面 1/3 */
  height: 66px; /* 与底部功能栏同高（实测 footer 66px） */
  box-sizing: border-box;
  padding: 7px 12px;
  background: rgba(5, 18, 42, 0.62);
  border: 1px solid rgba(56, 148, 255, 0.3);
  border-radius: 14px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(6px);
  gap: 8px;
}

.road-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  border-radius: 9px;
  font-size: 14px;
  letter-spacing: 2px;
  color: #bfe0ff;
  background: rgba(10, 27, 63, 0.85);
  border: 1px solid rgba(56, 148, 255, 0.28);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: all 0.15s;
}

.road-btn:hover {
  color: #fff;
  border-color: rgba(0, 200, 184, 0.6);
  box-shadow: 0 0 8px rgba(0, 200, 184, 0.25);
}

/* 选中态：青绿高亮（参考图 #00C8B8） */
.road-btn.on {
  color: #fff;
  background: rgba(0, 200, 184, 0.9);
  border-color: #00d9c9;
  box-shadow: 0 0 12px rgba(0, 200, 184, 0.55);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}
</style>
