# OpenAI 图像生成与编辑 REST API 规范文档

本文档基于 OpenAI 官方开发者文档及 API 规范整理，系统规范了 OpenAI 全系列图像大模型（包括 **`gpt-image-2.5-sunburst`**、**`gpt-image-2.5-flare`**、`gpt-image-2`、`gpt-image-1.5`、`gpt-image-1`、`gpt-image-1-mini` 以及经典模型 `dall-e-3`、`dall-e-2`）的 REST API 接口定义、请求参数、响应数据结构、图像编辑与多图融合参考、局部遮罩重绘（Inpainting）、流式渐进式出图（Streaming）、对话式视觉工作流（Responses API Image Tool）以及生产环境异常处理标准。

## 2026-10-21 项目参数对齐

官方来源：[生成指南](https://developers.openai.com/api/docs/guides/image-generation)、[生成参数](https://developers.openai.com/api/reference/resources/images/methods/generate)、[编辑参数](https://developers.openai.com/api/reference/resources/images/methods/edit)、[Responses 图像工具](https://developers.openai.com/api/docs/guides/tools-image-generation)。

- 默认图像模型为 `gpt-image-2.5-sunburst`。2.5 的 Sunburst、Flare 及日期快照支持 `auto / low / medium / high / xhigh / max`；此前模型最高为 `high`。
- Images 和 Responses 共用质量、尺寸、格式、压缩、背景约束。Responses 的 `options.imageModel` 映射到 `tools[].model`，与顶层对话模型 `modelId` 分开配置。
- `safetyIdentifier` 可选、最多 128 字符，建议传用户标识哈希值；Images 映射为 `safety_identifier`，Responses 放在顶层请求。
- GPT Image 固定返回 Base64，请求不发送 `response_format`。仅 JPEG / WebP 发送 `output_compression`。选择透明背景会将 JPEG 改为 PNG；Image 2 透明背景属于官方预览能力。
- `inputFidelity: auto` 是项目“省略参数”的标记，并非官方枚举。Image 1 / 1.5 可选 `low / high`，1 Mini 仅 `low`；Image 2 和其他未明确支持调节的模型不提供手动保真度。
- 编辑沿用非流式 multipart，透传 `moderation`，省略渐进预览参数；文生图和 Responses 继续流式预览。
- DALL·E 已退役；本文相关段落保留作历史参考，项目不提供这些旧模型的参数。

### 九种比例的快捷尺寸

1K / 2K / 4K 为项目档位，目标长边为 1024 / 2048 / 3840。为保持精确比例、16 像素倍数及 655,360–8,294,400 总像素，尺寸会按限制调整，界面始终展示实际像素。超过 2560×1440 总像素为实验性分辨率。早期模型仅显示标准尺寸。

| 比例 | 1K 档 | 2K 档 | 4K 档 |
| --- | --- | --- | --- |
| 1:1 | `1024x1024` | `2048x2048` | `2880x2880` |
| 16:9 | `1280x720` | `2048x1152` | `3840x2160` |
| 9:16 | `720x1280` | `1152x2048` | `2160x3840` |
| 4:3 | `1024x768` | `2048x1536` | `3264x2448` |
| 3:4 | `768x1024` | `1536x2048` | `2448x3264` |
| 3:2 | `1008x672` | `2064x1376` | `3504x2336` |
| 2:3 | `672x1008` | `1376x2064` | `2336x3504` |
| 21:9 | `1344x576` | `2016x864` | `3808x1632` |
| 9:21 | `576x1344` | `864x2016` | `1632x3808` |

---

## 1. 基础信息与通用约定

### 1.1 服务接入点（Base URL）

OpenAI REST API 全局统一接入根地址：

```http
https://api.openai.com/v1
```

### 1.2 认证鉴权（Authentication）

所有 API 请求均须在 HTTP 请求头（Headers）中携带 Bearer 格式的 API Key 进行身份认证：

```http
Authorization: Bearer $OPENAI_API_KEY
# /images/generations 与 /responses 使用 application/json
# /images/edits 使用 multipart/form-data，并由客户端自动生成 boundary
```

> 📌 **组织验证说明（Organization Verification）**：
>
> 为确保模型安全合规使用，首次使用 `gpt-image-2`、`gpt-image-1.5` 等 GPT Image 系列模型前，需确保开发者组织已在 OpenAI Developer Console 完成 [API 组织认证（API Organization Verification）](https://platform.openai.com/settings/organization/general)。

### 1.3 核心支持模型一览

| 模型标识 (Model ID) | 核心定位与能力说明 | 支持功能 | 最大提示词长度 | 默认返回格式 |
| :--- | :--- | :--- | :---: | :---: |
| **`gpt-image-2`** | **GPT Image 2 图像模型**。具备顶尖的真实感画质渲染、复杂文字排版与拼写能力、精准构图指令遵循、高保真多图参考编辑与任意自定义分辨率（最高 4K）。 | 文生图、多图融合编辑（最多16张）、遮罩重绘、流式渐进式出图、画质分级 | 32,000 字符 | Base64 (`b64_json`) |
| **`gpt-image-1.5`** | 高性能平衡模型。生成速度更快、成本更低，支持单图/多图参考编辑与透明背景。 | 文生图、图像编辑、透明背景、流式出图 | 32,000 字符 | Base64 (`b64_json`) |
| **`gpt-image-1`** | 第一代 GPT 图像模型。具备出色的文本遵循与编辑保真度。 | 文生图、图像编辑、遮罩重绘 | 32,000 字符 | Base64 (`b64_json`) |
| **`gpt-image-1-mini`** | 轻量极速模型。主打极低延迟与超高性价比，适合快速预览与草图生成。 | 快速文生图、轻量编辑 | 32,000 字符 | Base64 (`b64_json`) |
| **`dall-e-3`** | 经典高质量文生图模型。支持提示词自动重写扩展（`revised_prompt`）与鲜明/自然风格控制。 | 纯文生图（不支持编辑） | 4,000 字符 | URL 或 Base64 |
| **`dall-e-2`** | 经典轻量模型。仅支持固定尺寸生成、单图遮罩编辑与变体生成（Variations）。 | 文生图、单图编辑、图像变体 | 1,000 字符 | URL 或 Base64 |

---

### 1.4 API 架构选型指南：Image API vs. Responses API

OpenAI 提供了两种接入图像能力的方式：

```
                    ┌────────────────────────────────────────────────────────┐
                    │               选择适合的图像接口架构                    │
                    └────────────────────────────────────────────────────────┘
                                                │
                 ┌──────────────────────────────┴──────────────────────────────┐
                 ▼                                                             ▼
    【Image API (标准 REST 接口)】                                 【Responses API (对话式智能体)】
    • POST /v1/images/generations                                 • POST /v1/responses (tools: image_generation)
    • POST /v1/images/edits                                       • 适合场景：多轮会话、上下文连贯修改、
    • 适合场景：单次独立出图、批量生成、后台管线集成                 智能自动重写提示词、Agent 工作流
    • 直接指定 GPT Image 模型 ID                                  • 指定主体大模型 (如 gpt-5.6)，由工具调度图像模型
    • 计费：仅计图像 Token/固定费率                                 • 计费：包含主体模型对话 Token + 图像 Token
```

---

### 1.5 计费机制与 Token 消耗模型

#### 1.5.1 `gpt-image-2` 计费与费用参考

`gpt-image-2` 采用按画质等级与生成像素结合的输出 Token 计费模式：

| 画质等级 (Quality) | 方形 (1024 × 1024) | 纵向肖像 (1024 × 1536) | 横向宽屏 (1536 × 1024) | 适用场景说明 |
| :--- | :---: | :---: | :---: | :--- |
| **`low`** | **$0.006** | **$0.005** | **$0.005** | 极速草图预览、缩略图、多轮快速迭代 |
| **`medium`** | **$0.053** | **$0.041** | **$0.041** | 标准商用质量、社交媒体内容发布（推荐默认） |
| **`high`** | **$0.211** | **$0.165** | **$0.165** | 印刷品、影视级海报、精细细节展示 |

> 💡 **成本计算公式**：
>
> $$\text{单次请求总费用} = \text{输入文本 Token} + \text{输入图像 Token (编辑场景)} + \text{图像输出 Token} + (\text{流式中间图数量} \times 100\ \text{Tokens})$$

#### 1.5.2 GPT Image 早期模型输出 Token 基准表

| 画质等级 | 方形 (1024 × 1024) | 纵向肖像 (1024 × 1536) | 横向宽屏 (1536 × 1024) |
| :--- | :---: | :---: | :---: |
| **`low`** | 272 tokens | 408 tokens | 400 tokens |
| **`medium`** | 1,056 tokens | 1,584 tokens | 1,568 tokens |
| **`high`** | 4,160 tokens | 6,240 tokens | 6,208 tokens |

---

## 2. 图像生成接口 (POST /v1/images/generations)

该端点用于根据文本描述（Prompt）从零生成全新的高质量图像。支持高并发批量生成、任意分辨率设定、流式渐进式出图与画质压缩。

- **请求方法**：`POST`
- **请求路径**：`/v1/images/generations`
- **完整 URL**：`https://api.openai.com/v1/images/generations`
- **数据格式**：`Content-Type: application/json`

### 2.1 请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 详细说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`prompt`** | `string` | **是** | - | 图像生成的描述性文本。GPT 系列模型上限 **32,000** 字符，`dall-e-3` 上限 4,000 字符，`dall-e-2` 上限 1,000 字符。 |
| **`model`** | `string` | 否 | `gpt-image-2.5-sunburst` | 调用的模型标识：`gpt-image-2.5-sunburst`、`gpt-image-2.5-flare`、`gpt-image-2`、`gpt-image-1.5`、`gpt-image-1`、`gpt-image-1-mini`、`dall-e-3`、`dall-e-2`。 |
| **`n`** | `integer` | 否 | `1` | 单次请求生成的图片张数。取值范围：`1 ~ 10`。注：`dall-e-3` 仅支持 `n=1`。 |
| **`size`** | `string` | 否 | `"auto"` | 图像分辨率与尺寸：<br>• **Image 2 / 2.5**：支持任意 `WIDTHxHEIGHT`（如 `"1536x864"`、`"2048x1152"`、`"3840x2160"`），宽高需均为 16 的倍数，宽高比介于 1:3 与 3:1 之间，总像素 655,360 ~ 8,294,400。<br>• **标准枚举**：`"1024x1024"`、`"1536x1024"`、`"1024x1536"`、`"auto"`。<br>• **`dall-e-3`**：`"1024x1024"`、`"1792x1024"`、`"1024x1792"`。<br>• **`dall-e-2`**：`"256x256"`、`"512x512"`、`"1024x1024"`。 |
| **`quality`** | `string` | 否 | `"auto"` | 渲染画质等级：<br>• **GPT Image 2.5**：另支持 `"xhigh"`、`"max"`。<br>• **GPT 基础选项**：`"low"`（草图极速）、`"medium"`（标准）、`"high"`（超清精细）、`"auto"`。<br>• **`dall-e-3`**：`"standard"`、`"hd"`。<br>• **`dall-e-2`**：仅支持 `"standard"`。 |
| **`background`** | `string` | 否 | `"auto"` | 背景透明度控制（仅 GPT Image 模型支持）：<br>• `"auto"`：模型自动判断最适背景<br>• `"opaque"`：实体不透明背景<br>• `"transparent"`：透明背景（输出格式须为 `png` 或 `webp`；注：`gpt-image-2` 透明背景属于预览能力） |
| **`output_format`** | `string` | 否 | `"png"` | 输出文件格式（仅 GPT Image 模型支持）：`"png"`、`"jpeg"`、`"webp"`。**`jpeg` 格式具有更低的编码延迟与更小的网络传输体积**。 |
| **`output_compression`** | `integer` | 否 | `100` | 输出图片压缩等级（0 ~ 100%）。仅在 `output_format` 为 `jpeg` 或 `webp` 时生效。 |
| **`response_format`** | `string` | 否 | `"url"` | 数据返回格式：`"b64_json"` 或 `"url"`。<br>⚠️ **注意**：此参数已弃用且不支持 GPT Image；GPT Image 固定返回 Base64 (`b64_json`)；`"url"` 仅适用于 `dall-e-2` 和 `dall-e-3`（生成的 URL 有效期为 60 分钟）。 |
| **`stream`** | `boolean` | 否 | `false` | 是否开启 Server-Sent Events (SSE) 流式传输。仅 GPT Image 模型支持。 |
| **`partial_images`** | `integer` | 否 | `0` | 流式传输过程中返回的部分中间草图数量（取值范围：`0 ~ 3`）。设置为 0 时仅在最终完成时返回单张图片。每产生一张中间图会额外增加 100 输出 tokens。 |
| **`moderation`** | `string` | 否 | `"auto"` | 内容审查严格度过滤级别（仅 GPT Image 模型支持）：<br>• `"auto"`：标准合规过滤（默认）<br>• `"low"`：低限制宽松过滤 |
| **`style`** | `string` | 否 | `"vivid"` | 生成画面艺术风格。**仅 `dall-e-3` 支持**：<br>• `"vivid"`：生动、超现实、戏剧化光影<br>• `"natural"`：写实、自然自然光照风格 |
| **`safety_identifier`** | `string` | 否 | `null` | 最多 128 字符，建议使用哈希，替代已弃用的 `user`。终端用户的唯一标识符字符串，协助 OpenAI 进行滥用与安全监控。 |

---

### 2.2 响应数据结构（Response Body - 标准非流式）

```json
{
  "created": 1740000000,
  "background": "opaque",
  "data": [
    {
      "b64_json": "iVBORw0KGgoAAAANSUhEUgAA...",
      "revised_prompt": null,
      "url": null
    }
  ],
  "output_format": "png",
  "quality": "high",
  "size": "1024x1024",
  "usage": {
    "input_tokens": 36,
    "input_tokens_details": {
      "image_tokens": 0,
      "text_tokens": 36
    },
    "output_tokens": 4160,
    "output_tokens_details": {
      "image_tokens": 4160,
      "text_tokens": 0
    },
    "total_tokens": 4196
  }
}
```

#### 响应字段说明

| 字段路径 | 类型 | 描述 |
| :--- | :--- | :--- |
| `created` | `integer` | 图像生成完成的 Unix 时间戳（秒）。 |
| `background` | `string` \| `null` | 实际采用的背景设置（`"transparent"` 或 `"opaque"`）。 |
| `data` | `array<object>` | 生成的图像数据对象列表，元素数量与请求中的 `n` 一致。 |
| `data[].b64_json` | `string` \| `null` | Base64 编码的纯图像二进制数据字符串（GPT 模型默认返回）。 |
| `data[].revised_prompt` | `string` \| `null` | 模型实际扩写/重写后的优化提示词（主要在 `dall-e-3` 或 Responses API 中返回）。 |
| `data[].url` | `string` \| `null` | 临时访问下载链接（仅 `dall-e-2` / `dall-e-3` 配置 `response_format="url"` 时返回，60分钟有效）。 |
| `output_format` | `string` | 最终输出图像的格式（`"png"`、`"jpeg"`、`"webp"`）。 |
| `quality` | `string` | 最终采用的画质等级（`"low"`、`"medium"`、`"high"`）。 |
| `size` | `string` | 最终输出图像的分辨率（如 `"1024x1024"`、`"1536x1024"`）。 |
| `usage` | `object` | 本次请求的 Token 消耗明细统计。 |
| `usage.input_tokens` | `integer` | 输入 Token 总数（包含提示词与参考图片）。 |
| `usage.input_tokens_details` | `object` | 输入细分（`text_tokens`、`image_tokens`）。 |
| `usage.output_tokens` | `integer` | 图像生成渲染所消耗的输出 Token 总数。 |
| `usage.total_tokens` | `integer` | 本次请求累计消耗的总 Token 数。 |

---

### 2.3 流式事件结构（Server-Sent Events）

当请求参数中携带 `stream: true` 时，服务端将以 SSE 协议持续推送进度与图像数据：

```http
event: image_generation.partial_image
data: {"type":"image_generation.partial_image","b64_json":"/9j/4AAQSkZJRg...","partial_image_index":0,"created_at":1740000001,"size":"1024x1024","quality":"medium","background":"opaque","output_format":"png"}

event: image_generation.partial_image
data: {"type":"image_generation.partial_image","b64_json":"/9j/4AAQSkZJRg...","partial_image_index":1,"created_at":1740000003,"size":"1024x1024","quality":"medium","background":"opaque","output_format":"png"}

event: image_generation.completed
data: {"type":"image_generation.completed","b64_json":"iVBORw0KGgoAAA...","created_at":1740000005,"size":"1024x1024","quality":"medium","background":"opaque","output_format":"png","usage":{"total_tokens":1256,"input_tokens":36,"output_tokens":1220,"input_tokens_details":{"text_tokens":36,"image_tokens":0},"output_tokens_details":{"image_tokens":1220,"text_tokens":0}}}
```

Images Edit 使用独立事件名，客户端必须同时支持，不能把所有图片流都按 `image_generation.*` 解析：

```http
event: image_edit.partial_image
data: {"type":"image_edit.partial_image","partial_image_index":0,"b64_json":"..."}

event: image_edit.completed
data: {"type":"image_edit.completed","b64_json":"...","usage":{"total_tokens":1256}}
```

预览与最终图由 `type` 明确区分；Partial 不得写入历史或成为下一轮编辑基图。

---

### 2.4 图像生成实战代码示例

#### 示例 1：基础文生图并保存为本地文件 (cURL)

```bash
curl -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A cinematic shot of an astronaut riding a crystal horse across a neon dunes landscape on Mars, 8k, hyperrealistic, octane render",
    "size": "1536x1024",
    "quality": "high",
    "output_format": "png"
  }' | jq -r '.data[0].b64_json' | base64 --decode > mars_astronaut.png
```

#### 示例 2：使用 Python 请求高画质 2K 宽屏图 (Python Requests)

```python
import base64
import os
import requests

api_key = os.environ.get("OPENAI_API_KEY")

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

payload = {
    "model": "gpt-image-2",
    "prompt": "An intricate cybernetic owl perched on a glowing branch of a digital bonsai tree, volumetric lighting, mist, cyberpunk aesthetic",
    "size": "2048x1152",  # 2K 宽屏比例 (16:9)
    "quality": "high",
    "output_format": "jpeg",
    "output_compression": 90,
}

response = requests.post(
    "https://api.openai.com/v1/images/generations",
    headers=headers,
    json=payload,
    timeout=120,
)
response.raise_for_status()
result = response.json()

# 解码 Base64 并保存本地
b64_data = result["data"][0]["b64_json"]
image_bytes = base64.b64decode(b64_data)

with open("cyber_owl.jpg", "wb") as f:
    f.write(image_bytes)

print(f"图像生成成功！消耗 Token 总数: {result['usage']['total_tokens']}")
```

#### 示例 3：Node.js / TypeScript 流式接收渐进式出图

```typescript
import * as fs from "fs";

async function streamImageGeneration() {
  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-2",
      prompt: "A magical waterfall cascading with luminous liquid gold into a crystal lake at sunset",
      size: "1024x1024",
      stream: true,
      partial_images: 2,
    }),
  });

  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith("data: ")) {
        const jsonStr = line.replace(/^data: /, "");
        try {
          const eventData = JSON.parse(jsonStr);
          if (eventData.type === "image_generation.partial_image") {
            const idx = eventData.partial_image_index;
            console.log(`收到流式中间图 [${idx}]...`);
            fs.writeFileSync(`waterfall_partial_${idx}.png`, Buffer.from(eventData.b64_json, "base64"));
          } else if (eventData.type === "image_generation.completed") {
            console.log("最终高清图生成完成！消耗 Token:", eventData.usage.total_tokens);
            fs.writeFileSync("waterfall_final.png", Buffer.from(eventData.b64_json, "base64"));
          }
        } catch {
          // 忽略非完整 JSON 片段
        }
      }
    }
  }
}

streamImageGeneration();
```

---

## 3. 图像编辑与参考图融合接口 (POST /v1/images/edits)

OpenAI 图像编辑端点支持三大核心能力：
1. **多图参考融合与重绘（Multi-Image Reference Editing）**：传入 1 ~ 16 张源图片，模型理解各图中的主体、光影、纹理与风格，并根据提示词生成全新场景。
2. **单图指令编辑（Single Image Instruction Edit）**：在保留原图特征的基础上增加、移除或修改元素。
3. **精准遮罩重绘（Mask Inpainting）**：配合带有 Alpha 透明通道的遮罩图（Mask），对指定区域进行局部替换或补全。

- **请求方法**：`POST`
- **请求路径**：`/v1/images/edits`
- **完整 URL**：`https://api.openai.com/v1/images/edits`
- **数据格式**：`Content-Type: multipart/form-data`
- **图片字段**：单图使用 `image`，多图使用重复的 `image[]` 文件字段；遮罩使用 `mask` 文件字段。

> 当前 OpenAI 官方 SDK 会把 `image`、图片数组和 `mask` 提取为 multipart 文件。不要把 Images Edit 与 Responses API 的 `input_image.image_url` 混淆，也不要向 `/v1/images/edits` 发送 JSON `images: [{image_url: ...}]`。
>
> **霜华绘梦兼容策略**：虽然官方协议定义了编辑流事件，但实测部分 OpenAI 兼容网关会返回空 SSE，或把完整 JSON 错误标记为 `text/event-stream`。项目对 `/v1/images/edits` 默认使用非流式 multipart，并将完整结果转换为本站统一 SSE 完成事件；不会在流失败后自动重试计费请求。

---

### 3.1 请求参数（Request Body）

| 参数名称 | 类型 | 必填 | 默认值 | 取值范围 / 说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`prompt`** | `string` | **是** | - | 描述编辑要求的指导性文本提示词。GPT 模型上限 32,000 字符。 |
| **`image` / `image[]`** | `file` / `array<file>` | **是** | - | 输入图像文件。GPT Image 模型最多支持 **16 张** PNG、JPEG 或 WebP，每张小于 50MB；单图使用 `image`，多图使用 `image[]`。 |
| **`mask`** | `file` | 否 | `null` | multipart 二进制遮罩文件。必须是 PNG、小于 4MB、与第一张输入图尺寸完全相同并包含 Alpha 通道；透明区域表示待编辑区域。 |
| **`model`** | `string` | 否 | `gpt-image-1.5` | 编辑模型标识：`gpt-image-2`（推荐）、`gpt-image-1.5`、`gpt-image-1`、`gpt-image-1-mini`、`chatgpt-image-latest`、`dall-e-2`。 |
| **`input_fidelity`** | `string` | 否 | 省略 | 官方枚举为 `low / high`。Image 1 / 1.5 可用两档，1 Mini 仅 `low`；Image 2 必须省略。项目 `auto` 表示省略；其他未明确支持的模型也不发送。 |
| **`n`** | `integer` | 否 | `1` | 单次生成的编辑结果图片张数（`1 ~ 10`）。 |
| **`size`** | `string` | 否 | `"auto"` | 目标输出尺寸：`"auto"`、`"1024x1024"`、`"1536x1024"`、`"1024x1536"` 或自定义宽高。 |
| **`quality`** | `string` | 否 | `"auto"` | 输出画质：`"low"`、`"medium"`、`"high"`、`"auto"`；Image 2.5 另支持 `"xhigh"`、`"max"`。 |
| **`background`** | `string` | 否 | `"auto"` | 结果背景处理：`"transparent"`、`"opaque"`、`"auto"`。 |
| **`output_format`** | `string` | 否 | `"png"` | 输出格式：`"png"`、`"jpeg"`、`"webp"`。 |
| **`output_compression`** | `integer` | 否 | `100` | 压缩比例（0 ~ 100%）。 |
| **`stream`** | `boolean` | 否 | `false` | 是否开启流式传输编辑进度。 |
| **`partial_images`** | `integer` | 否 | `0` | 流式返回的中间过程图片数量（0 ~ 3）。 |
| **`moderation`** | `string` | 否 | `"auto"` | 内容审查严格度：`"auto"` 或 `"low"`。 |
| **`safety_identifier`** | `string` | 否 | `null` | 最多 128 字符，建议使用哈希，替代已弃用的 `user`。终端用户唯一标识符。 |

---

### 3.2 遮罩（Mask）制作与格式要求

进行局部遮罩编辑时，必须满足以下硬性规范：
1. **尺寸必须对齐**：遮罩图像的宽度与高度必须与待编辑原图**完全一致**。
2. **文件体积限制**：图像与遮罩文件大小均需小于 50MB。
3. **必须具备 Alpha 透明通道**：
   - **完全透明区域（Alpha = 0）**：代表需要模型进行**重绘/替换**的区域。
   - **完全不透明区域（Alpha = 255）**：代表需要**原样保留**的区域。

#### Python 脚本：将黑白遮罩图转为合法 RGBA 带 Alpha 通道遮罩

```python
from io import BytesIO
from PIL import Image


def convert_black_white_to_alpha_mask(bw_mask_path: str, output_path: str):
    """将黑白遮罩图（白色为编辑区，黑色为保留区）转换为带 Alpha 通道的标准 PNG 遮罩"""
    # 1. 以灰度模式载入黑白遮罩
    mask_gray = Image.open(bw_mask_path).convert("L")

    # 2. 转换为 RGBA 4通道模式
    mask_rgba = mask_gray.convert("RGBA")

    # 3. 将遮罩的灰度值注入 Alpha 通道 (透明度)
    # 若原图中白色(255)为待重绘区，需将白色映射为透明(0)，黑色映射为不透明(255)
    # 使用 Image.eval 反转通道:
    alpha_channel = mask_gray.point(lambda p: 255 - p)
    mask_rgba.putalpha(alpha_channel)

    # 4. 保存为标准 PNG 文件
    mask_rgba.save(output_path, format="PNG")
    print(f"标准 RGBA 遮罩已生成: {output_path}")


# 转换示例
convert_black_white_to_alpha_mask("raw_mask.png", "valid_alpha_mask.png")
```

---

### 3.3 图像编辑代码示例

#### 示例 1：基于多张参考图融合生成全新场景（cURL Multipart）

```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image[]=@sofa.png" \
  -F "image[]=@floor_lamp.png" \
  -F "image[]=@plant.png" \
  -F "prompt=Create a cozy Scandinavian living room containing these exact objects" \
  -F "quality=high" \
  -F "size=1536x1024" \
  -F "output_format=png" \
  | jq -r '.data[0].b64_json' | base64 --decode > scandinavian_room.png
```

#### 示例 2：单图提示词编辑（Python Multipart 文件上传）

```python
import base64
import os
import requests

api_key = os.environ["OPENAI_API_KEY"]
headers = {"Authorization": f"Bearer {api_key}"}
data = {
    "model": "gpt-image-2",
    "prompt": "Transform the sunny garden into a magical night scene while keeping the gazebo",
    "quality": "high",
    "size": "1024x1024",
    "stream": "false",
}

with open("sunny_garden.png", "rb") as source:
    response = requests.post(
        "https://api.openai.com/v1/images/edits",
        headers=headers,
        data=data,
        files={"image": ("sunny_garden.png", source, "image/png")},
        timeout=120,
    )
response.raise_for_status()

result_b64 = response.json()["data"][0]["b64_json"]
with open("night_garden.png", "wb") as output:
    output.write(base64.b64decode(result_b64))
```

#### 示例 3：结合遮罩进行局部精准重绘 (Multipart 表单模式 - cURL)

```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image=@living_room.png" \
  -F "mask=@living_room_mask_alpha.png" \
  -F "prompt=Place a vintage wooden coffee table with a steaming cup of coffee and an open book in the masked area" \
  -F "quality=high" \
  -F "size=1024x1024" | jq -r '.data[0].b64_json' | base64 --decode > edited_lounge.png
```

#### 示例 4：多图编辑 Multipart 数组语法 (cURL)

```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "model=gpt-image-1.5" \
  -F "image[]=@body-lotion.png" \
  -F "image[]=@bath-bomb.png" \
  -F "image[]=@incense-kit.png" \
  -F "image[]=@soap.png" \
  -F "prompt=Create a lovely luxury spa gift basket on a wooden table containing all these four items" \
  -F "quality=medium" \
  -F "size=1024x1024" | jq -r '.data[0].b64_json' | base64 --decode > spa_basket.png
```

---

## 4. 图像变体生成接口 (POST /v1/images/variations - 兼容与遗留)

该端点用于根据输入的一张图片生成风格和构图相似的衍生变体。**该端点仅支持经典模型 `dall-e-2`**。对于全新项目，推荐使用 `gpt-image-2` 配合 `POST /v1/images/edits` 实现更强大的变体与重绘效果。

- **请求方法**：`POST`
- **请求路径**：`/v1/images/variations`
- **数据格式**：`Content-Type: multipart/form-data`

### 4.1 请求参数（Multipart Form）

| 参数名称 | 类型 | 必填 | 默认值 | 说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`image`** | `file` | **是** | - | 用作生成变体的源图片文件。必须为有效的 PNG 文件，大小小于 4MB，且必须为正方形。 |
| **`model`** | `string` | 否 | `dall-e-2` | 变体模型标识（目前仅支持 `dall-e-2`）。 |
| **`n`** | `integer` | 否 | `1` | 生成变体张数（`1 ~ 10`）。 |
| **`size`** | `string` | 否 | `"1024x1024"` | 尺寸大小：`"256x256"`、`"512x512"` 或 `"1024x1024"`。 |
| **`response_format`** | `string` | 否 | `"url"` | 返回格式：`"url"` 或 `"b64_json"`。 |
| **`safety_identifier`** | `string` | 否 | `null` | 最多 128 字符，建议使用哈希，替代已弃用的 `user`。终端用户标识符。 |

### 4.2 变体生成代码示例 (cURL)

```bash
curl -X POST "https://api.openai.com/v1/images/variations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "image=@square_otter.png" \
  -F "n=2" \
  -F "size=1024x1024" \
  -F "response_format=url"
```

---

## 5. 对话式视觉工作流 (Responses API: `image_generation` 工具)

Responses API (`/v1/responses`) 允许将图像生成与编辑作为大语言模型（如 `gpt-5.6`、`gpt-5.5`、`gpt-4o`）的**原生内置工具（Built-in Tool）**来调用。

### 5.1 核心优势与机制

- **多轮会话迭代（Multi-Turn Visual State）**：通过 `previous_response_id` 自动串联历史会话上下文，用户无需重新上传图片即可说“把左边的猫改成橘猫”。
- **意图智能路由（Action Control）**：模型根据对话上下文自动识别是“生成新图”还是“编辑上下文中的旧图”。
- **提示词智能扩写（Prompt Expansion）**：主模型会自动将用户的简略自然语言转化为高度详细的专业图像描述，并在响应中返回 `revised_prompt`。
- **Files API 原生融合**：直接通过 `file_id` 引用上传的视觉文件。

---

### 5.2 工具参数配置规范

在调用 `/v1/responses` 时，在 `tools` 列表中声明 `image_generation` 工具：

```json
{
  "model": "gpt-5.6",
  "input": "Draw a cute red panda wearing a blue hoodie sitting in an autumn forest",
  "tools": [
    {
      "type": "image_generation",
      "action": "auto",
      "quality": "high",
      "size": "1024x1024",
      "output_format": "png",
      "partial_images": 0
    }
  ]
}
```

#### `image_generation` 工具可配置参数表

| 工具参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| **`type`** | `string` | `"image_generation"` | 工具类型标识，固定为 `"image_generation"`。 |
| **`action`** | `string` | `"auto"` | 行为模式控制：<br>• `"auto"`：模型根据对话历史自动判断生成新图或编辑已有图片<br>• `"generate"`：强制生成全新图像<br>• `"edit"`：强制对上下文中的已有图像进行编辑 |
| **`quality`** | `string` | `"auto"` | 工具调用的图像画质：`"low"`、`"medium"`、`"high"`、`"auto"`；Image 2.5 另支持 `"xhigh"`、`"max"`。 |
| **`size`** | `string` | `"auto"` | 图像尺寸：`"1024x1024"`、`"1536x1024"`、`"1024x1536"` 或 `"auto"`。 |
| **`output_format`** | `string` | `"png"` | 图像输出格式：`"png"`、`"jpeg"`、`"webp"`。 |
| **`input_image_mask`** | `object` | `null` | 遮罩配置：`{ "file_id": "file-abc123" }`。 |
| **`partial_images`** | `integer` | `0` | 流式返回的中间草图数量（0 ~ 3）。 |

---

### 5.3 Responses API 多轮图像编辑代码示例 (Python)

```python
import base64
import os
import requests

api_key = os.environ.get("OPENAI_API_KEY")
url = "https://api.openai.com/v1/responses"
headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json",
}

# ----------------- 第 1 轮：生成初始图片 -----------------
turn1_payload = {
    "model": "gpt-5.6",
    "input": "Generate an image of a gray tabby cat hugging an otter with an orange scarf",
    "tools": [{"type": "image_generation", "action": "generate"}],
}

res1 = requests.post(url, headers=headers, json=turn1_payload).json()
turn1_response_id = res1["id"]

# 提取第 1 轮生成的图片
image_calls = [
    out for out in res1.get("output", []) if out.get("type") == "image_generation_call"
]
if image_calls:
    first_call = image_calls[0]
    print(f"第 1 轮优化后的提示词 (Revised Prompt): {first_call.get('revised_prompt')}")
    with open("round1_otter.png", "wb") as f:
        f.write(base64.b64decode(first_call["result"]))
    print("第 1 轮图片已保存为 round1_otter.png")

# ----------------- 第 2 轮：基于上一轮上下文进行迭代修改 -----------------
turn2_payload = {
    "model": "gpt-5.6",
    "previous_response_id": turn1_response_id,  # 关联上一轮视觉状态
    "input": "Now change the otter's scarf from orange to bright emerald green, and make them sit under a cherry blossom tree",
    "tools": [{"type": "image_generation", "action": "edit"}],
}

res2 = requests.post(url, headers=headers, json=turn2_payload).json()
image_calls_2 = [
    out for out in res2.get("output", []) if out.get("type") == "image_generation_call"
]
if image_calls_2:
    with open("round2_otter_cherry.png", "wb") as f:
        f.write(base64.b64decode(image_calls_2[0]["result"]))
    print("第 2 轮多轮编辑图片已保存为 round2_otter_cherry.png")
```

---

## 6. 输出自定义规格与尺寸速查表

### 6.1 `gpt-image-2` 自定义分辨率规则引擎

`gpt-image-2` 支持高度自由的自定义分辨率，必须满足以下数学约束：

$$\begin{cases}
\text{Width} \pmod{16} = 0 \\
\text{Height} \pmod{16} = 0 \\
\frac{1}{3} \le \frac{\text{Width}}{\text{Height}} \le 3 \\
655,360 \le (\text{Width} \times \text{Height}) \le 8,294,400 \\
\max(\text{Width}, \text{Height}) \le 3840\ \text{px}
\end{cases}$$

### 6.2 常用推荐标准分辨率对照表

| 画面比例 | 分辨率字符串 (`size`) | 总像素数 | 等级 | 典型应用场景 |
| :---: | :---: | :---: | :---: | :--- |
| **1:1** (正方形) | `"1024x1024"` | 1,048,576 | 1K | 社交媒体头像、电商主图、方形卡片（出图速度最快） |
| **16:9** (横屏宽屏) | `"1536x864"` 或 `"1536x1024"` | 1,327,104 | 1.5K | 视频封面、网页横幅 Banner、幻灯片背景 |
| **9:16** (手机竖屏) | `"1024x1536"` 或 `"864x1536"` | 1,327,104 | 1.5K | 抖音/TikTok/小红书/快手手机全屏封面 |
| **4:3** (经典画幅) | `"1200x900"` 或 `"1024x768"` | 1,080,000 | 1K | 传统摄影、展板插图 |
| **3:4** (肖像画幅) | `"900x1200"` 或 `"768x1024"` | 1,080,000 | 1K | 人像摄影、海报竖版插画 |
| **2K 正方形** | `"2048x2048"` | 4,194,304 | 2K | 高清印刷、精细艺术作品展示 |
| **2K 宽屏** | `"2048x1152"` | 2,359,296 | 2K | 2K 桌面壁纸、4K 预演 |
| **4K 超高清宽屏** | `"3840x2160"` | 8,294,400 | 4K (实验) | 影视级超高清背景、大幅面海报印刷 |
| **4K 超高清竖屏** | `"2160x3840"` | 8,294,400 | 4K (实验) | 超大户外立式大屏、高清手机壁纸 |

---

## 7. 内容审核机制与异常错误处理

### 7.1 安全过滤与审核拦截错误 (`moderation_blocked`)

当请求的提示词或上传的图片未能通过安全策略（Usage Policies）时，API 将返回 HTTP 400 状态码，并在 JSON 中包含详细的 `moderation_details` 对象。

#### 审核拦截响应结构体

```json
{
  "error": {
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "message": "The prompt was flagged by our moderation system.",
    "moderation_details": {
      "moderation_stage": "input",
      "categories": [
        "harassment",
        "violence"
      ]
    }
  }
}
```

#### `moderation_details` 字段含义

| 字段 | 可能取值 | 说明 |
| :--- | :--- | :--- |
| `moderation_stage` | `"input"` | 违规触发来自用户输入的 Prompt 文本或输入参考图片。应提示用户修改提示词。 |
| | `"output"` | 违规触发来自生成的图像结果内容。可引导用户微调提示词重新生成。 |
| | `"unknown"` | 审核溯源未明确。 |
| `categories` | `["harassment", "sexual", "violence", "self-harm"]` | 粗粒度违规类型标签（不暴露内部判定分值，便于对终端用户给出合规指引）。 |

---

### 7.2 常见 HTTP 状态码与业务错误码清单

| HTTP 状态码 | 错误码 (`code`) / 错误类型 (`type`) | 错误原因与排查指南 | 应对策略 |
| :---: | :--- | :--- | :--- |
| **`400`** | `moderation_blocked` | 提示词或参考图片触发了 OpenAI 内容安全策略。 | **禁止盲目重试**。根据 `moderation_stage` 提示用户修改提示词。 |
| **`400`** | `invalid_request_error` | 参数格式错误，如尺寸不是 16 的倍数、宽高比超过 3:1、遮罩与原图尺寸不一致等。 | 校验请求参数合法性后再发送。 |
| **`401`** | `invalid_api_key` | API Key 缺失、无效或已过期。 | 检查 `Authorization: Bearer <KEY>` 是否正确。 |
| **`403`** | `unsupported_country_region_territory` / `organization_not_verified` | 地区限制或当前 Organization 未完成开发者组织实名认证。 | 完成 Organization Verification 认证。 |
| **`429`** | `rate_limit_exceeded` / `insufficient_quota` | 请求并发/速率超限，或账户余额不足。 | 采用指数退避（Exponential Backoff）重试，或前往后台充值。 |
| **`500` / `503`** | `server_error` | OpenAI 图像渲染计算节点偶发性故障或负载过高。 | 采用指数退避算法安全重试（最多 3 次）。 |

---

### 7.3 健壮的生产级 Python 错误处理与重试封装模板

```python
import time
import requests


class OpenAIImageClient:

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.base_url = "https://api.openai.com/v1"

    def generate_image_safe(
        self, prompt: str, model="gpt-image-2", max_retries=3, **kwargs
    ):
        """具备内容审核解析与指数退避重试的生产级生图方法"""
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload = {"model": model, "prompt": prompt, **kwargs}

        for attempt in range(1, max_retries + 1):
            try:
                response = requests.post(
                    f"{self.base_url}/images/generations",
                    headers=headers,
                    json=payload,
                    timeout=120,
                )

                # 正常成功返回
                if response.status_code == 200:
                    return response.json()

                err_json = response.json().get("error", {})
                err_code = err_json.get("code")
                err_msg = err_json.get("message")

                # 1. 拦截内容审核错误 (用户侧错误，禁止重试)
                if err_code == "moderation_blocked":
                    mod_details = err_json.get("moderation_details", {})
                    stage = mod_details.get("moderation_stage", "input")
                    cats = mod_details.get("categories", [])
                    print(
                        f"[安全拦截] 审核阶段: {stage}, 触发类别: {cats}。请调整提示词！"
                    )
                    return {
                        "success": False,
                        "error_type": "moderation_blocked",
                        "stage": stage,
                        "categories": cats,
                    }

                # 2. 429 速率限制或 5xx 服务端错误 (可退避重试)
                if response.status_code in [429, 500, 502, 503, 504]:
                    wait_sec = 2**attempt
                    print(
                        f"[服务繁忙] 状态码 {response.status_code}，将在 {wait_sec} 秒后进行第 {attempt}/{max_retries} 次重试..."
                    )
                    time.sleep(wait_sec)
                    continue

                # 3. 其他 4xx 客户端参数错误
                print(f"[请求错误] 状态码: {response.status_code}, 信息: {err_msg}")
                return {
                    "success": False,
                    "status_code": response.status_code,
                    "message": err_msg,
                }

            except requests.exceptions.RequestException as e:
                if attempt == max_retries:
                    raise e
                time.sleep(2**attempt)

        raise RuntimeError(f"在重试 {max_retries} 次后生图请求仍未成功。")
```

---

## 8. 生产环境快速调用模板清单

### 8.1 极速文本生图 (cURL JSON)

```bash
curl -X POST "https://api.openai.com/v1/images/generations" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A modern minimalist interior living room with morning light",
    "size": "1536x1024",
    "quality": "medium",
    "output_format": "jpeg",
    "output_compression": 85
  }'
```

### 8.2 多参考图融合编辑 (cURL JSON)

```bash
curl -X POST "https://api.openai.com/v1/images/edits" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "images": [
      { "image_url": "https://example.com/character.png" },
      { "image_url": "https://example.com/costume.png" }
    ],
    "prompt": "Render the character from the first image wearing the exact costume from the second image in a futuristic cyberpunk city background",
    "quality": "high",
    "size": "1024x1024"
  }'
```

### 8.3 局部遮罩重绘 (Python)

```python
import base64
import requests

with open("original.png", "rb") as f_img, open("mask_alpha.png", "rb") as f_mask:
    response = requests.post(
        "https://api.openai.com/v1/images/edits",
        headers={"Authorization": f"Bearer {OPENAI_API_KEY}"},
        files={
            "image": ("original.png", f_img, "image/png"),
            "mask": ("mask_alpha.png", f_mask, "image/png"),
        },
        data={
            "model": "gpt-image-2",
            "prompt": "Add a cute sleeping golden retriever puppy on the rug in the transparent masked region",
            "quality": "high",
            "size": "1024x1024",
        },
    )

data = response.json()
image_b64 = data["data"][0]["b64_json"]
with open("result.png", "wb") as f:
    f.write(base64.b64decode(image_b64))
```

### 8.4 对话式多轮视觉流 (Node.js / TypeScript)

```typescript
import OpenAI from "openai";
const openai = new OpenAI();

// 第 1 轮：生成
const res1 = await openai.responses.create({
  model: "gpt-5.6",
  input: "Generate an image of a red panda drinking bubble tea in Tokyo street",
  tools: [{ type: "image_generation", action: "generate", quality: "high" }],
});

// 第 2 轮：修改
const res2 = await openai.responses.create({
  model: "gpt-5.6",
  previous_response_id: res1.id,
  input: "Make it rain softly and add glowing neon reflections on the street puddle",
  tools: [{ type: "image_generation", action: "edit" }],
});
```
