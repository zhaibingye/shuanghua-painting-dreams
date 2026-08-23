# Google Gemini 图像模型 REST API 接口文档

本文档基于 Google Gemini API 官方图像生成与编辑规范整理，提供标准 REST API 接口定义、请求/响应结构规范、参数说明、数据模型矩阵及核心业务场景的完整 cURL 调用示例。

---

## 1. 概述与核心能力

Gemini 图像生成与编辑模型（代号 Nano Banana 系列）采用原生的多模态架构，支持对话式图文生成与精准图像编辑。支持文本、图片、视频等多种模态作为输入上下文，具备前沿的视觉理解、推理思考（Thinking Process）以及高保真渲染能力。

### 核心特性
- **文生图 (Text-to-Image)**：通过精准自然语言描述生成高质量图像。
- **图生图与编辑 (Image-to-Image / Editing)**：提供单张或多张参考图片，进行元素添加/删除、风格迁移、局部语义修复（Inpainting）等。
- **多轮对话连续迭代**：在保持上下文和角色的连续性下，通过多轮交互逐步微调画面。
- **多参考图融合**：单次请求最多支持融合 14 张参考图片（物体、角色、风格）。
- **Google 搜索接地 (Grounding with Google Search)**：结合实时网页搜索及图片搜索，生成具时效性或精准实体视觉的新图像。
- **视频转图像生成 (Video-to-Image)**：支持直接解析 YouTube 视频或视频帧文件生成对应海报、缩略图或信息图。
- **高分辨率输出**：支持 512px、1K、2K 直至最高 4K 的超高清分辨率渲染。
- **显式思维过程 (Thinking Process)**：内置视觉推理思考能力，并提供思考签名（Thought Signature）用于多轮会话状态保持。

---

## 2. 模型选型矩阵 (Model Matrix)

Gemini API 提供以下四个主要的图像生成与编辑模型：

| 模型标识 (Model ID) | 代号 / 显示名称 | 定位与核心优势 | 最大参考图数量 | 支持分辨率 |
| :--- | :--- | :--- | :--- | :--- |
| `gemini-3.1-flash-image` | Nano Banana 2 | **通用推荐主力**。兼具极快速度与 4K 超高清生成能力，支持视频上下文与实时搜索接地，文本渲染及角色一致性极佳。 | 14 张（最多 10 张物体 + 4 张角色） | `512` (0.5K), `1K`, `2K`, `4K` |
| `gemini-3.1-flash-lite-image` | Nano Banana 2 Lite | **极速低成本**。专为超大规模并发、高吞吐和成本敏感型任务打造，适用于无需复杂风格参考的快速渲染。 | 14 张（高保真物体） | `512` (0.5K), `1K` |
| `gemini-3-pro-image` | Nano Banana Pro | **专业级超高画质**。处理最复杂的视觉设计、严苛品牌画风一致性、高级排版排字及精准构图控制。 | 14 张（最多 6 张物体 + 5 张角色 + 3 张风格） | `1K`, `2K`, `4K` |
| `gemini-2.5-flash-image` | Nano Banana | **上一代基准模型**。提供稳定的基础文生图及图生图能力。 | 基础图生图 | `1K` (默认) |

> ⚠️ **说明**：原 Google Imagen 独立图像模型已废弃，并将于 **2026 年 8 月 17 日**正式下线。建议所有新场景全面采用 Gemini 图像模型（Nano Banana 系列）。

---

## 3. REST API 接口规范

### 3.1 接口基础信息

- **接口请求方式**：`POST`
- **基础 URL**：`https://generativelanguage.googleapis.com/v1/models/{model}:generateContent`
- **请求格式 (Content-Type)**：`application/json`
- **响应格式**：`application/json`

### 3.2 认证与鉴权 (Authentication)

支持两种认证方式：
1. **HTTP 请求头（推荐）**：
   ```http
   x-goog-api-key: YOUR_GEMINI_API_KEY
   ```
2. **URL Query 参数**：
   ```http
   https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent?key=YOUR_GEMINI_API_KEY
   ```

---

## 4. 请求参数详解 (Request Schema)

