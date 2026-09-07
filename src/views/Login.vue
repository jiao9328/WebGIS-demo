<template>
  <!-- 全屏不透明覆盖层（z-index 9999 盖过地图/Header/所有浮层）：
       登录前地图仍在后台就绪，登录成功后进入即用，无二次加载 -->
  <div class="login-overlay">
    <div class="glow glow-blue"></div>
    <div class="glow glow-cyan"></div>
    <div class="grid-fade"></div>
    <div class="login-card">
      <div class="login-brand">
        <span class="brand-icon">🚦</span>
        <h1 class="brand-title">淄博市智慧交通管理系统</h1>
        <p class="brand-sub">ZIBO SMART TRANSPORTATION MANAGEMENT SYSTEM</p>
      </div>

      <el-form class="login-form" @submit.prevent="onLogin">
        <el-form-item>
          <el-input
            v-model="username"
            placeholder="用户名"
            size="large"
            autocomplete="username"
            @keyup.enter="onLogin"
          >
            <template #prefix><span class="ipt-ico">👤</span></template>
          </el-input>
        </el-form-item>
        <el-form-item>
          <el-input
            v-model="password"
            type="password"
            placeholder="密码"
            size="large"
            show-password
            autocomplete="current-password"
            @keyup.enter="onLogin"
          >
            <template #prefix><span class="ipt-ico">🔒</span></template>
          </el-input>
        </el-form-item>
        <p v-if="errMsg" :key="errMsg" class="login-error">{{ errMsg }}</p>
        <el-button
          class="login-btn"
          type="primary"
          native-type="submit"
          size="large"
          :loading="loading"
        >登 录</el-button>
      </el-form>

      <p v-if="isDev" class="login-hint">
        演示账号 admin / 123456
        <el-link class="fill-link" @click="fillDemo">一键填入</el-link>
      </p>
      <p class="login-copy">数据服务登录 · 账号由 SQL Server 校验</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { api } from '../api'
import { setAuthUser } from '../store'
import { speak } from '../tools/speech'

const route = useRoute()
const router = useRouter()

// 开发环境才在页脚提示默认账号（生产构建不显示）
const isDev = import.meta.env.DEV

const username = ref('')
const password = ref('')
const loading = ref(false)
// 错误用卡片内联提示，不用 ElMessage —— toast 默认 z-index(~2000) 低于覆盖层 9999 会被盖住
const errMsg = ref('')
// 演示：一键填入默认账号（仅开发环境展示入口）
const fillDemo = () => {
  username.value = 'admin'
  password.value = '123456'
  errMsg.value = ''
}

