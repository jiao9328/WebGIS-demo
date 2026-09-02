<style scoped>
.box-card {
    position: absolute;
    left: 1%;
    top: 11%;
    z-index: 999;
    width: auto;
    height: 20px;
    line-height: 20px;
    padding: 6px 25px;
    color: white;
    border-radius: 10px;
    border: 1.2px solid rgba(255, 255, 255);
    background-color: rgba(91, 107, 246, 0.4);
}

/* 图层切换提示条（当前显示的图层名 + 说明） */
.layer-tip {
    position: absolute;
    left: 1%;
    top: calc(11% + 42px);
    z-index: 999;
    font-size: 12px;
    color: #cfe3ff;
    padding: 4px 12px;
    border-radius: 8px;
    border: 1px solid rgba(56, 148, 255, 0.35);
    background: rgba(8, 28, 56, 0.8);
}

</style>
<template>
    <div class="box-card">{{ title }}</div>
    <div class="layer-tip">{{ tip }}</div>
</template>
<script setup>
import { onMounted, inject, onUnmounted, ref, watch } from "vue";
import { useRoute, onBeforeRouteUpdate } from "vue-router";
import { setTrafficLayerVisible } from '@/tools/initTrafficLayers'

let type;
let title = ref('')
let tip = ref('')

// 7 类交通图层：名称 → 标题/说明
const LAYER_META = {
    camera:       { title: '监控探头分布', tip: '220 个道路监控点 · 青色正常 / 红色故障，点击查看详情' },
    trafficLight: { title: '信号灯分布',   tip: '231 个交通信号灯 · 绿/红/黄/灰四色状态，点击查看详情' },
    police:       { title: '警员分布',     tip: '60 名执勤警员 · 蓝色圆点，点击查看警号与位置' },
    busRoute:     { title: '公交线路',     tip: '50 条公交线路 · 按线路主题色绘制' },
    congestion:   { title: '道路拥堵',     tip: '22 条拥堵路段 · 红=严重 橙=中度 黄=轻度' },
    heat:         { title: '交通热力图',   tip: '车辆密度热力 · 蓝→绿→黄→红 由疏到密' },
    busStop:      { title: '公交站点',     tip: '225 个公交站点 · 青色圆点，点击查看站名' }
}

/** 只显示当前类型，其余交通图层全部隐藏 */
const showOnly = (t) => {
    for (const n of Object.keys(LAYER_META)) {
        setTrafficLayerVisible(n, n === t)
    }
}

const updateTitle = (t) => {
    const meta = LAYER_META[t]
    title.value = meta ? meta.title : '图层显示'
    tip.value = meta ? meta.tip : ''
}

onMounted(() => {
    const route = useRoute();
    type = route.params.type;
    updateTitle(type)
    const sm = inject("$scene_map");
    const go = () => {
        const map = sm.map
        if (!map) return false
        map.flyTo({
            center: [118.05, 36.81],
            zoom: 10,
            pitch: 0,
        })
        showOnly(type)
        return true
    }
    // 等地图就绪（reactive 容器赋值后）再执行
    if (!go()) {
        const stop = watch(sm, () => { if (go()) stop() })
    }
});

onBeforeRouteUpdate((to) => {
    type = to.params.type;
    updateTitle(type)
    showOnly(type)
});

onUnmounted(() => {
    // 离开页面时收起全部交通图层（实例保留复用）
    for (const n of Object.keys(LAYER_META)) {
        setTrafficLayerVisible(n, false)
    }
});
</script>