### 4.1 请求体顶层结构 (Request Body)

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [
        { "text": "Prompt text..." },
        {
          "inline_data": {
            "mime_type": "image/png",
            "data": "<BASE64_STRING>"
          }
        }
      ]
    }
  ],
  "tools": [
    {
      "google_search": {}
    }
  ],
  "generationConfig": {
    "responseModalities": ["TEXT", "IMAGE"],
    "responseFormat": {
      "image": {
        "aspectRatio": "16:9",
        "imageSize": "2K"
      }
    },
    "thinkingConfig": {
      "thinkingLevel": "High",
      "includeThoughts": true
    }
  }
}
```

### 4.2 字段说明表

#### `contents`（必填，Array of Object）
对话内容列表，支持单轮或多轮上下文。

| 字段名 | 类型 | 必填 | 说明 |
| :--- | :--- | :--- | :--- |
| `role` | String | 选填 | 角色标识。可选值：`"user"`（用户输入）或 `"model"`（模型输出）。多轮对话中必须明确标注。 |
| `parts` | Array of Object | 是 | 内容片段列表，可混合文本、图片、视频及思维签名。 |

#### `contents[].parts[]` 片段对象

| 字段名 | 类型 | 说明 |
| :--- | :--- | :--- |
| `text` | String | 文本提示词（Prompt）或模型返回的文本说明。 |
| `inline_data` | Object | 内联二进制数据（如图片 Base64 编码）。 |
| `inline_data.mime_type` | String | 图片 MIME 类型，如 `"image/png"`, `"image/jpeg"`, `"image/webp"`。 |
| `inline_data.data` | String | Base64 编码后的二进制图像字符串。 |
| `file_data` | Object | 外部文件/视频资源引用。 |
| `file_data.file_uri` | String | 资源 URI（支持公开的 YouTube 视频 URL 或 Google File API 上传的 URI）。 |
| `video_metadata` | Object | 视频处理配置元数据。 |
| `video_metadata.fps` | Number | 视频抽帧采样率，推荐值：`0.5`（每秒采样 0.5 帧）。 |
| `thought` | Boolean | （仅响应/多轮历史中）标记该 Part 是否为模型的思考过程中间产物。 |
| `thought_signature` | String | （仅多轮对话中）模型的加密思维签名，多轮调用需原样回传以维持推理上下文。 |

---

#### `generationConfig`（选填，Object）
控制模型输出模态、图片尺寸、分辨率及思考等级。

| 字段名 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `responseModalities` | Array of String | `["TEXT", "IMAGE"]` | 指定输出模态。常用值：<br>- `["IMAGE"]`：仅返回生成的图像，不返回附带文本。<br>- `["TEXT", "IMAGE"]`：同时返回说明文本和生成的图像。 |
| `responseFormat` | Object | - | 输出格式配置。包含 `image` 子对象。 |
| `responseFormat.image.aspectRatio` | String | `"1:1"` | 输出图片的宽高比。详见 [宽高比枚举表](#5-宽高比分辨率与-token-消耗对照表)。 |
| `responseFormat.image.imageSize` | String | `"1K"` | 输出图片分辨率大小。可选值：`"512"`, `"1K"`, `"2K"`, `"4K"`。<br>⚠️ **注意：字母 `K` 必须为大写**。 |
| `thinkingConfig` | Object | - | 思考模型推理配置。 |
| `thinkingConfig.thinkingLevel` | String | `"High"` | 思考深度等级。可选值：`"High"`, `"Low"`, `"Off"`。 |
| `thinkingConfig.includeThoughts` | Boolean | `false` | 是否在响应的 `parts` 中返回思考过程文本/中间过程图像（带 `"thought": true` 标识）。 |

---

#### `tools`（选填，Array of Object）
外部工具调用配置。

| 工具名称 | 配置项结构 | 说明 |
| :--- | :--- | :--- |
| **标准 Google 搜索** | `[{"google_search": {}}]` | 启用网页搜索接地，获取最新事实数据辅助绘图。 |
| **Google 图片搜索接地** | `[{"google_search": {"searchTypes": {"webSearch": {}, "imageSearch": {}}}}]` | **（仅限 Gemini 3.1 Flash）** 启用图片搜索，检索网络图片作为视觉生成上下文。*(注意：不可用于搜索真实人物)* |

---

## 5. 宽高比、分辨率与 Token 消耗对照表

Gemini 模型生成图像时的 Token 消耗与选定的宽高比和目标分辨率挂钩。

### 5.1 Gemini 3.1 Flash Image 分辨率与 Token 消耗对照

| 宽高比 | 512 分辨率 (0.5K) | 512 Token | 1K 分辨率 | 1K Token | 2K 分辨率 | 2K Token | 4K 分辨率 | 4K Token |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1:1** | 512 x 512 | 747 | 1024 x 1024 | 1,120 | 2048 x 2048 | 1,680 | 4096 x 4096 | 2,520 |
| **1:4** | 256 x 1024 | 747 | 512 x 2048 | 1,120 | 1024 x 4096 | 1,680 | 2048 x 8192 | 2,520 |
| **1:8** | 192 x 1536 | 747 | 384 x 3072 | 1,120 | 768 x 6144 | 1,680 | 1536 x 12288 | 2,520 |
| **2:3** | 424 x 632 | 747 | 848 x 1264 | 1,120 | 1696 x 2528 | 1,680 | 3392 x 5056 | 2,520 |
| **3:2** | 632 x 424 | 747 | 1264 x 848 | 1,120 | 2528 x 1696 | 1,680 | 5056 x 3392 | 2,520 |
| **3:4** | 448 x 600 | 747 | 896 x 1200 | 1,120 | 1792 x 2400 | 1,680 | 3584 x 4800 | 2,520 |
| **4:1** | 1024 x 256 | 747 | 2048 x 512 | 1,120 | 4096 x 1024 | 1,680 | 8192 x 2048 | 2,520 |
| **4:3** | 600 x 448 | 747 | 1200 x 896 | 1,120 | 2400 x 1792 | 1,680 | 4800 x 3584 | 2,520 |
| **4:5** | 464 x 576 | 747 | 928 x 1152 | 1,120 | 1856 x 2304 | 1,680 | 3712 x 4608 | 2,520 |
| **5:4** | 576 x 464 | 747 | 1152 x 928 | 1,120 | 2304 x 1856 | 1,680 | 4608 x 3712 | 2,520 |
| **8:1** | 1536 x 192 | 747 | 3072 x 384 | 1,120 | 6144 x 768 | 1,680 | 12288 x 1536 | 2,520 |
| **9:16** | 384 x 688 | 747 | 768 x 1376 | 1,120 | 1536 x 2752 | 1,680 | 3072 x 5504 | 2,520 |
| **16:9** | 688 x 384 | 747 | 1376 x 768 | 1,120 | 2752 x 1536 | 1,680 | 5504 x 3072 | 2,520 |
| **21:9** | 792 x 168 | 747 | 1584 x 672 | 1,120 | 3168 x 1344 | 1,680 | 6336 x 2688 | 2,520 |

---

### 5.2 Gemini 3.1 Flash Lite Image 对照表

| 宽高比 | 512 分辨率 | Token 消耗 | 1K 分辨率 | Token 消耗 |
| :---: | :---: | :---: | :---: | :---: |
| **1:1** | 512 x 512 | 747 | 1024 x 1024 | 1,120 |
| **1:4** | 256 x 1024 | 747 | 512 x 2048 | 1,120 |
| **1:8** | 192 x 1536 | 747 | 384 x 3072 | 1,120 |
| **2:3** | 424 x 632 | 747 | 848 x 1264 | 1,120 |
| **3:2** | 632 x 424 | 747 | 1264 x 848 | 1,120 |
| **3:4** | 448 x 600 | 747 | 896 x 1200 | 1,120 |
| **4:1** | 1024 x 256 | 747 | 2048 x 512 | 1,120 |
| **4:3** | 600 x 448 | 747 | 1200 x 896 | 1,120 |
| **4:5** | 464 x 576 | 747 | 928 x 1152 | 1,120 |
| **5:4** | 576 x 464 | 747 | 1152 x 928 | 1,120 |
| **8:1** | 1536 x 192 | 747 | 3072 x 384 | 1,120 |
| **9:16** | 384 x 688 | 747 | 768 x 1376 | 1,120 |
| **16:9** | 688 x 384 | 747 | 1376 x 768 | 1,120 |
| **21:9** | 792 x 168 | 747 | 1584 x 672 | 1,120 |

---

### 5.3 Gemini 3 Pro Image 对照表

| 宽高比 | 1K 分辨率 | 1K Token | 2K 分辨率 | 2K Token | 4K 分辨率 | 4K Token |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **1:1** | 1024 x 1024 | 1,120 | 2048 x 2048 | 1,120 | 4096 x 4096 | 2,000 |
| **2:3** | 848 x 1264 | 1,120 | 1696 x 2528 | 1,120 | 3392 x 5056 | 2,000 |
| **3:2** | 1264 x 848 | 1,120 | 2528 x 1696 | 1,120 | 5056 x 3392 | 2,000 |
| **3:4** | 896 x 1200 | 1,120 | 1792 x 2400 | 1,120 | 3584 x 4800 | 2,000 |
| **4:3** | 1200 x 896 | 1,120 | 2400 x 1792 | 1,120 | 4800 x 3584 | 2,000 |
| **4:5** | 928 x 1152 | 1,120 | 1856 x 2304 | 1,120 | 3712 x 4608 | 2,000 |
| **5:4** | 1152 x 928 | 1,120 | 2304 x 1856 | 1,120 | 4608 x 3712 | 2,000 |
| **9:16** | 768 x 1376 | 1,120 | 1536 x 2752 | 1,120 | 3072 x 5504 | 2,000 |
| **16:9** | 1376 x 768 | 1,120 | 2752 x 1536 | 1,120 | 5504 x 3072 | 2,000 |
| **21:9** | 1584 x 672 | 1,120 | 3168 x 1344 | 1,120 | 6336 x 2688 | 2,000 |

---

### 5.4 Gemini 2.5 Flash Image 对照表

| 宽高比 | 1K 分辨率 | Token 消耗 |
| :---: | :---: | :---: |
| **1:1** | 1024 x 1024 | 1,290 |
| **2:3** | 832 x 1248 | 1,290 |
| **3:2** | 1248 x 832 | 1,290 |
| **3:4** | 864 x 1184 | 1,290 |
| **4:3** | 1184 x 864 | 1,290 |
| **4:5** | 896 x 1152 | 1,290 |
| **5:4** | 1152 x 896 | 1,290 |
| **9:16** | 768 x 1344 | 1,290 |
| **16:9** | 1344 x 768 | 1,290 |
| **21:9** | 1536 x 672 | 1,290 |

---

## 6. 响应结构详解 (Response Schema)

### 6.1 典型响应 JSON 格式

```json
{
  "candidates": [
    {
      "content": {
        "role": "model",
        "parts": [
          {
            "text": "Here is your generated image of a nano banana dish...",
            "thought_signature": "CiQAe..."
          },
          {
            "inline_data": {
              "mime_type": "image/png",
              "data": "iVBORw0KGgoAAAANSUhEUgAA..."
            },
            "thought_signature": "CiQAe..."
          }
        ]
      },
      "finishReason": "STOP",
      "index": 0,
      "groundingMetadata": {
        "webSearchQueries": ["current weather in San Francisco"],
        "searchEntryPoint": {
          "renderedContent": "<search_widget_html>"
        }
      }
    }
  ],
  "usageMetadata": {
    "promptTokenCount": 35,
    "candidatesTokenCount": 1120,
    "totalTokenCount": 1155
  }
}
```

### 6.2 字段说明

- `candidates[]`：候选回答列表。
  - `content.parts[]`：生成的具体内容：
    - `inline_data`：生成的图片 Base64 编码，可以直接保存为 `.png` 或 `.jpg` 文件。
    - `text`：生成的附随文本（若 `responseModalities` 包含 `"TEXT"`）。
    - `thought_signature`：**思维签名**，用于保障多轮对话推理连贯性。
  - `groundingMetadata`：搜索接地元数据（若启用了 Google 搜索）。
    - `searchEntryPoint.renderedContent`：根据搜索合规要求必须展示的搜索入口组件 HTML。
- `usageMetadata`：Token 消耗统计。

---

## 7. 核心场景 REST API 调用示例 (cURL)

### 示例 1：基础文生图 (Text-to-Image)

向 `gemini-3.1-flash-image` 发送文本提示词生成图像。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Create a picture of a nano banana dish in a fancy restaurant with a Gemini theme"}
      ]
    }]
  }'
```

