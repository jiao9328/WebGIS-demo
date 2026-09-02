
<template>
  <header class="header">
    <!-- 左：时钟 -->
    <div class="header-left">
      <div class="timer">
        <p class="time-date">{{ time1 }}</p>
        <p class="time-clock">{{ time2 }}</p>
      </div>
    </div>

    <!-- 中：标题 -->
    <div class="header-center">
      <div class="logo">
        <span class="logo-icon">🚦</span>
        <h1 class="header-title">淄博市智慧交通管理系统</h1>
      </div>
      <p class="header-sub">ZIBO SMART TRANSPORTATION MANAGEMENT SYSTEM</p>
    </div>

    <!-- 右：留空保持标题严格居中 -->
    <div class="header-right"></div>
  </header>
</template>

<script setup>
import { computed, ref, onMounted } from "vue";

const year = ref(0);
const month = ref(0);
const day = ref(0);
const hour = ref(0);
const minute = ref(0);
const second = ref(0);

const updateTime = () => {
  const date = new Date();
  year.value = date.getFullYear();
  month.value = ('0' + (date.getMonth() + 1)).slice(-2);
  day.value = ('0' + date.getDate()).slice(-2);
  hour.value = ('0' + date.getHours()).slice(-2);
  minute.value = ('0'+date.getMinutes()).slice(-2);
  second.value = ('0'+date.getSeconds()).slice(-2);
};

onMounted(() => {
  // 初始调用一次
  updateTime();
  // 设置每秒钟更新一次
  setInterval(updateTime, 1000);
});

const time1 = computed(() => {
  return `${year.value}-${month.value}-${day.value}`;
});

const time2 = computed(() => {
  return `${hour.value}:${minute.value}:${second.value}`;
});
</script>

<style scoped>
/* ===== 顶部栏：玻璃渐变条 + 左时钟 + 居中标题 + 右留空 ===== */
.header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 64px;
  box-sizing: border-box;
  z-index: 50;
  display: flex;
  align-items: center;
  padding: 0 20px;
  background: linear-gradient(180deg, rgba(2, 16, 36, 0.92), rgba(2, 16, 36, 0.55));
  border-bottom: 1px solid rgba(56, 148, 255, 0.35);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 20px rgba(0, 100, 255, 0.15);
}

/* 左右伸缩区（左时钟/右留空） */
.header-left,
.header-right {
  flex: 1;
  display: flex;
  align-items: center;
  min-width: 0;
}

.header-right {
  justify-content: flex-end;
}

/* 中间标题块：绝对居中，不受两侧内容宽度影响 */
.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  line-height: 1;
}

.logo-icon {
  font-size: 28px;
}

.header-title {
  margin: 0;
  font-size: 22px;
  color: #fff;
  letter-spacing: 4px;
  background: linear-gradient(90deg, #4fc3ff, #7dd3ff, #4fc3ff);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
  white-space: nowrap;
}

.header-sub {
  margin: 4px 0 0;
  font-size: 9px;
  color: rgba(160, 200, 255, 0.6);
  letter-spacing: 2px;
  white-space: nowrap;
}

.timer {
  text-align: left;
  color: #7dd3ff;
  line-height: 1.2;
}

.time-date {
  margin: 0;
  font-size: 12px;
  color: rgba(160, 200, 255, 0.7);
}

.time-clock {
  margin: 0;
  font-size: 20px;
  font-family: Consolas, monospace;
  letter-spacing: 1px;
}
</style>
