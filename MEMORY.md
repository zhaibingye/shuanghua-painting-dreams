# 项目记忆

- 图片、视频与视频续写参数以 `backend/app/schemas/` 的 Pydantic 模型为源，`domain/options.py` 注册各格式。运行根目录命令 `npm run api:generate --prefix frontend` 同步 OpenAPI、TypeScript 类型和 `provider-catalog.json`；前端 `api/options.ts` 统一提供字段、默认值和提交校验，表单直接读取生成目录，不再请求运行时元数据。`test_provider_catalog.py` 检查生成文件是否过期，修改契约后必须重新生成。
- OpenAI Images 与 Responses 是两个真实端点，保留两个 API 格式；图片输出字段共用基础模型和一套表单。普通 Images 生成与参考图/遮罩/标注编辑走上游 SSE（JSON / multipart）；GPT Image 请求不发送旧 `response_format`，仅 JPEG / WebP 发送压缩参数，`inputFidelity=auto` 表示省略该字段。
- GPT Image 2.6（2026-11-05 官方 image-generation 指南）：Images 支持 complexity、markup、SVG、GIF。SVG / GIF 只能文生图，必须用非流式上游请求，再桥接为本站 completed / done 事件；SVG 限 n=1，MIME 为 image/svg+xml，下载扩展名 svg；可选 svg.model / svg.reasoning.effort 仅在填写编写模型时发送，需上游开通模型选择。GIF 帧尺寸不应用静态图片的最小总像素限制；帧数 2～64、时长 20～2000ms 取自 2.6 指南，部分 API 参考页仍列旧预览 2～16 帧。模型的动画总像素预算留给上游校验。markup 是与第一张输入图同尺寸的独立透明 PNG，不能与 mask 共用；前端复用绘图编辑器产生透明图层。不要把这些新增 Images 参数直接发给 Responses。
- Gemini 当前采用 `/v1beta/models/{model}:generateContent` 与 `generationConfig.imageConfig`，思考等级使用标准大写枚举。2026-11-04 官方 GenerateContent 文档也列有 `responseFormat`；本项目选择统一使用 `imageConfig`，不要据此推断另一个字段无效。v2 设置里的 High/Low/Off 在迁移时映射为 HIGH/LOW/MINIMAL。
- 字节图片和视频按用户明确要求自动选协议，统一规则在 `providers/bytedance_endpoints.py`：完整主机名 `ark.cn-beijing.volces.com`、`ark.ap-southeast.bytepluses.com` 使用官方 `/api/v3`；其他主机使用 `/v1`。支持服务根地址以及已有 `/v1`、`/api/v3` 后缀，规范化版本并保留自定义代理前缀。SHAPI 设置填根域名或 `/v1`，不再添加旧 `/doubao` 插件前缀；不要靠失败后切协议重试，避免重复创建付费任务。
- 字节图片：官方文生图、编辑共用 `/api/v3/images/generations`，请求 Base64；非官方分别使用 `/v1/images/generations`、`/v1/images/edits`，请求 URL 并设 `n=1`，组图数量仍通过 sequential 参数控制。后台用不携带 API Key 的媒体下载器将 URL 统一转成本地 Base64。已知 Seedream 家族按文档校验能力，Endpoint ID / 自定义别名交上游确认。
- 2026-11-04 SHAPI 实测 Seedream 5.0 pro：`/v1/images/generations` 和供应商原生 `/doubao/api/v3/images/generations` 的单张 1K、`response_format=url` 均成功。`/v1` 仅返回 created/data，不能要求原生 model/usage/尺寸字段；兼容层的 `n` 只能为 1，多图用组图参数。原生曾拒绝 Base64，未重新确认后续支持性。早期任务查找错误后复测恢复，不能总结为永久不支持。更新后的本站后端已实测完成 `/v1` 生图、下载签名图片和返回 JPEG Base64 的完整链路。
- 字节视频：官方用 `/api/v3/contents/generations/tasks`，非官方用 `/v1/videos`；兼容请求使用顶层 model/prompt/seconds 和 metadata 中的原生素材及选项。兼容状态 queued/in_progress/completed 转为本站 queued/processing/succeeded，完成媒体读取 `metadata.url`，不依赖要求 API Key 的视频 content URL。兼容服务应提供可访问的视频 URL。SHAPI 的 `doubao-seedance-2-0-260128-se` 已实际完成 4 秒任务并验证 MP4；新后端也已成功查询该完成任务。其 `/doubao/...` 查询不一定能读取经其他协议创建的任务，不要混用路径。
- 图片下载地址常带签名 Query，必须区分 `validate_base_url`（禁止 Query）与 `validate_http_url`（允许请求/素材 Query）。保留签名的原始编码和顺序，不把下载地址重新当成 Base URL 规范化；仍需校验公网地址和重定向，下载请求不转发 API Key。
- 设置 schema v3 仍使用原 LocalStorage 键 `shuanghua.settings.v2`，从 v2 迁移保留 Key、Base URL、模型和参数。每种格式的 `models` 是模型列表，`modelId` 是默认模型；删除默认项时选列表首项，至少保留一个。独立 Key 的 `null` 表示继承全局，空字符串表示已开启独立 Key 但尚未填写，不应悄悄提升为全局 Key。
- 对话保存连接和所选模型，切换模型应保留输入草稿和附件；切换对话才重置草稿。后台任务使用提交时的请求快照，不依赖之后的模型选择。
- Windows 上启动 Python 工具优先 `uv run python -m ...`。本次环境的 `uv run uvicorn ...` 出现 `Failed to canonicalize script path`，`python -m uvicorn` 可正常启动，Playwright 配置已统一使用模块入口。

