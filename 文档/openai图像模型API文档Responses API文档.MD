# OpenAI Responses API 图像模型技术规范文档 (REST 标准)

本文档专门针对 OpenAI **Responses API**（`/v1/responses`）中的图像生成与编辑能力（`image_generation` 内置工具）进行系统化梳理与规范定义。涵盖 REST API 接口规范、参数架构、多模态请求结构、多轮对话图像迭代、多图融合参考、遮罩局部重绘（Inpainting）、流式渐进式出图（SSE）、Token 计量模型与生产级错误拦截策略。

---

## 1. 架构总览与核心设计理念

### 1.1 什么是 Responses API 图像模式？

Responses API 是 OpenAI 推出的新一代智能体与会话级统一模型响应接口。在 Responses API 中，图像生成不再是孤立的单次调用，而是作为**原生内置工具（Hosted Built-in Tool: `image_generation`）**无缝融入到大语言模型（如 `gpt-5.6`、`gpt-5.5`、`gpt-4o` 等）的对话上下文和 Agent 决策循环中。

```
                               ┌────────────────────────────────────────────────────────┐
                               │           Responses API 图像生成工作流架构              │
                               └────────────────────────────────────────────────────────┘
                                                           │
                                ┌──────────────────────────┴──────────────────────────┐
                                ▼                                                     ▼
               【客户端发送请求 POST /v1/responses】                  【多模态输入上下文】
               • model: "gpt-5.6"                                     • 用户提示词 / 指令
               • tools: [{"type": "image_generation", ...}]           • 多模态参考图 (URL/Base64/File ID)
               • previous_response_id: "resp_xxx"                     • 历史生图结果 (image_generation_call)
                                │
                                ▼
               【主体大模型 (Mainline LLM) 智能编排】
               • 语义理解与意图判断 (决定是生成全新图还是编辑上下文图)
               • 提示词自动扩展与优化 (生成 revised_prompt)
               • 自动调度 GPT Image 核心引擎 (gpt-image-2 / gpt-image-1.5)
                                │
                                ▼
               【生成结果与流式分发】
               • 结构化输出项: type = "image_generation_call"
               • revised_prompt: 模型精修后的生图提示词
               • result: Base64 编码的图像二进制流
               • 可选 SSE 渐进式草图: response.image_generation_call.partial_image
```

### 1.2 Image API vs. Responses API 对比选型

| 维度 | Image API (`/v1/images/*`) | Responses API (`/v1/responses`) |
| :--- | :--- | :--- |
| **主要定位** | 单次、独立、无状态的图像生成/编辑端点 | 智能体、多轮连续对话、工作流集成的会话端点 |
| **调用端点** | `POST /v1/images/generations`<br>`POST /v1/images/edits` | `POST /v1/responses` |
| **顶层模型指定** | 直接指定图像模型（如 `gpt-image-2`） | 指定文本/多模态主体大模型（如 `gpt-5.6`），由工具调度底层图像引擎 |
| **多轮连续编辑** | 需客户端自行管理并重新上传上一轮图片二进制 | 原生支持：通过 `previous_response_id` 或会话上下文直接跨轮次迭代修改 |
| **输入图片格式** | `multipart/form-data`（仅接受原始二进制流） | 支持 3 种格式：公网 URL、Base64 Data URL、Files API 的 `file_id` |
| **提示词优化** | `dall-e-3` 支持，GPT Image 模型默认原样执行 | 主体模型**全自动精修重写提示词**，并在 `revised_prompt` 中结构化返回 |
| **遮罩重绘 (Mask)** | `multipart/form-data` 上传 PNG Mask | JSON 请求体中通过 `input_image_mask`（`file_id` / `image_url`）灵活指定 |
| **计费构成** | 仅计图像生成/编辑 Token 费用 | 主体模型输入输出文本 Token + 图像生成/编辑 Token |

---

## 2. 基础信息与认证约定

### 2.1 服务接入点 (Base URL)

```http
https://api.openai.com/v1
```

### 2.2 鉴权与组织认证 (Authentication & Verification)

所有 API 请求均须在 HTTP 请求头（Headers）中提供有效的 Bearer Token：

```http
Authorization: Bearer $OPENAI_API_KEY
Content-Type: application/json
```

