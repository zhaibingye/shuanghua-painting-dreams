# xAI Grok 图像生成与编辑 REST API 规范文档

本文档基于 xAI 官方开发者文档（[xAI Image Generation Documentation](https://docs.x.ai/developers/model-capabilities/images/generation)、[Image Editing](https://docs.x.ai/developers/model-capabilities/images/editing)、[Multi-Image Editing](https://docs.x.ai/developers/model-capabilities/images/multi-image-editing) 及 REST API Inference 规范）整理，详细规范了 xAI Grok 图像大模型（`grok-imagine-image-2.0`、`grok-imagine-image`、`grok-imagine-image-quality`）的 REST API 接口定义、请求参数、响应结构、单图编辑、多图参考编辑（最多 3 张图）、Files API 存储集成以及 Conversational Tool 模式标准。

---

## 1. 基础信息与通用约定

### 1.1 服务接入点（Base URL）

xAI REST API 全局统一接入地址：

```http
https://api.x.ai/v1
```

### 1.2 认证鉴权（Authentication）

所有 API 请求均须在 HTTP 请求头中携带 Bearer 格式的 API Key 进行鉴权：

```http
Authorization: Bearer <XAI_API_KEY>
Content-Type: application/json
```

> ⚠️ **重要协议说明（与 OpenAI SDK 的关键差异）**：
>
> 传统的 OpenAI SDK `images.edit()` 方法使用 `multipart/form-data` 传输二进制文件，而 **xAI API 的所有图像生成与图像编辑端点均严格采用 `application/json` 格式**。
>
> 在 xAI 中，输入图片通过 **公开 URL**、**Base64 Data URI** 或 **xAI Files API 的 `file_id`** 在 JSON 请求体中直接传递。因此，请使用标准 HTTP/REST 请求库（如 `requests`、`fetch`、`axios`）、xAI SDK 或兼容 JSON 的 AI SDK，避免直接使用 OpenAI 原生 SDK 的 `images.edit` 封装。

### 1.3 支持的模型与能力一览

| 模型标识 (Model ID) | 核心定位与能力说明 | 支持功能 | 计费单价 |
| :--- | :--- | :--- | :--- |
| **`grok-imagine-image-2.0`** | 最新旗舰图像模型。具备卓越的文本理解能力、提示词扩展/重写能力、复杂场景构图、多风格迁移、单图/多图编辑能力，支持 1k/2k 分辨率及质量控制。 | 文生图、单图编辑、多图编辑 (最多3张)、风格迁移、画幅自适应 | $0.04 / 张 |
| **`grok-imagine-image`** | 基础图像模型。适合大批量、高性价比的快速文生图。 | 文生图、基础图像编辑 | $0.02 / 张 |
| **`grok-imagine-image-quality`** | 高画质特化模型。注重细节渲染与高保真度画面表现。 | 高画质文生图、图像编辑 | $0.05 / 张 |

### 1.4 计费机制与 USD Ticks 说明

- **计费模式**：图像生成与编辑采用按张计费的固定费率，不按文本提示词长度收费。编辑操作会同时计入输入与输出。
- **USD Ticks 计算标准**：在 API 响应的 `usage.cost_in_usd_ticks` 字段中以 Ticks 精确记录单次请求成本：
  - $1\ \text{USD Cent (美分)} = 100,000,000\ \text{ticks}$ ($10^8$ ticks)
  - $1\ \text{USD (美元)} = 10,000,000,000\ \text{ticks}$ ($10^{10}$ ticks)
  - 例如生成一张 $0.04 的图片，`cost_in_usd_ticks` 值为 `400000000`。

---

## 2. 图像生成接口 (POST /v1/images/generations)

该端点用于根据文本提示词（Prompt）直接生成全新图片（Text-to-Image）。支持单次请求批量生成多张图片、多种画幅比例自适应、1k/2k 分辨率选择、质量控制以及自动持久化存储。

- **请求方式**：`POST`
- **请求路径**：`/v1/images/generations`
- **完整 URL**：`https://api.x.ai/v1/images/generations`
- **数据格式**：`Content-Type: application/json`

### 2.1 请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`prompt`** | `string` | **是** | - | 图像生成的描述性文本提示词。支持详细场景、光影、构图、色彩及艺术风格描述。 |
| **`model`** | `string` | 否 | `grok-imagine-image-2.0` | 调用的模型标识，可选：`grok-imagine-image-2.0`、`grok-imagine-image`、`grok-imagine-image-quality`。 |
| **`n`** | `integer` | 否 | `1` | 单次请求生成的图片张数。取值范围：`1 ~ 10`。批量生成时返回包含多张图片的列表。 |
| **`aspect_ratio`** | `string` | 否 | `"1:1"` | 画面宽高比。可选枚举值：<br>• `"1:1"`：方形（社交媒体头像/帖子）<br>• `"16:9"` / `"9:16"`：宽屏横屏 / 手机全屏竖屏（故事/短视频）<br>• `"4:3"` / `"3:4"`：标准画幅 / 纵向肖像<br>• `"3:2"` / `"2:3"`：经典相机摄影画幅<br>• `"2:1"` / `"1:2"`：全景横幅 / 细长竖幅<br>• `"19.5:9"` / `"9:19.5"`：现代智能手机屏幕比例<br>• `"20:9"` / `"9:20"`：超宽手机屏比例<br>• `"auto"`：模型根据提示词内容自动推导最佳比例 |
| **`resolution`** | `string` | 否 | `"1k"` | 输出图像分辨率。可选枚举：<br>• `"1k"`：标准高清分辨率<br>• `"2k"`：超高清分辨率（细节更丰富，适合大幅展示） |
| **`quality`** | `string` | 否 | `"medium"` | 生成质量等级。仅 `grok-imagine-image-2.0` 支持。可选：<br>• `"low"`：快速生成<br>• `"medium"`：标准质量（默认） |
| **`response_format`** | `string` | 否 | `"url"` | 响应中返回的图片数据格式：<br>• `"url"`：返回临时的图片下载链接（短时有效，建议立即下载或配置存储）<br>• `"b64_json"`：返回 Base64 编码的纯图片字符串（无 `data:image/...` 前缀） |
| **`storage_options`** | `object` | 否 | `null` | 自动持久化存储配置对象。配置后会将生成的图片自动存入 xAI Files API 存储空间中。详见下表。 |
| **`user`** | `string` | 否 | `null` | 终端用户的唯一标识符，帮助 xAI 监控和检测滥用行为。 |

#### `storage_options` 子对象结构

| 参数名称 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `filename` | `string` | **是** | 存储在 Files API 中的文件名称（例如 `"output.jpg"`）。 |
| `expires_after` | `integer` | 否 | 文件自动过期的秒数。取值范围：`3600`（1小时）至 `2592000`（30天）。若省略则永久保留。 |
| `public_url` | `boolean` \| `object` | 否 | 是否额外创建免鉴权的永久/可分享公开 URL。设为 `true` 即可直接获得公开访问外链。 |

---

### 2.2 响应结构（Response Body）

```json
{
  "data": [
    {
      "url": "https://imgen.x.ai/xai-imgen/xai-tmp-imgen-abc123.jpg",
      "b64_json": null,
      "mime_type": "image/jpeg",
      "file_output": {
        "file_id": "file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a",
        "filename": "garden.jpg",
        "public_url": "https://files.x.ai/public/file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a.jpg",
        "public_url_expires_at": null,
        "public_url_error": null,
        "expires_at": null
      },
      "storage_error": null
    }
  ],
  "usage": {
    "cost_in_usd_ticks": 400000000,
    "input_tokens": 32,
    "input_tokens_details": {
      "cached_tokens": 0,
      "image_tokens": 0,
      "text_tokens": 32
    },
    "output_tokens": 288,
    "output_tokens_details": {
      "image_tokens": 256,
      "reasoning_tokens": 16,
      "text_tokens": 16
    },
    "total_tokens": 320
  }
}
```

#### 响应字段详细说明

| 字段路径 | 类型 | 描述 |
| :--- | :--- | :--- |
| `data` | `array<object>` | 生成的图片对象列表，元素数量与请求的 `n` 对应。 |
| `data[].url` | `string` \| `null` | 临时图片访问 URL（当 `response_format` 为 `"url"` 或未指定时返回）。 |
| `data[].b64_json` | `string` \| `null` | Base64 编码的图片字符串（当 `response_format="b64_json"` 时返回）。 |
| `data[].mime_type` | `string` \| `null` | 生成图像的 MIME 类型（如 `image/jpeg`、`image/png`、`image/webp`）。 |
| `data[].file_output` | `object` \| `null` | 当请求配置了 `storage_options` 时返回的文件持久化元数据。 |
| `data[].file_output.file_id` | `string` | Files API 中的唯一文件 ID（可用于后续图片编辑或检索）。 |
| `data[].file_output.filename` | `string` | 持久化保存的文件名称。 |
| `data[].file_output.public_url` | `string` \| `null` | 免鉴权的公开分享 URL（当 `storage_options.public_url=true` 且创建成功时返回）。 |
| `data[].file_output.public_url_expires_at` | `integer` \| `null` | 公开 URL 的过期时间戳（Unix 秒数）。 |
| `data[].file_output.public_url_error` | `string` \| `null` | 公开 URL 创建失败时的错误提示（文件存储本身仍可能成功）。 |
| `data[].file_output.expires_at` | `integer` \| `null` | 文件本身在 Files API 中的自动删除时间戳（Unix 秒数）。 |
| `data[].storage_error` | `string` \| `null` | 存储到 Files API 失败时的错误信息。 |
| `usage.cost_in_usd_ticks` | `integer` | 消耗的 USD Ticks 计费总量（1 USD = $10^{10}$ ticks）。 |
| `usage.input_tokens` | `integer` | 输入 Token 总数（包含提示词 Token 及缓存 Token）。 |
| `usage.input_tokens_details` | `object` | 输入 Token 细分明细（`cached_tokens`, `image_tokens`, `text_tokens`）。 |
| `usage.output_tokens` | `integer` | 输出 Token 总数（包含提示词扩写重写 Token、思考推理 Token 及图像 Token）。 |
| `usage.output_tokens_details`| `object` | 输出 Token 细分明细（`image_tokens`, `reasoning_tokens`, `text_tokens`）。 |
| `usage.total_tokens` | `integer` | 总 Token 数量（`input_tokens + output_tokens`）。 |

---

### 2.3 图像生成代码示例

#### 示例 1：基础图像生成 (cURL)

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image-2.0",
    "prompt": "A collage of London landmarks in a stenciled street-art style",
    "aspect_ratio": "16:9",
    "resolution": "2k"
  }'