---

### 示例 2：纯图像输出与指定 16:9 比例 (Response Modalities & Aspect Ratio)

仅要求模型返回图像（不附带文本），并设定宽高比为 `16:9`。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "A cinematic shot of a cyberpunk city at night with neon reflections on wet asphalt"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "responseFormat": {
        "image": {
          "aspectRatio": "16:9"
        }
      }
    }
  }'
```

---

### 示例 3：图生图与编辑 (Image-to-Image / Modification)

传入一张现有的 Base64 图片，并指示模型添加特定元素或更改样式。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Using the provided cat photo, add a small knitted wizard hat onto its head. Match the lighting and tone of the original photo."},
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": "<BASE64_IMAGE_DATA>"
          }
        }
      ]
    }]
  }'
```

---

### 示例 4：多轮对话连续图片修改 (Multi-turn Image Editing)

在同一会话中基于前一次生成的图像进行迭代修改（例如将图片中的文字替换为西班牙语）。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [
      {
        "role": "user",
        "parts": [
          {"text": "Create a vibrant infographic that explains photosynthesis like a recipe book for kids."}
        ]
      },
      {
        "role": "model",
        "parts": [
          {
            "inline_data": {
              "mime_type": "image/png",
              "data": "<PREVIOUS_GENERATED_IMAGE_BASE64>"
            },
            "thought_signature": "<PREVIOUS_THOUGHT_SIGNATURE>"
          }
        ]
      },
      {
        "role": "user",
        "parts": [
          {"text": "Update this infographic to be in Spanish. Do not change any other elements of the image."}
        ]
      }
    ],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "responseFormat": {
        "image": {
          "aspectRatio": "16:9",
          "imageSize": "2K"
        }
      }
    }
  }'
