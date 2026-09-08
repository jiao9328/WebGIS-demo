<template>
  <!-- 全屏不透明覆盖层（z-index 9999 盖过地图/Header/所有浮层）：
       登录前地图仍在后台就绪，登录成功后进入即用，无二次加载 -->
  <div class="login-overlay">
    <div class="login-decor"></div>
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
          />
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
          />
        </el-form-item>
        <p v-if="errMsg" class="login-error">{{ errMsg }}</p>
        <el-button
          class="login-btn"
          type="primary"
          native-type="submit"
          size="large"
          :loading="loading"
        >登 录</el-button>
      </el-form>

      <p v-if="isDev" class="login-hint">默认账号 admin / 123456（可修改 server/.env 的 ADMIN_PASSWORD）</p>
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

/* 低透明度径向蓝光装饰，营造大屏科技感 */
.login-decor {
  position: absolute;
  width: 900px;
  height: 900px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(38, 130, 255, 0.22) 0%, transparent 65%);
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

.login-brand {
  text-align: center;
  margin-bottom: 30px;
}
.brand-icon {
  font-size: 40px;
}
.brand-title {
  margin: 8px 0 4px;
  font-size: 21px;
  letter-spacing: 3px;
  color: #fff;
  font-weight: 600;
}
.brand-sub {
  margin: 0;
  font-size: 10px;
  letter-spacing: 1.5px;
  color: rgba(125, 211, 255, 0.75);
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
}

.login-hint {
  margin: 22px 0 0;
  font-size: 12px;
  text-align: center;
  color: rgba(125, 211, 255, 0.65);
}

</style>
