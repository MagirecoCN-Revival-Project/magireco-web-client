# Web 客户端服务端接口 v1

本文是 `magireco-web-client` 与账号、资源、存档、封禁及游戏后端之间的生产接口契约。
示例中的 `HOST`、`TOKEN`、`HASH` 均为占位值。

## 1. 通用约定

### 1.1 Base URL

```text
账户与控制面：https://ACCOUNT_API_HOST/v1
游戏兼容 API：https://GAME_API_HOST/magica/api
资源文件节点：https://RESOURCE_HOST/
```

### 1.2 请求头

| 头 | 必填 | 说明 |
|---|---:|---|
| `Authorization: Bearer TOKEN` | 鉴权接口 | 短期 access token |
| `X-Client-Version` | 是 | SemVer 客户端版本 |
| `X-Client-Platform` | 是 | 固定 `web` |
| `X-Request-Id` | 是 | UUID；服务端原样回传 |
| `Idempotency-Key` | 写操作 | 24 小时内同 key 同结果 |
| `Content-Type` | 有 body | `application/json` |

时间使用 UTC ISO-8601。ID 是不透明字符串。金额/道具数量使用整数。成功响应直接返回资源对象；
失败响应统一为：

```json
{
  "error": {
    "code": "ACCOUNT_BANNED",
    "message": "面向用户的短文案",
    "requestId": "REQUEST_ID",
    "details": {
      "reason": "REASON_CODE",
      "appealUrl": "https://SUPPORT_HOST/appeal"
    }
  }
}
```

### 1.3 状态码

| HTTP | 用途 |
|---:|---|
| 200/201/204 | 成功 |
| 400 | schema、路径或状态不合法 |
| 401 | access/refresh token 缺失、过期或撤销 |
| 403 | 封禁、权限不足、设备不允许 |
| 404 | 资源不存在 |
| 409 | 版本冲突、幂等键冲突、存档 CAS 失败 |
| 410 | 资源版本撤回 |
| 423 | 账号临时限制 |
| 426 | 客户端强制更新 |
| 429 | 频率限制 |
| 503 | 维护或节点不可用 |

## 2. 启动与节点目录

### `GET /status`

无鉴权，用于登录页探活。

```json
{
  "state": "online",
  "region": "REGION",
  "apiVersion": "v1",
  "manifestRevision": "REVISION",
  "message": "运行正常"
}
```

### `POST /client/init`

可信锚点握手。节点目录不参与本请求自身路由。

```json
{
  "version": "0.2.0",
  "deviceId": "DEVICE_ID",
  "platform": "web",
  "channel": "stable",
  "clientNonce": "BASE64URL_RANDOM"
}
```

响应：

```json
{
  "accessToken": "SHORT_BOOT_TOKEN",
  "expiresAt": "2026-07-29T12:15:00Z",
  "server": { "status": "normal", "message": "", "endTime": null },
  "client": {
    "allowedVersions": ["0.2.0"],
    "minimumVersion": "0.2.0",
    "latestVersion": "0.2.1",
    "updateUrl": "https://HOST/"
  },
  "features": {
    "accountEnabled": true,
    "onlineResources": true,
    "localImport": true,
    "cloudSave": true
  },
  "directory": {
    "payload": "BASE64URL_COMPACT_JSON",
    "sig": "BASE64_ED25519_SIGNATURE"
  }
}
```

目录 payload：

```json
{
  "seq": 8,
  "issued_at": 1785300000,
  "expires_at": 1785386400,
  "nodes": [
    { "id": "business-1", "api": "https://HOST", "caps": ["init","login","account","save"], "weight": 100 },
    { "id": "resource-1", "api": "https://HOST", "caps": ["resource"], "weight": 90 }
  ]
}
```

签名覆盖收到的 `payload` 字符串 UTF-8 字节，而不是解码后重序列化的 JSON。客户端依次执行：
Ed25519 验签 → `seq` 防回滚 → `expires_at` → 按 cap 选最大权重节点。验签失败回到内置锚点；
没有根公钥的构建不接受目录。

## 3. 鉴权

### `POST /auth/login`

限速：账号 5 次/15 分钟、设备 20 次/小时。

```json
{
  "username": "ACCOUNT",
  "password": "PASSWORD",
  "device": {
    "id": "DEVICE_ID",
    "name": "Browser",
    "platform": "USER_AGENT"
  },
  "challengeToken": "OPTIONAL_CAP_TOKEN"
}
```

响应：

