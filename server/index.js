/**
 * 淄博智慧交通管理系统 —— 数据服务端（Express 5 + mssql/tedious）
 *
 * 职责：把前端业务数据的增删改查代理到 SQL Server「ZiboSmartTraffic」。
 *   GET    /api/tables/:table          整表查询（白名单表名；bus_routes.geometry 自动 JSON.parse）
 *   POST   /api/tables/:table          新增一行（列名/类型白名单校验 → 参数化 INSERT）
 *   PUT    /api/tables/:table/:id      按主键整行更新（同上白名单校验）
 *   DELETE /api/tables/:table/:id      按主键删除
 *   GET    /api/mapdata                一次返回全部业务表（页面启动一次性拉取）
 *   GET    /api/health                 连通性自检（用于界面提示后端/数据库状态）
 *   POST   /api/auth/login             登录校验 dbo.users（scrypt 加盐哈希比对；
 *                                      默认管理员由启动时 ensureDefaultAdmin 自举）
 * 生产模式（NODE_ENV=production 或存在 ../dist）额外托管前端构建产物，同源 /api。
 *
 * 启动：pnpm server  （配置见 server/.env；库/表/登录由 db/setup.sql 建立，
 *                     数据由 db/seed.sql 灌入 —— 均在 SSMS 里执行）
 *
 * 安全设计：表名、列名全部走下方白名单注册表，杜绝 SQL 注入；
 * 值一律参数化（sql.input / sql.Table），类型经 colTypes 归一化。
 */
import express from 'express'
import sql from 'mssql'
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PORT = Number(process.env.PORT || 3001)

/* ================= 连接配置（来自 server/.env，由 pnpm server 注入） ================= */
const dbCfg = {
  server: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 1433),
  user: process.env.DB_USER || 'zibo_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'ZiboSmartTraffic',
  options: {
    encrypt: false, // 本机 SQL Server，无需 TLS
    trustServerCertificate: true,
    enableArithAbort: true
  },
  connectionTimeout: 5000,
  requestTimeout: 20000,
  pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
}

/* ================= 表注册表：DB schema 的服务端镜像（单点维护） ================= */
// colTypes: 'str' | 'num' | 'bit' | 'geom'
const TABLES = {
  districts:      { label: '区县',            cols: { name: 'str', lng: 'num', lat: 'num', population: 'num' }, readonly: false },
  cameras:        { label: '监控探头',        cols: { cam_id: 'str', name: 'str', road: 'str', status: 'str', area: 'str', lng: 'num', lat: 'num' }, readonly: false },
  traffic_lights: { label: '信号灯',          cols: { tl_id: 'str', name: 'str', state: 'str', area: 'str', lng: 'num', lat: 'num' }, readonly: false },
  police:         { label: '警员',            cols: { pol_id: 'str', name: 'str', badge: 'str', district: 'str', on_duty: 'bit', location: 'str', lng: 'num', lat: 'num' }, readonly: false },
  alerts:         { label: '实时警情',        cols: { alert_id: 'str', type: 'str', level: 'num', area: 'str', road: 'str', lng: 'num', lat: 'num', minutes_ago: 'num', status: 'str', car_num: 'str' }, readonly: false },
  events:         { label: '事件记录',        cols: { event_num: 'str', name: 'str', area: 'str', car_num: 'str', phone: 'str', level: 'num', lng: 'num', lat: 'num' }, readonly: false },
  congestion:     { label: '拥堵路段',        cols: { name: 'str', level: 'num', level_name: 'str', avg_speed: 'num', flow: 'num', area: 'str', lng: 'num', lat: 'num' }, readonly: false },
  heat_points:    { label: '热力点（只读）',  cols: { lng: 'num', lat: 'num', value: 'num' }, readonly: true },
  bus_routes:     { label: '公交线路',        cols: { ref: 'str', name: 'str', dep_stop: 'str', arr_stop: 'str', via: 'num', color: 'str', geometry: 'geom' }, readonly: false },
  bus_stops:      { label: '公交站点',        cols: { stop_id: 'str', name: 'str', lng: 'num', lat: 'num' }, readonly: false }
}
const KEY = 'id'

/* 状态/枚举列取值约束（写入前校验，保证图层着色逻辑不炸） */
const ENUMS = {
  cameras:        { status: ['normal', 'fault'] },
  traffic_lights: { state: ['green', 'red', 'yellow', 'fault'] },
  alerts:         { status: ['handling', 'pending'], level: [1, 2, 3, 4] },
  congestion:     { level: [0, 1, 2] },
  events:         { level: [1, 2, 3, 4] }
}

const tableOf = (t) => TABLES[t] || null
const validCols = (def) => Object.keys(def.cols)

