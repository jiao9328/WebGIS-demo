
import { createRouter, createWebHistory } from 'vue-router'
import { getAuthUser } from '../store'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import("../views/Login.vue"),
      meta: { public: true } // 免登录路由
    },
    {
      path: '/',
      name: 'home',
      component: () => import("../views/Home.vue")
    },
    {
      path: '/rotation',
      name: 'rotation',
      component: () => import("../views/Rotation.vue")
    },
    {
      path: '/cityview',
      name: 'cityview',
      component: () => import("../views/CityView.vue")
    },
    {
      path: '/mapdraw/:type',
      name: 'mapdraw',
      props:true,
      component: () => import("../views/MapDraw.vue")
    },
    {
      path: '/eventinfo',
      name: 'eventinfo',
      props:true,
      component: () => import("../views/EventInfo.vue")
    },
    {
      path: '/navigation',
      name: 'navigation',
      props:true,
      component: () => import("../views/Navigation.vue")
    },
    {
      path: '/areasearch',
      name: 'areasearch',
      props:true,
      component: () => import("../views/AreaSearch.vue")
    },
    {
      path: '/changestyle',
      name: 'changestyle',
      props:true,
      component: () => import("../views/ChangeStyle.vue")
    },
  ]
})

/* ================= 全局登录守卫（仅前端拦截；/api 接口保持开放，课程演示级） =================
 * 未登录访问任何页面 → 跳 /login（带 redirect 参数，登录后回原目标）；
 * 已登录访问 /login   → 弹回 /。结构上 /login 分支永不指向 /login，无死循环。
 * replace: true 让登录页不进历史栈，按返回键不会退回登录页。 */
router.beforeEach((to) => {
  const user = getAuthUser()
  if (to.meta.public) {
    return user ? { path: '/', replace: true } : true
  }
  if (!user) {
    return { path: '/login', query: to.fullPath !== '/' ? { redirect: to.fullPath } : {}, replace: true }
  }
  return true
})

export default router