```

---

### 示例 5：多参考图合成 (最多 14 张参考图)

传入多张人物/物体参考图，合成一张新的群像或复杂场景。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "An office group photo of these people, they are making funny faces together in a modern co-working space."},
        {"inline_data": {"mime_type": "image/png", "data": "<PERSON_1_BASE64>"}},
        {"inline_data": {"mime_type": "image/png", "data": "<PERSON_2_BASE64>"}},
        {"inline_data": {"mime_type": "image/png", "data": "<PERSON_3_BASE64>"}},
        {"inline_data": {"mime_type": "image/png", "data": "<PERSON_4_BASE64>"}}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "responseFormat": {
        "image": {
          "aspectRatio": "5:4",
          "imageSize": "2K"
        }
      }
    }
  }'
```

---

### 示例 6：Google 搜索接地与图片搜索接地 (Search Grounding & Image Search)

借助 Google 实时网页搜索或图片搜索生成符合最新客观事实的图像。

#### 6a. 普通 Google 网页搜索接地
```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Visualize the current weather forecast for the next 5 days in San Francisco as a clean, modern weather chart. Add a visual on what I should wear each day."}
      ]
    }],
    "tools": [{"google_search": {}}],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "responseFormat": {
        "image": {"aspectRatio": "16:9"}
      }
    }
  }'
```

