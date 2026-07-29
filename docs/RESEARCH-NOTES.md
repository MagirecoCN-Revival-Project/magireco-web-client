# 实现调研记录

本文只记录可复核的互操作结论，不复制第三方资源或实现正文。

## 本地资源

### `kyu.gay-mirror`

- 已验证的关键路径是 cocos2d-html5 的 `cocostudio` 模块；
- CocoStudio 定义经
  `ccs.armatureDataManager.addArmatureFileInfo` → `ccs.Armature` 直接装载；
- 动作从 `animation_data[].mov_data` 枚举，循环标志来自 movement 数据；
- 镜像内含提取图集，故只采纳格式/调用结论，没有复制任何文件。

### 魔法纪录 Wiki 镜像

- 只用于战斗公式、效果语义、属性关系与字段对照；
- Wiki 页面、图片、导出文件均不进入仓库；
- 战斗引擎测试使用独立构造的数字和通用单位 ID。

## 社区项目

| 项目类别 | 已验证结论 | 采用方式 |
|---|---|---|
| cocos2d-html5 mini 查看器 | 原格式可在 Canvas 渲染 | 运行时适配，资产由玩家提供 |
| Web Live2D 查看器 | 原资源路径与 Cubism Web 路径可行 | 独立 SDK/vendor 层 |
| Totentanz/CNV 服务端 | `/magica/api/` 可由兼容后端承接 | API 代理契约 |
| CNV Android 客户端 | WebView 静态/API 分流、状态桥和资源流程 | 按文档独立实现 |

无明确开源许可证的仓库只用于理解行为，不复制代码。许可证兼容的依赖也必须保留许可证文本。

## `magireco-cnv-client` 补丁甄别

审阅范围包括项目 README 和 `website/tech/` 下的架构、协议、资源、WebView、引擎数据契约与
Web 化评估。结论：

1. 自有补丁是 smali 挂点、`patch/src/main/java/io/kamihama/**` 和 native hook；
2. APK 原始代码、资产、库与反编译输出不是可复用源码；
3. 元游戏页面原本运行在 WebView，`/magica/api/` 留在网络，静态 `/magica/` 可本地命中；
4. `CnvBridge` 的稳定互操作面是 save/load/delete/accountId；
5. 资源准备包含在线清单、镜像、断点、校验、心跳与封禁动作；
6. 签名目录的签名对象是 base64url payload 字符串本身，且有 seq 防回滚；
7. native 层只作为数据播放器/引擎，不应移植原二进制；剧情和战斗定义是结构化数据。

因此 Web 端选择 Service Worker + Cache Storage + JS bridge，而不是携带 APK 或模拟 Java/Native
进程。

## HiiragiNemu 私有仓库

在获授权的
`HiiragiNemu/MagiaExedraLive2DViewerPersonal@feature/story-playback-local-complete`
中只读检查了 `package.json`、`src/storyParser.ts`、`src/lapplive2dmanager.ts`、
`src/main.ts` 与清单生成工具。它面向 Exedra 而非本作，不能把剧情 schema 直接等同；仍得到几条
可迁移的工程结论：

- 解析器不假定列顺序，保留完整 `fields/rawRowData` 以发现新 opcode；
- 场景需要同时管理多个模型，而不是单一 viewer；
- 模型加载必须是 Promise 生命周期，失败时从管理器移除，离场时主动 release；
- 投影矩阵、宽高比、模型位置和后处理 tint 属于场景编排层；
- 音频、背景、对白与模型资源应由独立 manifest 建索引；
- Cubism Core/Framework 带独立 Live2D 许可，不得因为仓库访问权限而忽略其条款。

本项目据此让 `StoryOrchestrator` 对未知键调用 `applyUnknown`，并把渲染器定义为异步 adapter；
没有复制该私人仓库源文件，也没有导入其资源与 SDK。

## 仍需通过真实玩家资源完成的兼容矩阵

| 领域 | 自动化方法 | 通过条件 |
|---|---|---|
| Web 入口 | 遍历候选 HTML 并启动 | 原页面首屏无 404 |
| 静态路径 | 记录 `/magica/*` 请求 | 已装资源 100% 命中 |
| JS bridge | 枚举 `androidCommand` payload | 已知命令有 adapter，未知命令保留 |
| 剧情 opcode | 汇总所有 step key/type | 未知集合清零或有显式兼容策略 |
| Live2D | 按模型版本分组跑表情/动作 | 无泄漏、错位或动作死锁 |
| mini | 枚举 armature movement | 动作、循环、锚点与原版观察一致 |
| 音频 | A/B 时间轴 | 起播、淡入淡出、循环点误差在验收阈值内 |
| 战斗 | Wiki 规格 + 统计旁证 | 公式、不变量和状态时序一致 |

这些测试的输入与截图留在受控测试环境，不提交到代码仓库。
