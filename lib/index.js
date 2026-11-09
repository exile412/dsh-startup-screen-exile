/* ============================================================================
 * dsh-startup-screen — Host 半侧
 * ----------------------------------------------------------------------------
 * 做三件事：
 *   1) 在 index.html 里注入「启动界面」：首屏兜底黑幕 + 关键 CSS + 配置 + 运行时
 *   2) 提供 /dsh-startup/splash.css · splash.js · config 三个路由
 *   3) 把配置持久化到 ~/.dsh/dsh-startup.json（设置页经 /dsh-startup/config 读写）
 *
 * 说明：配置刻意不走 settings 命名空间，而是自带一份 JSON + 自带设置面板
 * （与 dsh-meme 同款做法），这样不受 dsh-settings 版本变更影响。
 * ========================================================================== */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh')
const CONFIG_FILE = path.join(DSH_HOME, 'dsh-startup.json')

const NS = 'dsh-startup-screen'
const ROUTE_BASE = '/dsh-startup'

/** 插件版本：读自己的 package.json，避免源码与版本号两处各写一份。
    读不到就退回占位符（设置页会显示它，不会显示 undefined）。 */
const PLUGIN_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    const v = String(pkg.version || '').trim()
    return v || '0.0.0'
  } catch (err) {
    return '0.0.0'
  }
})()

/** 默认配置：字段与 lib/splash.js 的 DEFAULTS 一一对应。 */
const DEFAULTS = {
  enabled: true,
  mode: 'session',            // always | session | daily
  theme: 'light',             // light | dark
  speed: 1,
  requireInteraction: true,
  allowSkip: true,
  sound: true,                // 界面音效（WebAudio 合成，无音频文件）
  soundVolume: 0.5,
  voice: true,                // 女声播报（Web Speech API）
  voiceLang: 'en',            // en | zh | both
  voiceName: '',              // '' = 自动挑（按分数优先神经网络女声）
  voiceRate: 0.88,            // 电影旁白档：比朗读慢，字与字之间才有重量
  voicePitch: 0.85,           // 压低音调，深沉的 AI 女声
  voiceVolume: 0.9,
  voiceCue: true,             // 念台词前的一声轻提示
  sfx: 'audio',               // 音效来源：audio=lib/assets 里的真素材 / synth=现场合成
  voiceSource: 'asset',       // 语音来源：asset=优先用真声素材（拿不到自动回落 TTS）/ tts=全 TTS
  voiceLead: 240,             // 提示音之后留一小段空白再开口
  cornerZh: 'AI不止于现在更能改变未来',
  cornerEn: 'AI IS MORE THAN NOW. IT CHANGES THE FUTURE.',
  identity: 'JOYCE MOORE',    // ← 设置页里可改的「身份名称」
  identityId: '0087',
  accessLevel: '3',
  brand1: 'DEEPSEEK',
  brand2: 'SYNTHESIZE INTELLIGENCE',
  brand3a: 'HARNESS',
  brand3b: 'OS',
  orgZh: '深度求索',
  orgEn: 'DEEPSEEK',
  orgSub: 'DEEPSEEK HARNESS',
  welcomeBox: 'DEEPSEEK HARNESS',
  footer: 'POWERED BY DEEPSEEK',
  accent: '#ff7500',
  glitchA: '#ff3b30',
  glitchB: '#2971b8',
  /* 液态玻璃：底板/黑幕改成半透明的磨砂层，透过它能看到后面的界面或窗口。
     文字、线条、鲸鱼标识这些「主体素材」保持不透明，只让背景层透。
     出厂默认按「整窗重磨砂 + 文字锐利」的观感调：两档模糊都开到 22px 左右。 */
  glass: true,                // 总开关（默认开：这是本版的默认观感）
  glassOpacity: 0.75,         // 0.15 ~ 0.95：越低越透；0.75 时背后是「暖白模糊」而不是灰
  glassBlur: 22,              // 0 ~ 60px：玻璃自身的磨砂
  glassSaturate: 160,         // 100 ~ 200%：玻璃后面的饱和度（液态玻璃那种通透感）
  glassBackdropBlur: 28       // 0 ~ 80px：背景模糊（实际作用于应用本体，超过 60 会糊成纯色）
}

