# xAI Grok 视频生成 REST API 规范文档

本文档整理自 xAI 官方开发者文档（[xAI Video Generation Documentation](https://docs.x.ai/developers/model-capabilities/video/generation) 及 Inference API Reference），详细规范了 xAI Grok 视频生成大模型（`grok-imagine-video-1.5`、`grok-imagine-video`）的 REST API 接口定义、请求参数、响应结构、异步轮询生命周期、多模态输入方式及错误处理标准。

---

## 1. 基础信息与通用约定

### 1.1 服务接入点（Base URL）

xAI REST API 全局接入地址：

```http
https://api.x.ai/v1
```

### 1.2 认证鉴权（Authentication）

所有 API 请求均须通过 HTTP 请求头传递 Bearer 格式的 API Key 进行身份鉴权：

```http
Authorization: Bearer <XAI_API_KEY>
Content-Type: application/json
```

### 1.3 支持的模型（Models）

| 模型标识 | 核心定位与能力说明 | 支持能力 | 最高分辨率 |
| :--- | :--- | :--- | :--- |
| **`grok-imagine-video-1.5`** | 最新旗舰视频生成模型，画质与语义理解大幅提升，支持原生 1080p 高清输出，支持多参考图与参考音色融合生视频。 | 文生视频 (T2V)、图生视频 (I2V)、多参考生视频 (R2V) | 1080p (T2V/I2V)<br>720p (R2V) |
| **`grok-imagine-video`** | 经典视频模型，支持高保真视频编辑与视频向后无缝续写/延展。 | 文生视频 (T2V)、图生视频 (I2V)、视频编辑 (Edit)、视频续写 (Extension) | 720p |

---

## 2. 核心工作机制：异步任务与轮询流程

视频生成属于高耗时异步计算任务（通常需要数十秒至数分钟不等），REST API 采用两阶段异步任务流机制：

```
+------------------+                    +-----------------+
|   Client 应用    |                    |   xAI API 网关  |
+------------------+                    +-----------------+
         |                                       |
         |  1. POST /v1/videos/generations       |
         |     (或 /v1/videos/edits 等)           |
         |-------------------------------------->|
         |                                       |
         |  2. 返回 HTTP 200 + { request_id }    |
         |<--------------------------------------|
         |                                       |
         |  3. 轮询 GET /v1/videos/{request_id}  |
         |-------------------------------------->|
         |     返回 status: "pending"            |
         |<--------------------------------------|
         |                                       |
         |     (等待几秒间隔后继续轮询...)         |
         |                                       |
         |  4. 轮询 GET /v1/videos/{request_id}  |
         |-------------------------------------->|
         |     返回 status: "done" + video.url   |
         |<--------------------------------------|
```

1. **发起任务（Start）**：客户端调用任务创建接口（如 `POST /v1/videos/generations`），服务端校验参数后立即返回唯一任务标识符 `request_id`。
2. **状态轮询（Poll）**：客户端使用 `request_id` 定期（推荐间隔 3~5 秒）请求 `GET /v1/videos/{request_id}` 查询任务状态，直到 `status` 变为 `done`、`failed` 或 `expired`。

---

## 3. 接口详细规范

### 3.1 创建视频生成任务 (POST /v1/videos/generations)

该端点用于从文本、起始图片、或者多张参考图/参考音频生成视频。

- **请求方式**：`POST`
- **请求路径**：`/v1/videos/generations`
- **完整 URL**：`https://api.x.ai/v1/videos/generations`

#### 3.1.1 支持的请求模式（Request Modes）

通过在请求体中传入不同的字段组合，接口自动激活对应模式（单次请求仅支持激活一种模式）：

| 模式名称 | 核心字段组合 | 模式说明 |
| :--- | :--- | :--- |
| **文生视频 (Text-to-Video)** | 仅提供 `prompt` | 根据文本提示词直接生成视频。在 `grok-imagine-video-1.5` 上采用底层首帧生成后动画化机制。 |
| **图生视频 (Image-to-Video)** | `image` + 可选 `prompt` | 以 `image` 作为视频起始帧（First Frame）生成动态视频。`prompt` 可选。 |
| **参考生视频 (Reference-to-Video)** | `reference_images` / `reference_audios` + `prompt` | 依据提供的参考图（人物、风格、物品）和/或预置声音音色，由提示词驱动生成连贯视频，不锁定首帧。 |

> ⚠️ **互斥约束**：`image` 与 `reference_images` 严格互斥，不得在同一请求中同时传入，否则将返回 `400 Bad Request`。

#### 3.1.2 请求参数（Request Body）

请求体为 JSON 格式对象：

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `model` | `string` | 否 | `grok-imagine-video-1.5` | 使用的模型标识，推荐 `grok-imagine-video-1.5` 或 `grok-imagine-video`。 |
| `prompt` | `string` | 视模式而定 | - | 视频生成的文本描述提示词。<br>• 文生视频 (T2V) 与参考生视频 (R2V) 模式下**必填**。<br>• 图生视频 (I2V) 模式下**可选**（省略时模型自动理解并驱动画面）。 |
| `duration` | `integer` \| `string` | 否 | `8` | 生成视频的时长（秒）。取值范围为 `[1, 15]` 之间的整数。<br>注：同时兼容 OpenAI 风格的 `seconds` 字段名，支持数字或数字字符串。 |
| `aspect_ratio` | `string` | 否 | `16:9` | 视频画面宽高比。枚举值：<br>• `16:9`（默认值，宽屏/横屏）<br>• `9:16`（竖屏，短视频/移动端）<br>• `1:1`（方形，社交媒体）<br>• `4:3` / `3:4`（传统画幅/纵向肖像）<br>• `3:2` / `2:3`（摄影画幅）<br>*注：图生视频模式若未显式指定，则默认继承输入图片的宽高比。* |
| `resolution` | `string` | 否 | `480p` | 输出视频分辨率。枚举值：<br>• `480p`（标清，生成速度最快，默认）<br>• `720p`（高清）<br>• `1080p`（全高清，仅 `grok-imagine-video-1.5` 在 T2V 和 I2V 模式下支持）<br>*注：参考生视频 (R2V) 分辨率上限为 `720p`。* |
| `image` | `object` | 否 | - | 图生视频 (I2V) 模式的起始首帧图片对象。详细字段见 [3.1.3 image 对象](#313-image-对象规范)。 |
| `reference_images` | `array<object>` | 否 | - | 参考生视频 (R2V) 模式的参考图片列表。用于注入人物特征、服饰、场景风格等。详细见 [3.1.4 reference_images 对象](#314-reference_images-对象规范)。 |
| `reference_audios` | `array<object>` | 否 | - | 参考生视频 (R2V) 模式的参考音频/音色列表，最多支持 **3** 个音色。详细见 [3.1.5 reference_audios 对象](#315-reference_audios-对象规范)。 |
| `output` | `object` | 否 | - | 自定义输出配置对象。可传入 `upload_url`（预签名 HTTP PUT 上传地址），生成完成后服务端直接将 MP4 上传至该地址。 |
| `storage_options` | `object` | 否 | - | 持久化存储至 xAI Files API 的选项。包含 `filename`（必填）、`expires_after`（过期秒数，最大 2592000 即 30 天）、`public_url`（布尔值或对象）。 |
| `user` | `string` | 否 | - | 终端用户唯一标识符，便于审计与追踪。 |

---

#### 3.1.3 `image` 对象规范

用于指定图生视频的首帧图像：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `url` | `string` | 二选一 | 图像的公网 HTTPS URL 或 Base64 编码的 Data URI（例如 `data:image/jpeg;base64,...`）。支持 JPEG、PNG、WebP。亦可使用兼容字段 `image_url`。 |
| `file_id` | `string` | 二选一 | xAI Files API 上传获取的文件 ID（与 `url` 互斥）。 |

---

#### 3.1.4 `reference_images` 对象规范

数组元素格式与 `image` 类似，可混合公网 URL、Base64 或 `file_id`：

```json
[
  { "url": "https://example.com/character.jpg" },
  { "url": "https://example.com/outfit.jpg" }
]
```

在提示词中可通过 `<IMAGE_0>`, `<IMAGE_1>`, `<IMAGE_2>` 分别引用各参考图像。

---

#### 3.1.5 `reference_audios` 对象规范

数组元素为音色指定对象（单次请求最多 3 个）：

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `voice_id` | `string` | 二选一 | 官方内置预置音色 ID（大小写不敏感，如 `"eve"`, `"ara"`，同 TTS API 音色表）。 |
| `url` | `string` | 二选一 | 自定义参考音频公网 URL 或 Base64 Data URI（时长不超过 15 秒）。*（注：自定义音频文件参考目前面向特邀受信任合作伙伴开放）* |

在提示词中可通过 `<AUDIO_0>`, `<AUDIO_1>`, `<AUDIO_2>` 引用对应音色。

---

#### 3.1.6 响应参数（Response Body）

提交成功时返回 HTTP 200 及 JSON：

| 参数名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `request_id` | `string` | 任务全局唯一 ID，用于后续轮询任务状态和获取视频结果。 |

**响应示例**：

```json
{
  "request_id": "d97415a1-5796-b7ec-379f-4e6819e08fdf"
}
```

---

#### 3.1.7 请求示例

##### 场景 A：文生视频 (Text-to-Video)

```bash
curl -s -X POST "https://api.x.ai/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video-1.5",
    "prompt": "A glowing crystal-powered rocket launching from the red dunes of Mars into a starry nebula",
    "duration": 10,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

##### 场景 B：图生视频 (Image-to-Video)

```bash
curl -s -X POST "https://api.x.ai/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video-1.5",
    "prompt": "Camera slowly pans up as gentle wind blows through the trees",
    "image": {
      "url": "https://example.com/landscape.jpg"
    },
    "duration": 8,
    "resolution": "1080p"
  }'
```

##### 场景 C：参考生视频 (Reference-to-Video 融合参考图与音色)

```bash
curl -s -X POST "https://api.x.ai/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video-1.5",
    "prompt": "The person from <IMAGE_0> wearing the jacket from <IMAGE_1> steps forward and speaks with the voice of <AUDIO_0>.",
    "reference_images": [
      { "url": "https://example.com/person.jpg" },
      { "url": "https://example.com/jacket.jpg" }
    ],
    "reference_audios": [
      { "voice_id": "eve" }
    ],
    "duration": 8,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }'
```

---

### 3.2 视频编辑接口 (POST /v1/videos/edits)

基于源视频及文本修改指令对已有视频进行精准重绘与编辑（保持原有场景构图，仅针对指令修改指定元素）。

- **请求方式**：`POST`
- **请求路径**：`/v1/videos/edits`
- **完整 URL**：`https://api.x.ai/v1/videos/edits`

#### 3.2.1 请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `model` | `string` | 否 | `grok-imagine-video` | 视频编辑模型（如 `grok-imagine-video`）。 |
| `prompt` | `string` | **是** | - | 视频编辑提示词，描述需要修改或添加的元素（例如 `"Give the woman a wide-brimmed black hat"`）。 |
| `video` | `object` | **是** | - | 源视频输入对象。包含 `url` 或 `file_id`。格式须为 `.mp4` 容器封装，编码支持 H.264、H.265、AV1 等。 |
| `output` | `object` | 否 | - | 自定义 `upload_url`。 |
| `storage_options` | `object` | 否 | - | 持久化存储至 Files API 选项。 |
| `user` | `string` | 否 | - | 终端用户标识符。 |

> 📌 **注意**：视频编辑接口**不支持**自定义 `duration`、`aspect_ratio` 和 `resolution`。输出视频自动继承源视频的时长与画幅，且源视频时长上限为 8.7 秒，输出分辨率上限为 720p。

#### 3.2.2 请求与响应示例

```bash
curl -s -X POST "https://api.x.ai/v1/videos/edits" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video",
    "prompt": "Give the woman a silver necklace and change outfit color to deep red",
    "video": {
      "url": "https://example.com/source_video.mp4"
    }
  }'
```

**响应示例**：

```json
{
  "request_id": "b784a912-3211-4fa2-93cb-834927df0012"
}
```

---

### 3.3 视频续写/扩展接口 (POST /v1/videos/extensions)

以源视频的最后一帧为起点，按照提示词向后无缝延续生成后续视频内容。最终返回的视频为拼接后的完整视频。

- **请求方式**：`POST`
- **请求路径**：`/v1/videos/extensions`
- **完整 URL**：`https://api.x.ai/v1/videos/extensions`

#### 3.3.1 请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `model` | `string` | 否 | `grok-imagine-video` | 视频扩展模型（如 `grok-imagine-video`）。 |
| `prompt` | `string` | **是** | - | 续写提示词，描述原视频末尾之后接下来发生的情节。 |
| `video` | `object` | **是** | - | 源视频输入对象，包含 `url` 或 `file_id`（`.mp4` 格式）。 |
| `duration` | `integer` | 否 | `6` | **仅代表续写延长的片段时长**（秒），取值范围 `[2, 10]`。<br>例如：源视频为 5 秒，`duration` 设为 6 秒，最终生成视频总长为 11 秒。 |
| `output` | `object` | 否 | - | 自定义 `upload_url`。 |
| `storage_options` | `object` | 否 | - | 持久化存储选项。 |
| `user` | `string` | 否 | - | 终端用户标识符。 |

#### 3.3.2 请求与响应示例

```bash
curl -s -X POST "https://api.x.ai/v1/videos/extensions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video",
    "prompt": "The camera slowly pans out to reveal the bustling city skyline behind the building",
    "video": {
      "url": "https://example.com/intro.mp4"
    },
    "duration": 6
  }'
```

**响应示例**：

```json
{
  "request_id": "c928419a-9812-4aa8-bc88-912837492104"
}
```

---

### 3.4 查询视频任务结果 (GET /v1/videos/{request_id})

轮询并获取视频生成/编辑/扩展任务的实时进度与最终产出结果。

- **请求方式**：`GET`
- **请求路径**：`/v1/videos/{request_id}`
- **完整 URL**：`https://api.x.ai/v1/videos/d97415a1-5796-b7ec-379f-4e6819e08fdf`

#### 3.4.1 路径参数（Path Parameters）

| 参数名称 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `request_id` | `string` | **是** | 任务创建时返回的唯一请求 ID。 |

#### 3.4.2 响应参数（Response Body）

| 参数名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `status` | `string` | 任务当前生命周期状态。枚举值：<br>• `pending`：视频排队中或正在生成中<br>• `done`：视频已生成完毕<br>• `failed`：任务处理失败<br>• `expired`：任务已过期 |
| `progress` | `integer` \| `null` | 任务生成进度的近似百分比（`0 ~ 100`）。<br>• `pending` 状态下：`0 ~ 99`<br>• `done` 状态下：固定为 `100`<br>• `failed` 状态下：省略/为 `null` |
| `model` | `string` \| `null` | 实际用于生成该视频的模型标识。在 `failed` 状态下可能省略。 |
| `video` | `object` \| `null` | 视频生成结果对象（仅在生成成功时提供）。详细结构见 [3.4.3 video 对象](#343-video-响应对象规范)。 |
| `usage` | `object` \| `null` | 本次任务的 Token 用量与费用明细。详细结构见 [3.4.4 usage 对象](#344-usage-用量与计费对象规范)。 |
| `error` | `object` \| `null` | 任务失败时的错误信息对象（仅在 `status: "failed"` 时提供）。详细见 [3.4.5 error 对象](#345-error-错误响应对象规范)。 |

---

#### 3.4.3 `video` 响应对象规范

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `url` | `string` \| `null` | 生成视频的公网临时访问/下载 URL（MP4 格式）。<br>⚠️ *注：若触发内容安全策略未通过审核，该字段为空。* |
| `duration` | `integer` | 生成视频的实际总时长（单位：秒）。 |
| `respect_moderation` | `boolean` | 是否通过内容安全审查。<br>• `true`：审核合规，`url` 有效可用。<br>• `false`：触发安全风控，视频已被拦截过滤，`url` 为空。 |
| `file_output` | `object` \| `null` | 若请求中配置了 `storage_options`，返回持久化到 Files API 的文件详情：<br>• `file_id`：Files API 文件 ID<br>• `filename`：存储的文件名<br>• `expires_at`：自动过期 Unix 时间戳（秒）<br>• `public_url`：持久化公开访问链接（若请求了 public_url）<br>• `public_url_expires_at`：公开链接过期时间戳<br>• `public_url_error`：公开链接生成失败原因 |
| `storage_error` | `string` \| `null` | 转存存储失败时的错误说明。 |

---

#### 3.4.4 `usage` 用量与计费对象规范

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `cost_in_usd_ticks` | `integer` | 任务消耗的精确费用，以 USD ticks 计量。<br>换算关系：**1 USD = 10,000,000,000 ticks**（即 1 美分 = 100,000,000 ticks）。 |
| `input_tokens` | `integer` | 输入总 Token 数（提示词文本 Token + 输入图片 Token 等）。 |
| `input_tokens_details` | `object` | 输入 Token 细分：<br>• `text_tokens`：Prompt 文本 Token 数<br>• `cached_tokens`：命中文档缓存的 Token 数<br>• `image_tokens`：图片编码 Token 数 |
| `output_tokens` | `integer` | 输出总 Token 数（重写提示词 + 思考/推理 Token + 生成帧 Token）。 |
| `output_tokens_details` | `object` | 输出 Token 细分：<br>• `text_tokens`：Prompt 重写文本 Token 数<br>• `reasoning_tokens`：模型推理思考 Token 数<br>• `image_tokens`：视频画面生成 Token 数 |
| `total_tokens` | `integer` | 本次请求消耗的 Token 总量 (`input_tokens + output_tokens`)。 |

---

#### 3.4.5 `error` 错误响应对象规范

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `code` | `string` | 机器可读的异步错误码（枚举见下表）。 |
| `message` | `string` | 人类可读的详细错误原因。 |

**异步生成错误码枚举 (`error.code`)**：

| Error Code | 含义说明 | 建议处理方式 |
| :--- | :--- | :--- |
| `invalid_argument` | 请求参数非法（例如时长超出范围、媒体文件损坏、提示词超长、模式冲突、或输入违规被拦截）。 | 检查并修正请求参数、媒体 URL 或提示词后重新提交。 |
| `permission_denied` | API Key 权限不足或所属 Team 未开通该功能。 | 确认 API Key 权限或在控制台开通对应能力。 |
| `failed_precondition` | 请求的操作不满足前置条件（如所选模型不支持编辑/续写，或所选分辨率超过模型上限）。 | 调整请求的 `model`、`resolution` 或功能模式。 |
| `service_unavailable` | 视频生成算力集群瞬时负载过高 (503)。 | 实施指数退避重试 (Exponential Backoff)。 |
| `internal_error` | 服务端内部执行故障。 | 稍后重试；若持续发生，可携带 `request_id` 联系 xAI 技术支持。 |

---

#### 3.4.6 查询响应示例

##### 状态 A：处理中 (`pending`)

```json
{
  "status": "pending",
  "progress": 45,
  "model": "grok-imagine-video-1.5"
}
```

##### 状态 B：生成成功 (`done`)

```json
{
  "status": "done",
  "progress": 100,
  "video": {
    "url": "https://vidgen.x.ai/xai-vidgen-bucket/xai-video-d97415a1-5796-b7ec-379f-4e6819e08fdf.mp4",
    "duration": 10,
    "respect_moderation": true
  },
  "model": "grok-imagine-video-1.5",
  "usage": {
    "cost_in_usd_ticks": 5000000000,
    "input_tokens": 128,
    "output_tokens": 1024,
    "total_tokens": 1152,
    "input_tokens_details": {
      "text_tokens": 128,
      "cached_tokens": 0,
      "image_tokens": 0
    },
    "output_tokens_details": {
      "text_tokens": 64,
      "reasoning_tokens": 128,
      "image_tokens": 832
    }
  }
}
```

##### 状态 C：生成失败 (`failed`)

```json
{
  "status": "failed",
  "error": {
    "code": "invalid_argument",
    "message": "Prompt cannot be empty. Please provide a prompt."
  }
}
```

---

## 4. 同步 HTTP 状态码与异常处理

除异步轮询阶段由 `error` 对象表达业务失败外，API 请求发起阶段会返回标准 HTTP 状态码：

| HTTP 状态码 | 原因与场景 | 处理对策 |
| :--- | :--- | :--- |
| **`200 OK`** | 请求成功，返回 `request_id` 或轮询结果。 | 正常解析响应体。 |
| **`400 Bad Request`** | 请求体 JSON 格式错误、必填参数缺失或模式冲突（如同时传了 `image` 和 `reference_images`）。 | 校验参数格式与互斥规则。 |
| **`401 Unauthorized`** | API Key 缺失、格式错误或已失效。 | 检查 `Authorization: Bearer <KEY>` 请求头。 |
| **`403 Forbidden`** | 账号欠费、配额不足或无权访问指定模型。 | 前往 xAI 开发者控制台检查账户余额与权限。 |
| **`404 Not Found`** | 查询的 `request_id` 不存在或请求路径错误。 | 确认 `request_id` 是否正确。 |
| **`429 Too Many Requests`** | 触发并发或 RPM 速率限制。 | 实施客户端限流并进行退避重试。 |
| **`500 / 503 Server Error`** | xAI 服务端网关错误或服务维护中。 | 捕获异常后稍后重试。 |

---

## 5. 多语言完整调用示例

### 5.1 cURL + Bash 自动化轮询脚本

```bash
#!/usr/bin/env bash
set -e

XAI_API_KEY="${XAI_API_KEY:-your_api_key_here}"

echo "=== 1. 提交视频生成任务 ==="
CREATE_RES=$(curl -s -X POST "https://api.x.ai/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-video-1.5",
    "prompt": "Cinematic aerial drone shot of a futuristic cyberpunk city covered in neon lights and rain",
    "duration": 5,
    "aspect_ratio": "16:9",
    "resolution": "720p"
  }')

REQUEST_ID=$(echo "$CREATE_RES" | grep -o '"request_id": *"[^"]*"' | awk -F'"' '{print $4}')

if [ -z "$REQUEST_ID" ]; then
  echo "创建任务失败: $CREATE_RES"
  exit 1
fi

echo "任务提交成功，Request ID: $REQUEST_ID"
echo "=== 2. 开始轮询生成结果 ==="

while true; do
  POLL_RES=$(curl -s -X GET "https://api.x.ai/v1/videos/$REQUEST_ID" \
    -H "Authorization: Bearer $XAI_API_KEY")
  
  STATUS=$(echo "$POLL_RES" | grep -o '"status": *"[^"]*"' | head -n1 | awk -F'"' '{print $4}')
  PROGRESS=$(echo "$POLL_RES" | grep -o '"progress": *[0-9]*' | awk -F': *' '{print $2}')
  
  echo "当前状态: $STATUS (进度: ${PROGRESS:-0}%)"
  
  if [ "$STATUS" = "done" ]; then
    VIDEO_URL=$(echo "$POLL_RES" | grep -o '"url": *"[^"]*"' | head -n1 | awk -F'"' '{print $4}')
    echo "🎉 视频生成完成！下载地址:"
    echo "$VIDEO_URL"
    break
  elif [ "$STATUS" = "failed" ] || [ "$STATUS" = "expired" ]; then
    echo "❌ 任务失败或已过期:"
    echo "$POLL_RES"
    exit 1
  fi
  
  sleep 5
done
```

---

### 5.2 Python (Requests) 端到端实现

```python
import os
import time
import requests
from typing import Optional, Dict, Any

XAI_API_KEY = os.environ.get("XAI_API_KEY", "your_api_key_here")
BASE_URL = "https://api.x.ai/v1"

def generate_video(
    prompt: str,
    model: str = "grok-imagine-video-1.5",
    duration: int = 5,
    aspect_ratio: str = "16:9",
    resolution: str = "720p",
    poll_interval: int = 5,
    timeout: int = 600
) -> Dict[str, Any]:
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {XAI_API_KEY}",
    }
    
    # 步骤 1: 提交生成任务
    payload = {
        "model": model,
        "prompt": prompt,
        "duration": duration,
        "aspect_ratio": aspect_ratio,
        "resolution": resolution,
    }
    
    res = requests.post(f"{BASE_URL}/videos/generations", headers=headers, json=payload)
    if not res.ok:
        raise RuntimeError(f"创建视频任务失败 (HTTP {res.status_code}): {res.text}")
    
    request_id = res.json().get("request_id")
    print(f"任务提交成功，Request ID: {request_id}")
    
    # 步骤 2: 轮询任务状态
    start_time = time.time()
    while True:
        if time.time() - start_time > timeout:
            raise TimeoutError(f"任务等待超时（超过 {timeout} 秒）")
        
        poll_res = requests.get(f"{BASE_URL}/videos/{request_id}", headers={"Authorization": headers["Authorization"]})
        if not poll_res.ok:
            raise RuntimeError(f"轮询状态失败 (HTTP {poll_res.status_code}): {poll_res.text}")
        
        data = poll_res.json()
        status = data.get("status")
        progress = data.get("progress", 0)
        print(f"任务处理中... 状态: {status} | 进度: {progress}%")
        
        if status == "done":
            video_info = data.get("video", {})
            if not video_info.get("respect_moderation", True):
                raise ValueError("视频未通过内容安全审查 (Video filtered by moderation)")
            print(f"生成成功！视频链接: {video_info.get('url')}")
            return data
        elif status == "failed":
            err = data.get("error", {})
            raise RuntimeError(f"视频生成失败: [{err.get('code')}] {err.get('message')}")
        elif status == "expired":
            raise RuntimeError("任务已在服务端过期 (expired)")
        
        time.sleep(poll_interval)

if __name__ == "__main__":
    result = generate_video("A fluffy ginger cat sleeping on a sunny windowsill, gentle breeze moving curtains")
```

---

### 5.3 JavaScript / TypeScript (Fetch API) 端到端实现

```typescript
const XAI_API_KEY = process.env.XAI_API_KEY || "your_api_key_here";
const BASE_URL = "https://api.x.ai/v1";

interface VideoResult {
  status: "pending" | "done" | "failed" | "expired";
  progress?: number;
  video?: {
    url: string;
    duration: number;
    respect_moderation: boolean;
  };
  error?: {
    code: string;
    message: string;
  };
}

async function createAndPollVideo(prompt: string): Promise<string> {
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${XAI_API_KEY}`,
  };

  // 1. 发起任务请求
  const startResponse = await fetch(`${BASE_URL}/videos/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "grok-imagine-video-1.5",
      prompt,
      duration: 8,
      aspect_ratio: "16:9",
      resolution: "720p",
    }),
  });

  if (!startResponse.ok) {
    const errorText = await startResponse.text();
    throw new Error(`创建任务失败 [${startResponse.status}]: ${errorText}`);
  }

  const { request_id } = (await startResponse.json()) as { request_id: string };
  console.log(`任务创建成功，Request ID: ${request_id}`);

  // 2. 轮询结果
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 5000));

    const pollResponse = await fetch(`${BASE_URL}/videos/${request_id}`, {
      headers: { Authorization: `Bearer ${XAI_API_KEY}` },
    });

    if (!pollResponse.ok) {
      throw new Error(`查询状态异常: ${pollResponse.status}`);
    }

    const data = (await pollResponse.json()) as VideoResult;
    console.log(`当前任务状态: ${data.status} (进度: ${data.progress ?? 0}%)`);

    if (data.status === "done") {
      if (!data.video?.respect_moderation || !data.video.url) {
        throw new Error("视频未通过安全审查已被过滤");
      }
      console.log(`视频生成成功！URL: ${data.video.url}`);
      return data.video.url;
    } else if (data.status === "failed") {
      throw new Error(`生成失败: [${data.error?.code}] ${data.error?.message}`);
    } else if (data.status === "expired") {
      throw new Error("任务已在服务端过期");
    }
  }
}
```
