# 字节跳动火山方舟（Seedance）视频生成 REST API 规范文档

本文档整理自字节跳动火山引擎·火山方舟大模型服务平台（Ark）官方开放平台接口规范（[Volcano Ark Contents Generations API](https://api.volcengine.com/api-docs/view?serviceCode=ark&version=2024-01-01&action=CreateContentsGenerationsTasks) 及开发者文档），详细规范了字节跳动 **Seedance** 系列视频生成大模型（`Seedance 2.0`、`Seedance 2.0 fast`、`Seedance 1.5 pro`、`Seedance 1.0 pro`、`Seedance 1.0 pro-fast`、`Seedance 1.0 lite`）的 REST API 接口定义、请求参数、多模态输入格式、异步轮询生命周期、Webhook 回调与错误处理标准。

---

## 1. 基础信息与通用约定

### 1.1 服务接入点（Base URL）

火山方舟 API 提供区域级服务接入地址：

| 接入区域 | Base URL | 说明 |
| :--- | :--- | :--- |
| **华北2（北京）** | `https://ark.cn-beijing.volces.com/api/v3` | 推荐中国大陆地域应用使用（默认） |
| **亚太东南（柔佛/新加坡）** | `https://ark.ap-southeast-1.volces.com/api/v3` | 国际站及海外地域应用使用 |

### 1.2 认证鉴权（Authentication）

所有 API 请求均须在 HTTP 请求头中携带 Bearer 格式的 API Key：

```http
Authorization: Bearer <YOUR_ARK_API_KEY>
Content-Type: application/json; charset=utf-8
```

### 1.3 数据交互规范

- **请求格式**：`application/json`，UTF-8 编码。
- **响应格式**：`application/json`，UTF-8 编码。
- **时间格式**：Unix 时间戳（单位：**秒**）。

---

## 2. 支持的模型矩阵与特性概览

火山方舟视频生成核心采用 **Seedance** 系列大模型，各模型能力对比如下：

| 模型系列 / Model ID | 核心能力定位 | 支持的输入模态 | 默认 / 可选分辨率 | 默认 / 可选画幅比例 | 时长支持 (秒) | 同步音频 (`generate_audio`) | 样片模式 (`draft`) | 联网搜索 (`tools`) | 服务等级 (`service_tier`) |
| :--- | :--- | :--- | :--- | :--- | :--- | :---: | :---: | :---: | :--- |
| **Seedance 2.0**<br>`doubao-seedance-2-0-*` | 最新旗舰多模态生视频模型，画质与物理动力学大幅增强，支持音画同步、多图/视频参考及联网搜索。 | 文本、参考图、参考视频、音频 | 默认 720p<br>(480p / 720p / 1080p / 4k) | 默认 adaptive<br>(16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive) | 4 ~ 15 秒<br>(支持 `-1` 自动) | ✅ 支持 | ❌ 不支持 | ✅ 支持 (`web_search`) | `default` (在线) |
| **Seedance 2.0 fast**<br>`doubao-seedance-2-0-fast-*` | 旗舰极速版，极低时延与高吞吐，适合实时与互动场景。 | 文本、参考图、参考视频、音频 | 默认 720p<br>(480p / 720p) | 默认 adaptive<br>(16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive) | 4 ~ 15 秒<br>(支持 `-1` 自动) | ✅ 支持 | ❌ 不支持 | ✅ 支持 (`web_search`) | `default` (在线) |
| **Seedance 1.5 pro**<br>`doubao-seedance-1-5-pro-*` | 专业视频生成模型，首创支持低成本样片（Draft）模式验证镜头与运动意图，支持音画同步。 | 文本、参考图、首尾帧、音频、样片ID | 默认 720p<br>(480p / 720p / 1080p) | 默认 adaptive<br>(16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive) | 4 ~ 12 秒<br>(支持 `-1` 自动) | ✅ 支持 | ✅ 支持 | ❌ 不支持 | `default` / `flex` (离线50%折扣) |
| **Seedance 1.0 pro**<br>`doubao-seedance-1-0-pro-*` | 高清基准视频模型，原生 1080p 高清输出，支持首尾帧运动控制。 | 文本、首尾帧图片 | 默认 1080p<br>(480p / 720p / 1080p) | 文生 16:9，图生 adaptive<br>(16:9, 4:3, 1:1, 3:4, 9:16, 21:9, adaptive) | 2 ~ 12 秒<br>或指定帧数 `[29, 289]` | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 | `default` / `flex` |
| **Seedance 1.0 pro-fast**<br>`doubao-seedance-1-0-pro-fast-*` | 1.0 高清快速版，兼顾生成速度与画质。 | 文本、首尾帧图片 | 默认 1080p<br>(480p / 720p / 1080p) | 文生 16:9，图生 adaptive | 2 ~ 12 秒<br>或指定帧数 `[29, 289]` | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 | `default` / `flex` |
| **Seedance 1.0 lite**<br>`doubao-seedance-1-0-lite-*` | 轻量化低成本模型，适合高并发与大批量生成任务。 | 文本、参考图 | 默认 720p<br>(480p / 720p) | 默认 16:9 / adaptive | 2 ~ 12 秒<br>或指定帧数 `[29, 289]` | ❌ 不支持 | ❌ 不支持 | ❌ 不支持 | `default` / `flex` |

> 💡 **提示**：参数中的 `model` 既可直接填写官方 Model ID（如 `doubao-seedance-1-0-pro-250528`），也可填写在控制台创建并绑定的**推理接入点 Endpoint ID**（如 `ep-20250210123456-abcde`）。

---

## 3. 核心工作机制：异步任务与生命周期

视频生成属于高算力异步计算任务，REST API 采用两阶段异步任务流机制：

```
+-------------------+                      +-----------------------+
|    Client 应用    |                      |   火山方舟 API 网关   |
+-------------------+                      +-----------------------+
          |                                            |
          |  1. POST /contents/generations/tasks       |
          |     (提交提示词、多模态素材与生成参数)     |
          |------------------------------------------->|
          |                                            |
          |  2. 返回 HTTP 200 + { "id": "cgt-xxx" }    |
          |<-------------------------------------------|
          |                                            |
          |  3. 轮询 GET /contents/generations/tasks/id|
          |------------------------------------------->|
          |     返回 status: "queued" / "running"      |
          |<-------------------------------------------|
          |                                            |
          |     (等待 3~5 秒间隔继续轮询...)           |
          |                                            |
          |  4. 轮询 GET /contents/generations/tasks/id|
          |------------------------------------------->|
          |     返回 status: "succeeded"               |
          |     + content.video_url (+ last_frame_url) |
          |<-------------------------------------------|
          |                                            |
          |  [可选] 若配置了 callback_url:             |
          |  服务端自动推送 POST Webhook 回调通知      |
          |<-------------------------------------------|
```

### 3.1 任务状态机（Task Status Lifecycle）

任务在其生命周期内可能处于以下状态之一：

```
                 +----------+
                 |  queued  | <--- 任务已提交，在排队队列中
                 +----+-----+      (此阶段可调用 DELETE 取消)
                      |
                      v
                 +----+-----+
                 | running  | <--- 任务正在 GPU 上加速推理生成
                 +----+-----+
                      |
         +------------+------------+------------+
         |                         |            |
         v                         v            v
  +--------------+          +------------+ +------------+
  |  succeeded   |          |   failed   | |  expired   |
  |  (生成成功)  |          | (生成失败) | | (超时终止) |
  +--------------+          +------------+ +------------+
```

| 状态值 (`status`) | 状态说明 | 处理建议 |
| :--- | :--- | :--- |
| `queued` | 排队中。任务等待分配计算资源。 | 继续轮询等待；若用户主动取消，可调用 `DELETE` 接口取消任务。 |
| `running` | 运行中。模型正在渲染生成视频。 | 继续轮询等待（建议间隔 3~5 秒）。 |
| `cancelled` | 已取消。排队中被取消的任务（取消记录保留 24 小时）。 | 终止轮询。 |
| `succeeded` | **任务成功**。视频渲染完成，返回可下载的 `video_url`。 | 提取 `video_url`（及可选 `last_frame_url`），**建议 24 小时内转存至自身存储**。 |
| `failed` | **任务失败**。任务处理异常或触发安全审核拦截。 | 查看 `error.code` 与 `error.message` 获取失败原因。 |
| `expired` | **任务超时**。排队与运行总时长超过 `execution_expires_after`。 | 检查超时阈值设置或重新发起任务。 |

### 3.2 资源存储与有效期约定
- **任务元数据保留期**：任务提交后，元数据在火山方舟保留 **7 天**（从 `created_at` 起算），超时自动物理清理。
- **产物下载链接有效期**：返回的 `video_url` 与 `last_frame_url` 为预签名临时下载地址，**有效期为 24 小时**。
- **长期存储推荐**：建议在业务服务端下载后转存至自己的对象存储（如火山引擎 TOS、AWS S3），或配置火山引擎 TOS 数据订阅自动备份。

---

## 4. REST API 接口详细规范

### 4.1 创建视频生成任务 (CreateContentsGenerationsTasks)

提交视频生成请求，创建异步任务并获取唯一的任务 ID。

- **请求方式**：`POST`
- **请求路径**：`/contents/generations/tasks`
- **完整 URL**：`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

#### 4.1.1 请求头（Headers）

| 请求头名称 | 类型 | 必填 | 示例值 / 说明 |
| :--- | :--- | :---: | :--- |
| `Authorization` | `string` | **是** | `Bearer 12345678-abcd-ef01-2345-6789abcdef01` |
| `Content-Type` | `string` | **是** | `application/json; charset=utf-8` |

#### 4.1.2 请求体参数（Request Body）

请求体为 JSON 对象：

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 详细说明 |
| :--- | :--- | :---: | :--- | :--- |
| `model` | `string` | **是** | - | 视频生成模型的 Model ID（如 `doubao-seedance-1-0-pro-250528`）或推理接入点 Endpoint ID（如 `ep-2025****-**`）。 |
| `content` | `array` | **是** | - | 多模态输入列表，包含文本、图片、视频、音频或样片 ID（**最多 5 个元素**）。详见 [4.1.3 content 字段详细规范](#413-content-字段多模态输入规范)。 |
| `duration` | `integer` | 否 | - | 生成视频时长（单位：**秒**，仅支持整数）。<br>• Seedance 1.0 系列：`[2, 12]` 秒<br>• Seedance 1.5 pro：`[4, 12]` 秒，或设为 `-1`（根据输入素材自动推断）<br>• Seedance 2.0 / 2.0 fast：`[4, 15]` 秒，或设为 `-1`（根据输入素材自动推断）<br>*注：`duration` 与 `frames` 二选一，若指定 `frames` 则优先级高于 `duration`。* |
| `frames` | `integer` | 否 | - | 生成视频的总帧数。用于精准生成小数秒长度的视频（计算公式：`帧数 = 时长 × 帧率 24`）。<br>• 取值范围：`[29, 289]` 区间内所有满足 `25 + 4n`（n 为正整数）的整数。<br>• 例如：需要 2.4 秒视频，`2.4 × 24 = 57.6`，最接近的 `25 + 4n` 帧数为 `57` 帧（实际视频时长 `57 / 24 = 2.375` 秒）。<br>*注：Seedance 1.5 / 2.0 暂不支持该参数。* |
| `resolution` | `string` | 否 | 视模型而定 | 输出视频分辨率。枚举值：<br>• `480p`（标清，适合预览/低码率场景）<br>• `720p`（高清，Seedance 2.0 / 1.5 / 1.0 lite 默认值）<br>• `1080p`（超清，Seedance 1.0 pro 默认值；Seedance 2.0 fast 与 1.0 lite 默认不支持 1080p）<br>• `4k`（超高清，仅 Seedance 2.0 旗舰支持）<br>*注：模型 ID 以 `-se` 结尾时，即使该系列默认不支持 1080p，也可以选择 1080p，例如 `doubao-seedance-2-0-fast-260128-se`。* |
| `ratio` | `string` | 否 | 视模型而定 | 输出视频画面宽高比。枚举值：<br>• `16:9`（横屏宽幅，文生视频常用）<br>• `4:3`（传统画幅）<br>• `1:1`（方形画幅）<br>• `3:4`（竖向画幅）<br>• `9:16`（竖屏短视频）<br>• `21:9`（电影级超宽屏）<br>• `adaptive`（自适应，Seedance 2.0 / 1.5 pro 默认值；图生视频时自动匹配输入图比例） |
| `generate_audio` | `boolean` | 否 | `false` | 是否生成与画面同步的声音（包含语音对白、环境音效与背景音乐）。<br>• `true`：生成同步音频（仅 Seedance 2.0 / 2.0 fast / 1.5 pro 支持）。文本中的对白建议使用英文/中文双引号包裹，如 `男人说：“你好！”`<br>• `false`：生成无声视频 |
| `camera_fixed` | `boolean` | 否 | `false` | 是否锁定并固定摄像机机位。<br>• `true`：固定机位（平台在 Prompt 中追加运镜约束，实际效果不完全保证；Seedance 2.0 暂不支持）<br>• `false`：自由运镜 |
| `watermark` | `boolean` | 否 | `false` | 生成视频中是否添加平台水印。<br>• `false`：无水印（默认）<br>• `true`：含水印 |
| `seed` | `integer` | 否 | `-1` | 随机数种子，用于固定随机性以复现效果。取值范围：`[-1, 4294967295]`（即 `[-1, 2^32-1]`）。`-1` 表示完全随机。 |
| `draft` | `boolean` | 否 | `false` | 是否开启样片模式（**仅 Seedance 1.5 pro 支持**）。<br>• `true`：生成低 Token 消耗的预览样片，用于快速验证构图、主体动态与 Prompt 意图<br>• `false`：生成正式高质量视频 |
| `return_last_frame` | `boolean` | 否 | `false` | 是否返回生成视频的尾帧图片（PNG 格式，无水印，与视频同像素规格）。<br>• `true`：在查询任务接口中返回 `content.last_frame_url`。可将该尾帧作为下一个视频任务的输入，实现**多段连续长视频生成**。<br>• `false`：不返回尾帧图 |
| `tools` | `array` | 否 | - | 视频生成模型可调用的外部工具列表（**仅 Seedance 2.0 / 2.0 fast 支持**）。<br>例如启用联网搜索：`[{"type": "web_search"}]` |
| `service_tier` | `string` | 否 | `default` | 请求处理的服务等级类型：<br>• `default`：**在线推理模式**，优先级高、时效性强（Seedance 2.0 仅支持 default）<br>• `flex`：**离线推理模式**，价格仅为在线推理的 50%，TPD 吞吐更大，适合离线批处理等非实时场景 |
| `execution_expires_after` | `integer` | 否 | `172800` | 任务最大执行超时阈值（单位：**秒**，从 `created_at` 起算）。默认 172800 秒（48 小时）。取值范围 `[3600, 259200]`（1 小时 ~ 72 小时）。超时后任务自动终止并置为 `expired`。 |
| `callback_url` | `string` | 否 | - | 任务状态变更时的 Webhook 回调通知地址（POST）。回调 Payload 结构与[4.2 查询任务响应体](#422-响应参数response-body)完全一致。 |
| `safety_identifier` | `string` | 否 | - | 终端用户的唯一安全标识符，最大 64 字符（推荐传入用户 ID 或邮箱的 SHA-256 哈希值）。平台将原样透传，用于协助安全溯源。 |

---

#### 4.1.3 `content` 字段多模态输入规范

`content` 是一个对象数组，支持以下 5 种模态元素及自由组合：

##### 1. 文本输入（Text）
```json
{
  "type": "text",
  "text": "镜头推近，阳光穿透薄雾照耀在晨露欲滴的红玫瑰花瓣上，微风拂过，花瓣轻颤，电影级景深，8k超清。"
}
```

##### 2. 参考图 / 首尾帧图片输入（Image）
```json
{
  "type": "image_url",
  "image_url": {
    "url": "https://your-tos-bucket.tos-cn-beijing.volces.com/inputs/char_reference.jpg"
  },
  "role": "reference_image"
}
```
*`role` 支持的枚举值：*
- `reference_image`：**参考图**。作为画面主体、角色、道具或风格的视觉参考。
- `first_frame`：**起始帧（首帧）**。指定生成视频必须以此图像作为起始画面。
- `last_frame`：**结束帧（尾帧）**。指定生成视频必须以此图像作为终止画面。

##### 3. 参考视频输入（Video）
```json
{
  "type": "video_url",
  "video_url": {
    "url": "https://your-tos-bucket.tos-cn-beijing.volces.com/inputs/action_guide.mp4"
  },
  "role": "reference_video"
}
```

##### 4. 参考音频输入（Audio）
```json
{
  "type": "audio_url",
  "audio_url": {
    "url": "https://your-tos-bucket.tos-cn-beijing.volces.com/inputs/bgm_track.mp3"
  },
  "role": "reference_audio"
}
```

##### 5. 样片任务转正式视频输入（Draft Task ID）
```json
{
  "type": "draft_task_id",
  "draft_task_id": "cgt-20260315120000-abcdef"
}
```

##### 支持的多模态组合矩阵：
- **纯文本**：`[text]`
- **图生视频 (I2V)**：`[text(可选), image_url(first_frame)]`
- **首尾帧生视频**：`[text(可选), image_url(first_frame), image_url(last_frame)]`
- **多参考图生视频 (R2V)**：`[text, image_url(reference_image), image_url(reference_image)...]`
- **视频参考生视频 (V2V)**：`[text, video_url(reference_video)]`
- **多模态全要素驱动**：`[text, image_url, video_url, audio_url]`
- **样片高清化**：`[draft_task_id]`

---

#### 4.1.4 响应参数（Response Body）

HTTP 状态码：`200 OK`

| 参数名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `string` | 视频生成任务的唯一标识符（Task ID，格式如 `cgt-20260315102030-9a8b7c`）。用于后续查询与轮询。 |

---

#### 4.1.5 请求与响应示例

##### 示例 1：纯文本生成视频（Text-to-Video）

**HTTP 请求：**
```http
POST /api/v3/contents/generations/tasks HTTP/1.1
Host: ark.cn-beijing.volces.com
Authorization: Bearer YOUR_ARK_API_KEY
Content-Type: application/json

{
  "model": "doubao-seedance-1-0-pro-250528",
  "content": [
    {
      "type": "text",
      "text": "大疆无人机航拍视角：穿越张家界清晨奇峰怪石间的云海，晨曦破晓，金光洒满山脊，飞鸟展翅掠过幽谷，电影级史诗质感。"
    }
  ],
  "duration": 5,
  "resolution": "1080p",
  "ratio": "16:9",
  "watermark": false
}
```

**HTTP 响应：**
```json
{
  "id": "cgt-20260315102030-9a8b7c"
}
```

##### 示例 2：首尾帧控制 + 音画同步 + 尾帧导出 + 联网搜索（Seedance 2.0）

**HTTP 请求：**
```http
POST /api/v3/contents/generations/tasks HTTP/1.1
Host: ark.cn-beijing.volces.com
Authorization: Bearer YOUR_ARK_API_KEY
Content-Type: application/json

{
  "model": "doubao-seedance-2-0-260115",
  "content": [
    {
      "type": "text",
      "text": "特写镜头，身穿浅蓝色围裙的咖啡师正在精细拉花，在拿铁表面勾勒出精致的天鹅图案。环境伴随咖啡馆轻柔的白噪音与背景音乐，咖啡师抬头微笑说：“您好，您的特调拿铁已做好。”"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic1.jpg"
      },
      "role": "first_frame"
    },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://ark-project.tos-cn-beijing.volces.com/doc_image/r2v_tea_pic2.jpg"
      },
      "role": "last_frame"
    }
  ],
  "duration": 6,
  "resolution": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "return_last_frame": true,
  "tools": [
    {
      "type": "web_search"
    }
  ],
  "callback_url": "https://api.yourdomain.com/webhooks/volcengine/video-task",
  "safety_identifier": "usr_hash_9f83a21c"
}
```

**HTTP 响应：**
```json
{
  "id": "cgt-20260315102540-1f2e3d"
}
```

##### 示例 3：低成本样片验证与转正式高清视频（Seedance 1.5 pro）

**步骤 1：创建样片模式任务**
```json
{
  "model": "doubao-seedance-1-5-pro-250815",
  "content": [
    {
      "type": "text",
      "text": "赛博朋克都市雨夜，穿黄色雨衣的机车手疾驰穿过霓虹闪烁的街道。"
    }
  ],
  "draft": true,
  "duration": 5
}
```
*响应获得样片任务 ID：`cgt-20260315103000-draft123`*

**步骤 2：验证样片效果满意后，转正式高清视频**
```json
{
  "model": "doubao-seedance-1-5-pro-250815",
  "content": [
    {
      "type": "draft_task_id",
      "draft_task_id": "cgt-20260315103000-draft123"
    }
  ],
  "draft": false,
  "resolution": "1080p"
}
```

---

### 4.2 查询视频生成任务信息 (GetContentsGenerationsTask)

用于轮询或单次查询指定视频生成任务的当前执行状态、生成结果链接、Token 消耗统计及错误信息。

- **请求方式**：`GET`
- **请求路径**：`/contents/generations/tasks/{id}` 或 `/contents/generations/tasks?id={id}`
- **完整 URL**：`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`

#### 4.2.1 请求参数

| 参数名称 | 所在位置 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :---: | :--- |
| `id` | Path 或 Query | `string` | **是** | 待查询的视频生成任务 ID（如 `cgt-20260315102540-1f2e3d`）。 |

#### 4.2.2 响应参数（Response Body）

HTTP 状态码：`200 OK`

| 参数名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `id` | `string` | 任务 ID。 |
| `model` | `string` | 实际处理任务的模型名称与版本号（格式形如 `doubao-seedance-2-0-260115`）。 |
| `status` | `string` | **任务当前状态**：<br>• `queued`：排队中<br>• `running`：生成运行中<br>• `cancelled`：已取消（仅支持排队阶段取消）<br>• `succeeded`：**生成成功**<br>• `failed`：生成失败<br>• `expired`：超时终止 |
| `content` | `object` | 任务输出结果（仅在 `status == "succeeded"` 时返回）：<br>• `video_url` (`string`): 生成视频的 MP4 下载 URL（**有效期 24 小时**）<br>• `last_frame_url` (`string`): 生成视频的 PNG 尾帧图片 URL（**有效期 24 小时**，仅在创建时指定 `return_last_frame: true` 时返回） |
| `error` | `object` | 错误详情（仅在 `status == "failed"` 时返回）：<br>• `code` (`string`): 业务错误代码（见[第 6 节错误码](#6-错误代码与异常处理标准)）<br>• `message` (`string`): 错误详细信息与 Request ID |
| `usage` | `object` | 资源用量与计费 Token 统计：<br>• `completion_tokens` (`string`): 生成视频消耗的 Token 数量<br>• `total_tokens` (`string`): 请求总 Token 消耗（因视频生成不统计输入 Token，故等于 `completion_tokens`）<br>• `tool_usage` (`object`): 包含 `web_search` 实际调用次数（如 `{"web_search": 1}`） |
| `duration` | `string` | 生成视频的实际时长（秒）。 |
| `frames` | `integer` | 生成视频的实际总帧数。 |
| `framespersecond` | `integer` | 视频帧率（FPS，标准为 24）。 |
| `resolution` | `string` | 视频分辨率（如 `1080p`, `720p`, `480p`）。 |
| `ratio` | `string` | 视频画面宽高比（如 `16:9`, `9:16`, `adaptive`）。 |
| `seed` | `integer` | 实际生成采用的随机种子整数值。 |
| `generate_audio` | `boolean` | 是否包含音画同步音频。 |
| `draft` | `boolean` | 是否为样片模式视频。 |
| `draft_task_id` | `string` | 若基于样片生成，返回对应的样片任务 ID。 |
| `tools` | `array` | 实际使用的外部工具配置列表。 |
| `service_tier` | `string` | 处理任务的服务等级（`default` 或 `flex`）。 |
| `execution_expires_after` | `integer` | 任务超时阈值（秒）。 |
| `safety_identifier` | `string` | 终端用户安全标识符。 |
| `created_at` | `integer` | 任务创建的 Unix 时间戳（秒）。 |
| `updated_at` | `integer` | 任务状态最后更新的 Unix 时间戳（秒）。 |

---

#### 4.2.3 响应示例

##### 示例 1：任务生成成功（succeeded）

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "id": "cgt-20260315102540-1f2e3d",
  "model": "doubao-seedance-2-0-260115",
  "status": "succeeded",
  "content": {
    "video_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/cgt-20260315102540-1f2e3d.mp4?X-Tos-Expires=86400&...",
    "last_frame_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/cgt-20260315102540-1f2e3d_last_frame.png?X-Tos-Expires=86400&..."
  },
  "created_at": 1773570340,
  "updated_at": 1773570415,
  "duration": "6",
  "frames": 144,
  "framespersecond": 24,
  "resolution": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "draft": false,
  "service_tier": "default",
  "seed": 2048591,
  "tools": [
    {
      "type": "web_search"
    }
  ],
  "usage": {
    "completion_tokens": "38400",
    "total_tokens": "38400",
    "tool_usage": {
      "web_search": 1
    }
  },
  "execution_expires_after": 172800
}
```