> ⚠️ **开发者组织认证要求（API Organization Verification）**：
>
> 为防止滥用并确保模型安全合规，调用底层 GPT Image 系列模型（包括 `gpt-image-2`、`gpt-image-1.5`、`gpt-image-1`、`gpt-image-1-mini`）前，开发者组织必须在 [OpenAI Developer Console - Organization](https://platform.openai.com/settings/organization/general) 中完成实名与资质认证。

### 2.3 支持图像生成工具的主体模型一览

在 Responses API 中，顶层 `model` 字段应传入支持 Hosted Tool 的主体大模型，底层会自动路由到对应的 GPT Image 图像渲染引擎：

- **旗舰推荐**：`gpt-5.6`、`gpt-5.5`
- **高性价比模型**：`gpt-5.4-mini`、`gpt-5.4-nano`、`gpt-5.2`、`gpt-5`、`gpt-5-nano`
- **深度推理模型**：`o3`
- **经典 GPT-4 系列**：`gpt-4.1`、`gpt-4.1-mini`、`gpt-4.1-nano`、`gpt-4o`、`gpt-4o-mini`

---

## 3. 接口规范：创建模型响应 (POST /v1/responses)

- **HTTP 方法**：`POST`
- **请求路径**：`/v1/responses`
- **Content-Type**：`application/json`

### 3.1 请求体参数体系 (Request Body Parameters)

#### 3.1.1 核心顶级参数

| 参数字段 | 类型 | 是否必填 | 默认值 | 详细说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`model`** | `string` | **是** | - | 主体大模型 ID，例如 `"gpt-5.6"`、`"gpt-5.5"`、`"gpt-4o"`。 |
| **`input`** | `string` \| `array` | 否 | `null` | 会话输入内容。可以是纯文本字符串，也可以是由多模态输入消息（`input_text`、`input_image`、`input_file`、`image_generation_call`）构成的对象列表。 |
| **`tools`** | `array<object>` | **是 (生图需配)** | `[]` | 允许模型调用的工具列表。生图场景必须包含 `{"type": "image_generation", ...}` 配置对象。 |
| **`tool_choice`** | `string` \| `object` | 否 | `"auto"` | 工具调用策略：<br>• `"auto"`：模型自主决策是否调用生图工具<br>• `{"type": "image_generation"}`：强制模型执行图像生成工具<br>• `"none"`：禁止调用任何工具<br>• `"required"`：强制必须调用至少一个工具 |
| **`previous_response_id`** | `string` | 否 | `null` | 前一轮响应的全局唯一 ID（形如 `resp_...`）。用于在无须重新传输历史图片的情况下实现多轮图像编辑。与 `conversation` 互斥。 |
| **`conversation`** | `object` \| `string` | 否 | `null` | 绑定的持久化会话对象，例如 `{"id": "conv_xxx"}`。 |
| **`instructions`** | `string` | 否 | `null` | 系统级指令（System Prompt）。在使用 `previous_response_id` 时，系统指令不会被隐式继承，方便动态重置或覆盖角色设定。 |
| **`stream`** | `boolean` | 否 | `false` | 是否开启 Server-Sent Events (SSE) 流式传输。 |
| **`stream_options`** | `object` | 否 | `null` | 流式传输扩展选项，例如 `{"include_usage": true}`。 |
| **`temperature`** | `number` | 否 | `1.0` | 采样温度（0 ~ 2.0）。控制文本提示词重写及对话生成的随机性。 |
| **`max_output_tokens`** | `integer` | 否 | `null` | 响应允许生成的最大 Token 数量上限。 |
| **`store`** | `boolean` | 否 | `true` | 是否在 OpenAI 端持久化存储当前响应以支持后续通过 ID 检索。 |
| **`metadata`** | `map<string, string>` | 否 | `{}` | 键值对元数据字典（最多 16 对，Key $\le$ 64 字符，Value $\le$ 512 字符）。 |

---

#### 3.1.2 `image_generation` 工具参数详细规范 (`tools[i]`)

当 `tools` 包含 `{"type": "image_generation"}` 时，可配置以下完整的工具级属性：

```json
{
  "type": "image_generation",
  "action": "auto",
  "quality": "high",
  "size": "1536x1024",
  "output_format": "png",
  "output_compression": 100,
  "background": "auto",
  "partial_images": 2,
  "moderation": "auto",
  "input_fidelity": "high",
  "input_image_mask": {
    "file_id": "file-xyz..."
  }
}
```

| 参数字段 | 类型 | 是否必选 | 默认值 | 取值范围与规格说明 |
| :--- | :--- | :---: | :--- | :--- |
| **`type`** | `string` | **是** | `"image_generation"` | 工具类型标识符，固定为 `"image_generation"`。 |
| **`action`** | `string` | 否 | `"auto"` | 图像操作行为意图：<br>• `"auto"`：模型根据对话上下文与提示词智能判断从零生成还是修改历史图片<br>• `"generate"`：强制作为**全新生图**处理（忽略上下文已有图片）<br>• `"edit"`：强制作为**图像编辑/修改**处理（上下文中必须有图像输入或历史图，否则抛出错误） |
| **`quality`** | `string` | 否 | `"auto"` | 图像渲染质量等级：<br>• `"low"`：草图极速渲染，延迟与 Token 消耗极低<br>• `"medium"`：标准平衡画质<br>• `"high"`：高清精细渲染（推荐商用大图）<br>• `"auto"`：由模型根据提示词内容自动适配 |
| **`size`** | `string` | 否 | `"auto"` | 图像分辨率与尺寸规格：<br>• **标准常用枚举**：`"1024x1024"`（方形）、`"1536x1024"`（横屏）、`"1024x1536"`（竖屏）、`"auto"`<br>• **任意自定义分辨率**（`gpt-image-2`）：支持任意形如 `"{width}x{height}"` 字符串（如 `"2048x1152"`、`"3840x2160"`）。宽高需满足：**两边均为 16 的倍数、长宽比在 1:3 至 3:1 之间、总像素介于 655,360 至 8,294,400**。 |
| **`output_format`** | `string` | 否 | `"png"` | 生成图像的数据编码格式：<br>• `"png"`：无损画质（默认）<br>• `"jpeg"`：极速编码与较小体积（推荐对延迟敏感的应用）<br>• `"webp"`：现代高压缩比网页格式 |
| **`output_compression`** | `integer` | 否 | `100` | 图像压缩比例（取值 `0 ~ 100`）。仅在 `output_format` 为 `"jpeg"` 或 `"webp"` 时生效。 |
| **`background`** | `string` | 否 | `"auto"` | 背景透明度模式：<br>• `"auto"`：模型根据主体自动推导最适背景<br>• `"opaque"`：实体不透明背景<br>• `"transparent"`：透明背景（注：`gpt-image-2` 暂不支持透明背景，请求会失败；早期模型输出格式须为 `png`/`webp`） |
| **`partial_images`** | `integer` | 否 | `0` | 在流式（`stream: true`）模式下返回的中间渐进式草图数量。取值范围：`0 ~ 3`。设为 0 时仅在最终完成时下发成图。每张中间草图额外消耗 100 输出 Tokens。 |
| **`moderation`** | `string` | 否 | `"auto"` | 内容安全审查过滤严格级别：<br>• `"auto"`：标准安全合规策略（默认）<br>• `"low"`：低限制审查模式 |
| **`input_fidelity`** | `string` | 否 | `null` | 图像参考编辑保真度控制（`"high"` \| `"low"`）。适用于 `gpt-image-1` 与 `gpt-image-1.5`；`gpt-image-2` 默认全流程采用高保真处理，该参数可省略。 |
| **`input_image_mask`** | `object` | 否 | `null` | 局部重绘遮罩配置对象。支持传入 `{"file_id": "file-xxx"}` 或 `{"image_url": "data:image/png;base64,..."}`。必须包含 Alpha 透明通道，尺寸与参考图一致。 |
| **`model`** | `string` | 否 | `null` | 底层指定的图像模型。可选 `"gpt-image-1.5"`、`"gpt-image-1"`、`"gpt-image-1-mini"`。不传时系统默认使用最新一代引擎（如 `gpt-image-2`）。 |

---

#### 3.1.3 多模态输入数据结构 (`input`)

Responses API 提供了高度灵活的多模态输入体系。`input` 支持以下三种输入形态：

##### 1. 简易纯文本字符串输入
```json
{
  "model": "gpt-5.6",
  "input": "生成一只穿宇航服在火星表面漫步的柴犬插画",
  "tools": [{"type": "image_generation"}]
}
```

##### 2. 结构化多模态消息列表输入
```json
{
  "model": "gpt-5.6",
  "input": [
    {
      "role": "user",
      "content": [
        {
          "type": "input_text",
          "text": "基于以下参考图，生成一个包含所有商品的精美礼品篮包装图"
        },
        {
          "type": "input_image",
          "image_url": "https://example.com/item1.png",
          "detail": "auto"
        },
        {
          "type": "input_image",
          "image_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg...",
          "detail": "auto"
        },
        {
          "type": "input_image",
          "file_id": "file-9AbC123DeFgHiJkLmNoPqRsT",
          "detail": "auto"
        }
      ]
    }
  ],
  "tools": [{"type": "image_generation"}]
}
```

##### 3. 显式传递历史生图对象（跨会话/无状态编辑）
```json
{
  "model": "gpt-5.6",
  "input": [
    {
      "role": "user",
      "content": [{"type": "input_text", "text": "画一只戴橙色围巾的水獭"}]
    },
    {
      "type": "image_generation_call",
      "id": "ig_67ccf4c63cd08190887ef6464ba5681609504fb6872380d7",
      "status": "completed",
      "result": "iVBORw0KGgoAAAANSUhEUg..."
    },
    {
      "role": "user",
      "content": [{"type": "input_text", "text": "把围巾换成红色的，背景加上飘落的雪花"}]
    }
  ],
  "tools": [{"type": "image_generation"}]
}
```

---

## 4. 响应数据模型 (Response Object Schema)

当请求成功处理后，API 返回标准的 `response` 顶层对象。

### 4.1 核心响应字段说明

```json
{
  "id": "resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654",
  "object": "response",
  "created_at": 1741290958,
  "status": "completed",
  "completed_at": 1741290962,
  "model": "gpt-5.6",
  "output": [
    {
      "id": "ig_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654",
      "type": "image_generation_call",
      "status": "completed",
      "revised_prompt": "A photorealistic portrait of a fluffy gray tabby cat gently hugging an adorable brown river otter wearing a cozy vibrant orange woolen scarf. Warm studio lighting, hyper-detailed fur textures, 8k resolution.",
      "result": "iVBORw0KGgoAAAANSUhEUgAAA+gAAAPoCAYAAAB5aNmpAAAAAXNSR0IArs4c6Q..."
    },
    {
      "id": "msg_67c9fdd012ab8190ba82116e33fb28c507b8b0ad4e5eb654",
      "type": "message",
      "status": "completed",
      "role": "assistant",
      "content": [
        {
          "type": "output_text",
          "text": "已经为您生成了灰斑猫拥抱戴着橙色围巾小水獭的超清图像！"
        }
      ]
    }
  ],
  "parallel_tool_calls": true,
  "previous_response_id": null,
  "tools": [
    {
      "type": "image_generation",
      "action": "auto",
      "quality": "high",
      "size": "1024x1024",
      "output_format": "png"
    }
  ],
  "tool_choice": "auto",
  "usage": {
    "input_tokens": 142,
    "input_tokens_details": {
      "cached_tokens": 0,
      "cache_write_tokens": 0
    },
    "output_tokens": 4185,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 4327
  },
  "error": null,
  "incomplete_details": null,
  "metadata": {}
}
```

### 4.2 结构体字段详细定义

| 字段名称 | 类型 | 说明 |
| :--- | :--- | :--- |
| **`id`** | `string` | 响应唯一标识符（前缀 `resp_`）。用于在下一轮请求中通过 `previous_response_id` 继承上下文。 |
| **`object`** | `string` | 对象类型，固定为 `"response"`。 |
| **`created_at`** | `integer` | 响应创建的 Unix 秒级时间戳。 |
| **`status`** | `string` | 响应状态：`"completed"`（完成）、`"in_progress"`（处理中）、`"failed"`（失败）、`"cancelled"`（取消）、`"incomplete"`（未完全生成）。 |
| **`model`** | `string` | 处理本次响应的主体模型名称。 |
| **`output`** | `array<object>` | 生成的输出项列表。可能包含 `image_generation_call`（生图结果）以及 `message`（文本回复）。 |
| **`output[].type`** | `string` | 输出项类型：<br>• `"image_generation_call"`：图像生成工具调用结果<br>• `"message"`：常规文本消息 |
| **`output[].id`** | `string` | 工具调用 ID（前缀 `ig_`）或消息 ID（前缀 `msg_`）。 |
| **`output[].status`** | `string` | 当前工具调用的状态：`"in_progress"`、`"generating"`、`"completed"`、`"failed"`。 |
| **`output[].revised_prompt`** | `string` | **提示词精修结果**。主体大模型为获得更优画质自动扩展重写后的具体生图描述词。 |
| **`output[].result`** | `string` | **图像 Base64 编码字符串**。解码后即为标准图像文件二进制流。 |
| **`usage`** | `object` | 资源消耗量统计：包含输入 Token（`input_tokens`）、输出 Token（`output_tokens`，含图像渲染消耗）以及总计 Token（`total_tokens`）。 |

---

## 5. 流式传输与 Server-Sent Events (SSE) 协议

当请求中携带 `"stream": true` 且工具配置了 `"partial_images": 1~3` 时，服务器将通过 SSE 实时向客户端推送渐进式图像草图与状态事件。

### 5.1 流式事件时序模型

```
[客户端发起 POST /v1/responses (stream=true, partial_images=2)]
  │
  ├──► event: response.created                      (响应对象建立)
  ├──► event: response.in_progress                  (进入处理流)
  ├──► event: response.output_item.added            (添加 image_generation_call 项)
  │
  ├──► event: response.image_generation_call.partial_image (草图 0，低分辨率轮廓)
  ├──► event: response.image_generation_call.partial_image (草图 1，中等细节预览)
  │
  ├──► event: response.output_item.done             (生图工具执行结束，携带最终高清 Base64)
  ├──► event: response.completed                    (完整响应流交付完毕)
```

### 5.2 核心流式事件详细载荷

#### 1. 中间渐进草图事件 (`response.image_generation_call.partial_image`)
```http
event: response.image_generation_call.partial_image
data: {
  "type": "response.image_generation_call.partial_image",
  "item_id": "ig_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654",
  "output_index": 0,
  "partial_image_index": 0,
  "partial_image_b64": "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhzHz..."
}
```

#### 2. 输出项完成事件 (`response.output_item.done`)
```http
event: response.output_item.done
data: {
  "type": "response.output_item.done",
  "output_index": 0,
  "item": {
    "id": "ig_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654",
    "type": "image_generation_call",
    "status": "completed",
    "revised_prompt": "A gorgeous image of a river made of white owl feathers...",
    "result": "iVBORw0KGgoAAAANSUhEUgAAA+gAAAPoCAYAAAB5aNmpAAAAAXNSR0IArs4c6Q..."
  }
}
```

#### 3. 最终完成事件 (`response.completed`)
```http
event: response.completed
data: {
  "type": "response.completed",
  "response": {
    "id": "resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654",
    "object": "response",
    "status": "completed",
    "model": "gpt-5.6",
    "output": [
      {
        "id": "ig_67c9fdcf37fc8190ba82116e33fb28c507b8b0ad4e5eb654",
        "type": "image_generation_call",
        "status": "completed",
        "result": "iVBORw0KGgoAAAANSUhEUgAAA+g..."
      }
    ],
    "usage": {
      "input_tokens": 58,
      "output_tokens": 4360,
      "total_tokens": 4418
    }
  }
}
```

---

## 6. 核心业务场景与 REST 请求示例

### 6.1 场景一：标准文本到图像生成 (Text-to-Image)

#### cURL (REST 标准请求)
```bash
curl -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "input": "生成一张赛博朋克霓虹雨夜街道上的机械猫插画，电影质感，特写镜头",
    "tools": [
      {
        "type": "image_generation",
        "quality": "high",
        "size": "1536x1024",
        "output_format": "jpeg",
        "output_compression": 90
      }
    ],
    "tool_choice": {"type": "image_generation"}
  }'
```

---

### 6.2 场景二：基于 `previous_response_id` 的连续多轮图像迭代编辑

#### 第一轮：生成基础画面
```bash
curl -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "input": "画一只可爱的灰斑猫抱着一只戴橙色围巾的小水獭",
    "tools": [{"type": "image_generation"}]
  }'
```
*记录返回的响应 ID：`resp_first_round_123`*

#### 第二轮：无缝追加修改指令（换画风/增减元素）
```bash
curl -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "previous_response_id": "resp_first_round_123",
    "input": "让画面变得完全写实逼真，光线改为温暖的落日余晖，背景添加一扇木质窗户",
    "tools": [
      {
        "type": "image_generation",
        "action": "edit",
        "quality": "high"
      }
    ]
  }'
```

---

### 6.3 场景三：多图融合参考生成 (Multi-image Reference Synthesis)

利用 Responses API 的多模态输入，传入多张已存在的商品图/材质图，生成统一构图的新图像。

#### 步骤 1：使用 Files API 上传参考图
```bash
curl -X POST "https://api.openai.com/v1/files" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -F "file=@bath_bomb.png" \
  -F "purpose=vision"
```
*获得文件 ID：`file-bathBombId123`*

#### 步骤 2：在 Responses API 中组合 URL、Base64 与 File ID 发送请求
```bash
curl -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "生成一个纯白背景下的高档礼品篮，上面系着丝带，篮中必须包含所有参考图中的沐浴露、手工皂和泡泡浴球，整体风格写实自然。"
          },
          {
            "type": "input_image",
            "image_url": "https://example.com/soap.png"
          },
          {
            "type": "input_image",
            "file_id": "file-bathBombId123"
          }
        ]
      }
    ],
    "tools": [
      {
        "type": "image_generation",
        "action": "generate",
        "quality": "high",
        "size": "1024x1024"
      }
    ]
  }'
```

---

### 6.4 场景四：遮罩局部重绘 (Masked Inpainting)

通过上传原图与包含 Alpha 通道的 Mask 遮罩图，精确重绘指定区域。

```bash
curl -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "input": [
      {
        "role": "user",
        "content": [
          {
            "type": "input_text",
            "text": "在同一间阳光洒满的室内休息区泳池中，将泳池局部替换为一个粉红色的火烈鸟充气浮排"
          },
          {
            "type": "input_image",
            "file_id": "file-sunlitLoungeOriginalId"
          }
        ]
      }
    ],
    "tools": [
      {
        "type": "image_generation",
        "quality": "high",
        "input_image_mask": {
          "file_id": "file-maskWithAlphaChannelId"
        }
      }
    ]
  }'
```

> 📌 **Mask 遮罩规范要求**：
> 1. 原图与 Mask 尺寸与宽高比必须**完全一致**，文件小于 50MB。
> 2. Mask 图像必须包含 **Alpha 透明通道**（RGBA），模型会根据 Alpha 透明区域确定重绘指引范围。

---

### 6.5 场景五：流式渐进式出图 (Streaming with Partial Images)

```bash
curl -N -X POST "https://api.openai.com/v1/responses" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5.6",
    "input": "绘制一条由白色猫头鹰羽毛构成的壮丽河流，穿行在静谧的冬日雪景森林中",
    "stream": true,
    "tools": [
      {
        "type": "image_generation",
        "partial_images": 2,
        "quality": "high",
        "size": "1536x1024"
      }
    ]
  }'
```

---

## 7. 分辨率约束与 Token 计费模型

### 7.1 分辨率规格与约束规则 (`gpt-image-2`)

`gpt-image-2` 摆脱了传统固定尺寸的限制，支持数千种灵活分辨率。请求尺寸需严格遵循以下 4 项硬性约束：

1. **最大单边限制**：宽和高的最大值不得超过 **`3840px`**。
2. **步长对齐**：宽（Width）和高（Height）必须均能被 **`16` 整除**（$W \pmod{16} = 0,\ H \pmod{16} = 0$）。
3. **长宽比范围**：长边与短边比例不得超过 **`3:1`**（即宽高比介于 `1:3` 至 `3:1` 之间）。
4. **总像素范围**：总像素数需介于 **`655,360` 像素**（约 0.65MP）至 **`8,294,400` 像素**（4K UHD）之间。

#### 常用分辨率与预设分类

| 分辨率预设 | 尺寸规格 (W × H) | 纵横比 (Aspect Ratio) | 类型属性 | 推荐用途 |
| :--- | :---: | :---: | :---: | :--- |
| **标准方形** | `1024 x 1024` | 1:1 | 标准预设 | 头像、产品展示、通用插图（出图速度最快） |
| **横向宽屏** | `1536 x 1024` | 3:2 | 标准预设 | 电脑壁纸、横版海报、风景插画 |
| **纵向肖像** | `1024 x 1536` | 2:3 | 标准预设 | 手机壁纸、人物肖像、信息流海报 |
| **2K 高清方形** | `2048 x 2048` | 1:1 | 2K 级 | 超精细商品图、印刷物料 |
| **2K 电影宽屏** | `2048 x 1152` | 16:9 | 2K 级 | 电影分镜、游戏概念场景 |
| **4K 超清宽屏** | `3840 x 2160` | 16:9 | 4K 级 (实验性) | 巨幅高清广告、桌面 4K 视网膜壁纸 |
| **4K 超清竖屏** | `2160 x 3840` | 9:16 | 4K 级 (实验性) | 4K 移动端全屏海报 |
| **自动适配** | `"auto"` | 动态 | 自动 | 由大模型依据提示词语义自动计算最佳长宽比 |

---

### 7.2 费用核算与 Token 消耗公式

在 Responses API 中，图像调用的计费是**主体模型对话 Token 与图像生成 Token 的总和**：

$$\text{单次请求总成本} = \text{输入文本 Tokens} + \text{输入参考图 Tokens (Vision)} + \text{图像输出渲染 Tokens} + (\text{流式草图张数} \times 100\ \text{Tokens})$$

#### `gpt-image-2` 图像输出基准费用与 Token 对照表

| 画质 (Quality) | 方形 (1024 × 1024) | 纵向肖像 (1024 × 1536) | 横向宽屏 (1536 × 1024) | 适用阶段 |
| :--- | :---: | :---: | :---: | :--- |
| **`low`** | **$0.006** (196 Tokens) | **$0.005** (160 Tokens) | **$0.005** (160 Tokens) | 快速概念验证、草图探索、多轮对话预览 |
| **`medium`** | **$0.053** (1056 Tokens) | **$0.041** (820 Tokens) | **$0.041** (820 Tokens) | 社交媒体发布、常规应用展示（默认平衡点） |
| **`high`** | **$0.211** (4160 Tokens) | **$0.165** (3280 Tokens) | **$0.165** (3280 Tokens) | 最终成品物料交付、印刷画册、超写实特写 |

> 💡 **非对称分辨率成本提示**：
> 某些非方形分辨率（如 `1536x1024`）在特定质量配置下消耗的 Token 数量可能少于同等画质下的方形 `1024x1024` 分辨率。

---

## 8. 内容审查 (Moderation) 与生产级错误处理

### 8.1 安全审查拦截数据结构 (`moderation_blocked`)

当用户的提示词或模型生成的画面触发合规策略时，API 将返回带有细粒度分类的错误对象：

```json
{
  "error": {
    "type": "image_generation_user_error",
    "code": "moderation_blocked",
    "message": "The request was blocked by OpenAI content moderation policies.",
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

#### `moderation_details` 字段剖析

- **`moderation_stage`**：
  - `"input"`：拦截发生在**输入阶段**（用户的 Prompt、输入文本或参考图存在违规）。建议引导用户修改描述词。
  - `"output"`：拦截发生在**输出阶段**（模型生成的画面触碰了安全红线）。建议提示用户更换描述风格后重新尝试。
  - `"unknown"`：极少数情况下的未知归属阶段。
- **`categories`**：拦截命中的公共风险类别列表，包含 `"harassment"`（骚扰）、`"hate"`（仇恨）、`"self-harm"`（自残）、`"sexual"`（色情/成人）、`"violence"`（暴力）等。

---

### 8.2 错误状态码与重试决策矩阵

| HTTP 状态码 | Error Code / Type | 根因分析 | 生产端推荐应对策略 |
| :---: | :--- | :--- | :--- |
| **`400`** | `moderation_blocked` | 内容安全审查拦截 | **禁止自动重试**。根据 `moderation_stage` 区分是提示词违规还是生成结果违规，向用户展示友好修改建议。 |
| **`400`** | `image_generation_user_error` | 参数非法（如强设 `action: "edit"` 但无图片输入；或尺寸不满足 16 倍数约束） | **禁止自动重试**。校验请求参数有效性与分辨率约束。 |
| **`401`** | `invalid_api_key` | API Key 缺失、失效或格式错误 | 检查环境变量与 Bearer Token 注入逻辑。 |
| **`403`** | `unverified_organization` | 开发者组织未完成实名与安全验证 | 前往 OpenAI 开发者控制台完成 Organization Verification。 |
| **`429`** | `rate_limit_exceeded` / `insufficient_quota` | 超出并发速率限制（TPM/RPM）或账户余额不足 | 采用**指数退避算法（Exponential Backoff with Jitter）**进行重试；若为欠费则告警并充值。 |
| **`500 / 503`** | `server_error` / `service_unavailable` | OpenAI 服务端瞬时波动或 GPU 渲染节点超时 | 进行有限次数的指数退避自动重试（推荐 3 次）。 |

---

### 8.3 生产环境全功能调用封装代码参考 (TypeScript / Python)

#### TypeScript / Node.js 生产环境封装
```typescript
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface GenerateImageOptions {
  prompt: string;
  previousResponseId?: string;
  size?: string;
  quality?: "low" | "medium" | "high" | "auto";
  action?: "auto" | "generate" | "edit";
}

export async function generateOrEditImage(options: GenerateImageOptions) {
  try {
    const response = await openai.responses.create({
      model: "gpt-5.6",
      previous_response_id: options.previousResponseId,
      input: options.prompt,
      tools: [
        {
          type: "image_generation",
          action: options.action ?? "auto",
          quality: options.quality ?? "high",
          size: options.size ?? "1536x1024",
          output_format: "png",
        },
      ],
      tool_choice: { type: "image_generation" },
    });

    // 提取图像生成工具调用项
    const imageCalls = response.output.filter(
      (item): item is OpenAI.Responses.ResponseOutputItem.ImageGenerationCall =>
        item.type === "image_generation_call"
    );

    if (imageCalls.length === 0 || !imageCalls[0].result) {
      throw new Error("模型未返回任何图像数据");
    }

    return {
      responseId: response.id,
      imageBuffer: Buffer.from(imageCalls[0].result, "base64"),
      revisedPrompt: imageCalls[0].revised_prompt,
      usage: response.usage,
    };
  } catch (error: any) {
    if (error?.code === "moderation_blocked") {
      const details = error?.error?.moderation_details;
      const stage = details?.moderation_stage;
      const categories = (details?.categories || []).join(", ");
      
      const userHint =
        stage === "input"
          ? `您的描述词触发了安全审查（类别: ${categories}），请修改提示词中的敏感或不当词汇。`
          : "生成的画面未通过安全检查，请尝试调整提示词语境或画面构图。";

      console.error("[安全拦截]", { stage, categories, requestId: error?.requestID });
      throw new Error(userHint);
    }

    console.error("[生图异常]", error);
    throw error;
  }
}
```

#### Python 生产环境封装
```python
import base64
import os
from typing import Optional, Dict, Any
from openai import OpenAI, BadRequestError

client = OpenAI(api_key=os.environ.get("OPENAI_API_KEY"))

def generate_or_edit_image(
    prompt: str,
    previous_response_id: Optional[str] = None,
    size: str = "1536x1024",
    quality: str = "high",
    action: str = "auto"
) -> Dict[str, Any]:
    try:
        response = client.responses.create(
            model="gpt-5.6",
            previous_response_id=previous_response_id,
            input=prompt,
            tools=[{
                "type": "image_generation",
                "action": action,
                "quality": quality,
                "size": size,
                "output_format": "png"
            }],
            tool_choice={"type": "image_generation"}
        )

        image_calls = [
            item for item in response.output
            if getattr(item, "type", None) == "image_generation_call"
        ]

        if not image_calls or not image_calls[0].result:
            raise RuntimeError("未获取到生成的图像数据")

        image_bytes = base64.b64decode(image_calls[0].result)

        return {
            "response_id": response.id,
            "image_bytes": image_bytes,
            "revised_prompt": getattr(image_calls[0], "revised_prompt", None),
            "usage": response.usage
        }

    except BadRequestError as e:
        if e.code == "moderation_blocked":
            body = e.body if isinstance(e.body, dict) else {}
            details = body.get("moderation_details", {})
            stage = details.get("moderation_stage", "unknown")
            cats = ", ".join(details.get("categories", []))

            hint = "提示词未通过安全合规审查，请调整敏感描述。" if stage == "input" else "生成的画面触碰了安全策略，请更换风格重新生成。"
            print(f"[内容审查拦截] 阶段: {stage}, 类别: {cats}, RequestID: {e.request_id}")
            raise PermissionError(hint) from e
        raise
```

---

## 9. 响应生命周期管理 API

除了 `POST /v1/responses` 创建响应之外，OpenAI 还提供了一组完整的 REST 端点用于管理 Responses 对象的全生命周期：

### 9.1 查询响应详情 (GET /v1/responses/{response_id})
```http
GET https://api.openai.com/v1/responses/resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654
Authorization: Bearer $OPENAI_API_KEY
```

### 9.2 取消正在进行的生成 (POST /v1/responses/{response_id}/cancel)
```http
POST https://api.openai.com/v1/responses/resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654/cancel
Authorization: Bearer $OPENAI_API_KEY
```

### 9.3 删除历史响应记录 (DELETE /v1/responses/{response_id})
```http
DELETE https://api.openai.com/v1/responses/resp_67c9fdcecf488190bdd9a0409de3a1ec07b8b0ad4e5eb654
Authorization: Bearer $OPENAI_API_KEY
```

---

## 10. 附录：主流编程语言客户端速查

### cURL 极简单行模板
```bash
curl -s -X POST https://api.openai.com/v1/responses \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-5.6","input":"Draw a majestic snowy owl soaring over pines","tools":[{"type":"image_generation"}]}' \
  | jq -r '.output[] | select(.type=="image_generation_call") | .result' \
  | base64 --decode > output.png
```
