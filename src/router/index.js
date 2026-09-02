
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
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

export default router
