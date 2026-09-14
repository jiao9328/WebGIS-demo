/**
 * 交通图层的主题图标（监控=摄像头、信号灯=红绿灯、警员=警察、公交站=公交车）。
 *
 * 为什么是「白色单色符号」：L7 的图标着色器（l7-layers point/shaders/image_frag.glsl）拿
 * 纹理的**蓝通道**当遮罩 —— `gl_FragColor = step(0.01, textureColor.z) * v_color`，
 * 只有 v_color 恰为纯白时才直接用纹理原色。所以符号一律画成白色（蓝通道满值 = 遮罩全通），
 * 颜色交给图层的 .color() 决定；画成黑色或深色的话蓝通道≈0，整块会被挖空成透明（试过就没了）。
 *
 * 造型原则（都是照着「缩到 16px 还看不看得出来」定的，不是审美偏好）：
 *   · **画满 viewBox**：L7 的 size 是外框尺寸，不是墨迹尺寸。图形在 64×64 里缩一圈留白，
 *     16px 的图标实际只有 11px 的墨，图形就糊了。所以符号尽量顶到 0/64 边界。
 *   · **实心块面优先，别用细描边**：1px 描边缩到 16px 就断了。信号灯原来用描边画灯箱，
 *     结果整块糊成一个「盾牌」（识图复核原话），现在改成实心灯箱 + 三盏灯挖成洞。
 *   · **相邻图层别撞造型**：摄像头是「机身 + 右楔形镜头」（横长 + 尖角），公交是侧面车身
 *     （横长 + 两个圆轮），警员是人形（竖长对称），横竖圆尖各不相同。
 *
 * 各图形的墨迹占比（决定 size 折算到屏幕像素的系数）：
 *   摄像头 64×58、信号灯 40×60、警员 56×61、公交车 64×59 —— 基本都是满框，size≈墨迹半径。
 */
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`

export const TRAFFIC_ICONS = {
  /* 监控探头：摄像头机身 + 右向楔形镜头（摄像机侧影，满框） */
  camera: {
    id: 'zb-icon-camera',
    fallbackShape: 'circle',
    svg: svg(`
      <path fill="#fff" d="M0 14a6 6 0 0 1 6-6h26a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H6a6 6 0 0 1-6-6z"/>
      <path fill="#fff" d="M38 18 64 6v52L38 46z"/>`)
  },
  /* 信号灯：实心灯箱挖三个灯位（描边版在 16px 下糊成一块，见文件头） */
  trafficLight: {
    id: 'zb-icon-trafficLight',
    fallbackShape: 'triangle',
    svg: svg(`
      <path fill="#fff" fill-rule="evenodd" d="M22 2h20a10 10 0 0 1 10 10v40a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10V12A10 10 0 0 1 22 2z
        M32 8a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z
        M32 24.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z
        M32 41a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z"/>`)
  },
  /* 警员：警帽（帽冠+帽檐）+ 头部 + 肩部 */
  police: {
    id: 'zb-icon-police',
    fallbackShape: 'rhombus',
    svg: svg(`
      <path fill="#fff" d="M32 3c11 0 19 5 19 13v3H13v-3c0-8 8-13 19-13z"/>
      <path fill="#fff" d="M8 19h48a4 4 0 0 1 0 8H8a4 4 0 0 1 0-8z"/>
      <circle fill="#fff" cx="32" cy="38" r="11"/>
      <path fill="#fff" d="M4 64c0-12 12-17 28-17s28 5 28 17z"/>`)
  },
  /* 公交站点：公交车侧面（车身挖出车窗带 + 前后两个轮子） */
  busStop: {
    id: 'zb-icon-busStop',
    fallbackShape: 'pentagon',
    svg: svg(`
      <path fill="#fff" fill-rule="evenodd" d="M8 4h48a8 8 0 0 1 8 8v38H0V12a8 8 0 0 1 8-8zm4 10v14h40V14z"/>
      <circle fill="#fff" cx="14" cy="54" r="9"/>
      <circle fill="#fff" cx="50" cy="54" r="9"/>`)
  }
}

/** 图标名 → data URL（SVG 里的 # 必须转义，否则会被当成 URL 片段截断） */
export const iconUrl = (i) => 'data:image/svg+xml,' + encodeURIComponent(i.svg)