#### 6b. 图片搜索接地 (Gemini 3.1 Flash 特有)
```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "A detailed painting of a Timareta butterfly resting on a flower, based on real image references"}
      ]
    }],
    "tools": [
      {
        "google_search": {
          "searchTypes": {
            "webSearch": {},
            "imageSearch": {}
          }
        }
      }
    ],
    "generationConfig": {
      "responseModalities": ["IMAGE"]
    }
  }'
```

---

### 示例 7：视频转图像生成 (Video-to-Image Generation)

输入 YouTube 视频地址或视频文件，由模型分析关键帧并合成海报或缩略图。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {
          "file_data": {
            "file_uri": "https://www.youtube.com/watch?v=UTdfxFyOQTI"
          },
          "video_metadata": {
            "fps": 0.5
          }
        },
        {"text": "Generate an aesthetic movie poster that captures the key themes and emotional arc of this video."}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "responseFormat": {
        "image": {
          "aspectRatio": "2:3",
          "imageSize": "2K"
        }
      }
    }
  }'
```

---

### 示例 8：4K 超高清分辨率渲染 (4K High Resolution)

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "Da Vinci style anatomical sketch of a dissected Monarch butterfly. Detailed drawings of the head, wings, and legs on textured parchment with notes in English."}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["TEXT", "IMAGE"],
      "responseFormat": {
        "image": {
          "aspectRatio": "1:1",
          "imageSize": "4K"
        }
      }
    }
  }'
```