```

#### 示例 2：批量生成多张图片 (`n=4`) (Python Requests)

```python
import os
import requests

url = "https://api.x.ai/v1/images/generations"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['XAI_API_KEY']}"
}
payload = {
    "model": "grok-imagine-image-2.0",
    "prompt": "A futuristic cyberpunk city skyline with neon rain reflections",
    "n": 4,
    "aspect_ratio": "16:9",
    "resolution": "1k"
}

response = requests.post(url, headers=headers, json=payload)
result = response.json()

for i, img in enumerate(result.get("data", [])):
    print(f"Image {i + 1} URL: {img['url']}")
```

#### 示例 3：请求 Base64 数据并保存为本地文件 (Node.js / Fetch)

```javascript
import fs from "fs";

const response = await fetch("https://api.x.ai/v1/images/generations", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: "grok-imagine-image-2.0",
    prompt: "A serene Japanese zen garden with maple leaves in autumn",
    response_format: "b64_json",
    aspect_ratio: "1:1",
  }),
});

const json = await response.json();
const b64Data = json.data[0].b64_json;

// 解码并保存至本地文件
const buffer = Buffer.from(b64Data, "base64");
fs.writeFileSync("zen_garden.jpg", buffer);
console.log("Image saved successfully as zen_garden.jpg");
```

#### 示例 4：自动持久化至 Files API 并获取公开直链 (cURL)

```bash
curl -X POST https://api.x.ai/v1/images/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image-2.0",
    "prompt": "An astronaut exploring crystal caves on an alien planet",
    "aspect_ratio": "21:9",
    "resolution": "2k",
    "storage_options": {
      "filename": "alien_cave_astronaut.jpg",
      "expires_after": 604800,
      "public_url": true
    }
  }'
