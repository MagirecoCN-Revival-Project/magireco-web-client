# Magireco CN Revival Web Client

面向现代浏览器的魔法纪录客户端兼容运行时。项目的元游戏界面不做近似重绘：玩家加载自己持有的
`magica/` Web 包后，客户端通过 Service Worker 虚拟文件系统直接运行该包，因此资源齐全时，
HTML、CSS、布局、动效与原版 WebView 页面来自同一份运行数据。

> 仓库不包含、也不接受游戏的美术、音频、模型、剧情文本或提取资产。此规则由
> `npm run verify:assets` 在本地与 CI 中检查。

## 当前能力

- 官方 Web 包的 `/magica/*` 同源虚拟文件系统与 HTML 桥注入；
- `/magica/api/*` 与静态文件严格分流，API 可对接复刻服务端；
- `window.androidCommand`、`window.NativeBridge`、`window.CnvBridge` 浏览器兼容层；
- CNV 玩家状态按账号隔离、捕获、持久化与 GET/POST 对接基础；
- 本地目录导入：路径规范化、逐文件 SHA-256、Cache Storage 落盘；
- 鉴权资源清单：按需下载、散列校验、资源令牌与账号令牌分离；
- 账号登录、刷新、退出、设备会话、撤销会话及封禁错误展示；
- 声明式剧情编排器以及可测试的战斗状态/伤害核心；
- PWA 外壳、响应式启动器、运行时诊断及全屏游戏容器。

## 启动

```bash
cp .env.example .env.local
npm install
npm run dev
```

演示接口默认启用，账号 `demo`，密码 `magia`；用户名 `banned` 可检查封禁响应。

生产环境至少配置：

```dotenv
VITE_USE_MOCK_API=false
VITE_API_BASE_URL=https://ACCOUNT_API_HOST/v1
VITE_GAME_API_BASE_URL=https://GAME_API_HOST
```

### 加载玩家本地资源

1. 登录客户端，打开“运行资源”；
2. 选择玩家已有安装中的 `magica/` 目录；
3. 等待入口状态变为 `READY`；
4. 在“启动游戏”页设置真实入口（默认 `index.html`）并启动。

资源写入浏览器的 `magireco-runtime-assets-v1` Cache Storage，不复制到源码目录。

### 服务端按需分发

客户端读取 `GET /v1/resources/manifest?platform=web`。清单中的文件必须有 SHA-256 和短期授权
URL。客户端下载后先校验散列，才将文件映射为 `/magica/<path>`。完整接口见
[docs/API.md](docs/API.md)。

## 设计边界

### 为什么能与原版界面一致

原版的大量菜单、商店、扭蛋、编队等页面本来就是 WebView 中的 `/magica/` HTML5 页面。本项目
运行这份 Web 包，而不是凭截图重画一套 React UI。React 只负责账号、资源准备和运行容器；进入
游戏后由原 Web 包占满容器。Service Worker 对应 Android 客户端的 WebView 静态拦截器。

### Native 场景

剧情、战斗、Live2D、CocoStudio mini 动画和 CRI 音频并非 WebView 元游戏页面的一部分：

- 剧情由 `StoryOrchestrator` 解释声明式 JSON，再交给 Cubism/音频适配器；
- mini 动画可由 MIT 的 cocos2d-html5 直接消费玩家本地 `ExportJson + plist + png`；
- Cubism 运行时由部署方按其许可单独提供，不随仓库再分发；
- HCA/ACB 由部署方接入本地转码或独立授权的 WASM 解码适配器；
- 战斗由净室 TypeScript 引擎逐步覆盖社区公开规则，禁止复制原生二进制实现。

参见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) 与
[docs/RESOURCE-POLICY.md](docs/RESOURCE-POLICY.md)。调研边界与私有仓库采纳点见
[docs/RESEARCH-NOTES.md](docs/RESEARCH-NOTES.md)。

## 验证

```bash
npm run verify
```

该命令依次执行 TypeScript、单元测试、生产构建和资源禁入检查。

## 许可证

GPL-3.0，另见 `LICENSE.additional-terms` 与 `LICENSE.exception`。Live2D Cubism 等外部 SDK
仍受各自条款约束，例外条款不替代 SDK 许可。