- Seedance 模型家族、匹配优先级和能力值统一维护于 `backend/app/domain/seedance.py`，随 `api:generate` 导出到参数目录的 `byteDanceVideoFamilies`，前端直接读取；不要再在前端复制家族表或给已生成的能力值逐层兜底。持久化选项的模型切换归一化仍属于必要边界。
- 视频上游响应在适配器边界通过 Pydantic 模型解析，共用 `providers/base.py` 的 `parse_response` 转为 `invalidUpstreamResponse`；不要把畸形可选字段静默丢弃。字节官方响应仍接受数值字符串；xAI 数值字段保持严格类型。请求构建只补缺省值并校验，模型切换时的参数归一化不再重复放进提交逻辑。
- HTTP 的 JSON、multipart、SSE 和媒体下载共用 `SafeHttpTransport._request`，API 重定向保持同源，媒体下载不带 Key。SSE 按 Content-Type 解析，不再将声称 SSE 的裸 JSON 猜测修复；正确声明的 JSON 响应仍可桥接为图片结果。

- 前端只安装正式 `typescript@7`。Oxlint / oxlint-tsgolint 提供原生类型感知 lint，`scripts/generate-api.ts` 用 json-schema-to-typescript 从 OpenAPI 3.1 的组件生成模型，不依赖旧编译器 API。Pydantic 有默认值的字段在传输类型中可选；`parseOptions` 经 Zod 补齐默认值后返回 `Required` 类型。数组数量由后端与表单校验，不生成固定长度 tuple。
- Vite 8 使用 Rolldown，分包配置采用 `build.rolldownOptions.output.codeSplitting.groups`，不再使用已移除的对象式 `manualChunks`。
- 创建按钮 click 不代表 IndexedDB 写入与 ChatPage 载入完成。E2E 创建辅助函数等待弹窗关闭和消息输入框可见，再操作侧边栏；侧边栏辅助函数用界面断言等待状态，不用固定 sleep 或瞬时检查后静默跳过。
- 模型 ID 允许 `/`（如 `vendor/model`），前后端校验保持一致；JSON 请求原样发送，Gemini URL 对整个模型名做单次路径段编码，不把模型名当作路由层级或重复编码。
- 公网 HTTP 需避免依赖安全上下文 API：本地标识统一用 Nano ID（crypto.getRandomValues），复制使用 clipboard-copy，容量统计不可用时只显示未提供，不阻塞设置或清空数据。E2E 使用 shuanghua.test 映射本地测试服务，断言 isSecureContext=false，不能通过浏览器安全豁免标志验证 HTTP 兼容性。
- PM2 的项目日志目录由 `deploy/pm2/ecosystem.config.cjs` 在加载时创建。部署更新使用 `pm2 restart deploy/pm2/ecosystem.config.cjs --only shuanghua --update-env`；按进程名重启不会重读配置，若目录已不存在，会在应用启动前报日志路径 ENOENT。此时先创建项目 `logs/` 目录即可恢复。