```

---

## 3. 图像编辑接口 (POST /v1/images/edits)

该端点用于对已有图片进行二次编辑、风格迁移、局部修改、要素增删，以及**结合多张参考图进行融合创作（最多 3 张参考图）**。

- **请求方式**：`POST`
- **请求路径**：`/v1/images/edits`
- **完整 URL**：`https://api.x.ai/v1/images/edits`
- **数据格式**：`Content-Type: application/json`

### 3.1 输入图像的三种指定方式

无论是单图编辑还是多图编辑，每个图像源对象均支持以下 3 种输入方式之一：

1. **公开图片 URL（Public HTTP/HTTPS URL）**：直接指向互联网公开可访问的 JPEG、PNG 或 WebP 图片。
2. **Base64 Data URI**：以 `data:image/jpeg;base64,...` 或 `data:image/png;base64,...` 开头的完整 Data URI。
3. **Files API 的 `file_id`**：通过 xAI Files API 提前上传（或此前生成保留）的文件 ID（形如 `file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a`），无需重复耗费带宽上传大文件。

---

### 3.2 单图编辑规范 (Single Image Editing)

单图编辑适用于针对一张源图片进行提示词驱动的修改（如：“将这幅照片转换为铅笔素描风格”、“在桌上添加一杯热咖啡”、“将白天改为满月夜景”）。