const TEXT_KEYS = [
  'identity', 'identityId', 'accessLevel',
  'brand1', 'brand2', 'brand3a', 'brand3b',
  'orgZh', 'orgEn', 'orgSub', 'welcomeBox', 'footer', 'voiceName'
]
const COLOR_KEYS = ['accent', 'glitchA', 'glitchB']
const ENUMS = {
  mode: ['always', 'session', 'daily'],
  theme: ['light', 'dark'],
  voiceLang: ['en', 'zh', 'both'],
  sfx: ['audio', 'synth'],
  voiceSource: ['asset', 'tts']
}
const BOOL_KEYS = ['enabled', 'requireInteraction', 'allowSkip', 'sound', 'voice', 'voiceCue', 'glass']
/** 数值字段的合法区间（越界即夹取）。 */
const RANGES = {
  speed: [0.35, 3],
  soundVolume: [0, 1],
  voiceRate: [0.5, 2],
  voiceLead: [0, 1200],
  voicePitch: [0, 2],
  voiceVolume: [0, 1],
  glassOpacity: [0.15, 0.95],
  glassBlur: [0, 60],
  glassSaturate: [100, 200],
  glassBackdropBlur: [0, 80]
}

function normalize(input) {
  const out = { ...DEFAULTS }
  const src = input && typeof input === 'object' ? input : {}
  for (const key of Object.keys(DEFAULTS)) {
    if (!(key in src) || src[key] === undefined || src[key] === null) continue
    const value = src[key]
    if (BOOL_KEYS.includes(key)) {
      out[key] = value === true || value === 'true' || value === 1 || value === '1'
    } else if (ENUMS[key]) {
      out[key] = ENUMS[key].includes(value) ? value : DEFAULTS[key]
    } else if (key === 'speed' || RANGES[key]) {
      const [lo, hi] = RANGES[key] || RANGES.speed
      const n = Number(value)
      out[key] = Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : DEFAULTS[key]
    } else if (COLOR_KEYS.includes(key)) {
      const s = String(value).trim()
      out[key] = /^#[0-9a-fA-F]{3,8}$/.test(s) ? s : DEFAULTS[key]
    } else if (TEXT_KEYS.includes(key)) {
      out[key] = String(value).slice(0, 64)
    } else {
      out[key] = value
    }
  }
  if (!String(out.identity).trim()) out.identity = DEFAULTS.identity
  if (!String(out.identityId).trim()) {
    out.identityId = String(out.identity).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12)
  }
  if (!String(out.identityId).trim()) out.identityId = 'OPERATOR'
  return out
}

/* 读取用户配置。这里刻意做成「永不抛错」：
 * 文件不存在、读不了、JSON 写坏，都只打一行 warn 然后返回 {}，
 * 让上层的 DEFAULTS 接管，动画照常跑，不中断 apply 流程。 */
function readConfig() {
  let raw = null
  try {
    raw = fs.readFileSync(CONFIG_FILE, 'utf8')
  } catch (err) {
    /* 文件本来就不存在是正常情况，不必吵 */
    if (!err || err.code !== 'ENOENT') {
      console.warn('[dsh-startup-screen-exile] 读取配置失败，忽略用户配置：' + ((err && err.message) || err))
    }
    return {}
  }
  try {
    return normalize(JSON.parse(raw))
  } catch (err) {
    console.warn('[dsh-startup-screen-exile] 配置文件 JSON 解析失败，已跳过用户配置，使用默认动画：' + ((err && err.message) || err))
    return {}
  }
}

function writeConfig(next) {
  const cfg = normalize(next)
  fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true })
  const tmp = CONFIG_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), 'utf8')
  fs.renameSync(tmp, CONFIG_FILE)
  return cfg
}