const onLogin = async () => {
  if (loading.value) return
  errMsg.value = ''
  const u = username.value.trim()
  if (!u || !password.value) {
    errMsg.value = '请输入用户名和密码'
    return
  }
  loading.value = true
  try {
    const user = await api.login(u, password.value)
    setAuthUser(user)
    // 登录成功时 speak 必被浏览器放行（刚有点击/回车手势）
    speak('欢迎回来，' + (user.display_name || user.username))
    // 守卫记录的原目标（未登录直敲子页面时回跳）；否则回首页
    router.replace(route.query.redirect || '/')
  } catch (e) {
    errMsg.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #020f24 0%, #031a3a 55%, #020f24 100%);
  overflow: hidden;
}

/* 双光斑缓慢漂移 + 微弱网格透视，营造大屏科技氛围（纯 CSS，无额外资源） */
.glow {
  position: absolute;
  border-radius: 50%;
  filter: blur(70px);
  pointer-events: none;
}
.glow-blue {
  width: 540px;
  height: 540px;
  left: 10%;
  top: 6%;
  background: radial-gradient(circle, rgba(38, 130, 255, 0.5) 0%, transparent 65%);
  animation: driftA 14s ease-in-out infinite alternate;
}
.glow-cyan {
  width: 480px;
  height: 480px;
  right: 8%;
  bottom: 4%;
  background: radial-gradient(circle, rgba(0, 200, 255, 0.32) 0%, transparent 65%);
  animation: driftB 18s ease-in-out infinite alternate;
}
@keyframes driftA {
  to { transform: translate(70px, 40px) scale(1.1); }
}
@keyframes driftB {
  to { transform: translate(-60px, -50px) scale(1.06); }
}
.grid-fade {
  position: absolute;
  inset: 0;
  background:
    repeating-linear-gradient(0deg, rgba(125, 211, 255, 0.045) 0 1px, transparent 1px 48px),
    repeating-linear-gradient(90deg, rgba(125, 211, 255, 0.045) 0 1px, transparent 1px 48px);
  -webkit-mask-image: radial-gradient(ellipse at center, #000 15%, transparent 75%);
  mask-image: radial-gradient(ellipse at center, #000 15%, transparent 75%);
  pointer-events: none;
}

.login-card {
  position: relative;
  width: 400px;
  padding: 44px 40px 26px;
  border-radius: 14px;
  background: rgba(8, 28, 56, 0.88);
  border: 1px solid rgba(56, 148, 255, 0.35);
  backdrop-filter: blur(8px);
  box-shadow: 0 0 40px rgba(0, 100, 255, 0.25), inset 0 0 30px rgba(38, 130, 255, 0.06);
}

/* 卡片顶部细高光线 */
.login-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 12%;
  right: 12%;
  height: 2px;
  border-radius: 0 0 2px 2px;
  background: linear-gradient(90deg, transparent, #4fc3ff, #2b8cff, #4fc3ff, transparent);
  box-shadow: 0 0 10px rgba(79, 195, 255, 0.6);
}

.login-brand {
  text-align: center;
  margin-bottom: 26px;
}
.brand-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 62px;
  height: 62px;
  font-size: 30px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, rgba(43, 140, 255, 0.32), rgba(10, 40, 90, 0.65));
  border: 1px solid rgba(125, 211, 255, 0.4);
  box-shadow: 0 0 22px rgba(43, 140, 255, 0.35), inset 0 0 14px rgba(125, 211, 255, 0.14);
}
.brand-title {
  margin: 12px 0 4px;
  font-size: 21px;
  letter-spacing: 3px;
  color: #fff;
  font-weight: 600;
  text-shadow: 0 0 18px rgba(79, 195, 255, 0.35);
}
.brand-sub {
  margin: 0;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(125, 211, 255, 0.75);
}
/* 品牌区底部渐变分隔线 */
.login-brand::after {
  content: '';
  display: block;
  width: 76px;
  height: 1px;
  margin: 14px auto 0;
  background: linear-gradient(90deg, transparent, rgba(125, 211, 255, 0.85), transparent);
}

/* 深色卡片里的 Element 输入框适配（覆盖 Element Plus 默认白底） */
.login-form :deep(.el-input__wrapper) {
  background: rgba(2, 16, 36, 0.6);
  box-shadow: 0 0 0 1px rgba(56, 148, 255, 0.35) inset;
  border-radius: 8px;
}
.login-form :deep(.el-input__wrapper.is-focus) {
  box-shadow: 0 0 0 1px #2b8cff inset, 0 0 12px rgba(43, 140, 255, 0.25);
}
.login-form :deep(.el-input__inner) {
  color: #fff;
  font-size: 14px;
}
.login-form :deep(.el-input__inner::placeholder) {
  color: rgba(255, 255, 255, 0.35);
}
.login-form :deep(.el-input__icon) {
  color: rgba(125, 211, 255, 0.8);
}
.login-form :deep(.el-form-item) {
  margin-bottom: 18px;
}

/* 输入框前缀小图标（emoji 灰度化融入深色输入框） */
.ipt-ico {
  font-size: 13px;
  line-height: 1;
  opacity: 0.6;
  filter: grayscale(1) brightness(1.5);
}

/* 演示账号一键填入 */
.fill-link {
  margin-left: 8px;
  color: #4fc3ff;
}
.fill-link:hover {
  color: #7dd3ff;
}

.login-btn {
  width: 100%;
  margin-top: 4px;
  font-size: 15px;
  letter-spacing: 8px;
  background: linear-gradient(90deg, #1769e0, #2b8cff);
  border: none;
}
.login-btn:hover {
  background: linear-gradient(90deg, #2b8cff, #4fc3ff);
}

.login-error {
  margin: 0 0 12px;
  padding: 8px 12px;
  font-size: 13px;
  color: #ff8080;
  background: rgba(255, 80, 80, 0.12);
  border: 1px solid rgba(255, 80, 80, 0.35);
  border-radius: 6px;
  text-align: left;
  animation: shake 0.35s ease;
}
/* 错误提示轻微抖动（v-if + :key 每次错误触发重播） */
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-5px); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(-3px); }
  80% { transform: translateX(3px); }
}

.login-hint {
  margin: 22px 0 0;
  font-size: 12px;
  text-align: center;
  color: rgba(125, 211, 255, 0.65);
}

  margin: 10px 0 0;
  font-size: 11px;
  text-align: center;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 1px;
}
</style>
