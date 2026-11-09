# 这是一次更新，不是新项目

## 用途

给 DeepSeek Harness 装一段启动动画：双击图标后，黑幕亮出 EXILE 标识，过曝洗白，落在一张暖白的"技术档案"底板上，走五步访问授权，最后色散揭幕进入主界面。

底下铺一层绿色二进制数字雨（0/1 纵向流为主，后段横向穿插），带 CRT 扫描线、像素噪点、数字拖影。左上角常驻一行「AI不止于现在更能改变未来」，中英各一。

**它只是一个视觉插件**：不碰 DSH 的配置、不碰会话数据、不接管任何功能。不想看就把它从 `dsh.profile.bundles` 移除，DSH 立刻恢复原样。

## 原创归属

| | |
|---|---|
| 原作 | [6shenhonghong9/dsh-startup-screen](https://github.com/6shenhonghong9/dsh-startup-screen) v1.3.0 |
| 原作者 | 沈宏宏（@6shenhonghong9），MIT |
| 本仓库 | 二创，同样 MIT，保留原作者版权声明 |

**不是从零写的。** 本仓库从原作发布包原样复制，只改内容：

1. 标识 → EXILE 圆形电路图（透明 PNG，去掉了生成工具的水印）
2. 第一幕文案 → EXILE / 不止AI，步入生活，改变生活 / MORE THAN AI · STEP INTO LIFE
3. 第二幕左上角 → 新增一行中英提示（写进配置，带兜底）
4. 背景 → 新增绿色二进制数字雨，压在最底层

时间线、五步授权序列、玻璃底板、语音与音效系统、设置页框架，全部是原作的。

## 与上一版的关系（为什么叫"更新"）

上一版（本地目录名 `dsh-startup-screen-exile`）是在原作上不断叠补丁改出来的，叠到后来自己都理不清，期间三次把 DSH 卡在黑屏。

这一版换了做法：**从原版 1.3.0 重新复制一份**，只改上面那四处内容，不带任何自己加的"保险"逻辑。包名也从 `dsh-startup-screen-exile` 改成 `dsh-startup-exile`。

所以：

- **新版** `dsh-startup-exile` —— 当前启用
- **旧版** `dsh-startup-screen-exile` —— 停用，留在 node_modules 里当历史备份，不回滚也不删

两者包名不同，可以共存，不会互相覆盖。

## 改文案

`~/.dsh/dsh-startup.json`：

```json
{
  "cornerZh": "AI不止于现在更能改变未来",
  "cornerEn": "AI IS MORE THAN NOW. IT CHANGES THE FUTURE.",
  "brand1": "EXILE",
  "brand2": "不止AI，步入生活，改变生活"
}
```

保存后刷新页面生效。字段缺失或留空，会用代码里的兜底文案。
