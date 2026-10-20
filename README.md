# 霜华绘梦

霜华绘梦是一个部署在单机服务器上的多供应商对话式图片、视频创作网页。前端以本地优先方式保存对话、附件、图片 Blob 和视频任务，FastAPI 负责安全地适配不同上游 API。

## 支持格式

### 图片

默认生图协议为 OpenAI Images（Image API，`openaiImage`），所有协议的默认 Base URL 为 `https://www.shapi.vip`。已有的自定义设置和历史对话保留原值；点击「恢复默认设置」可应用新默认值。

- Google Gemini：默认 `nano-banana-2`，原生完整多轮 `contents` 与 `thought_signature` 回传。
- OpenAI Images：默认 `gpt-image-2.5-sunburst`；无参考图的生成使用上游 SSE 与 0～3 张渐进预览，参考图/遮罩编辑使用上游非流式 multipart，并统一转换为本站完成事件。
- OpenAI Responses：默认主体模型 `gpt-5.6-luna`，`store: false`，通过显式回传本地历史实现无状态多轮生成/编辑，支持 SSE 与渐进预览。
- xAI Image：默认 `grok-imagine-image-2.0`，采用与 OpenAI Images 相同的“最新图片继续编辑”逻辑。

### 视频

- 字节 Seedance：默认 `doubao-seedance-2-0-260128`。
- xAI Video：默认 `grok-imagine-video-1.5`。

同一视频对话中的普通轮次彼此独立。字节尾帧续写和 xAI 视频扩展必须由用户显式发起。Seedance 2.0 请求不会发送其不支持的 `service_tier` 字段。

## UI 与本地数据

- UI：依据 `文档/DS设计语言.MD` 实现的冷蓝中性 DS Design System。
- 布局：桌面常驻导航、手机模态抽屉、独立消息滚动区、自适应输入区、参数抽屉和设置弹窗。
- 屏幕适配：动态可视高度、软键盘与浏览器栏变化、安全区域、窄屏与横屏；输入区按内容占位，不覆盖消息。
- 阅读体验：跟随最新内容；向上阅读历史时保持位置，可一键回到最新消息。
- 主题：浅色、深色、跟随系统。
- 设置：LocalStorage。
- 对话、消息、图片 Blob、视频任务：IndexedDB。
- Partial Images：由全局内存图片任务管理器按结果索引维护，仅作为临时预览，不持久化、不参与后续编辑。
- 图片任务切换对话后继续运行并写回原对话；刷新或关闭浏览器仍会中断未完成请求。
- 无账号、SQL、Redis、服务端媒体文件存储和云端对话存储。

## 架构

- 前端：React 19 + TypeScript + Vite + Tailwind CSS
- 后端：FastAPI + aiohttp + Pydantic
- Python 管理：uv
- API 类型：FastAPI OpenAPI → `openapi-typescript`
- 生产入口：FastAPI 同时提供 `/api/v1/*` 与 Vite 构建产物
- 默认监听：`127.0.0.1:3001`
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

开发模式：

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:3001`
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