#### 3.2.1 单图编辑请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`prompt`** | `string` | **是** | - | 图像编辑的指令描述提示词，描述希望模型对原图做出的改变。 |
| **`image`** | `object` | **是\*** | - | 单图输入对象（与多图参数 `images` **严格互斥**）。包含 `url` 或 `file_id`。 |
| `image.url` | `string` | 条件必填 | - | 原图的公开 URL 或 Base64 Data URI。当未提供 `file_id` 时必填。也兼容 `image_url` 键名。 |
| `image.file_id` | `string` | 条件必填 | - | xAI Files API 中的文件 ID。与 `url` 互斥。 |
| `image.type` | `string` | 否 | `"image_url"` | 图像类型标识符，一般可传 `"image_url"`。 |
| **`model`** | `string` | 否 | `grok-imagine-image-2.0` | 图像编辑模型标识（推荐 `grok-imagine-image-2.0` 或 `grok-imagine-image-quality`）。 |
| **`n`** | `integer` | 否 | `1` | 单次编辑生成的变体数量（`1 ~ 10`）。 |
| **`aspect_ratio`** | `string` | 否 | *继承原图* | 输出画幅比例。默认跟随输入原图宽高比；亦可显式指定 `"1:1"`, `"16:9"` 等覆盖原图比例。 |
| **`resolution`** | `string` | 否 | `"1k"` | 输出分辨率，可选 `"1k"` 或 `"2k"`。 |
| **`response_format`** | `string` | 否 | `"url"` | 返回格式，`"url"` 或 `"b64_json"`。 |
| **`storage_options`** | `object` | 否 | `null` | 自动持久化至 Files API 配置（包含 `filename`, `expires_after`, `public_url`）。 |
| **`user`** | `string` | 否 | `null` | 终端用户标识。 |

> \***注意**：`image`（单图对象）与 `images`（多图数组）二者必须且仅能提供其中之一。

#### 3.2.2 单图编辑示例 (URL 输入方式)

```bash
curl -X POST https://api.x.ai/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image-2.0",
    "prompt": "Render this photograph as a detailed vintage watercolor painting with soft brush strokes",
    "image": {
      "url": "https://docs.x.ai/assets/api-examples/images/style-realistic.png",
      "type": "image_url"
    },
    "aspect_ratio": "16:9",
    "resolution": "2k"
  }'
```

#### 3.2.3 单图编辑示例 (Base64 Data URI 输入方式 - Python)

```python
import base64
import os
import requests

# 读取本地待编辑图片并转为 Base64 Data URI
with open("original_photo.png", "rb") as f:
    b64_data = base64.b64encode(f.read()).decode("utf-8")
image_data_uri = f"data:image/png;base64,{b64_data}"

url = "https://api.x.ai/v1/images/edits"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['XAI_API_KEY']}"
}
payload = {
    "model": "grok-imagine-image-2.0",
    "prompt": "Add realistic falling snow and warm glowing festive lights to the building windows",
    "image": {
        "url": image_data_uri
    },
    "response_format": "url"
}

response = requests.post(url, headers=headers, json=payload)
result = response.json()
print("Edited Image URL:", result["data"][0]["url"])
```

#### 3.2.4 单图编辑示例 (Files API `file_id` 输入方式)

```bash
curl -X POST https://api.x.ai/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image-quality",
    "prompt": "Add a stylish birthday party hat and sunglasses to the puppy",
    "image": {
      "file_id": "file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a"
    }
  }'
```

---

