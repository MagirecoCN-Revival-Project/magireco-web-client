# Web 客户端架构

## 1. 总体数据流

```text
React 启动器
  ├─ 账号 API：登录 / 刷新 / 会话 / 封禁
  ├─ 资源 API：签名清单 / 短期资源令牌 / 按需下载
  └─ OfficialRuntime iframe
       ├─ /magica/*       → Service Worker → Cache Storage（玩家资源）
       ├─ /magica/api/*   → Service Worker → GAME_API_HOST
       ├─ CnvBridge       → 账号隔离状态存储
       └─ Native command  → postMessage → Story / Battle / Live2D / Audio adapters
```

React 不承载游戏元界面。它是启动、鉴权、资源安装、设备管理与诊断外壳。

## 2. 与 CNV Android 三层补丁的对应关系

审阅 `magireco-cnv-client` 时必须区分“自有补丁”和“随反编译 APK 附带的原始部分”：

| CNV Android 层 | Web 等价实现 | 是否复用原始代码 |
|---|---|---|
| Smali 的 WebView 静态拦截挂点 | `public/sw.js` 的 `/magica/*` 路由 | 否，仅按行为契约独立实现 |
| Java `WebViewInterceptor` | Service Worker 静态/API 分流和 HTML 桥注入 | 否 |
| Java `CnvJsBridge` | `public/runtime/official-bridge.js` | 否，保留互操作方法形状 |
| SQLite `PlayerStateCache` | 浏览器账号隔离状态存储 | 否 |
| Java `ClientInit` / `NodeDirectory` | Web API 客户端和服务端契约 | 否 |
| Java `ResourceFlow` | `RuntimeAssetStore` | 否 |
| Native C++ 引擎 Hook | 不移植；浏览器适配器接管 native command | 否 |
| 原生 WebView 页面 | 玩家运行时提供的 Web 包 | 仅运行，不进仓库 |
| 原生 Cocos/CRI/Live2D 二进制 | Web 等价运行时 | 不使用原二进制 |

仓库中的 APK、smali、原生库、提取资源和 Web 包均不作为本项目源文件。本项目只使用文档化的
路径、字段、调用顺序和公开格式事实进行互操作实现。

## 3. 虚拟资源文件系统

`RuntimeAssetStore` 的 Cache Storage 名为 `magireco-runtime-assets-v1`。安装流程：

1. 将 `\` 统一为 `/`；
2. 若路径包含 `magica/`，剥离其之前的本地目录；
3. 拒绝空路径与任何 `..` 分段；
4. 对文件完整内容计算 SHA-256；
5. 以同源绝对 URL `/magica/<relative path>` 写入 Cache Storage；
6. 元数据仅记录路径、大小、MIME、散列和安装时间。

Service Worker 只响应同源 `/magica/`。本地资源优先；本地未命中时按 Android 拦截器语义回落
到游戏后端，因此服务端渲染页面仍可工作。命中 HTML 时，在 `<head>` 首部注入兼容桥。
所有 `/magica/api/` 请求在静态查找前分流，永远不会被同名本地文件遮蔽。

## 4. WebView 兼容桥

### `CnvBridge`

```ts
saveState(endpoint, requestJson, responseJson): void
loadAllState(): string
deleteState(endpoint): void
getAccountId(): string
```

端点必须以 `/magica/api/` 开始、长度不超过 512、不得包含路径穿越。状态按 `accountId`
分区。官方页面通过 `fetch` 或 `XMLHttpRequest` 发出的成功 `POST /magica/api/user/*` 都会被
捕获；确认响应另存入状态 Cache Storage，Service Worker 可在 GET 早于 POST 回放完成时直接注入。

### `androidCommand`

`jsCallback(raw)` 将 JSON 或字符串包装成 `MAGIRECO_NATIVE_COMMAND`，通过同源
`postMessage` 发给外壳。外壳再按 `command` 路由到剧情、战斗、Live2D、音频或窗口适配器。
未知命令必须保留原始 payload 并记录，不应静默丢弃；这样可通过真实数据枚举补齐指令集。

### `NativeBridge`

提供原页面常见的版本、包名、设备标识、剩余空间、打开 URL、剪贴板、屏幕锁和退出等方法。
涉及系统能力的方法采用 Web API；不适用的方法是明确的无副作用实现。

## 5. Native 场景适配

### 剧情

`src/engine/story.ts` 对 `{version, story: {group_N: step[]}}` 进行顺序解释：

- 角色 `id/face/motion/pos/voice/cheek/effect` 传给场景适配器；
- `se` 传给音频适配器；
- `autoTurn/autoTurnLast` 控制推进；
- 未识别字段原样传给 `applyUnknown`，便于采集完整指令集。

表现层应同时适配 Cubism 2 的旧表达文件与 Cubism 4 的 `moc3/model3.json`。SDK 由部署方按
许可提供，游戏模型由玩家运行时提供。

### 2D mini

玩家资产中的 CocoStudio `ExportJson + plist + png` 可由同族 Web 引擎直接读取。建议将
cocos2d-html5 作为独立、保留 MIT 许可的部署依赖，并按以下路径适配：

```text
ccs.armatureDataManager.addArmatureFileInfo(exportJsonUrl)
new ccs.Armature(armatureName)
armature.getAnimation().play(movement)
```

任何示例测试都应使用项目自制几何图形，不得提交游戏图集。

### 战斗

`src/engine/battle.ts` 提供可测试的单位、属性相克、Disc、Charge、MP、效果回合、伤害事件和
胜负状态核心。其输入保持结构化，后续可将 `quest/native/get` 的定义规范化后加载。服务端必须
独立校验客户端上报结果的合理范围，奖励与掉落不可由客户端决定。

## 6. 安全模型

- 外壳访问令牌默认存 `sessionStorage`，关闭标签即失效；
- 资源令牌与账号令牌分离，资源 URL 短期有效；
- Service Worker 删除入站 `cookie/host`，按配置追加 Bearer；
- 资源在落盘前校验 SHA-256；
- 清单应由服务端签名，根公钥随可信构建固定；
- API 节点按签名目录的 `caps` 路由，资源节点不接收账号凭证；
- 本地路径和云端 path 都必须经过同一规范化逻辑；
- iframe 的资源与页面是玩家主动提供的可信游戏包；部署时建议专用 origin，与管理后台隔离。

## 7. 生产部署建议

1. 将启动器部署到独立游戏 origin；
2. Service Worker scope 保持 `/`；
3. API 允许该 origin，资源文件允许 Range 与强缓存；
4. COOP/COEP 仅在 WASM 音频解码需要共享内存时启用；
5. 将 Cubism/cocos/HCA 适配器作为独立 vendor 构建，不嵌入游戏资产；
6. CI 运行 `npm run verify`；
7. 对清单签名、散列不匹配、路径穿越、过期令牌和封禁中断做端到端测试。
