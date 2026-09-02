
<template>
  <header class="header">
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon">🚦</span>
        <div class="logo-text">
          <h1 class="header-title">淄博市智慧交通管理系统</h1>
          <p>ZIBO SMART TRANSPORTATION MANAGEMENT SYSTEM</p>
        </div>
      </div>
    </div>

    <div class="header-right">
      <!-- 数字时钟 -->
      <div class="timer">
        <p class="time-date">{{ time1 }}</p>
        <p class="time-clock">{{ time2 }}</p>
      </div>
    </div>
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
/* ===== V1 顶部栏设计风格：玻璃渐变条 + 左 logo 中英文标题 + 右时钟 ===== */
.header {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 64px;
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: linear-gradient(180deg, rgba(2, 16, 36, 0.92), rgba(2, 16, 36, 0.55));
  border-bottom: 1px solid rgba(56, 148, 255, 0.35);
  backdrop-filter: blur(6px);
  box-shadow: 0 2px 20px rgba(0, 100, 255, 0.15);
}

.header-left .logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 30px;
  line-height: 1;
}

.logo-text h1 {
  margin: 0;
  font-size: 20px;
  color: #fff;
  letter-spacing: 3px;
  background: linear-gradient(90deg, #4fc3ff, #7dd3ff, #4fc3ff);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  font-weight: bold;
  white-space: nowrap;
}

.logo-text p {
  margin: 2px 0 0;
  font-size: 10px;
  color: rgba(160, 200, 255, 0.6);
  letter-spacing: 1px;
  white-space: nowrap;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.timer {
  text-align: right;
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