### 3.3 多图编辑与多参考融合规范 (Multi-Image Editing)

多图编辑支持在单次请求中**传入最多 3 张源图像**（作为元素、主体、风格、构图或背景的参考）。模型能够深度理解多张图片的语义，并将它们精准合成或迁移融合成一张全新画面。

#### 3.3.1 核心机制与规则

1. **数组传参 (`images`)**：使用 `images` 列表传入 2 ~ 3 张图片对象。`images` 与单图字段 `image` 互斥。
2. **混合源支持**：`images` 数组中的各个元素可以**自由混合使用**公网 URL、Base64 Data URI 或 `file_id`。
3. **提示词索引引用（Prompt Indexing）**：
   在 `prompt` 提示词中，可以通过 **`<IMAGE_0>`**、**`<IMAGE_1>`**、**`<IMAGE_2>`** 分别指代 `images` 数组中索引为 `0`、`1`、`2` 的源图片。例如：
   > *"Combine the person from `<IMAGE_0>` standing in the fantasy landscape of `<IMAGE_1>`, using the art style and lighting of `<IMAGE_2>`."*
4. **宽高比继承与覆盖**：
   - 默认情况下，输出图片的宽高比**自动跟随第一张输入图片（即 `<IMAGE_0>`）**。
   - 若需改变比例，可在请求中显式设置 `aspect_ratio`（如 `"16:9"`、`"1:1"` 等）进行强制覆盖。

#### 3.3.2 多图编辑请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`prompt`** | `string` | **是** | - | 多图融合与编辑提示词。推荐使用 `<IMAGE_0>`、`<IMAGE_1>`、`<IMAGE_2>` 指代具体输入图。 |
| **`images`** | `array<object>` | **是\*** | - | 输入图像对象列表（**最多 3 张图**，长度范围：`2 ~ 3`）。与 `image` 互斥。 |
| `images[].url` | `string` | 条件必填 | - | 该张图片的公开 URL 或 Base64 Data URI。若未提供 `file_id` 则必填。 |
| `images[].file_id` | `string` | 条件必填 | - | Files API 中的文件 ID。与 `url` 互斥。 |
| **`model`** | `string` | 否 | `grok-imagine-image-2.0` | 模型标识（推荐 `grok-imagine-image-2.0`）。 |
| **`n`** | `integer` | 否 | `1` | 生成变体数量（`1 ~ 10`）。 |
| **`aspect_ratio`** | `string` | 否 | *继承 `<IMAGE_0>`* | 画幅比例。默认继承第一张图，支持指定枚举覆盖。 |
| **`resolution`** | `string` | 否 | `"1k"` | 分辨率，`"1k"` 或 `"2k"`。 |
| **`response_format`** | `string` | 否 | `"url"` | 返回格式，`"url"` 或 `"b64_json"`。 |
| **`storage_options`** | `object` | 否 | `null` | 自动持久化存储配置。 |

#### 3.3.3 多图编辑示例 1：双图场景与人物合成 (cURL)

将 `<IMAGE_0>` 中的主体人物放置到 `<IMAGE_1>` 的赛博朋克街道背景中：

```bash
curl -X POST https://api.x.ai/v1/images/edits \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -d '{
    "model": "grok-imagine-image-2.0",
    "prompt": "Place the character from <IMAGE_0> seamlessly standing in the center of the rainy neon city background of <IMAGE_1>, matching the neon reflections and ambient atmospheric lighting",
    "images": [
      {
        "url": "https://example.com/character-portrait.png"
      },
      {
        "url": "https://example.com/cyberpunk-street.jpg"
      }
    ],
    "aspect_ratio": "16:9",
    "resolution": "2k"
  }'
```

#### 3.3.4 多图编辑示例 2：三图混合（URL + Base64 + Files API 混合输入 - Python）