```json
{
  "account": {
    "id": "ACCOUNT_ID",
    "displayName": "DISPLAY_NAME",
    "playerCode": "PLAYER_CODE",
    "rank": 1,
    "status": "active",
    "createdAt": "2026-01-01T00:00:00Z",
    "lastLoginAt": "2026-07-29T00:00:00Z",
    "currencies": { "magiaStone": 0, "supportPoint": 0, "coin": 0 },
    "ban": { "active": false }
  },
  "tokens": {
    "accessToken": "ACCESS_TOKEN",
    "refreshToken": "ROTATING_REFRESH_TOKEN",
    "accessExpiresAt": "2026-07-29T00:15:00Z",
    "refreshExpiresAt": "2026-08-28T00:00:00Z"
  },
  "session": {
    "id": "SESSION_ID",
    "deviceName": "Browser",
    "platform": "Web",
    "ipRegion": "REGION",
    "current": true,
    "createdAt": "2026-07-29T00:00:00Z",
    "lastSeenAt": "2026-07-29T00:00:00Z"
  }
}
```

封禁返回 403 `ACCOUNT_BANNED`，`details` 必须含 `reason`、`expiresAt|null`、`appealUrl|null`。
临时限制返回 423 `ACCOUNT_LIMITED`。前端不得只依赖本地封禁标志。

### `POST /auth/refresh`

refresh token 每次使用后轮换；旧 token 的重用会撤销整个 token family。

```json
{ "refreshToken": "TOKEN", "deviceId": "DEVICE_ID" }
```

响应为新的 token 四字段对象。

### `POST /auth/logout`

需要 access token。body `{ "refreshToken": "TOKEN" }`，成功 204。服务端撤销当前 refresh
token family 和当前 session。

## 4. 账号、设备与封禁

### `GET /account/me`

响应是登录返回中的 `account`。

### `GET /account/sessions`

返回 `session[]`，按 `lastSeenAt` 降序。IP 只返回粗粒度区域，不返回完整地址。

### `DELETE /account/sessions/{sessionId}`

撤销指定非当前会话，成功 204。撤销当前会话使用 logout。

### `GET /account/ban`

```json
{
  "active": true,
  "code": "POLICY_CODE",
  "reason": "面向用户的说明",
  "issuedAt": "2026-07-29T00:00:00Z",
  "expiresAt": null,
  "appealUrl": "https://SUPPORT_HOST/appeal",
  "revision": 4
}
```

### `POST /account/appeals`

```json
{ "banRevision": 4, "message": "TEXT", "contact": "CONTACT" }
```

成功 201，响应 `{ "id":"APPEAL_ID", "state":"received", "createdAt":"..." }`。同一 revision
只能有一个未结束申诉。

### `POST /client/heartbeat`

游戏运行时每 30 秒、资源下载时每 5 秒调用：

```json
{
  "sessionId": "SESSION_ID",
  "state": "game",
  "files": [
    { "path": "relative/path", "loaded": 1024, "total": 4096 }
  ],
  "clientTime": "2026-07-29T00:00:00Z"
}
```

响应动作：

```json
{ "action": "ok", "nextInSeconds": 30 }
```

`action` 可为 `ok | switch_mirrors | ban | maintenance | reauth`。`ban` 必须附完整 ban 对象；
收到后立即停止新 API、下载与游戏结果提交，清理访问令牌并展示封禁页。

## 5. 资源分发

### `GET /resources/manifest?platform=web&revision=REVISION`

需要账号 access token。若 revision 未变化可返回 304。响应：

```json
{
  "schemaVersion": 1,
  "revision": "2026.07.29.1",
  "generatedAt": "2026-07-29T00:00:00Z",
  "minimumClientVersion": "0.2.0",
  "resourceToken": "RESOURCE_ONLY_TOKEN",
  "bundles": [
    {
      "id": "core-ui",
      "title": "基础界面",
      "description": "TEXT",
      "version": "1",
      "sizeBytes": 1234,
      "state": "required",
      "tags": ["core"],
      "files": [
        {
          "id": "FILE_ID",
          "path": "index.html",
          "bytes": 1234,
          "sha256": "LOWERCASE_HEX_HASH",
          "contentType": "text/html; charset=utf-8",
          "url": "https://RESOURCE_HOST/files/FILE_ID?token=SHORT_TOKEN"
        }
      ]
    }
  ],
  "payload": "BASE64URL_CANONICAL_MANIFEST",
  "signature": "BASE64_ED25519_SIGNATURE"
}
```

约束：

