#!/usr/bin/env node
/**
 * 依赖 / 配置预检 —— npm 会在每次 dev / build / preview 前自动运行（predev 等）。
 *
 * 背景：新用户从 GitHub 下载 / 克隆仓库后没有 node_modules（不入库），
 * 直接 `npm run dev` 会报「'vite' 不是内部或外部命令」这种看不懂的错误。
 * 本脚本把这类问题翻译成人话：缺依赖 → 提示先安装；缺 .env → 提示复制 .env.example。
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const fails = []
const warns = []

/* ---------- 1) 依赖是否安装 ---------- */
const hasVite =
  existsSync(resolve(root, 'node_modules/.bin/vite')) ||
  existsSync(resolve(root, 'node_modules/vite'))
if (!hasVite) {
  fails.push(
    '未安装依赖：找不到 vite（node_modules 不存在）。\n' +
    '原因：仓库刻意不含 node_modules，首次运行必须先安装依赖。\n' +
    '解决：在本项目根目录执行（二选一）\n' +
    '    pnpm install    推荐 —— 与提交的 pnpm-lock.yaml 完全一致\n' +
    '    npm install      同样可行（会自动生成 package-lock.json）\n' +
    '安装完成后重新运行 pnpm dev / npm run dev 即可。'
  )
}

/* ---------- 2) .env 密钥配置（只提醒，不阻断） ---------- */
let envText = ''
try { envText = readFileSync(resolve(root, '.env'), 'utf8') } catch { /* 不存在则走下方提醒 */ }
const envVal = (k) => envText.match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.trim() || ''

if (!envText.trim()) {
  warns.push(
    '未检测到 .env（API Key 配置文件，不入库）。\n' +
    '未配置时地图底图 / 高德服务不可用，页面可能白屏。\n' +
    '解决：复制 .env.example 为 .env 后填入自己的 Key ——\n' +
    '    bash:   cp .env.example .env\n' +
    '    CMD:    copy .env.example .env\n' +
    '各 Key 申请地址见 README「运行指南」。'
  )
} else {
  const rule = {
    VITE_MAPBOX_TOKEN: '地图底图渲染必需（pk. 开头，https://account.mapbox.com/）',
    VITE_AMAP_KEY: '区域搜索 / 天气 / 地名解析需要（https://console.amap.com/）',
    VITE_DEEPSEEK_KEY: 'AI 助手对话需要（缺省时自动降级为离线指令模式）'
  }
  for (const [k, desc] of Object.entries(rule)) {
    const v = envVal(k)
    if (!v || /^(pk\.your|your_|sk-your|sk-?your)/i.test(v) || v.includes('your_')) {
      warns.push(`${k} 未配置有效值 —— ${desc}`)
    }
  }
}

/* ---------- 输出 ---------- */
if (fails.length) {
  console.error('\n[预检失败 · check-deps]\n' + fails.join('\n\n'))
  process.exit(1) // 中断启动，提示明确，用户照做即可
}
if (warns.length) {
  console.warn('\n[预检提醒 · check-deps]\n' + warns.join('\n\n'))
}
console.log('\n[预检通过] 依赖就绪' + (warns.length ? '（有配置提醒，见上方，可先启动再补 Key）' : '') + '，开始启动…\n')