```python
import base64
import os
import requests

# 读取本地参考图作为 Base64
with open("art_style_reference.jpg", "rb") as f:
    style_b64 = base64.b64encode(f.read()).decode("utf-8")
style_data_uri = f"data:image/jpeg;base64,{style_b64}"

url = "https://api.x.ai/v1/images/edits"
headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['XAI_API_KEY']}"
}

payload = {
    "model": "grok-imagine-image-2.0",
    "prompt": (
        "Create a harmonious composition where the cat in <IMAGE_0> wears the outfit "
        "shown in <IMAGE_1>, illustrated in the delicate oil painting style and color palette of <IMAGE_2>."
    ),
    "images": [
        # <IMAGE_0>: 公开网络 URL
        {"url": "https://images.example.com/cute-cat.png"},
        # <IMAGE_1>: xAI Files API 中预先上传的文件 ID
        {"file_id": "file_2cd998e7-bf12-44aa-92c8-e3d1f1c1234f"},
        # <IMAGE_2>: 本地 Base64 Data URI
        {"url": style_data_uri}
    ],
    "aspect_ratio": "4:3",
    "resolution": "2k",
    "storage_options": {
        "filename": "cat_dressed_oil_painting.jpg",
        "public_url": True
    }
}

response = requests.post(url, headers=headers, json=payload)
data = response.json()

print("Generated URL:", data["data"][0]["url"])
if data["data"][0].get("file_output"):
    print("Public Permanent URL:", data["data"][0]["file_output"]["public_url"])
```

#### 3.3.5 多图编辑示例 3：双图风格融合 (JavaScript / Fetch)

```javascript
const response = await fetch("https://api.x.ai/v1/images/edits", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${process.env.XAI_API_KEY}`,
  },
  body: JSON.stringify({
    model: "grok-imagine-image-2.0",
    prompt: "Redraw the architectural structure of <IMAGE_0> with the vibrant ukiyo-e woodblock print style and sea wave patterns of <IMAGE_1>",
    images: [
      { url: "https://docs.x.ai/assets/api-examples/images/building.png" },
      { url: "https://docs.x.ai/assets/api-examples/images/great-wave.png" }
    ],
    aspect_ratio: "16:9",
    resolution: "2k"
  }),
});

const result = await response.json();
console.log("Blended Image URL:", result.data[0].url);
```

---

## 4. 高级工作流与技巧 (Advanced Workflows)

### 4.1 多轮迭代式编辑（Multi-Turn Iterative Editing）

通过将前一次编辑输出的图片（URL、Base64 或持久化 `file_id`）作为下一次编辑请求的输入，可以构建多轮渐进式精修流程：

```
[初始提示词] 
     │
     ▼
生成基础图片 A (POST /v1/images/generations)
     │
     ▼ (输入图片 A + 提示词 "添加一条清澈见底的河流")
编辑生成图片 B (POST /v1/images/edits)
     │
     ▼ (输入图片 B + 提示词 "将时间调整为落日余晖，加入晚霞倒影")
编辑生成图片 C (POST /v1/images/edits)
```

```python
import os
import requests

headers = {
    "Content-Type": "application/json",
    "Authorization": f"Bearer {os.environ['XAI_API_KEY']}"
}

# 第 1 步：生成基础底图
res1 = requests.post(
    "https://api.x.ai/v1/images/generations",
    headers=headers,
    json={
        "model": "grok-imagine-image-2.0",
        "prompt": "A modern minimalist house on a green hill",
        "aspect_ratio": "16:9"
    }
).json()
step1_url = res1["data"][0]["url"]

# 第 2 步：第一轮编辑（增添元素）
res2 = requests.post(
    "https://api.x.ai/v1/images/edits",
    headers=headers,
    json={
        "model": "grok-imagine-image-2.0",
        "prompt": "Add a sleek infinity swimming pool in front of the house",
        "image": {"url": step1_url}
    }
).json()
step2_url = res2["data"][0]["url"]

# 第 3 步：第二轮编辑（氛围与光影改造）
res3 = requests.post(
    "https://api.x.ai/v1/images/edits",
    headers=headers,
    json={
        "model": "grok-imagine-image-2.0",
        "prompt": "Change the time to twilight with warm interior lighting and stars in the sky",
        "image": {"url": step2_url},
        "resolution": "2k"
    }
).json()
print("Final Refined Image URL:", res3["data"][0]["url"])
```

### 4.2 风格迁移与艺术化重绘（Style Transfer）

`grok-imagine-image-2.0` 对艺术风格具有极强的感知和重建能力。在单图编辑中，无需复杂的控制网（ControlNet），仅需通过自然语言描述即可实现高精度风格转换：

- **超写实人像摄影**：`"Transform this into a 35mm film photograph with natural skin textures, bokeh background, and golden hour sunlight"`
- **日系动漫风**：`"Convert this into Makoto Shinkai anime style with vivid blue skies, radiant clouds, and lush lighting"`
- **古典油画**：`"Repaint this as an 18th-century Baroque oil painting with dramatic chiaroscuro lighting and rich brushstroke textures"`
- **极简矢量插画**：`"Simplify this into a modern flat vector illustration with clean lines and pastel color palette"`

---

## 5. xAI Files API 集成规范

对于频繁进行图片编辑、多图融合或需要长期托管生成资产的应用，强烈建议结合 xAI Files API 使用。

### 5.1 上传本地文件到 Files API (POST /v1/files)

```bash
curl -X POST https://api.x.ai/v1/files \
  -H "Authorization: Bearer $XAI_API_KEY" \
  -F "purpose=assistants" \
  -F "file=@/path/to/my_image.png"
