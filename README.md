# 霜华绘梦

霜华绘梦是一个部署在单机服务器上的多供应商对话式图片、视频创作网页。前端以本地优先方式保存对话、附件、图片 Blob 和视频任务，FastAPI 负责安全地适配不同上游 API。

## 支持格式

### 图片

默认生图协议为 OpenAI Images（Image API，`openaiImage`），所有协议的默认 Base URL 为 `https://www.shapi.vip`。已有的自定义设置和历史对话保留原值；点击「恢复默认设置」可应用新默认值。

- Google Gemini：默认 `nano-banana-2`，原生完整多轮 `contents` 与 `thought_signature` 回传。
- OpenAI Images：默认 `gpt-image-2.5-sunburst`；生成与参考图/遮罩编辑共用参数，均支持上游 SSE 与 0～3 张渐进预览。
- OpenAI Responses：默认主体模型 `gpt-5.6-luna`，`store: false`，通过显式回传本地历史实现无状态多轮生成/编辑，支持 SSE 与渐进预览。
- xAI Image：默认 `grok-imagine-image-2.0`，采用与 OpenAI Images 相同的“最新图片继续编辑”逻辑。
- 字节 Seedream：默认 `doubao-seedream-5-0-pro-260628`，支持文生图、单图/多图参考编辑；支持组图的模型可配置组图模式与最大数量。支持 Base64 图片和 URL 图片，URL 结果由后端安全下载后统一返回并保存到本地；组图部分失败会保留成功图片并显示失败信息。