##### 示例 2：任务运行中（running）

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "id": "cgt-20260315102540-1f2e3d",
  "model": "doubao-seedance-2-0-260115",
  "status": "running",
  "created_at": 1773570340,
  "updated_at": 1773570355,
  "resolution": "720p",
  "ratio": "16:9",
  "service_tier": "default"
}
```

##### 示例 3：任务失败（failed - 触发合规策略）

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8

{
  "id": "cgt-20260315102540-1f2e3d",
  "model": "doubao-seedance-2-0-260115",
  "status": "failed",
  "created_at": 1773570340,
  "updated_at": 1773570348,
  "error": {
    "code": "InputTextSensitiveContentDetected",
    "message": "The request failed because the input text may contain sensitive information. Request ID: 20260315102540-1f2e3d"
  }
}
```

---

### 4.3 查询内容生成任务列表 (ListContentsGenerationsTasks)

批量分页查询当前账号下的内容生成任务列表，支持状态、模型、服务等级和任务 ID 等多维条件组合过滤。

- **请求方式**：`GET`
- **请求路径**：`/contents/generations/tasks`
- **完整 URL**：`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`

#### 4.3.1 Query 参数

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| `page_num` | `integer` | 否 | `1` | 当前请求页码，取值范围 `[1, 500]`。 |
| `page_size` | `integer` | 否 | `10` | 每页数据条数，取值范围 `[1, 500]`。 |
| `filter.status` | `string` | 否 | - | 按任务状态筛选：`queued`、`running`、`cancelled`、`succeeded`、`failed`。 |
| `filter.model` | `string` | 否 | - | 按绑定的推理接入点 ID（Endpoint ID）精确筛选。 |
| `filter.service_tier` | `string` | 否 | - | 按服务等级筛选：`default`（在线）或 `flex`（离线）。 |
| `filter.task_ids` | `string` / `array` | 否 | - | 按任务 ID 批量检索。传递多个 ID 时使用 `&filter.task_ids=id1&filter.task_ids=id2`。 |

