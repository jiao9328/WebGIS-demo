<template>
  <div class="event-warning screen-panel" :class="{ collapsed: !store.warningVisible }" @click="store.warningVisible = !store.warningVisible">
    <div class="ew-head">
      <span class="ew-bell" :class="{ shake: store.unreadCount > 0 }">🔔</span>
      <span v-if="store.unreadCount > 0" class="ew-badge">{{ store.unreadCount }}</span>
      <span class="ew-title">事件警告</span>
      <span class="ew-toggle">{{ store.warningVisible ? '收起 ▲' : '展开 ▼' }}</span>
    </div>
    <div v-show="store.warningVisible" class="ew-list" @click.stop>
      <div
        v-for="e in store.events"
        :key="e.id"
        class="ew-item"
        :class="{ unread: !e.read }"
        @click="readEvent(e)"
      >
        <span class="ew-dot" :class="e.type"></span>
        <div class="ew-content">
          <p class="ew-text">{{ e.title }}</p>
          <p class="ew-time">{{ fmtTime(e.time) }} <span v-if="!e.read" class="ew-unread-tag">未读</span></p>
        </div>
        <button class="ew-speak" title="重新播报" @click.stop="replay(e)">🔊</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { inject } from 'vue'
import { speak } from '@/tools/speech'

const { store } = inject('$store')

const fmtTime = (t) => {
  const d = t instanceof Date ? t : new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

const readEvent = (e) => {
  e.read = true
  store.unreadCount = store.events.filter((x) => !x.read).length
}

const replay = (e) => {
  speak('请注意！' + e.title.replace('｜', '，'))
}
</script>

<style scoped>
/* 右下角常驻小铃铛（避开 L7 控件）：默认收起，点击展开事件列表 */
.event-warning {
  position: fixed;
  right: 10px;
  bottom: 12vh;
  width: 280px;
  z-index: 45;
  max-height: 40vh;
  cursor: pointer;
  transition: width 0.2s;
}

.event-warning.collapsed {
  width: auto;
  padding: 10px 12px;
}

.event-warning.collapsed .ew-head {
  border-bottom: none;
  margin-bottom: 0;
  padding-bottom: 0;
}

/* 收起时只留铃铛 + 未读角标 */
.event-warning.collapsed .ew-title,
.event-warning.collapsed .ew-toggle {
  display: none;
}

.event-warning.collapsed .ew-bell {
  font-size: 20px;
  line-height: 1;
}

.ew-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(56, 148, 255, 0.2);
  margin-bottom: 6px;
  user-select: none;
}

.ew-bell {
  font-size: 14px;
  position: relative;
}

.ew-bell.shake {
  animation: shake 1s infinite;
}

.ew-title {
  font-size: 13px;
  font-weight: bold;
  color: #ffb340;
  flex: 1;
}

.ew-badge {
  background: #ff3b30;
  color: #fff;
  border-radius: 8px;
  font-size: 10px;
  padding: 1px 7px;
  animation: blink 1.2s infinite;
  flex-shrink: 0;
}

.ew-toggle {
  font-size: 10px;
  color: rgba(160, 200, 255, 0.6);
}

.ew-list {
  overflow-y: auto;
  max-height: 30vh;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.ew-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 5px;
  background: rgba(0, 15, 40, 0.4);
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s;
}

.ew-item:hover {
  background: rgba(56, 148, 255, 0.14);
}

.ew-item.unread {
  border-left: 2px solid #ffb340;
  background: rgba(120, 80, 0, 0.15);
}

.ew-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  flex-shrink: 0;
}

.ew-dot.事故 { background: #ff3b30; }
.ew-dot.管制 { background: #ff9500; }
.ew-dot.故障 { background: #8e8e93; }
.ew-dot.施工 { background: #ffd60a; }
.ew-dot.拥堵 { background: #ff3b30; }

.ew-content {
  flex: 1;
}

.ew-text {
  color: #cfe3ff;
  line-height: 1.4;
}

.ew-time {
  color: rgba(160, 200, 255, 0.5);
  margin-top: 2px;
  font-size: 10px;
}

.ew-unread-tag {
  color: #ffb340;
  margin-left: 4px;
}

.ew-speak {
  background: none;
  border: none;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@keyframes shake {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(15deg); }
  40% { transform: rotate(-12deg); }
  60% { transform: rotate(8deg); }
  80% { transform: rotate(-4deg); }
}
</style>