---

### 示例 9：显式推理与思考等级控制 (Thinking Config)

调节思考深度（`High` / `Low` / `Off`）并要求返回思考过程。

```bash
curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1/models/gemini-3.1-flash-image:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "contents": [{
      "parts": [
        {"text": "A futuristic city built inside a giant glass bottle floating in space, intricate internal architectural physics and micro gravity systems"}
      ]
    }],
    "generationConfig": {
      "responseModalities": ["IMAGE"],
      "thinkingConfig": {
        "thinkingLevel": "High",
        "includeThoughts": true
      }
    }
  }'
```

---

## 8. 思维签名机制规范 (Thought Signatures)

### 8.1 概念与作用
Gemini 3 图像模型是具备逻辑推理能力的思考模型（Thinking Models）。在生成画面前，模型会进行构图、空间关系与物理规律的推理。
- `thought_signature` 是模型内部思考过程的加密签名表示。
- 在多轮交互中，**必须将前序响应中的 `thought_signature` 完全按原样带回请求中**，否则可能导致多轮推理上下文丢失或 API 返回错误。

### 8.2 多轮请求回传结构规范

```json
{
  "contents": [
    {
      "role": "user",
      "parts": [{ "text": "Step 1: Draw a cute dragon..." }]
    },
    {
      "role": "model",
      "parts": [
        {
          "text": "Here is the sketch...",
          "thought_signature": "ENCRYPTED_SIGNATURE_STRING_A"
        },
        {
          "inline_data": {
            "mime_type": "image/png",
            "data": "<BASE64_IMG_1>"
          },
          "thought_signature": "ENCRYPTED_SIGNATURE_STRING_B"
        }
      ]
    },
    {
      "role": "user",
      "parts": [{ "text": "Step 2: Add wings and color it gold." }]
    }
  ]
}
```

---

## 9. 提示词工程与最佳实践 (Prompt Engineering)

