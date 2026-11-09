# 崩溃记录：ModuleLoader 注册 id 不一致

> 版本：1.3.0-exile.1（有 bug）→ 1.3.0-exile.2（修复）
> 影响：装上后 DSH 打不开、白屏、反复自动重启

## 现象

装上这个二创插件后：

- 打开 DSH 一片黑，只有鼠标可以动
- 过几秒自己刷新一次，然后又黑，反复十几次
- 重装 DSH 也没用——问题在 profile 里的插件，不在安装包

## 根因

我改包名的时候只改了 `package.json`，漏了 `lib/client.js`。

DSH 的客户端插件通过 `window.__ModuleLoader__.load({ id: '...' })` 注册自己，而且**注册的 id 必须等于 loader entry 名**（也就是包名）。原作的写法是：

```js
window.__ModuleLoader__.load({
  id: 'dsh-startup-screen',   // ← 等于包名
  ...
})
```

我把包名改成 `dsh-startup-screen-exile`，这一行却没动。于是：

1. ModuleLoader 收到 `id: 'dsh-startup-screen'`，但当前 bundle 叫 `dsh-startup-screen-exile`
2. 它认为这个 entry 加载了却没有注册 → 报 `loaded without registering dsh-startup-screen-exile`
3. 客户端半个插件没生效，但宿主半侧**已经把全屏黑罩注入到页面里了**
   （`<div id="dsh-startup-root" class="dsu-root dsu-boot">`，`position: fixed; inset: 0; z-index: 2147483000; background: #000`）
4. 没有人负责拆这个黑罩 → 页面永远黑着
5. 插件自带的兜底逻辑（`9 秒后无条件放开`）也依赖客户端脚本运行，脚本没跑起来 → 兜底也没生效

**黑屏 → 看起来像崩溃 → 重装 DSH 也复现**，因为 profile 是独立的，重装不清理它。

## 修复

`lib/client.js`：

```diff
- id: 'dsh-startup-screen',
+ id: 'dsh-startup-screen-exile',
```

## 三层防崩溃保险（本次新增）

### 1. 宿主侧熔断

`lib/index.js` 增加 `~/.dsh/dsh-startup-panic.json` 计数。连续 3 次启动失败后，**彻底不注入启动动画**——宁可没有动画，也不能让人打不开 DSH。

复位方式：

```powershell
Remove-Item "$env:USERPROFILE\.dsh\dsh-startup-panic.json"
```

或在设置页点「恢复默认」。

### 2. 客户端看门狗

`lib/splash.js` 顶部：

- 8 秒内 `window.__DSH_STARTUP_RUNNING__` 还不是 `true`，就自己把 `#dsh-startup-root` 从 DOM 里摘掉，并写 `sessionStorage['dsh-startup-exile:skip']`
- 下次同会话直接跳过，不再尝试

### 3. 异常兜底

监听 `window` 的 `error` 事件：启动阶段任何未捕获异常也走上面那条拆罩逻辑，并 POST `/dsh-startup/panic` 记账。

## 教训

**改插件包名时，必须同时改三处：**

| 位置 | 内容 |
|---|---|
| `package.json` | `name` |
| `lib/client.js` | `id:`（必须等于包名） |
| profile 的 `package.json` | `dependencies` 键名 + `dsh.profile.bundles` 数组项 |

漏掉第二处 → 白屏；漏掉第三处 → 插件根本不加载（这个反而比较安全）。