/* ================= 工具 ================= */
// 归一化值：按列类型转成 mssql 能收的类型；非法返回 { err }
function normVal(type, v, { trim = true } = {}) {
  if (v === null || v === undefined) return { err: '缺少必填字段' }
  if (type === 'num') {
    const n = Number(v)
    return Number.isFinite(n) ? { v: n } : { err: '必须是数字' }
  }
  if (type === 'bit') {
    if (v === true || v === 1 || v === '1' || v === 'true') return { v: true }
    if (v === false || v === 0 || v === '0' || v === 'false') return { v: false }
    return { err: '必须是 0/1 或 true/false' }
  }
  if (type === 'geom') {
    // 接受 GeoJSON 对象或 JSON 字符串 → 一律转紧凑 JSON 文本入库
    try {
      const s = typeof v === 'string' ? v : JSON.stringify(v)
      const parsed = JSON.parse(s)
      if (!parsed || !parsed.type || !Array.isArray(parsed.coordinates)) return { err: 'geometry 必须是 GeoJSON 对象' }
      return { v: JSON.stringify(parsed) }
    } catch (e) {
      return { err: 'geometry 不是合法 JSON' }
    }
  }
  // str
  const s = trim ? String(v).trim() : String(v)
  return { v: s }
}

// 行读出后：geometry 文本 → 对象（一次解析，客户端直接用）
function shapeRow(table, def, row) {
  const out = { ...row }
  if (def.cols.geometry && typeof out.geometry === 'string' && out.geometry.trim().startsWith('{')) {
    try { out.geometry = JSON.parse(out.geometry) } catch (e) { /* 保留原文 */ }
  }
  return out
}

/* ================= 登录密码（scrypt 加盐哈希，明文绝不入库） ================= */
// 参数显式写死：N/r/p 与 Node 默认值一致，未来 Node 调整默认参数也不会导致旧哈希验不过
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64, maxmem: 64 * 1024 * 1024 }
const hashPassword = (password, saltHex) =>
  scryptSync(String(password), Buffer.from(saltHex, 'hex'), SCRYPT.keylen, SCRYPT).toString('hex')

/* ================= mssql 连接（懒建全局单连接池） ================= */
let poolPromise = null
async function pool() {
  if (!poolPromise) poolPromise = sql.connect(dbCfg).catch((e) => {
    poolPromise = null // 连接失败后可重试
    throw e
  })
  return poolPromise
}

/* ================= Express ================= */
const app = express()
app.use(express.json({ limit: '1mb' }))
// 宽松 CORS：开发直连 / 生产同源都不受影响，方便调试工具单独访问
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

// 统一错误体
const fail = (res, status, msg) => res.status(status).json({ ok: false, error: msg })

/** 通用 CRUD 校验与参数化执行 */
function buildParams(def, body, { partial = false } = {}) {
  const params = [] // { col, type, value, sqlType }
  const sqlTypeOf = { str: sql.NVarChar, num: sql.Float, bit: sql.Bit, geom: sql.NVarChar }
  for (const [col, type] of Object.entries(def.cols)) {
    const has = Object.prototype.hasOwnProperty.call(body, col)
    if (!has) {
      if (partial) continue // PUT：缺字段 = 不改（整行更新语义，但允许部分字段）
      return { err: `缺少字段：${col}` }
    }
    const r = normVal(type, body[col])
    if (r.err) return { err: `字段 ${col} ${r.err}` }
    params.push({ col, type, value: r.v, sqlType: sqlTypeOf[type] })
  }
  return { params }
}

app.get('/api/health', async (req, res) => {
  try {
    const p = await pool()
    const r = await p.request().query('SELECT 1 AS ok')
    res.json({ ok: r.recordset[0].ok === 1, db: process.env.DB_NAME, tables: Object.keys(TABLES).length })
  } catch (e) {
    res.status(503).json({ ok: false, error: '数据库连接失败：' + e.message })
  }
})