| 视觉类别 | 核心策略与提示词技巧 | 示例 Prompt |
| :--- | :--- | :--- |
| **逼真摄影 (Photography)** | 明确指定摄影专业术语：视角、焦距（如 85mm 人像镜头）、光圈景深、光线（黄金时刻/三点柔光灯）和胶片/数字质感。 | *"A close-up portrait of an elderly Japanese ceramic artist smiling warmly, golden hour light through the window, 85mm portrait lens, shallow depth of field (bokeh), highly detailed clay texture."* |
| **扁平插画与贴纸 (Stickers / Icons)** | 明确指定艺术风格（卡哇伊、赛璐珞、扁平矢量）并**强烈要求纯白背景**（方便后续抠图）。 | *"A kawaii-style sticker of a happy baby panda wearing a small bamboo hat, bold clean outlines, vibrant colors. Pure solid white background."* |
| **准确文字排版 (Typography)** | 明确文字内容（使用英文双引号括起）、字体类型（粗体无衬线、手写花体）及在画面中的绝对位置。推荐使用 `gemini-3-pro-image`。 | *"A modern minimalist logo for a coffee shop named 'The Daily Grind'. Clear bold sans-serif lettering inside a circular badge with subtle coffee bean accents."* |
| **电商与商业展示 (Product Photography)** | 设定摄影棚布光方案、摆放材质（如哑光混凝土底座）、微俯拍 45° 视角与产品表面材质反射（PBR）。 | *"Studio product photography of a matte black minimalist ceramic mug on polished concrete. Three-point softbox lighting, 45-degree angle, sharp focus on rising steam."* |
| **极简与留白构图 (Negative Space)** | 说明主体偏向一角（如右下角），为文字排版预留大面积负空间（Off-white canvas）。 | *"Minimalist composition with a single red maple leaf in the bottom right corner. Vast empty off-white background with soft diffuse light from top left."* |
| **多格分镜漫画 (Comics / Storyboards)** | 设定格数（三格/四格）、黑白高对比墨水风格或美漫风格，并保持分格叙事递进。 | *"A three-panel comic strip in gritty film-noir art style with high contrast black and white ink, depicting a detective finding a clue."* |
| **局部语义重绘 (Inpainting)** | 提供原图，清晰描述保留区域与改动区域，模型自动保持未修改部分的光影与空间一致性。 | *"Using the provided living room image, change only the blue sofa into a vintage brown leather Chesterfield sofa. Keep all other furniture, lighting, and pillow positions intact."* |
| **风格迁移 (Style Transfer)** | 上传原图，并指定特定艺术家或流派的画风重绘（如梵高《星月夜》厚涂油画质感）。 | *"Transform this urban street night photo into Vincent van Gogh's Starry Night style. Retain building outlines but use swirling impasto brushstrokes and deep blue/vibrant yellow palette."* |

---

## 10. 限制、错误码与合规说明

### 10.1 语言支持列表
为确保最佳的文本理解与文字渲染准确性，推荐使用以下 15 种优化语言：
- 中文 (`zh-CN`)
- 英语 (`en-US` / `en-GB`)
- 日语 (`ja-JP`)
- 韩语 (`ko-KR`)
- 西班牙语 (`es-MX` / `es-ES`)
- 法语 (`fr-FR`)
- 德语 (`de-DE`)
- 意大利语 (`it-IT`)
- 葡萄牙语 (`pt-BR`)
- 俄语 (`ru-RU`)
- 乌克兰语 (`ua-UA`)
- 越南语 (`vi-VN`)
- 印尼语 (`id-ID`)
- 印地语 (`hi-IN`)
- 阿拉伯语 (`ar-EG`)

### 10.2 常见错误码 (Error Codes)

| HTTP 状态码 | 错误状态 | 典型原因 | 解决方案 |
| :---: | :--- | :--- | :--- |
| **400** | `INVALID_ARGUMENT` | 1. `imageSize` 未大写 `K`（如写成 `"2k"` 而非 `"2K"`）。<br>2. 宽高比枚举值不合法。<br>3. Base64 编码损坏。<br>4. 包含超过上限的参考图片。 | 检查 `imageSize` 是否为 `"512"`, `"1K"`, `"2K"`, `"4K"`；检查 Base64 完整性与参考图数量。 |
| **401 / 403** | `PERMISSION_DENIED` | API Key 无效、未启用 Gemini API 权限或配额受限。 | 检查请求头 `x-goog-api-key` 是否正确配置并拥有调用权限。 |
| **429** | `RESOURCE_EXHAUSTED` | 触发并发或 RPM/TPM 速率限制。 | 实施指数退避重试（Exponential Backoff）或切换至 Batch API。 |
| **500 / 503** | `INTERNAL` | 服务端渲染超时或临时不可用。 | 稍后重试请求。 |

### 10.3 搜索接地合规展示要求
若在请求中启用了 `google_search` 工具：
- 如果响应返回了 `groundingMetadata.searchEntryPoint`，前端界面**必须原样渲染**该对象中的 `renderedContent` HTML 挂件，以符合 Google 搜索来源标注政策。
- 依托 Google 搜索接地检索图片功能**严禁用于搜索真实人物**。
