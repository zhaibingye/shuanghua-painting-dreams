# 霜华绘梦统一 API 契约 v2

> API 前缀：`/api/v1`  
> JSON 字段：camelCase  
> 图片对话流：Server-Sent Events

## 1. 契约原则

1. 浏览器只调用霜华绘梦 API，不直接请求供应商。
2. API Key 通过 `X-Upstream-API-Key` 发送，后端不保存、不记录。
3. Base URL、模型和参数随请求发送；后端保持无状态。
4. FastAPI Pydantic Schema 与 OpenAPI 是网络 DTO 的唯一来源。
5. 图片最终结果统一为 Base64；浏览器立即转换成 Blob 后写入 IndexedDB。
6. Partial Images 只存在于流式请求内存中，不持久化。
7. 所有产生费用的请求均不自动重试。

## 2. API 格式

```ts
type ApiFormat =
  | "googleGeminiImage"
  | "openaiImage"
  | "openaiResponsesImage"
  | "xaiImage"
  | "byteDanceVideo"
  | "xaiVideo";
```

默认值：

| API 格式 | 默认模型 | 默认 Base URL |
|---|---|---|
| Google Gemini 图像 | `nano-banana-2` | `https://shapi.vip` |
| OpenAI Images | `gpt-image-2` | `https://shapi.vip` |
| OpenAI Responses 图像 | `gpt-5.6-luna` | `https://shapi.vip` |
| xAI 图像 | `grok-imagine-image-2.0` | `https://shapi.vip` |
| 字节 Seedance 视频 | `doubao-seedance-2-0-260128` | `https://shapi.vip` |
| xAI 视频 | `grok-imagine-video-1.5` | `https://shapi.vip` |

## 3. 通用连接信息

```ts
interface UpstreamConnection {
  apiFormat: ApiFormat;
  baseUrl: string;
  modelId: string;
}
```

- Base URL 只能是公网 HTTP/HTTPS URL。
- 禁止 Query、Fragment、用户名和密码。
- 可包含固定代理路径前缀。
- 模型 ID 必须是单一路径段，禁止 `/`、`?`、`#` 和空白。

图片输入：

```ts
type ImageAsset =
  | { kind: "dataUrl"; dataUrl: string; filename?: string }
  | { kind: "url"; url: string };
```

Data URL 只接受 PNG、JPEG、WebP。

## 4. Provider 元数据

```http
GET /api/v1/metadata/providers
```

当前 `schemaVersion` 为 `3`。OpenAI Images 能力拆分为生成流式能力与编辑流式能力，元数据提供：

- 默认连接和模型。
- 默认参数。
- 已知模型能力。
- 对话、SSE、渐进图片、遮罩、视频续写等能力。
- Seedance 模型是否允许序列化 `service_tier`。

## 5. 图片对话流

```http
POST /api/v1/images/conversation-turns/stream
Accept: text/event-stream
X-Upstream-API-Key: <KEY>
Content-Type: application/json
```

请求体是四种图片格式的判别联合。

### 5.1 OpenAI Images

```json
{
  "apiFormat": "openaiImage",
  "baseUrl": "https://shapi.vip",
  "modelId": "gpt-image-2",
  "prompt": "把天空改成极光夜空",
  "sourceImages": [
    { "kind": "dataUrl", "dataUrl": "data:image/png;base64,..." }
  ],
  "mask": null,
  "options": {
    "count": 1,
    "size": "1024x1024",
    "quality": "auto",
    "outputFormat": "png",
    "outputCompression": 100,
    "background": "auto",
    "moderation": "auto",
    "inputFidelity": "auto",
    "partialImages": 2
  }
}
```

后端路由规则：

- `sourceImages` 为空：以 JSON 和 `stream: true` 调用 `/v1/images/generations`。
- 文生图的 `partial_images` 范围为 0～3；最终图可能在达到请求数量前提前返回，生图事件 `image_generation.partial_image/completed` 被映射为产品事件。
- `sourceImages` 非空：将 Data URL 解码为文件；公网 URL 经过 SSRF 防护下载后，以非流式 `multipart/form-data` 调用 `/v1/images/edits`。
- 编辑请求不发送 `stream` 与 `partial_images`；上游完整 JSON 结果由后端转换为本站 `image.completed` 和 `turn.completed`，因此浏览器仍使用统一 SSE 接口。
- 单参考图使用 `image` 文件字段，多参考图使用重复的 `image[]`，遮罩使用 `mask`。
- 遮罩存在时必须且只能有一张主编辑图片。
- 传输层遇到声明为 `text/event-stream`、实际未产生任何 SSE 事件的非空响应时，会在同一次响应内尝试普通 JSON 回退解析；不会自动重试计费请求。

“是否存在历史结果、哪张图片是编辑基图”由浏览器对话层决定。浏览器默认把最近成功轮次的第一张非思考图片放在 `sourceImages[0]`，用户可显式更换。

### 5.2 OpenAI Responses

```json
{
  "apiFormat": "openaiResponsesImage",
  "baseUrl": "https://shapi.vip",
  "modelId": "gpt-5.6-luna",
  "prompt": "把花瓣改成半透明冰晶",
  "history": [
    {
      "kind": "message",
      "text": "生成一朵蓝色花",
      "images": []
    },
    {
      "kind": "imageGenerationCall",
      "callId": "ig_previous",
      "status": "completed",
      "image": {
        "kind": "dataUrl",
        "dataUrl": "data:image/png;base64,..."
      }
    }
  ],
  "images": [],
  "options": {
    "size": "auto",
    "quality": "auto",
    "outputFormat": "png",
    "outputCompression": 100,
    "background": "auto",
    "moderation": "auto",
    "inputFidelity": "auto",
    "partialImages": 2
  }
}
```

