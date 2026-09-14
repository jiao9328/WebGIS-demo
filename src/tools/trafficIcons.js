/**
 * 交通图层的主题图标（监控=摄像头、信号灯=红绿灯、警员=警徽、公交站=公交车）。
 *
 * 符号从「白色单色剪影」升级为「圆角方块徽章」：彩底 + 真白图形 + 白描边 + 柔影 ——
 * 与动态车辆 marker（App.vue 的 CAR_SVG：圆角车身 + 白车窗 + drop-shadow）同一套视觉语言。
 *
 * 为什么必须叠三层才画得出来（读 l7-layers point/shaders/image_frag 定死的，不是选择）：
 *   · `gl_FragColor = step(0.01, textureColor.z) * v_color` —— 拿纹理**蓝通道**当二值遮罩，
 *     一个图标只能被染成**一种**颜色，画不出白色的内部细节；而且这一支里**纹理 alpha 完全不参与**，
 *     任何半透明（柔和投影）都会被切成硬边。
 *   · 只有图层色**精确等于纯白**（6 位 #FFFFFF）时才走 `gl_FragColor = textureColor` 原色分支，
 *     这一支才保留纹理 alpha。
 * 所以一个点位叠三层（自下而上，见 initTrafficLayers 的 ICON/BADGE）：
 *   ① 阴影  SHADOW：深色（#101828）+ 自身 alpha 0.38 + 高斯模糊，配 `.color('#FFFFFF')` 走原色分支
 *   ② 白底板 BACK：纯白实心圆角方块（比徽章外扩 1.5 像素），配 `.color('#FFFFFF')`
 *      —— 既当徽章外侧的白描边，又从徽章的镂空处透出来当「真白」
 *   ③ 徽章本体 BADGE：圆角方块 + 图形处镂空（蓝通道 0 ⇒ 透出白底板），配状态色/主色
 *
 * 镂空区里的次级细节（镜头、灯位、五角星、车窗）用**环绕方向**填回徽章色，不需要第二张图：
 *   shell 逆时针 + 图形顺时针 + 细节逆时针 ⇒ 非零环绕下 细节处环绕数 -1 ≠ 0 ⇒ 被填成徽章色。
 * 同理，同一份 d 直接给面板小图标用（没有 shell）：图形顺时针 + 细节逆时针 ⇒ 细节是**洞**，
 * 正好是单色图标的读法 —— 「地图符号 = 面板图标」同源，不会再出现面板画飞机、地图画红绿灯的事。
 *
 * 造型原则（照旧，都是「缩到 16px 还看不看得出来」定的，不是审美偏好）：
 *   · **画满 viewBox**：L7 的 size 是外框尺寸；图形在 64 里缩一圈留白，18px 的图标就只剩 11px 墨。
 *   · **实心块面优先，别用细描边**：1px 描边缩到 16px 就断（信号灯早期的描边灯箱就糊成一块盾牌）。
 *   · **白色图形占徽章面积 40~50%**（与车辆车窗占比同量级），保证彩色主体仍是主导色。
 *   · **四类别撞形**：摄像头（横长机身 + 圆镜头）、信号灯（竖长灯箱 + 三盏灯）、
 *     警员（盾牌 + 五角星，换掉原来 16px 下糊成一坨的「帽子+头+肩」人形）、
 *     公交车（横长车身 + 车窗带 + 两个轮子）。
 *
 * 四个图形的墨迹外框（定面板图标缩放用，也是 size 折算到屏幕像素的依据）：
 *   摄像头 28×28、信号灯 30×48、警员 38×42、公交车 48×42（都在 64 里）
 */
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`

/* 徽章外壳：3..61 的圆角方块（rx 17）。**逆时针**绕 —— 它是上面图形的"底"，
 * 逆向才挖得动（同向的话非零环绕下会互相填实，镂空全失效）。 */
const SHELL_CCW = 'M20 3a17 17 0 0 0-17 17v24a17 17 0 0 0 17 17h24a17 17 0 0 0 17-17V20a17 17 0 0 0-17-17z'
/* 白底板：0..64 的实心圆角方块，**没有洞**（有洞会一路透到底图） */
const BACKING = svg('<rect x="0" y="0" width="64" height="64" rx="20" fill="#ffffff"/>')
/* 阴影：与徽章同形、下移 1.5、高斯模糊 3、深色 + 自身 0.42 alpha。
 * 注意是**深色画在图上**（而不是"蓝色 + 图层 alpha"）—— 遮罩分支丢纹理 alpha，
 * 只有原色分支（配 .color('#FFFFFF')）才留得住这层柔边。参数与车辆的
 * drop-shadow(0 1px 2px rgba(16,24,40,.35)) 对齐。
 *
 * 图形要**接近满框**（1.5..62.5）：影子层是按 size+3 画的（24px），白底板是 size+1.5（21px），
 * 两者贴得只剩 1.5px —— 影子图形若再内缩（早先写的 4..62），就整块躲在白底板后面，
 * 屏幕上等于没有投影（预览图 8× 复核：只有底部一丝模糊）。
 * 代价是模糊在画布边缘被裁一刀，但被裁的那圈正好压在底板下面，看不见。 */
const SHADOW = svg(`<defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%">
    <feGaussianBlur stdDeviation="3"/></filter></defs>
  <g filter="url(#b)"><rect x="1.5" y="3" width="61" height="61" rx="18" fill="#101828" fill-opacity="0.42"/></g>`)

/* 图形：shape 顺时针（多段同向 = 并集，互不挖空）；inner 逆时针（细节）。
 * 圆形用两段 a 弧：sweep=1 顺时针、sweep=0 逆时针（y 轴向下）。 */
const GLYPH = {
  /* 摄像头：机身 + 顶部取景台（两块并集），镜头是细节。
   * 取景台要**压进机身 2 个单位**（v12：18→30，机身顶在 28）：早先写成 v7（18→25）
   * 会在中间留一道 3 单位的缝，放大看就是"顶上飘着一块横条"（识图复核原话）。 */
  camera: {
    shape: 'M24 18h16v12H24z M18 28h28v14a4 4 0 0 1-4 4H22a4 4 0 0 1-4-4z',
    inner: 'M25.8 37a6.2 6.2 0 1 0 12.4 0 6.2 6.2 0 1 0-12.4 0'
  },
  /* 信号灯：竖长灯箱 + 三盏灯（语义保留：还是三灯，用户一眼认得出） */
  trafficLight: {
    shape: 'M24 8h16a7 7 0 0 1 7 7v34a7 7 0 0 1-7 7H24a7 7 0 0 1-7-7V15a7 7 0 0 1 7-7z',
    inner: 'M26 20a6 6 0 1 0 12 0 6 6 0 1 0-12 0'
      + ' M26 32a6 6 0 1 0 12 0 6 6 0 1 0-12 0'
      + ' M26 44a6 6 0 1 0 12 0 6 6 0 1 0-12 0'
  },
  /* 警员：警徽盾牌 + 五角星（星的中心 32,28，外接半径 11，逆时针） */
  police: {
    shape: 'M13 13h38v18c0 12-8 20-19 24-11-4-19-12-19-24z',
    inner: 'M32 17 29.3 24.28 21.54 24.6 27.63 29.42 25.53 36.9 32 32.6'
      + ' 38.47 36.9 36.37 29.42 42.46 24.6 34.7 24.28z'
  },
  /* 公交站：侧面车身 + 两个轮子（同向并集，轮子占车身下缘 —— 车不"浮"在空中），
   * 细节是车窗带与两个轮毂 */
  busStop: {
    shape: 'M14 12h36a6 6 0 0 1 6 6v28H8V18a6 6 0 0 1 6-6z'
      + ' M12 46a8 8 0 1 1 16 0 8 8 0 1 1-16 0'
      + ' M34 46a8 8 0 1 1 16 0 8 8 0 1 1-16 0',
    inner: 'M16 20v8h32v-8z'
      + ' M17 46a3 3 0 1 0 6 0 3 3 0 1 0-6 0'
      + ' M39 46a3 3 0 1 0 6 0 3 3 0 1 0-6 0'
  }
}

/* 徽章本体图：外壳（逆时针）+ 图形（顺时针）+ 细节（逆时针）合成一条 d，
 * 白色填充只是"开了蓝色通道"，实际颜色由图层的 .color() 决定。 */
const badgeSvg = (key) => svg(`<path fill="#fff" d="${SHELL_CCW} ${GLYPH[key].shape} ${GLYPH[key].inner}"/>`)

export const TRAFFIC_ICONS = {
  camera: { id: 'zb-icon-camera', fallbackShape: 'circle', svg: badgeSvg('camera') },
  trafficLight: { id: 'zb-icon-trafficLight', fallbackShape: 'triangle', svg: badgeSvg('trafficLight') },
  police: { id: 'zb-icon-police', fallbackShape: 'rhombus', svg: badgeSvg('police') },
  busStop: { id: 'zb-icon-busStop', fallbackShape: 'pentagon', svg: badgeSvg('busStop') }
}

/* 徽章的两张共用件（四类外壳形状相同 ⇒ 阴影/白底板各只需一张图，不必按类型复制）。
 * 名字用 zb-badge-* 而不是按类型分段：换尺寸时代码里只改 size，图不用重注册。 */
export const BADGE_IMAGES = {
  shadow: { id: 'zb-badge-shadow', svg: SHADOW },
  backing: { id: 'zb-badge-backing', svg: BACKING }
}

/* 面板小图标：同一份图形数据去掉外壳（→ 单色填充，细节是洞）。
 * scale 把墨迹放大到 64 框的 ~90%（数字来自文件头那张墨迹外框表，改图形要同步改）。 */
export const TRAFFIC_GLYPHS = {
  camera: { d: `${GLYPH.camera.shape} ${GLYPH.camera.inner}`, scale: 2.0, label: '监控探头' },
  trafficLight: { d: `${GLYPH.trafficLight.shape} ${GLYPH.trafficLight.inner}`, scale: 1.2, label: '信号灯' },
  police: { d: `${GLYPH.police.shape} ${GLYPH.police.inner}`, scale: 1.37, label: '警员分布' },
  busStop: { d: `${GLYPH.busStop.shape} ${GLYPH.busStop.inner}`, scale: 1.2, label: '公交站点' }
}

/** 图标名 → data URL（SVG 里的 # 必须转义，否则会被当成 URL 片段截断） */
export const iconUrl = (i) => 'data:image/svg+xml,' + encodeURIComponent(i.svg)