#### 4.3.2 响应参数（Response Body）

HTTP 状态码：`200 OK`

| 参数名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| `total` | `integer` | 满足当前筛选条件的总任务数量。 |
| `items` | `array` | 任务列表数组，每个元素包含单个任务的完整信息（结构与 [4.2.2 查询任务响应参数](#422-响应参数response-body) 一致）。 |

**响应示例：**
```json
{
  "total": 28,
  "items": [
    {
      "id": "cgt-20260315102540-1f2e3d",
      "model": "doubao-seedance-2-0-260115",
      "status": "succeeded",
      "content": {
        "video_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/video1.mp4",
        "last_frame_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/last_frame1.png"
      },
      "created_at": 1773570340,
      "updated_at": 1773570415,
      "duration": "6",
      "resolution": "720p",
      "ratio": "16:9",
      "usage": {
        "completion_tokens": "38400",
        "total_tokens": "38400"
      }
    }
  ]
}
```

---

### 4.4 取消或删除内容生成任务 (DeleteContentsGenerationsTasks)

取消排队中的视频生成任务，或删除已完成/已失败/已取消的历史任务记录。

- **请求方式**：`DELETE`
- **请求路径**：`/contents/generations/tasks/{id}` 或 `/contents/generations/tasks`
- **完整 URL**：`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/{id}`

#### 4.4.1 行为说明

| 任务当前状态 | 执行 DELETE 接口的行为说明 |
| :--- | :--- |
| **排队中 (`queued`)** | **取消任务**：任务立即终止排队并移出队列，状态变更为 `cancelled`，取消记录在 24 小时后系统自动物理清除。不产生算力计费。 |
| **运行中 (`running`)** | **不支持立即中断**：GPU 已在密集计算中，不可撤回。建议等待其完成或失败后删除记录。 |
| **已成功 / 失败 / 已超时 / 已取消** | **删除元数据**：立即从任务列表及控制台中移除该条任务元数据记录。 |

#### 4.4.2 请求示例

```bash
curl -X DELETE "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/cgt-20260315102540-1f2e3d" \
  -H "Authorization: Bearer YOUR_ARK_API_KEY"
```

**响应（HTTP 200 OK）：**
```json
{}
```

---

## 5. Webhook 异步回调通知规范

如果在创建任务时传入了 `callback_url`，火山方舟将在任务状态变更（进入终态 `succeeded`、`failed`、`expired`）时自动向该 URL 推送 HTTP POST 回调通知。

### 5.1 回调请求规格
- **HTTP Method**：`POST`
- **Headers**：`Content-Type: application/json; charset=utf-8`
- **Request Body**：与 [4.2 查询任务信息接口](#42-查询视频生成任务信息-getcontentsgenerationstask) 的返回体结构完全一致。

### 5.2 重试机制与响应要求
1. **响应状态码**：客户端接收端收到回调后，须在 **5 秒** 内返回 HTTP `200` 状态码（Body 可为空）。
2. **重试策略**：若接收超时或返回非 2xx 状态码，火山方舟将触发重试机制，最多重试 **3 次**。
3. **幂等性保障**：由于网络波动可能引发重复推送，客户端业务逻辑应根据 `id` 做好幂等去重处理。

### 5.3 回调 Payload 示例（任务成功完成）

```json
{
  "id": "cgt-20260315102540-1f2e3d",
  "model": "doubao-seedance-2-0-260115",
  "status": "succeeded",
  "content": {
    "video_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/cgt-20260315102540-1f2e3d.mp4",
    "last_frame_url": "https://ark-project.tos-cn-beijing.volces.com/outputs/cgt-20260315102540-1f2e3d_last_frame.png"
  },
  "created_at": 1773570340,
  "updated_at": 1773570415,
  "duration": "6",
  "frames": 144,
  "framespersecond": 24,
  "resolution": "720p",
  "ratio": "16:9",
  "generate_audio": true,
  "usage": {
    "completion_tokens": "38400",
    "total_tokens": "38400"
  }
}
```

---

## 6. 错误代码与异常处理标准

当请求发生异常或生成失败时，API 将返回对应的 HTTP 状态码与 JSON 结构错误体：

```json
{
  "error": {
    "code": "InputTextSensitiveContentDetected",
    "message": "The request failed because the input text may contain sensitive information. Request ID: 20260315102540-1f2e3d"
  }
}
```

### 错误码全量对照表

| HTTP 状态码 | 业务错误代码 (`code`) | 说明与客户端最佳处置建议 |
| :--- | :--- | :--- |
| `400 Bad Request` | `InputTextSensitiveContentDetected` | 输入的提示词文本命中平台安全合规检测策略。请提示用户修改或过滤敏感词汇后重试。 |
| `400 Bad Request` | `InputImageSensitiveContentDetected` | 输入的参考图片或首尾帧命中安全合规策略。请更换图片后重试。 |
| `400 Bad Request` | `OutputVideoSensitiveContentDetected` | 模型渲染生成的视频画面命中安全审核策略。请微调提示词或替换素材后重试。 |
| `400 Bad Request` | `InvalidParameter` | 请求参数非法（例如时长超出范围、分辨率不支持、多模态组合格式错误等）。请核对文档中的参数限制。 |
| `400 Bad Request` | `InvalidModel` | 指定的模型 Model ID 或 Endpoint ID 不存在、已下线或拼写错误。 |
| `401 Unauthorized` | `UnauthorizedAccess` | API Key 缺失、格式无效或已失效。请核验 `Authorization` 请求头。 |
| `403 Forbidden` | `ModelAccessDenied` | 当前火山引擎主/子账号未开通该模型的使用权限或欠费停服。请前往火山方舟控制台开通。 |
| `404 Not Found` | `TaskNotFound` | 任务 ID 不存在或已超过 7 天被系统自动清理。 |
| `429 Too Many Requests` | `QuotaExceeded` | 当前账号排队中的任务数超过配额上限，或请求频率触碰 RPM/TPM 阈值。请实施**指数退避重试（Exponential Backoff）**并控制并发。 |
| `500 Internal Server Error` | `InternalError` | 火山方舟服务端内部偶发异常。建议结合退避算法进行重试（重试 2~3 次）。 |

---

## 7. 全流程实战代码示例

### 7.1 Python 完整实战：异步任务创建、智能轮询与自动下载

```python
import os
import time
import requests
from typing import Optional, Dict, Any

# 1. 配置认证参数
ARK_API_KEY = os.environ.get("ARK_API_KEY", "your-ark-api-key-here")
BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"

HEADERS = {
    "Authorization": f"Bearer {ARK_API_KEY}",
    "Content-Type": "application/json; charset=utf-8"
}

def create_video_generation_task(
    prompt: str,
    first_frame_url: Optional[str] = None,
    duration: int = 5,
    resolution: str = "720p",
    ratio: str = "16:9",
    generate_audio: bool = False,
    model: str = "doubao-seedance-2-0-260115"
) -> str:
    """提交视频生成任务并返回 task_id"""
    content = [{"type": "text", "text": prompt}]
    
    if first_frame_url:
        content.append({
            "type": "image_url",
            "image_url": {"url": first_frame_url},
            "role": "first_frame"
        })

    payload = {
        "model": model,
        "content": content,
        "duration": duration,
        "resolution": resolution,
        "ratio": ratio,
        "generate_audio": generate_audio,
        "return_last_frame": True,
        "watermark": False
    }

    url = f"{BASE_URL}/contents/generations/tasks"
    response = requests.post(url, json=payload, headers=HEADERS)
    response.raise_for_status()
    
    task_id = response.json().get("id")
    print(f"[✔] 视频生成任务已创建，Task ID: {task_id}")
    return task_id

def poll_video_task_until_complete(
    task_id: str,
    poll_interval: int = 5,
    max_wait_seconds: int = 300
) -> Dict[str, Any]:
    """轮询任务状态直至完成或失败"""
    url = f"{BASE_URL}/contents/generations/tasks/{task_id}"
    start_time = time.time()

    print(f"[*] 开始轮询任务状态 (最大等待: {max_wait_seconds}s)...")
    while time.time() - start_time < max_wait_seconds:
        resp = requests.get(url, headers=HEADERS)
        resp.raise_for_status()
        data = resp.json()
        
        status = data.get("status")
        elapsed = int(time.time() - start_time)
        print(f"    - [{elapsed}s] 任务状态: {status}")

        if status == "succeeded":
            video_url = data.get("content", {}).get("video_url")
            last_frame = data.get("content", {}).get("last_frame_url")
            tokens = data.get("usage", {}).get("total_tokens")
            print(f"\n[🎉] 视频生成成功!")
            print(f"    • 视频 URL: {video_url}")
            print(f"    • 尾帧 URL: {last_frame}")
            print(f"    • 消耗 Token: {tokens}")
            return data
            
        elif status in ("failed", "expired", "cancelled"):
            error_info = data.get("error", {})
            raise RuntimeError(f"任务未成功完成: 状态={status}, 详情={error_info}")

        time.sleep(poll_interval)

    raise TimeoutError(f"任务轮询超时（超过 {max_wait_seconds} 秒）")

def download_file(url: str, output_path: str) -> None:
    """下载生成的视频文件到本地"""
    print(f"[*] 正在下载视频到: {output_path}...")
    with requests.get(url, stream=True) as r:
        r.raise_for_status()
        with open(output_path, "wb") as f:
            for chunk in r.iter_content(chunk_size=8192):
                f.write(chunk)
    print(f"[✔] 视频下载完毕: {output_path}")

if __name__ == "__main__":
    prompt_text = "特写微距镜头，一颗晶莹剔透的水滴从荷叶中央滑落，溅起优美的涟漪，晨光折射出彩虹光芒，超清细节，4k。"
    
    # 1. 发起任务
    task_id = create_video_generation_task(
        prompt=prompt_text,
        duration=5,
        resolution="720p",
        generate_audio=True
    )
    
    # 2. 轮询结果
    result = poll_video_task_until_complete(task_id)
    
    # 3. 本地保存
    video_download_url = result["content"]["video_url"]
    download_file(video_download_url, "lotus_waterdrop.mp4")
```

---

### 7.2 Node.js / TypeScript 完整实战

```typescript
import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const ARK_API_KEY = process.env.ARK_API_KEY || "your-ark-api-key-here";
const BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    Authorization: `Bearer ${ARK_API_KEY}`,
    "Content-Type": "application/json; charset=utf-8",
  },
});

interface CreateTaskResponse {
  id: string;
}

interface TaskDetailResponse {
  id: string;
  model: string;
  status: "queued" | "running" | "succeeded" | "failed" | "expired" | "cancelled";
  content?: {
    video_url: string;
    last_frame_url?: string;
  };
  error?: {
    code: string;
    message: string;
  };
  usage?: {
    completion_tokens: string;
    total_tokens: string;
  };
}

async function generateVideo(): Promise<void> {
  try {
    // 1. 创建视频生成任务
    console.log("[+] 提交视频生成任务...");
    const createRes = await apiClient.post<CreateTaskResponse>("/contents/generations/tasks", {
      model: "doubao-seedance-2-0-260115",
      content: [
        {
          type: "text",
          text: "电影质感，一只雪白的小猫好奇地伸出爪子触碰空中的全息光斑，光斑散开化为星尘。",
        },
      ],
      duration: 5,
      resolution: "720p",
      ratio: "16:9",
      generate_audio: true,
    });

    const taskId = createRes.data.id;
    console.log(`[✔] 任务创建成功，Task ID: ${taskId}`);

    // 2. 轮询任务状态
    console.log("[*] 开始轮询状态...");
    const startTime = Date.now();
    const maxWaitMs = 300 * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      const detailRes = await apiClient.get<TaskDetailResponse>(`/contents/generations/tasks/${taskId}`);
      const task = detailRes.data;
      console.log(`    - 任务状态: ${task.status}`);

      if (task.status === "succeeded" && task.content?.video_url) {
        console.log(`[🎉] 视频生成成功! 视频地址: ${task.content.video_url}`);
        return;
      } else if (task.status === "failed" || task.status === "expired" || task.status === "cancelled") {
        throw new Error(`任务失败: ${task.status}, 原因: ${JSON.stringify(task.error)}`);
      }

      // 等待 5 秒继续轮询
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error("轮询任务超时");
  } catch (error: any) {
    console.error("[✖] 执行出错:", error.response?.data || error.message);
  }
}

generateVideo();
```