/** 静态文件按 mtime 缓存，改完插件刷新页面即生效。 */
function makeReader(rel) {
  let cache = null
  return function read() {
    const file = path.join(PACKAGE_ROOT, rel)
    try {
      const st = fs.statSync(file)
      if (!cache || cache.mtimeMs !== st.mtimeMs) {
        cache = { mtimeMs: st.mtimeMs, text: fs.readFileSync(file, 'utf8') }
      }
      return cache.text
    } catch (err) {
      return ''
    }
  }
}

const readSplashCss = makeReader('lib/splash.css')
const readSplashJs = makeReader('lib/splash.js')

/** 内联脚本里绝对不能出现 `</script>`。 */
function safeJson(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028|\u2029/g, '')
}

/** 首屏兜底：在应用挂载前先把窗口盖住，避免闪出界面本体。 */
const CRITICAL_CSS = [
  'html.dsu-lock,html.dsu-lock body{overflow:hidden!important}',
  /* DSH 0.2.1 起 index.html 会先写一条 :root{color-scheme:light}body{background-color:#fff;--dsh-boot-bg:#fff}，
     我们的覆盖层插入前/玻璃透明时都会露出这层白 → 启动期一律压成黑色（与黑幕开场一致）。 */
  'html.dsu-lock body{background-color:#000!important}',
  ':root{--dsh-boot-bg:#000}',
  '#dsh-startup-root.dsu-boot{position:fixed;inset:0;z-index:2147483000;background:#000}'
].join('')

const BOOTSTRAP_JS = `(function(){try{
var c=window.__DSH_STARTUP__||{};
var root=document.getElementById('dsh-startup-root');
var off=!c.enabled;
if(!off&&c.mode==='session'&&sessionStorage.getItem('dsh-startup-screen:shown')==='1')off=true;
if(!off&&c.mode==='daily'&&localStorage.getItem('dsh-startup-screen:day')===new Date().toISOString().slice(0,10))off=true;
if(off){window.__DSH_STARTUP_SKIP__=true;if(root&&root.parentNode)root.parentNode.removeChild(root);}
else{document.documentElement.classList.add('dsu-lock');/* 兜底：连 splash.js 都没跑起来（404/被拦/语法错）时，9 秒后无条件放行，绝不锁黑屏。判据是「时间线有没有开始跑」而不是类名 —— dsu-boot 在 run() 之前就被摘掉，按类名判等于永不生效 */setTimeout(function(){try{if(window.__DSH_STARTUP_RUNNING__===true)return;var r=document.getElementById('dsh-startup-root');if(r&&r.parentNode)r.parentNode.removeChild(r);document.documentElement.classList.remove('dsu-lock');if(document.body)document.body.style.overflow='';window.__DSH_STARTUP_FAILED__=true;}catch(e){}},9000);}
}catch(e){} })()`

const LATE_MOUNT_JS = `(function(){try{
var c=window.__DSH_STARTUP__||{};
if(c.enabled===false)return;
try{
  if(c.mode==='session'&&sessionStorage.getItem('dsh-startup-screen:shown')==='1')return;
  if(c.mode==='daily'&&localStorage.getItem('dsh-startup-screen:day')===new Date().toISOString().slice(0,10))return;
}catch(e){}
var R=window.__DSH_STARTUP_ROUTE__||'/dsh-startup';
function tear(reason){
  try{
    var r=document.getElementById('dsh-startup-root');
    if(r&&r.parentNode)r.parentNode.removeChild(r);
    document.documentElement.classList.remove('dsu-lock');
    if(document.body)document.body.style.overflow='';
  }catch(e){}
  window.__DSH_STARTUP_FAILED__=true;
  try{console.warn('[dsh-startup-exile] overlay released: '+reason)}catch(e){}
  try{fetch(R+'/panic',{method:'POST',keepalive:true}).catch(function(){})}catch(e){}
}
window.__DSH_STARTUP_TEAR__=tear;
function mount(){
  try{
    if(document.getElementById('dsh-startup-root'))return;
    if(!document.body)return;
    var root=document.createElement('div');
    root.id='dsh-startup-root';
    root.className='dsu-root dsu-boot';
    document.body.appendChild(root);
    /* 硬上限 30 秒：动画没跑完就拆掉，应用本身不受影响 */
    setTimeout(function(){
      if(window.__DSH_STARTUP_RUNNING__===true)return;
      tear('30s cap');
    },30000);
    var s=document.createElement('script');
    s.src=R+'/splash.js';s.defer=true;
    s.onerror=function(){tear('splash.js load error')};
    document.body.appendChild(s);
  }catch(e){tear('mount error: '+(e&&e.message))}
}
if(document.readyState==='complete')setTimeout(mount,900);
else window.addEventListener('load',function(){setTimeout(mount,900)});
}catch(e){}})()`

