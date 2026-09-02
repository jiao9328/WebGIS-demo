# 🚦 淄博市智慧交通管理系统 v2

![Vue.js](https://img.shields.io/badge/Vue.js-3.x-4FC08D?style=flat-square&logo=vue.js)
![Vite](https://img.shields.io/badge/Vite-4.x-646CFF?style=flat-square&logo=vite)
![AntV L7](https://img.shields.io/badge/AntV_L7-2.15-1890FF?style=flat-square)
![Mapbox GL](https://img.shields.io/badge/Mapbox_GL-2.14-000000?style=flat-square)
![G2Plot](https://img.shields.io/badge/G2Plot-2.4-FF6B35?style=flat-square)

## 📝 项目简介

淄博智慧交通管理系统第二版（v2）：在保留第一版（Cesium 大屏）真实数据成果的基础上，以
**智慧城市 WebGIS**（Vue3 + AntV L7 + Mapbox GL）为骨架重构，将主题改为智慧交通，
功能与风格沿用参考程序布局：**纯净地图 + 顶部标题 + 底部工具条**，功能页为悬浮面板。

- 中心坐标：淄博 `118.05°E, 36.81°N`（张店区）
- 数据源：高德 Web 服务 API（公交线路/站点/天气/POI）、OSM 路网与信号灯点位；
  摄像头/警员/警情等公安数据不公开，沿真实路网与区县中心模拟生成（固定种子可复现）

## ✨ 功能模块

| 模块 | 说明 |
|---|---|
| 🏠 首页 `/` | 纯净地图，flyTo 淄博全景，基础图层（道路流线/城市建筑） |
| 🔔 事件铃铛 | 右下角常驻（默认收起），未读徽标 → 点击展开事件列表 → 点读/重播；每 45s 随机新警情 + 语音播报 |
| 🗺️ 图层显示 `/layerdisplay/:type` | 7 类交通图层：监控探头(220)/信号灯(231)/警员(60)/公交线路(50)/道路拥堵(22)/交通热力(336)/公交站点(225)，进入仅显示该类，点击要素弹详情 |
| 📊 控制中心 `/g2charts` | G2Plot 三图（各区县车辆密度/拥堵路段流量排行/警情类型分布）+ 设施统计卡（探头/信号灯/警员/公交） |
| 🌍 地球自转 `/rotation` | 3D 地球视角旋转 |
| 🏙️ 城市视角 `/cityview` | 城市飞行视角 |
| 📏 地图测量 `/mapdraw/:type` | 多边形/矩形/圆形/线 绘制测量 |
| 🚨 拉框查询 `/eventinfo` | 交通警情事件列表 |
| 🧭 导航 `/navigation` | Mapbox 驾车导航 |
| 🔍 区域搜索 `/areasearch` | 高德区域搜索（真实数据） |
| 🎨 切换风格 `/changestyle` | 底图亮暗/标准切换 |

## 🛠️ 技术栈

Vue 3.2 + Vite 4 + AntV L7 2.15 + L7-draw 3.0 + Mapbox GL 2.14 + G2Plot 2.4 + Element Plus

## 🚀 运行

```bash
pnpm install      # 依赖（store 硬链接）
pnpm dev          # 开发服务器 → http://localhost:5173
pnpm build        # 生产构建 → dist/
```

> `.env` 已含 Mapbox Token 与高德 Key。

## 📁 目录

```
src/
├── App.vue                  # 地图初始化 + provide 容器 + 45s 事件定时器
├── store.js                 # 全局 reactive 状态
├── tools/
│   ├── initTrafficLayers.js # 7 类交通图层懒创建注册表（核心）
│   ├── initLayer.js         # 基础图层（道路/建筑）
│   ├── mockData.js          # 交通业务数据（固定种子可复现）
│   ├── weather.js           # 高德天气
│   └── speech.js            # 语音播报
├── Hooks/                   # 控制中心图表数据
└── views/                   # 功能页
```

## ⚠️ 已知说明

- 控制中心拥堵图原参考用 G2Plot 玫瑰图，2.4.31 极坐标在真机渲染为空白
  （参考 dist 实测相同），故改用**横向条形图**展示同一数据
- 调试桥 `window.__traffic` 仅开发环境暴露（供 scripts/ 验证脚本断言）