/** 登录校验（dbo.users 不入 TABLES 白名单，只经此专用接口访问，防 hash/salt 外泄） */
app.post('/api/auth/login', async (req, res) => {
  // Express 5：无 body 时 req.body 可能是 undefined，务必可选链
  const username = String(req.body?.username || '').trim() // SQL Server 比较忽略尾随空格，先 trim
  const password = String(req.body?.password || '')
  if (!username || !password) return fail(res, 400, '请输入用户名和密码')
  try {
    const p = await pool()
    const q = p.request()
    q.input('u', sql.NVarChar, username) // NVarChar 保中文安全；绝不用 VarChar
    const r = await q.query('SELECT username, password_hash, salt, display_name FROM dbo.users WHERE username = @u')
    const row = r.recordset[0]
    if (!row) return fail(res, 401, '用户名或密码错误') // 不区分「用户不存在/密码错」，防枚举
    // timingSafeEqual 长度不等会直接 throw，须先比长度；hex 文本转 Buffer 后再比
    const derived = Buffer.from(hashPassword(password, row.salt), 'hex')
    const stored = Buffer.from(row.password_hash, 'hex')
    if (stored.length !== derived.length || !timingSafeEqual(stored, derived)) {
      return fail(res, 401, '用户名或密码错误')
    }
    res.json({ ok: true, user: { username: row.username, display_name: row.display_name } })
  } catch (e) {
    // 最常见未初始化原因：setup.sql 还没跑 / 跑的是旧版没有 users 表
    if (/dbo\.users|Invalid object/i.test(e.message)) {
      return fail(res, 503, '登录服务未初始化：users 表不存在，请先在 SSMS 执行 db/setup.sql，再重启服务端（pnpm server）')
    }
    fail(res, 500, '登录失败：' + e.message)
  }
})

/** 整表查询 */
app.get('/api/tables/:table', async (req, res) => {
  const def = tableOf(req.params.table)
  if (!def) return fail(res, 404, `未知数据表：${req.params.table}`)
  try {
    const p = await pool()
    const r = await p.request().query(`SELECT * FROM dbo.[${req.params.table}] ORDER BY id`)
    res.json({ ok: true, rows: r.recordset.map((row) => shapeRow(req.params.table, def, row)) })
  } catch (e) {
    fail(res, 500, '查询失败：' + e.message)
  }
})

/** 新增一行 */
app.post('/api/tables/:table', async (req, res) => {
  const t = req.params.table
  const def = tableOf(t)
  if (!def) return fail(res, 404, `未知数据表：${t}`)
  if (def.readonly) return fail(res, 403, `${def.label}为只读数据，不支持新增`)
  const { params, err } = buildParams(def, req.body || {})
  if (err) return fail(res, 400, err)
  // 枚举约束（前置判断，命中则给出中文可选值）
  const rule = ENUMS[t]
  if (rule) {
    for (const { col } of params) {
      const okVals = rule[col]
      if (okVals && !okVals.includes(req.body[col])) {
        return fail(res, 400, `字段 ${col} 取值不合法，可选：${okVals.join(' / ')}`)
      }
    }
  }
  try {
    const p = await pool()
    const q = p.request()
    const cols = params.map((x) => x.col).join(', ')
    const ph = params.map((x, i) => `@p${i}`).join(', ')
    params.forEach((x, i) => q.input(`p${i}`, x.sqlType, x.value))
    const r = await q.query(`INSERT INTO dbo.[${t}] (${cols}) OUTPUT INSERTED.id VALUES (${ph})`)
    res.json({ ok: true, id: r.recordset[0].id })
  } catch (e) {
    fail(res, 500, '新增失败：' + e.message)
  }
})

/** 按主键更新（缺省字段不改） */
app.put('/api/tables/:table/:id', async (req, res) => {
  const t = req.params.table
  const def = tableOf(t)
  const id = Number(req.params.id)
  if (!def) return fail(res, 404, `未知数据表：${t}`)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, '非法主键')
  const body = req.body || {}
  if (!Object.keys(body).length) return fail(res, 400, '没有要更新的字段')
  const { params, err } = buildParams(def, body, { partial: true })
  if (err) return fail(res, 400, err)
  const rule = ENUMS[t]
  if (rule) {
    for (const [col, val] of Object.entries(body)) {
      const okVals = rule[col]
      if (okVals && !okVals.includes(val)) return fail(res, 400, `字段 ${col} 取值不合法，可选：${okVals.join(' / ')}`)
    }
  }
  try {
    const p = await pool()
    const q = p.request()
    const set = params.map((x, i) => `[${x.col}] = @p${i}`).join(', ')
    params.forEach((x, i) => q.input(`p${i}`, x.sqlType, x.value))
    q.input('key', sql.Int, id)
    const r = await q.query(`UPDATE dbo.[${t}] SET ${set} WHERE ${KEY} = @key`)
    if (!r.rowsAffected[0]) return fail(res, 404, `记录不存在（id=${id}）`)
    res.json({ ok: true, id })
  } catch (e) {
    fail(res, 500, '更新失败：' + e.message)
  }
})