```

**响应示例：**

```json
{
  "id": "file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a",
  "object": "file",
  "bytes": 2451920,
  "created_at": 1716000000,
  "filename": "my_image.png",
  "purpose": "assistants",
  "expires_at": null
}
```

获取到 `id`（如 `file_7de029f4...`）后，即可在 `/v1/images/edits` 请求中作为 `{"file_id": "file_7de029f4..."}` 引用，极大降低网络传输体积并提升响应速度。

### 5.2 自动存储与创建公开分享链接 (`storage_options`)

在调用 `/v1/images/generations` 或 `/v1/images/edits` 时设置 `storage_options`：

```json
{
  "storage_options": {
    "filename": "generated_art.jpg",
    "expires_after": 2592000,
    "public_url": true
  }
}
```

- **`expires_after`**：支持设置生存时间 TTL（单位秒，最长 30 天 / 2,592,000 秒）。到期后平台自动安全清理文件。
- **`public_url`**：设为 `true` 后服务端会生成形如 `https://files.x.ai/public/...` 的公开直链，外部用户可免登录免鉴权直接访问。

---

## 6. 对话内智能生图与编辑工具 (Responses API: `image_generation` Tool)

除了直接调用独立的 `/v1/images/generations` 和 `/v1/images/edits` 端点，xAI 还支持在智能体对话流（`/v1/responses`）中将生图作为 Agent Tool 挂载，由大模型（如 `grok-4.6`）自主决定何时生图、何时编辑图片，并在多轮对话中自动链式调用。

### 6.1 工具配置与 `action` 控制

在 `/v1/responses` 请求的 `tools` 列表中添加 `{"type": "image_generation"}`：

```json
{
  "model": "grok-4.6",
  "input": "先帮我检索 2024 年法网男单冠军是谁，然后为他绘制一张复古胜利海报。",
  "tools": [
    { "type": "web_search" },
    { 
      "type": "image_generation",
      "action": "auto"
    }
  ]
}
```

#### `action` 参数枚举

| 取值 | 行为说明 |
| :--- | :--- |
| `"auto"` | **默认值**。模型可根据对话上下文自主决定执行文生图或对已有图片进行编辑。 |
| `"generate"` | 仅允许执行文生图，禁止修改对话历史中的已有图片。 |
| `"edit"` | 仅允许执行图片编辑（针对用户上传的图片或前轮生成的图片）。 |

### 6.2 对话生图输出结构 (`image_generation_call`)

在 Responses API 的响应输出中，生成的图片以 `image_generation_call` 对象返回：

```json
{
  "type": "image_generation_call",
  "id": "ig_d817cfd0-4f39-9cb3-bda2-44e538841ef2_call-a1b4dd05",
  "status": "completed",
  "prompt": "A triumphant retro vintage travel-poster style artwork of Carlos Alcaraz holding the Roland Garros trophy",
  "result": "/9j/4AAQSkZJRgABAQAAAQABAAD..."
}
```

- **ID 前缀约定**：新生成的图片 ID 以 **`ig_`** 开头；编辑生成的图片 ID 以 **`ie_`** 开头。
- **`prompt` 字段**：记录了 Grok 思考后为图像大模型编写的优化扩写提示词。
- **`result` 字段**：包含 Base64 编码的纯图片数据（无前缀），可直接进行 Base64 解码。

---

## 7. 参数速查表与技术规格

### 7.1 画幅比例枚举表 (`aspect_ratio`)