const name = NS
const inject = ['webServer', 'connection']

/**
 * 取得 HTTP 载体服务。
 *
 * web profile 与桌面端（DeepSeek Harness Desktop）都会挂 `@deepseek-ai/dsh-web-app`，
 * 其中 `webserver` 这一行提供 `webServer`；但 Electron 也可能改成 `file://` + IPC
 * 直接下发前端（`dsh-host-webserver` 的文档注释就写着 "Electron uses file:// plus
 * IPC instead"）。那种情况下没有 webServer，本插件不该把一颗 fiber 炸掉 ——
 * 交给客户端半侧自举（`lib/client.js` 的 selfBoot）。
 */
function resolveWebServer(ctx) {
  try {
    const viaGet = typeof ctx.get === 'function' ? ctx.get('webServer') : undefined
    if (viaGet) return viaGet
  } catch (err) { /* 取不到就当没有 */ }
  return ctx.webServer
}

function hasRoutes(server) {
  return !!server && typeof server.register === 'function' && typeof server.tapIndex === 'function'
}

function apply(ctx) {
  const disposers = []
  const webServer = resolveWebServer(ctx)

  /** 没有可注册路由的 HTTP 载体：桌面端若走 IPC 下发前端就是这种形态。
      什么都不注册（plugin 仍然 APPLIED，不报错），页面由客户端半侧自举。 */
  if (!hasRoutes(webServer)) {
    try {
      ctx.logger?.warn?.(
        '[' + NS + '] 当前 profile 没有可用的 webServer（桌面端可能用 file:// + IPC 下发前端）；' +
        'Host 半侧跳过路由与首屏注入，改由浏览器半侧自举启动界面。'
      )
    } catch (err) { /* 日志失败不影响加载 */ }
    return
  }

  /** 浏览器信任栅栏：自定义路由必须过一遍，否则可被任意网页读写。 */
  function rejected(req, res) {
    try {
      const conn = (typeof ctx.get === 'function' ? ctx.get('connection') : undefined) || ctx.connection
      if (!conn || typeof conn.requestRejection !== 'function') return false
      const code = conn.requestRejection(req)
      if (code === undefined || code === null || code === false) return false
      res.statusCode = typeof code === 'number' ? code : 403
      res.end()
      return true
    } catch (err) {
      return false
    }
  }

  function registerRoute(route) {
    const inner = route && route.handler
    const wrapped = Object.assign({}, route, {
      handler: async (req, res) => {
        if (rejected(req, res)) return
        return inner(req, res)
      }
    })
    return webServer.register(wrapped)
  }

  function sendJson(res, code, payload) {
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    res.writeHead(code, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }

  function readBody(req, limit = 64 * 1024) {
    return new Promise((resolve) => {
      let size = 0
      const chunks = []
      req.on('data', (c) => {
        size += c.length
        if (size > limit) {
          req.destroy()
          resolve('')
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', () => resolve(''))
    })
  }

  function sendText(res, type, text) {
    const body = Buffer.from(text, 'utf8')
    res.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': 'no-store',
      'Content-Length': String(body.length)
    })
    res.end(body)
  }


/* ── 防崩溃熔断（EXILE 二创新增）─────────────────────────────────────
 * 连续 3 次启动动画没跑起来，就不再注入，保证 DSH 一定能正常打开。
 * 复位：删掉下面的 PANIC_FILE，或把 failures 改成 0。 */
const PANIC_FILE = path.join(DSH_HOME, 'dsh-startup-panic.json')

function readPanic() {
  try {
    const raw = JSON.parse(fs.readFileSync(PANIC_FILE, 'utf8'))
    return { failures: Number(raw.failures) || 0, last: raw.last || null }
  } catch (err) {
    return { failures: 0, last: null }
  }
}

function writePanic(state) {
  try {
    fs.mkdirSync(path.dirname(PANIC_FILE), { recursive: true })
    fs.writeFileSync(PANIC_FILE, JSON.stringify(state, null, 2), 'utf8')
  } catch (err) { /* noop */ }
}

function bumpPanic() {
  const st = readPanic()
  st.failures = (st.failures || 0) + 1
  st.last = new Date().toISOString()
  writePanic(st)
  return st
}

/* ── 启动看护（EXILE 二创新增）────────────────────────────────────────
 * 注入前写一个「本次启动进行中」标记；客户端跑完动画会清掉它。
 * 下次启动若发现标记还在（说明上次是崩在这一步），累计 2 次就自动停用，
 * 避免用户被反复卡在黑屏/重启里。 */
const BOOT_FILE = path.join(DSH_HOME, 'dsh-startup-boot.json')

function readBoot() {
  try { return JSON.parse(fs.readFileSync(BOOT_FILE, 'utf8')) } catch (err) { return null }
}

function writeBoot(obj) {
  try {
    fs.mkdirSync(path.dirname(BOOT_FILE), { recursive: true })
    fs.writeFileSync(BOOT_FILE, JSON.stringify(obj), 'utf8')
  } catch (err) { /* noop */ }
}

function clearBoot() { try { fs.unlinkSync(BOOT_FILE) } catch (err) { /* noop */ } }

/* 返回 true 表示这次可以注入 */
function claimBoot() {
  const prev = readBoot()
  if (prev && prev.pending) {
    const age = Date.now() - (Number(prev.at) || 0)
    if (age > 60000) {
      const st = bumpPanic()
      console.warn('[dsh-startup-screen-exile] 上次启动未完成（标记 ' + Math.round(age / 1000) +
        ' 秒前），疑似崩在启动动画，累计 ' + st.failures + ' 次')
      if (st.failures >= 2) {
        console.warn('[dsh-startup-screen-exile] 已自动停用启动动画。删除 ' + PANIC_FILE + ' 可恢复。')
        clearBoot()
        return false
      }
    }
  }
  writeBoot({ pending: true, at: Date.now() })
  return true
}

function resetPanic() {
  writePanic({ failures: 0, last: null })
}

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.css',
    handler: (req, res) => sendText(res, 'text/css; charset=utf-8', readSplashCss())
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/splash.js',
    handler: (req, res) => sendText(res, 'application/javascript; charset=utf-8', readSplashJs())
  }))

  /* 音频素材：从用户提供的音轨里抠出来的音效（选项/确认音）。
     只读、白名单、不含子路径 —— 杜绝目录穿越。素材缺失时浏览器会自动回落到合成音。 */
  disposers.push(registerRoute({
    kind: 'prefix',
    path: ROUTE_BASE + '/asset',
    handler: (req, res) => {
      const name = path.basename(decodeURIComponent((req.url || '').split('?')[0]))
      if (!/^[a-z0-9._-]+\.(mp3|png|mp4|webm|jpg)$/i.test(name) || name.includes('..')) {
        res.writeHead(404); res.end(); return
      }
      const file = path.join(PACKAGE_ROOT, 'lib', 'assets', name)
      let bytes
      try { bytes = fs.readFileSync(file) } catch (err) {
        res.writeHead(404); res.end(); return
      }
      const ext = (name.split('.').pop() || '').toLowerCase()
      const mime = ext === 'png' ? 'image/png'
        : ext === 'mp4' ? 'video/mp4'
        : ext === 'webm' ? 'video/webm'
        : ext === 'jpg' ? 'image/jpeg'
        : 'audio/mpeg'
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=86400',
        'Content-Length': String(bytes.length)
      })
      res.end(bytes)
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/alive',
    handler: (req, res) => {
      clearBoot()
      resetPanic()
      sendJson(res, 200, { ok: true })
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/panic',
    handler: (req, res) => {
      const st = bumpPanic()
      console.warn('[dsh-startup-screen-exile] 客户端上报启动失败，累计 ' + st.failures + ' 次')
      sendJson(res, 200, { ok: true, failures: st.failures })
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/panic/reset',
    handler: (req, res) => {
      resetPanic()
      sendJson(res, 200, { ok: true, failures: 0 })
    }
  }))

  disposers.push(registerRoute({
    kind: 'exact',
    path: ROUTE_BASE + '/config',
    handler: async (req, res) => {
      const method = (req.method || 'GET').toUpperCase()
      if (method === 'GET') {
        sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: readConfig(), defaults: DEFAULTS, file: CONFIG_FILE })
        return
      }
      if (method !== 'POST') {
        sendJson(res, 405, { ok: false, error: 'method not allowed' })
        return
      }
      const text = await readBody(req)
      let payload = {}
      try {
        payload = text ? JSON.parse(text) : {}
      } catch (err) {
        sendJson(res, 400, { ok: false, error: 'invalid json' })
        return
      }
      try {
        if (payload && payload.action === 'reset') {
          const cfgNow = writeConfig(DEFAULTS)
          sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
          return
        }
        const current = readConfig()
        const patch = payload && typeof payload.patch === 'object' && payload.patch ? payload.patch : payload
        const cfgNow = writeConfig({ ...current, ...patch })
        sendJson(res, 200, { ok: true, version: PLUGIN_VERSION, config: cfgNow, defaults: DEFAULTS })
      } catch (err) {
        sendJson(res, 500, { ok: false, error: String((err && err.message) || err) })
      }
    }
  }))

  disposers.push(webServer.tapIndex((html) => {
    if (!html || html.includes(ROUTE_BASE + '/splash.js')) return html
    const cfg = { ...DEFAULTS, ...readConfig() }
    /* 熔断：连续失败太多次就彻底不注入，宁可没有启动动画也不要打不开 */
    const panicState = readPanic()
    if (panicState.failures >= 3) {
      console.warn('[dsh-startup-screen-exile] 启动动画已熔断（连续失败 ' + panicState.failures +
        ' 次）。删除 ' + PANIC_FILE + ' 可复位。')
      return html
    }
    if (cfg && cfg.enabled === false) return html
    if (!claimBoot()) return html
    const head =
      '<link rel="stylesheet" href="' + ROUTE_BASE + '/splash.css">' +
      '<style id="dsh-startup-critical">' + CRITICAL_CSS + '</style>'
    /* 浮层模式：页面里只放一段「等应用画完之后再造浮层」的脚本，
       绝不把全屏遮罩写进 HTML —— 动画失败时最多损失一层浮层。 */
    const body =
      '<script>window.__DSH_STARTUP_BOOT__="index";window.__DSH_STARTUP_VERSION__=' + safeJson(PLUGIN_VERSION) + ';window.__DSH_STARTUP__=' + safeJson(cfg) + ';' +
      'window.__DSH_STARTUP_ROUTE__=' + safeJson(ROUTE_BASE) + ';' +
      LATE_MOUNT_JS + '</script>'

    let out = html
    if (out.includes('</head>')) out = out.replace('</head>', head + '</head>')
    else out = head + out
    if (out.includes('<body>')) out = out.replace('<body>', '<body>' + body)
    else if (out.includes('</body>')) out = out.replace('</body>', body + '</body>')
    else out = out + body
    return out
  }))

  ctx.effect(() => () => {
    for (const dispose of disposers) {
      try { dispose() } catch (err) { /* noop */ }
    }
  })
}

/* 导出形状对齐 DSH 内部插件（如 dsh-host-open-in-app）：
   只给具名 name / inject / apply。
   两点刻意不做：
   1) 不导出 default —— cordis-plugin-loader 的 unwrapExports 是
      `exports.default ?? exports`，一旦有 default 就只认 default，
      两边都写反而多一个"改一处忘一处"的坑；
   2) 不导出 Config —— Cordis 约定 Config 是 schemastery schema，
      我这份只是普通默认值对象，当 schema 用会炸。本插件也不吃 profile 配置。 */
export { apply, inject, name }