上游请求固定：

```json
{
  "store": false,
  "stream": true,
  "tool_choice": { "type": "image_generation" },
  "tools": [{ "type": "image_generation", "action": "auto" }]
}
```

不使用 `previous_response_id`。浏览器显式回传用户消息、参考图和历史 `image_generation_call`，以同时满足无上游存储和多轮编辑。

### 5.3 Gemini

```json
{
  "apiFormat": "googleGeminiImage",
  "baseUrl": "https://shapi.vip",
  "modelId": "nano-banana-2",
  "prompt": "把信息图翻译成西班牙语",
  "history": [
    {
      "role": "user",
      "parts": [{ "kind": "text", "text": "生成信息图", "thought": false }]
    },
    {
      "role": "model",
      "parts": [
        {
          "kind": "image",
          "image": { "kind": "dataUrl", "dataUrl": "data:image/png;base64,..." },
          "thought": false,
          "thoughtSignature": "..."
        }
      ]
    }
  ],
  "images": [],
  "options": {
    "aspectRatio": "16:9",
    "imageSize": "2K",
    "responseModalities": "TEXT_AND_IMAGE",
    "thinkingLevel": "High",
    "includeThoughts": true
  }
}
```

规则：

- 浏览器回传完整成功对话历史。
- 后端将历史转换为原生 `contents`。
- `thought_signature` 必须原样回传。
- 模型返回的普通文本、思考文本、思考图片和最终图片均保留结构。

### 5.4 xAI Image

请求包含 `sourceImages`：

- 空数组调用 `/v1/images/generations`。
- 一张图片映射为 `image`。
- 两至三张映射为 `images`。
- 响应固定 `b64_json`。
- 对话层与 OpenAI Images 一样，自动把当前活动图片作为下一轮主编辑图。

## 6. 统一 SSE 事件

### 6.1 开始

```text
event: turn.started
data: {"requestId":"req_...","apiFormat":"openaiImage"}
```

### 6.2 渐进图片

```text
event: image.partial
data: {
  "index": 0,
  "partialImageIndex": 1,
  "mimeType": "image/png",
  "base64Data": "...",
  "providerMetadata": null
}
```

### 6.3 文本增量

```text
event: text.delta
data: {"delta":"已经完成构图..."}
```

### 6.4 最终图片

```text
event: image.completed
data: {
  "index": 0,
  "image": {
    "id": "img_...",
    "mimeType": "image/png",
    "base64Data": "...",
    "revisedPrompt": null,
    "thought": false,
    "thoughtSignature": null
  },
  "providerMetadata": {
    "callId": "ig_...",
    "status": "completed",
    "prompt": "..."
  }
}
```

### 6.5 完成

```text
event: turn.completed
data: {
  "requestId": "req_...",
  "usage": {
    "inputTokens": 10,
    "outputTokens": 100,
    "totalTokens": 110,
    "costInUsdTicks": null
  },
  "providerState": {}
}
```

### 6.6 流内失败

HTTP 响应头已经发送后发生的错误使用：

```text
event: turn.failed
data: {
  "error": {
    "code": "moderationBlocked",
    "category": "moderation",
    "message": "输入或输出内容未通过上游安全审核。",
    "retryable": false,
    "requestId": "req_..."
  }
}
```

请求体校验、缺 Key 等流建立前错误仍返回标准 JSON 错误信封。

## 7. 兼容图片端点

以下端点继续保留，用于非对话、非流式客户端：

```http
POST /api/v1/images/generations
POST /api/v1/images/edits
```

新 Web UI 统一使用图片对话流端点。

## 8. 视频接口

接口保持：

```http
POST /api/v1/videos/generations
POST /api/v1/videos/extensions
POST /api/v1/video-tasks/status
```

视频对话只是浏览器本地组织结构，普通轮次不会自动继承上一轮素材和参数。

显式续写：

- 字节：成功任务返回 `lastFrameUrl` 后，创建新的首帧生视频任务。
- xAI：`grok-imagine-video` 使用 `/v1/videos/extensions`。

Seedance 规则：

- `doubao-seedance-2-0-*` 与 2.0 fast 必须省略 `service_tier`。
- 明确支持该字段的 1.5/1.0 模型才序列化 `service_tier`。
- 前端能力表对 2.0 隐藏服务等级控件。
- Seedance 2.0 旗舰（`doubao-seedance-2-0-*`，不含 fast）支持 `480p` / `720p` / `1080p` / `4k`。
- Seedance 2.0 fast 默认仅支持 `480p` / `720p`。
- 任意模型 ID 以 `-se` 结尾时，可在该系列原有分辨率上使用 `1080p`，例如 `doubao-seedance-2-0-fast-260128-se`。

## 9. 错误与取消

- 创建类请求不自动重试，避免重复计费。
- 视频状态查询可退避重试。
- 图片 SSE 由全局内存任务管理器持有，不绑定当前 `ChatPage` 路由生命周期。
- 切换对话只切换 UI 订阅，不调用 `AbortController.abort()`；原对话任务继续接收流并写入 IndexedDB。
- 用户显式点击停止时，才使用对应任务的 `AbortController` 关闭前后端流。
- 刷新或关闭浏览器仍会中断图片请求，并在下次启动时标记为 `interrupted`。
- 停止后的 Partial Image 不保存。
- 已收到且完整持久化的最终结果不因后续 UI 切换丢失。

## 10. OpenAPI

```bash
cd backend
uv run python scripts/export_openapi.py
cd ../frontend
npm run api:generate
```

生成文件：

```text
backend/openapi.json
frontend/src/api/generated/schema.d.ts
```
