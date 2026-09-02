<template>
  <div class="home-wrap"></div>
</template>
<script setup>
// 首页：纯净地图 + 顶部标题 + 底部工具条。
// 等地图就绪后飞到淄博全景，打开道路/建筑基础图层。
import { inject, onMounted, watch } from 'vue'

const sm = inject('$scene_map')

onMounted(() => {
  const go = () => {
    const map = sm.map
    const scene = sm.scene
    if (!map || !scene) return false
    map.flyTo({
      center: [118.05, 36.81],
      zoom: 9.5,
      pitch: 0,
      duration: 2000
    })
    // 基础图层（道路流线 + 城市建筑）显示
    const road = scene.getLayerByName('淄博道路')
    const building = scene.getLayerByName('淄博市')
    if (road) road.show()
    if (building) building.show()
    return true
  }
  // 容器已就绪直接飞，否则等 reactive 赋值
  if (!go()) {
    const stop = watch(sm, () => {
      if (go()) stop()
    })
  }
})
</script>
