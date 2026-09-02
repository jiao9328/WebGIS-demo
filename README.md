# 🌐 智慧城市-淄博 WebGIS 综合可视化平台

![Vue.js](https://img.shields.io/badge/Vue.js-3.x-4FC08D?style=flat-square&logo=vue.js)
![Vite](https://img.shields.io/badge/Vite-⚡-646CFF?style=flat-square&logo=vite)
![AntV L7](https://img.shields.io/badge/AntV_L7-Data_Viz-1890FF?style=flat-square)
![GeoServer](https://img.shields.io/badge/GeoServer-GIS_Server-1164A3?style=flat-square)
![Python](https://img.shields.io/badge/Python-Data_Process-3776AB?style=flat-square&logo=python)

## 📝 项目简介

本项目为一个综合性的 WebGIS 结课开发实践项目。系统以“智慧城市-淄博”为核心研究区域，采用前后端分离架构，结合开源 WebGIS 技术栈。通过整合城市路网、建筑白模、POI、交通事故及人口统计等多元空间数据，实现了从宏观地球视角到微观街道模型的全方位展示，全面提升地理信息系统的交互性、可视化效果与实用性。

> **研究区域概况**：淄博市位于山东省中部，是齐国故都、蒲松龄故乡，素有“陶瓷之都”美誉。全市下辖 5 区 3 县（张店区、临淄区、淄川区、博山区、周村区、桓台县、高青县、沂源县），市政府驻张店区，中心坐标约 `118.05°E, 36.81°N`。

## ✨ 核心功能模块 (Features)

本项目的功能模块与 `src/views/` 目录下的组件高度解耦，主要包含以下亮点：

* 🌍 **宏观与微观视角切换**
    * **地球自转展示 (`Rotation.vue`)**: 炫酷的 3D 地球开场，支持无缝缩放至城市级别。
    * **城市扫光与视角跟随 (`CityView.vue`)**: 动态扫光特效，增强城市建筑群的立体感与科技感。
* 📊 **多维度空间数据可视化**
    * **图表联动呈现 (`G2Charts.vue`)**: 结合 G2plot，直观展示淄博各区今日出行人口统计、淄博各区人口比例等属性数据。
    * **特征图层叠加 (`LayerDisplay.vue`)**: 基于 POI 数据，可视化展示住宅区、医院、商场等特定类型的空间分布（气泡图/热力图）。
    * **地标建筑查看 (`ModelView.vue`)**: 一键飞行定位至淄博地标建筑「海岱楼」，俯视查看真实建筑。
* 🛠️ **专业地图分析工具**
    * **空间测量工具 (`MapDraw.vue`)**: 提供地图上的两点距离测量、多边形面积测量功能。
    * **拉框空间查询 (`EventInfo.vue`)**: 在地图上绘制矩形范围，实时查询并展示区域内的交通事故点位及详细信息。
* 📍 **便民 GIS 服务**
    * **跨区路径导航 (`Navigation.vue`)**: 基于地图 API 的路径规划功能（支持驾车、步行等模式）。
    * **区域天气检索 (`AreaSearch.vue`)**: 动态检索并展示指定行政区划的天气、温湿度及风向信息。
    * **底图风格自由切换 (`ChangeStyle.vue`)**: 提供卫星影像、高对比度街道、暗色模式、夜间导航等多种底图风格切换。

## 🏗️ 系统架构与技术栈

### 前端应用 (Frontend)
* **核心框架**: Vue 3 (采用 Composition API 构建)
* **构建工具**: Vite
* **地图渲染底座**: AntV-L7 (阿里开源空间数据可视化引擎) / Mapbox
* **地理空间分析**: Turf.js (用于前端拓扑分析与几何计算)
* **图表与UI**: G2plot / 纯 CSS 定制化大屏 UI
* **状态与逻辑复用**: 自定义 Vue Hooks (`useLeftBottom.js`, `useRightTop.js` 等)

### 后端与 GIS 服务 (Backend & GIS Server)
* **GIS 服务器**: GeoServer (用于发布 WMS/WFS 地图服务)
* **Web 服务器**: Tomcat
* **空间数据库**: PostgreSQL + PostGIS 扩展

### 数据预处理 (Data Pipeline)
* **语言与库**: Python（标准库，零第三方依赖）
* **脚本路径**: `Pyscripts/fetchZiboOSM.py`、`Pyscripts/fetchZiboPOI.py`、`Pyscripts/m3mf2obj.py`
* **处理流程**: 通过 Overpass API 抓取路网与建筑、通过高德 API 抓取 POI -> 脚本内置去重与坐标清洗 -> 导出为 GeoJSON（供前端）与 CSV（供 ArcGIS 转 Shapefile -> PostGIS -> GeoServer 发布）。

## 📁 核心目录结构

```text
SMART-CITY/
├── Pyscripts/               # Python 数据获取与预处理脚本
│   ├── fetchZiboOSM.py      # 路网 + 建筑抓取（OpenStreetMap，无需 key）
│   ├── fetchZiboPOI.py      # 5 类 POI + 事故生成（高德，读取 .env key）
│   ├── m3mf2obj.py          # 3MF -> OBJ 转换（海岱楼 3D 打印模型 -> 浏览器模型）
│   └── 淄博市POI数据.csv     # 汇总 POI（供 ArcGIS 转 SHP/PostGIS 使用）
├── src/                     # 前端源码
│   ├── assets/
│   │   └── GIS_Data/        # 本地 GeoJSON 静态空间数据
│   ├── components/          # 页面基础组件 (Header, BottomTools)
│   ├── Hooks/               # 业务逻辑抽离，管理各面板状态
│   ├── router/              # 路由配置模块
│   ├── tools/               # 核心 GIS 工具类
│   │   ├── initControl.js   # 地图控件初始化
│   │   └── initLayer.js     # 图层加载与管理
│   ├── views/               # 十一大核心功能视图组件
│   ├── App.vue
│   └── main.js
├── public/                  # 静态资源
├── package.json             # 依赖管理
└── vite.config.js           # 构建配置
```

## 🗄️ 数据来源说明

本项目严格遵守数据开源协议，采用以下数据来源：

1. **建筑物及楼高数据**: OpenStreetMap (OSM) 建筑轮廓，楼高由 `building:levels` 估算（原论文数据集《Vectorized rooftop area data for 90 cities in China》不含淄博，故改用 OSM）。
2. **城市路网数据**: OpenStreetMap (OSM) 提取。
3. **地标建筑**: 海岱楼（WGS-84 坐标定位，淄博市张店区齐盛湖公园内；3D 模型由 MakerWorld 真实 3MF 打印模型经 `m3mf2obj.py` 转换得到）。
4. **POI 兴趣点数据**: 高德地图开放平台 API 获取。
5. **人口及统计数据**: 淄博市统计局公开统计公报。

> ✅ **数据现状**：`src/assets/GIS_Data/` 下的数据已通过项目内置脚本抓取为**真实淄博数据**（路网/建筑来自 OpenStreetMap，POI 来自高德开放平台，事故为模拟数据）。其中建筑楼高 `Elevation` 由 OSM 的 `building:levels` 估算（OSM 建筑普遍缺少真实楼高）。如需重新抓取或更新，见下文「数据获取与更新」。

## 🔄 数据获取与更新（脚本已内置）

数据已通过 `Pyscripts/` 下两个脚本抓取完成（均零第三方依赖，只用 Python 标准库），如需重新抓取或扩大范围：

```bash
python Pyscripts/fetchZiboOSM.py   # 路网 + 建筑（OpenStreetMap，无需 key）
python Pyscripts/fetchZiboPOI.py   # 5 类 POI + 事故（高德，读取 .env 的 VITE_AMAP_KEY）
```

- **路网与建筑**：`fetchZiboOSM.py` 调 Overpass API 抓取，楼高 `Elevation` 由 `building:levels`×3 估算；要扩大范围改脚本顶部 `BBOX`（默认张店区主城区）。
- **POI**：`fetchZiboPOI.py` 调高德 place/text 接口，输出 5 个 GeoJSON + `淄博市POI数据.csv`（供 ArcGIS→Shapefile→PostGIS 发布）。
- **事故模拟数据**：由 `fetchZiboPOI.py` 自动生成（鲁C 车牌 + 淄博区县），如需手改，字段保持 `event_num/name/area/car_num/level` 不变。
- **天气/地理编码**：在 `src/views/AreaSearch.vue` 中替换高德 key，在 `src/App.vue` 与 `src/views/Navigation.vue` 中替换 Mapbox access token。

## 🚀 部署与运行指南

### 1. 前置环境要求
* Node.js (建议 v16+)
* pnpm (推荐使用，可通过 `npm install -g pnpm` 安装)
* *(可选但推荐)* 本地或云端已配置好的 GeoServer 与 PostgreSQL+PostGIS 环境。

### 2. GIS 数据发布 (GeoServer 篇)
1. 将 `Pyscripts/淄博市POI数据.csv` 经 ArcGIS 转为 Shapefile，连同路网、建筑 shp 一并导入 PostGIS 数据库。
2. 在 GeoServer 中创建工作空间，连接 PostGIS 存储仓库。
3. 依次发布图层，并配置相应的 SLD 样式。记录下 WMS/WFS 的服务地址。

### 3. 前端项目运行

```bash
# 安装项目依赖
pnpm install

# 配置环境变量
# 请在根目录创建 .env 文件，并填入您的地图 API 密钥及 GeoServer 地址
# 例如：
# VITE_AMAP_KEY=your_gaode_map_api_key
# VITE_GEOSERVER_URL=http://localhost:8080/geoserver/wms

# 启动本地开发服务器
pnpm dev
```

## 🤝 贡献与许可

本项目为课程结课实验项目，暂未完全开放协作。如需参考或交流，欢迎提交 Issue。