字节生图按[火山方舟图片生成 API](https://console.volcengine.com/ark/region:cn-beijing/docs/image-generation-api)实现。直连方舟时，将该格式的 Base URL 设为 `https://ark.cn-beijing.volces.com`，填写方舟 Key 与已开通的模型 ID 或 Endpoint ID；API 路径由服务端追加。不同 Seedream 模型的尺寸、参考图数量、组图、输出格式与联网搜索能力不同，已知模型会按文档校验，自定义别名由上游确认能力。

字节图片和视频根据 Base URL 自动选择协议：

| Base URL 主机 | 图片生成 / 编辑 | 视频提交 / 查询 |
| --- | --- | --- |
| `ark.cn-beijing.volces.com`、`ark.ap-southeast.bytepluses.com` | `/api/v3/images/generations` | `/api/v3/contents/generations/tasks[/{id}]` |
| 其他主机，例如 `www.shapi.vip` | `/v1/images/generations`、`/v1/images/edits` | `/v1/videos[/{id}]` |

官方主机按完整主机名匹配。Base URL 可以是服务根地址，也可带 `/v1` 或 `/api/v3`，程序会按所选协议规范化版本路径，保留自定义代理前缀。使用 SHAPI 时填写 `https://www.shapi.vip` 或 `https://www.shapi.vip/v1`，此前用于原生插件的 `/doubao` 前缀应从设置中去掉。非官方生图请求 URL 输出，下载图片时不向图片服务器转发 API Key；兼容视频使用 `seconds` 和 `metadata` 承载参数，将 `queued/in_progress/completed` 映射为本站任务状态，并从 `metadata.url` 读取完成视频地址。兼容服务需要在完成响应中提供可访问的视频 URL。

### 视频

- 字节 Seedance：默认 `doubao-seedance-2-5-260628`。
- xAI Video：默认 `grok-imagine-video-1.5`。

同一视频对话中的普通轮次彼此独立。字节尾帧续写和 xAI 视频扩展必须由用户显式发起。Seedance 2.5 / 2.0 系列请求不会发送不支持的 `service_tier` 和 `seed` 字段。

字节模型参数依据[火山方舟创建视频生成任务 API](https://console.volcengine.com/ark/region:cn-beijing/docs/create-video-generation-task-api)核对（2026-10-21）：

| 模型 | 可用清晰度 | 默认清晰度 |
| --- | --- | --- |
| Seedance 2.5 | 480p、720p、1080p | 720p |
| Seedance 2.0 | 480p、720p、1080p、4k | 720p |
| Seedance 2.0 fast / mini | 480p、720p | 720p |
| Seedance 1.0 pro / pro fast | 480p、720p、1080p | 1080p |

Seedance 2.5 默认自动时长（`-1`，模型选择 4～30 秒）、`adaptive` 比例、开启同步音频、关闭水印和返回尾帧。首帧/首尾帧生成仅允许 `adaptive`。模型名带 `-se` 不会额外开放官方未支持的清晰度。已有设置与历史对话保留；恢复默认设置可应用新模型与默认参数。

## UI 与本地数据

- UI：依据 `文档/DS设计语言.MD` 实现的冷蓝中性 DS Design System。
- 布局：桌面常驻导航、手机模态抽屉、独立消息滚动区、自适应输入区、参数抽屉和设置弹窗。
- 屏幕适配：动态可视高度、软键盘与浏览器栏变化、安全区域、窄屏与横屏；输入区按内容占位，不覆盖消息。
- 阅读体验：跟随最新内容；向上阅读历史时保持位置，可一键回到最新消息。
- 主题：浅色、深色、跟随系统。
- 设置：LocalStorage。
- 每个 API 格式可配置模型列表、默认模型、Base URL 和独立 Key；新对话只需选择格式，对话顶部可切换列表中的模型，切换保留输入草稿。独立 Key 不会改写全局 Key。
- 图片参数只有一套表单：后端 Pydantic 契约同时生成默认值、前端字段与校验规则。OpenAI Images 和 Responses 是不同端点，保留两个格式并共用输出参数定义；Gemini 统一使用 GenerateContent 的 `imageConfig` 与标准思考等级。
- 设置 schema v2 会迁移为 v3，保留原有 Key、连接、默认参数和模型；原单个模型自动成为模型列表首项。
- 对话、消息、图片 Blob、视频任务：IndexedDB。
- Partial Images：由全局内存图片任务管理器按结果索引维护，仅作为临时预览，不持久化、不参与后续编辑。
- 图片任务切换对话后继续运行并写回原对话；刷新或关闭浏览器仍会中断未完成请求。
- 无账号、SQL、Redis、服务端媒体文件存储和云端对话存储。

## 架构

- 前端：React 19 + TypeScript + Vite + Tailwind CSS
- 后端：FastAPI + aiohttp + Pydantic
- Python 管理：uv
- API 类型与图片参数：FastAPI OpenAPI / Pydantic JSON Schema → `openapi-typescript` / 参数目录
- 生产入口：FastAPI 同时提供 `/api/v1/*` 与 Vite 构建产物
- 默认监听：`127.0.0.1:3002`
- 部署：Linux + Nginx/宝塔 + PM2

## 环境要求

- Node.js 20+
- Python 3.12
- uv

## 项目命令

所有命令均在项目根目录执行。

```bash
npm run setup
npm run dev
npm run build
npm start
npm run check
```

修改后端请求模型后运行 `npm run api:generate --prefix frontend`，同时更新 OpenAPI、前端类型及参数目录。不要手工修改 `frontend/src/api/generated/` 中的生成文件。

开发模式：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3002`
- Vite 自动代理 `/api`

`npm run check` 依次执行：

- Pytest
- Ruff lint / format check
- mypy strict
- ESLint
- TypeScript typecheck
- Vitest
- Vite production build

浏览器 E2E：

```bash
npm run e2e
```

## 部署注意事项

Nginx 必须关闭 API 请求与响应缓冲，以确保 SSE 渐进图片立即到达浏览器：

```nginx
proxy_request_buffering off;
proxy_buffering off;
proxy_read_timeout 620s;
proxy_send_timeout 620s;
client_max_body_size 128m;
```

PM2 配置位于 `deploy/pm2/ecosystem.config.cjs`。完整部署说明见 [`deploy/README.md`](deploy/README.md)，系统设计与统一契约位于 `文档/`。