/** 删除一行 */
app.delete('/api/tables/:table/:id', async (req, res) => {
  const t = req.params.table
  const def = tableOf(t)
  const id = Number(req.params.id)
  if (!def) return fail(res, 404, `未知数据表：${t}`)
  if (def.readonly) return fail(res, 403, `${def.label}为只读数据，不支持删除`)
  if (!Number.isInteger(id) || id <= 0) return fail(res, 400, '非法主键')
  try {
    const p = await pool()
    const q = p.request()
    q.input('key', sql.Int, id)
    const r = await q.query(`DELETE FROM dbo.[${t}] WHERE ${KEY} = @key`)
    if (!r.rowsAffected[0]) return fail(res, 404, `记录不存在（id=${id}）`)
    res.json({ ok: true, id })
  } catch (e) {
    fail(res, 500, '删除失败：' + e.message)
  }
})

/** 一次返回全部业务表（页面启动 / 全局刷新用） */
app.get('/api/mapdata', async (req, res) => {
  try {
    const p = await pool()
    const out = {}
    for (const [t, def] of Object.entries(TABLES)) {
      const r = await p.request().query(`SELECT * FROM dbo.[${t}] ORDER BY id`)
      out[t] = r.recordset.map((row) => shapeRow(t, def, row))
    }
    res.json({ ok: true, data: out })
  } catch (e) {
    fail(res, 500, '读取失败：' + e.message)
  }
})

/** 生产模式：托管 dist 构建产物（同源访问 /api） */
const DIST = join(ROOT, 'dist')
if (process.env.NODE_ENV === 'production' || existsSync(join(DIST, 'index.html'))) {
  app.use(express.static(DIST))
  // Express 5 通配兜底：非 /api 的 GET 一律回 index.html（vue-router history 模式）
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(join(DIST, 'index.html'))
    }
    next()
  })
  console.log(`[server] 已托管前端构建产物 ${DIST}`)
}

/* ================= 登录账户自举 ================= */
/**
 * 首次启动自动把默认管理员写入 dbo.users（insert-if-missing，天然幂等）。
 * 账号/口令可经 server/.env 的 ADMIN_USERNAME / ADMIN_PASSWORD 覆盖（默认 admin / 123456）。
 * 注意：只影响「还不存在的用户」；改口令需删掉该行或手动 UPDATE password_hash/salt 后重启。
 */
async function ensureDefaultAdmin() {
  try {
    const username = String(process.env.ADMIN_USERNAME || 'admin').trim()
    const password = String(process.env.ADMIN_PASSWORD || '123456')
    if (!password) return
    const p = await pool()
    const q = p.request()
    q.input('u', sql.NVarChar, username)
    const r = await q.query('SELECT id FROM dbo.users WHERE username = @u')
    if (r.recordset.length) return // 已存在（可能用户改过密码），不覆盖
    const salt = randomBytes(16).toString('hex')
    const ins = p.request()
    ins.input('u', sql.NVarChar, username)
    ins.input('h', sql.NVarChar, hashPassword(password, salt))
    ins.input('s', sql.NVarChar, salt)
    ins.input('d', sql.NVarChar, '系统管理员')
    await ins.query('INSERT INTO dbo.users (username, password_hash, salt, display_name) VALUES (@u, @h, @s, @d)')
    console.log(`[server] 已创建默认管理员：${username}（口令取 server/.env 的 ADMIN_PASSWORD，未配置默认 123456）`)
  } catch (e) {
    // users 表未建时只提示不崩：引导先跑 db/setup.sql，登录接口会返回 503 文案
    console.warn(`[server] 默认管理员初始化失败（users 表未建？请先在 SSMS 执行 db/setup.sql）：${e.message}`)
  }
}

/* ================= 启动 ================= */
app.listen(PORT, () => {
  console.log(`[server] ZiboSmartTraffic 数据服务已启动 → http://localhost:${PORT}`)
  console.log(`[server] 数据库 ${dbCfg.server}:${dbCfg.port}/${dbCfg.database}（账户 ${dbCfg.user}）`)
  console.log('[server] 健康检查: GET /api/health  |  全量数据: GET /api/mapdata  |  登录: POST /api/auth/login')
  ensureDefaultAdmin() // 自举默认管理员（失败仅 warn，不阻塞服务）
}).on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`[server] 端口 ${PORT} 已被占用——可能已有实例在跑，或换 server/.env 里的 PORT 后重启。`)
  } else {
    console.error('[server] 启动失败：', e)
  }
  process.exit(1)
})

// 兜底错误提示（库未建/连接失败等，把用户引到正确的初始化步骤）
process.on('unhandledRejection', (e) => {
  console.error('[server] 未处理异常：', e.message)
  console.error('[server] 提示：确认已在 SSMS 执行 db/setup.sql（建库+建表+zibo_app 账户）；首次可直接 Ctrl+C 退出。')
})