- `path` 相对 `magica/`，禁止前导 `/`、`\`、空分段、`.`、`..`、NUL；
- 单文件默认上限 512 MiB；bundle 与总清单声明总量；
- URL 有效期 10 分钟，绑定 account/device/file/hash，只允许 GET/HEAD；
- `resourceToken` audience 固定为资源服务，不可调用账号 API；
- 客户端必须以收到的 payload 字符串验签，并验证 payload 与外层展示字段一致；
- 散列不符不得落盘，连续 3 次上报 `RESOURCE_INTEGRITY_FAILED`。

### `POST /resources/authorize`

用于只给清单返回 file ID、不预签 URL 的大清单：

```json
{ "fileIds": ["FILE_ID"], "revision": "REVISION" }
```

响应：

```json
{
  "expiresAt": "2026-07-29T00:10:00Z",
  "files": [{ "id":"FILE_ID", "url":"https://RESOURCE_HOST/...", "sha256":"HASH" }]
}
```

一次最多 100 个 file ID。服务端再次检查账号状态、bundle 权限与 revision。

### `GET RESOURCE_URL`

支持 `Range`、`If-None-Match`，返回：

```text
Content-Length
Content-Type
ETag: "<sha256>"
Accept-Ranges: bytes
Cache-Control: private, max-age=600
X-Content-SHA256: HASH
```

资源节点不接收账号 refresh token。日志不得记录 query token。

### `POST /resources/events`

客户端批量上报安装事件：

```json
{
  "revision": "REVISION",
  "events": [
    { "type":"verified", "fileId":"FILE_ID", "bytes":1234, "durationMs":250 }
  ]
}
```

`type` 为 `started | resumed | verified | failed | removed`。失败可附
`errorCode`，不得附资源正文。

## 6. 云端存档

### `GET /saves/current`

```json
{
  "revision": 12,
  "updatedAt": "2026-07-29T00:00:00Z",
  "sha256": "HASH",
  "state": {
    "/magica/api/user/deck/1": {
      "req": "JSON_STRING",
      "resp": "JSON_STRING",
      "updatedAt": 1785283200000
    }
  }
}
```

服务端按 account ID 分区，只接受 `/magica/api/` 白名单端点；每个 req/resp 默认 1 MiB，
完整存档默认 64 MiB。

### `PUT /saves/current`

需要 `Idempotency-Key` 和乐观锁：

```json
{
  "baseRevision": 12,
  "sha256": "HASH_OF_CANONICAL_STATE",
  "state": { "...": {} }
}
```

成功 `{ "revision":13,"updatedAt":"..." }`。revision 不符返回 409 `SAVE_CONFLICT` 并带当前
revision，不自动覆盖。服务端对 endpoint 重新做白名单验证。

### `POST /saves/merge`

可选的逐端点 last-write-wins 合并：

```json
{ "baseRevision": 12, "entries": { "/magica/api/user/deck/1": { "...": "..." } } }
```

响应包含新 revision 与 `conflicts[]`。涉及消费、抽取、奖励、礼物等非幂等端点永远不进入存档。

## 7. 游戏 API 兼容代理

浏览器请求保持原路径：

```text
/magica/api/...
```

Service Worker 将其转给 `GAME_API_HOST`，保留 method、query、content-type 和 body，删除
浏览器 cookie/host，并加入当前 access token。服务端应：

- 校验 Origin 和 access token；
- 把 Web 账号映射到游戏后端账号；
- 统一返回 JSON，不发依赖第三方 cookie 的会话；
- 对用户状态写接口使用幂等键或服务端去重；
- 不接受客户端决定奖励、掉落、货币和抽取结果。

### 战斗

`quest/native/get` 返回结构化战斗定义；Web 战斗引擎运行后向 `quest/native/result/send`
提交结果。结果至少包含：

```json
{
  "questBattleId": "ID",
  "turns": 8,
  "clearTimeMs": 92500,
  "survivors": [{ "unitId":"ID", "hp":123 }],
  "damageSummary": [{ "source":"ID", "target":"ID", "amount":456 }],
  "clientResultHash": "HASH"
}
```

服务端用关卡定义验证回合、伤害、HP、耗时和状态上限，独立裁定掉落与奖励。异常结果返回
422 `BATTLE_RESULT_INVALID`，记录审计事件但不泄露检测阈值。

## 8. 运维与安全检查表

- access token 15 分钟，refresh token 轮换且存储散列；
- 密码使用 Argon2id/scrypt，登录/申诉/忘记密码独立限速；
- 封禁状态在登录、refresh、资源授权、heartbeat、游戏代理五处检查；
- 节点目录和资源清单使用不同 Ed25519 子密钥并支持 key ID；
- 资源 token 与账号 token 使用不同 issuer/audience/密钥；
- 所有路径在 URL decode 后再次检查；
- CORS 只允许部署 origin，不使用 `*` + credentials；
- 审计会话创建/撤销、封禁变更、资源授权、存档冲突、战斗异常；
- 隐私日志不记录密码、Authorization、资源 query token、完整 IP 或存档正文；
- 备份恢复演练包含账号、封禁、存档 revision 与签名密钥轮换。
