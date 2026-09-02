<template>
  <div class="footer">
    <div class="btn-groups">
      <RouterLink to="/" @click="reset()">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-shouye-copy"></i>
          </button>
          <p>首页</p>
        </div>
      </RouterLink>
      <RouterLink to="/rotation">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-fuwudiqiu"></i>
          </button>
          <p>地球自转</p>
        </div>
      </RouterLink>
      <RouterLink to="/g2charts">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-supervision-full"></i>
          </button>
          <p>控制中心</p>
        </div>
      </RouterLink>
      <RouterLink to="/cityview">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-icon-test"></i>
          </button>
          <p>城市视角</p>
        </div>
      </RouterLink>
      <el-popover placement="top" :width="100" trigger="click" popper-style="background-color: #53697670;color:#fff">
        <template #reference>
          <div class="item">
            <button class="toggle-btn">
              <i class="iconfont icon-ruler"></i>
            </button>
            <p>地图测量</p>
          </div>
        </template>
        <div class="popover-w">
          <RouterLink v-for="(item, index) in tools" :key="index" :to='"/mapdraw/" + item'
             style="display: flex;justify-content: center;align-items: center;flex-direction: column;">
            <i :class="computeClass(item)"></i>
            <p style="font-size: 5px;">{{ toolName[index] }}</p>
          </RouterLink>
        </div>
      </el-popover>
      <el-popover placement="top" :width="100" trigger="click" popper-style="background-color: #53697670;color:#fff;width:auto" >
        <template #reference>
          <div class="item">
            <button class="toggle-btn">
              <i class="iconfont icon-layers"></i>
            </button>
            <p>图层显示</p>
          </div>
        </template>
        <div class="popover-w">
          <RouterLink v-for="(item, index) in layers" :key="index" :to='"/layerdisplay/" + item'
            style="display: flex;justify-content: center;align-items: center;flex-direction: column;">
            <i :class="computeClass(item)" style="margin: 2px;"></i>
            <p style="font-size: 5px;">{{ layerName[index] }}</p>
          </RouterLink>
        </div>
      </el-popover>
      <RouterLink to="/eventinfo">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-shouye-copy"></i>
          </button>
          <p>拉框查询</p>
        </div>
      </RouterLink>
      <RouterLink to="/navigation">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-daohang"></i>
          </button>
          <p>导航</p>
        </div>
      </RouterLink>
      <RouterLink to="/areasearch">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-quyusousuo"></i>
          </button>
          <p>区域搜索</p>
        </div>
      </RouterLink>
      <RouterLink to="/changestyle">
        <div class="item">
          <button class="toggle-btn">
            <i class="iconfont icon-tucengfengge"></i>
          </button>
          <p>切换风格</p>
        </div>
      </RouterLink>
    </div>
  </div>
</template>
<script setup>
import { RouterLink } from "vue-router";
import { onMounted,ref,inject } from "vue";
// 坑1修复：注入的是 App.vue setup 同步创建的 reactive 容器，mounted 时可能尚未赋值，
// 使用时统一取 sm.map / sm.scene（地图就绪后必有值）
const sm = inject("$scene_map");
onMounted(() => {
  console.log("BottomTools mounted");
});
const reset = () => {
  const map = sm.map;
  if (!map) return;
  map.setCenter([118.05, 36.81]);
  map.setZoom(9.5);
  map.setPitch(0);
};
const popoverVisible = ref(false);

const showPopover = () => {
  popoverVisible.value = true;
};

const hidePopover = () => {
  popoverVisible.value = false;
};
const computeClass = (item) => {
  // 交通图层名 → 实际 iconfont 类名（iconfont 无同名图标，做近似映射）
  const ICON_MAP = {
    camera: 'supervision-full', trafficLight: 'icon-test', police: 'shouye-copy',
    busRoute: 'daohang', congestion: 'daolu', heat: 'paint', busStop: 'shoucang'
  }
  return "iconfont query-item icon-" + (ICON_MAP[item] || item);
};
const toolName = ['多边形','矩形','圆形','线']
// 7 类交通图层（对应 /layerdisplay/:type 与 initTrafficLayers 注册表）
const layerName = ['监控探头','信号灯','警员分布','公交线路','道路拥堵','热力图','公交站点']
const layers = ['camera','trafficLight','police','busRoute','congestion','heat','busStop']
const tools = ["drawPolygonTool", "drawRectTool", "drawCircleTool", "line"];
</script>
<style>
.footer {
  width: 100%;
  height: 10vh;
  position: fixed;
  z-index: 90;
  left: 0;
  bottom: 0;
  background: url("../assets/images/xzd-header.png") no-repeat;
  background-size: cover;
  background-position: center center;
  transform: rotate(180deg);
}

.btn-groups {
  display: flex;
  color: #fff;
  position: absolute;
  left: 50%;
  font-size: 8px !important;
  bottom: 12px;
  transform: translateX(-50%) rotate(180deg);
}

.btn-groups .item {
  margin-left: 18px;
  text-align: center;
}

.btn-groups button {
  margin-bottom: 4px;
  font-size: 8px;
  /* padding: 5px; */
  width: 25px;
  height: 25px;
  border: none;
  border-radius: 50%;
  outline: none;
  color: #fff;
  background: #53697670;
  /* fallback for old browsers */
  /* Chrome 10-25, Safari 5.1-6 */
  box-shadow: 0 0 5px 3px #333;
  background: linear-gradient(to bottom,
      rgba(0, 128, 255, 0.377),
      rgba(0, 128, 255, 0.281));
}

.btn-groups button:hover {
  cursor: pointer;
  background: linear-gradient(to bottom,
      rgba(0, 128, 255, 0.6),
      rgba(0, 128, 255, 0.281));
}

a {
  text-decoration: none;
  color: #fff;
}

.el-button+.el-button {
  margin-left: 8px;
}

.popover-w {
  display: flex;
  align-items: center;
  justify-content: space-around;
}

.query-item:hover {
  cursor: pointer;
  background: linear-gradient(to bottom,
      rgba(0, 128, 255, 0.6),
      rgba(0, 128, 255, 0.281));
}
</style>