| 比例值 | 比例类型 | 典型应用场景与设备 |
| :--- | :--- | :--- |
| `"1:1"` | 方形画幅 | Instagram 帖子、头像、商品缩略图、图标 |
| `"16:9"` | 宽屏横幅 | 电脑壁纸、YouTube 封面、幻灯片展示、视频首帧 |
| `"9:16"` | 竖屏全屏 | 抖音/TikTok、小红书、Instagram Stories、手机竖屏壁纸 |
| `"4:3"` | 经典画幅 | 平板电脑、传统摄影、复古海报 |
| `"3:4"` | 纵向肖像 | 人像摄影、杂志封面、印刷排版 |
| `"3:2"` | 经典 35mm 相机画幅 | 单反摄影、艺术风光摄影 |
| `"2:3"` | 竖向 35mm 摄影 | 全身人像、立式海报 |
| `"2:1"` | 超宽横幅 | 网站 Header Banner、全景画作 |
| `"1:2"` | 细长竖屏 | 移动端落地页长图、立柱广告 |
| `"19.5:9"` / `"9:19.5"` | 现代手机比例 | iPhone 及主流全面屏手机锁屏与壁纸 |
| `"20:9"` / `"9:20"` | 超长手机屏幕比例 | 安卓超长全面屏手机显示 |
| `"auto"` | 智能自适应 | 由模型自动分析提示词意图并选择最契合的画面比例 |

### 7.2 输出分辨率枚举表 (`resolution`)

| 分辨率标识 | 像素量级 | 特性与适用场景 |
| :--- | :--- | :--- |
| `"1k"` | 约 1024 级像素基准 | 生成速度极快，适合交互式预览、网页缩略展示及大批量快速生成 |
| `"2k"` | 约 2048 级超清像素基准 | 细节锐利，纹理清晰，适合印刷、高清壁纸、精细人像与艺术品输出 |

---

## 8. HTTP 状态码与错误处理

| HTTP 状态码 | 错误原因 (Error Reason) | 排查与解决建议 |
| :---: | :--- | :--- |
| **`400 Bad Request`** | 参数格式错误或字段冲突 | • 检查 JSON 语法是否合法<br>• 检查 `image` 与 `images` 是否同时传入（二者互斥）<br>• 检查 `images` 数组长度是否超过 3 张限制<br>• 检查 Base64 Data URI 或 URL 格式是否有效 |
| **`401 Unauthorized`** | API Key 缺失或无效 | 检查 HTTP 请求头是否正确携带 `Authorization: Bearer <XAI_API_KEY>` |
| **`403 Forbidden`** | 权限受限或账户额度不足 | 登录 xAI 控制台检查账户余额、账单配置与组织权限 |
| **`404 Not Found`** | 引用的资源不存在 | 检查 `file_id` 是否拼写错误，或该文件是否已过期自动删除 |
| **`422 Unprocessable Entity`** | 内容安全与审核策略拦截 | 提示词或输入图片触发了安全审核过滤器，请调整提示词或输入内容 |
| **`429 Too Many Requests`** | 触发速率限制（Rate Limit） | 降低并发调用频率，引入指数退避（Exponential Backoff）重试策略 |
| **`500 / 503 Internal Error`** | 服务端临时计算异常 | 稍后重试；若持续发生请检查 xAI 状态页（Status Page） |

---

## 9. 总结与快速调用模版

### 9.1 文生图最简模版

```http
POST https://api.x.ai/v1/images/generations
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "grok-imagine-image-2.0",
  "prompt": "Your descriptive prompt here",
  "aspect_ratio": "16:9",
  "resolution": "2k"
}
```

### 9.2 单图编辑最简模版

```http
POST https://api.x.ai/v1/images/edits
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "grok-imagine-image-2.0",
  "prompt": "Your modification instructions here",
  "image": {
    "url": "https://example.com/source_image.jpg"
  },
  "aspect_ratio": "16:9",
  "resolution": "2k"
}
```

### 9.3 多图编辑最简模版 (最多 3 张)

```http
POST https://api.x.ai/v1/images/edits
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "model": "grok-imagine-image-2.0",
  "prompt": "Combine elements from <IMAGE_0> and <IMAGE_1> with style from <IMAGE_2>",
  "images": [
    { "url": "https://example.com/subject.png" },
    { "url": "https://example.com/background.jpg" },
    { "file_id": "file_7de029f4-eb66-42ee-87f8-b2a9d9e7466a" }
  ],
  "aspect_ratio": "16:9",
  "resolution": "2k"
}
```
