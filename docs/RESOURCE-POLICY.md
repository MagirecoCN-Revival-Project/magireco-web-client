# 资源与版权边界

## 仓库允许内容

- 独立编写的 TypeScript、JavaScript、CSS、测试与文档；
- 接口字段、路径、枚举、公开文件格式等互操作事实；
- 明确兼容且保留许可证的第三方运行时代码；
- 项目自行生成的抽象测试图形和无版权负担的测试数据。

## 仓库禁止内容

- 游戏 PNG/JPG/WebP 图集、卡面、立绘、背景、UI 图；
- 游戏 HCA/ACB/MP3/OGG/WAV 音频；
- 游戏 Live2D 模型、动作、表情和派生转换文件；
- 游戏剧情台词、完整脚本、master data 内容；
- APK、`.so`、dex、smali 或其反编译/反汇编产物；
- 从镜像、Wiki 或查看器项目复制出来的官方素材；
- 将官方素材编码成 base64、压缩包或其他变体。

## 运行时允许来源

1. 玩家从自己的既有安装中选择 `magica/` 目录；
2. 复刻计划资源服务确认账号/设备权限后下发短期 URL；
3. 玩家自行运行的本地资源服务。

三类来源都只进入浏览器 Cache Storage，不写 Git 工作树。服务端必须维护来源、许可和删除机制。

## 自动检查

`scripts/verify-assets.mjs` 拒绝常见图片、音频、模型、图集和 CocoStudio 资源扩展名。CI 还应增加：

```bash
git diff --cached --numstat
git ls-files -z | xargs -0 file
npm run verify:assets
```

扩展名检查只是第一道门；代码审查仍需排查伪装扩展名、base64 媒体、二进制 blob 和大段剧情文本。

## 第三方项目使用口径

- `magireco-cnv-client`：只读取复刻项目自有补丁文档与接口行为；不复制原 APK 部分；
- `kyu.gay` 本地镜像与社区 viewer：用于验证 cocos2d-html5 能读取 CocoStudio 格式，不复制附带素材；
- Magireco Wiki 镜像：用于核对公开战斗规则和 schema，不把页面或图片导入源码；
- 未声明开源许可证的查看器/私人项目：仅研究互操作行为，代码复用必须另获书面许可；
- Cubism SDK：按 Live2D 当前许可独立接入，仓库的链接例外不替代 SDK 许可。
