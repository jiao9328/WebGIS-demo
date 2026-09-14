<template>
  <!-- 交通图层的单色小图标：与地图上的徽章**同源**（同一份图形数据，见 tools/trafficIcons.js），
       所以「面板图标 = 地图符号」不会再对不上（原来是信号灯画飞机、警员画房子）。
       fill 取 currentColor，尺寸/颜色由使用处的 CSS 决定（写法照抄 CarIcon.vue）。
       scale 把墨迹放大到 64 框的 ~90%：徽章里的图形要给外壳留位置，直接当面板图标会又小又飘。 -->
  <svg class="traffic-glyph" viewBox="0 0 64 64" aria-hidden="true">
    <g :transform="`translate(32 32) scale(${glyph.scale}) translate(-32 -32)`">
      <path :d="glyph.d" fill="currentColor" />
    </g>
  </svg>
</template>

<script setup>
import { computed } from 'vue'
import { TRAFFIC_GLYPHS } from '../tools/trafficIcons'

const props = defineProps({
  // 四类点位图层名（与 initTrafficLayers 的注册表键一致）：camera / trafficLight / police / busStop
  name: { type: String, required: true }
})
const glyph = computed(() => TRAFFIC_GLYPHS[props.name] || TRAFFIC_GLYPHS.camera)
</script>

<style scoped>
.traffic-glyph {
  display: block;
  width: 100%;
  height: 100%;
  fill: currentColor;
}
</style>
