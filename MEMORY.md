# 项目记忆

以下记录项目约定和已验证的易错点；上游能力以当前契约、代码及重新核实的文档为准，历史实测不代表长期支持。

## 契约与代码来源

- 图片、视频和续写的基础参数来自 `backend/app/schemas/`，在 `backend/app/domain/options.py` 注册。根目录执行 `npm run api:generate --prefix frontend`，同步 OpenAPI、TypeScript 类型和 `frontend/src/api/generated/provider-catalog.json`；`test_provider_catalog.py` 检查目录与后端契约一致性。前端 `api/options.ts` 提供默认值、字段和基本提交校验，表单读取生成目录，不请求运行时元数据。
- Pydantic 带默认值的字段在传输类型中可选，`parseOptions` 经 Zod 补齐后返回 `Required` 类型。类型由 `frontend/scripts/generate-api.ts` 使用 json-schema-to-typescript 生成，不依赖旧 TypeScript 编译器 API，也不把数组数量限制生成为固定长度 tuple。跨字段和模型能力校验仍需后端执行。
- Seedance 和 Seedream 的家族前缀及能力分别维护于 `backend/app/domain/seedance.py` 与 `backend/app/domain/image_options.py`，由生成目录提供给前端。OpenAI 图片模型能力同样由后端导出，前端尺寸预设和即时校验仍需与 `backend/app/domain/openai_images.py` 同步。
- 模型切换时可归一化已有选项；请求构建只补缺省值并校验，不再静默替换非法输入或重复归一化。安全、存储迁移与并发边界校验具有实际用途，不能作为冗余兜底删除。

## 供应商协议

- OpenAI Images 与 Responses 保留独立 API 格式，共用图片输出基础字段和表单。Images 对话的普通生成与参考图、遮罩、标注编辑走上游 SSE（JSON / multipart）；GPT Image 不发送旧 `response_format`，压缩参数仅用于 JPEG / WebP，`inputFidelity=auto` 表示省略该字段。
- 项目的 GPT Image 2.6 Images 契约支持 complexity、SVG、GIF 和 markup，不能直接套用到 Responses。SVG / GIF 仅文生图，使用非流式上游请求再桥接 completed / done 事件；SVG 限单张，可选编写模型和推理强度仅在填写模型时发送。GIF 帧尺寸不受静态图片最小总像素限制，动画总像素预算交上游校验；帧数、时长等数值以 `schemas/images.py` 和 `test_openai_image_26.py` 为准。markup 是与第一张输入图同尺寸的独立透明 PNG，与 mask 互斥；SVG MIME 使用 `image/svg+xml`，下载扩展名使用 svg。
- Gemini 使用 `/v1beta/models/{model}:generateContent` 和 `generationConfig.imageConfig`，思考等级使用大写枚举。选择 imageConfig 不表示上游不支持 responseFormat。模型 ID 可含 `/`：JSON 原样传递，Gemini 对整个模型名只做一次路径段编码，不能把它拆成路由层级。
- Nano Banana 2.1 延续 GenerateContent 接口，支持 1K / 2K / 4K 和 MINIMAL / MEDIUM / HIGH 思考等级。旧 Nano Banana 2 的 512 档位在切换到 2.1 时需重置。
- 字节图片、视频的协议选择统一在 `providers/bytedance_endpoints.py`：完整主机名 `ark.cn-beijing.volces.com`、`ark.ap-southeast.bytepluses.com` 走官方 `/api/v3`，其他主机走 `/v1`；规范化已有版本后缀并保留代理前缀。SHAPI 填根地址或 `/v1`，不要添加旧 `/doubao` 前缀，也不要失败后切协议重试，避免重复创建付费任务。
- 字节图片：官方生成、编辑共用 `/api/v3/images/generations` 并请求 Base64；兼容接口分别用 `/v1/images/generations`、`/v1/images/edits` 并请求 URL，`n=1`，组图数量通过 sequential 参数控制。URL 由后台无 Key 下载器转为本地 Base64；已知 Seedream 家族按契约校验，Endpoint ID / 自定义别名交上游确认。
- Seedream 5.5 普通生图最多 10 张参考图，支持 1K / 1.5K / 2K 和自定义尺寸，默认 PNG。透明背景需 PNG，官方请求省略 `stream` 和 `sequential_image_generation`。图层拆分只接收一张 PNG / JPEG，提示词可省略，尺寸使用档位或 `auto`，背景字段省略。结果按 `z_index` 排序（0 是底图），输出格式只影响底图，其余图层为 PNG。坐标与富文本 OCR 随图片保存在 `layer` 字段。
- 字节视频：官方用 `/api/v3/contents/generations/tasks`，兼容接口用 `/v1/videos`。兼容请求顶层为 model / prompt / seconds，原生素材和选项放 metadata；queued / in_progress / completed 映射为 queued / processing / succeeded，完成媒体取 `metadata.url`，不依赖需要 API Key 的 content URL。任务创建与查询使用同一协议路径。
- 2026-11-06 核对火山方舟创建视频任务文档：图片支持 Base64 / 公网 URL / `asset://`，无需临时图床；参考音频同样支持 Base64，视频用 URL / 素材 ID。旧的 content 合计 5 项限制已失效，2.0 支持 9 图 / 3 视频 / 3 音频，2.5 支持 30 / 10 / 10；参考模式提示词可选，仅 2.5 可单独参考音频。首尾帧与全模态参考不可混用。素材列表只按换行分隔，逗号属于 Data URL 和签名 URL 的合法内容。

## HTTP 与响应边界

- `SafeHttpTransport._request` 统一处理 JSON、multipart、SSE 和媒体下载。API 重定向限制同源；媒体下载不携带 API Key，仍需检查公网地址和重定向。SSE 按 Content-Type 解析，不猜测修复声称 SSE 的裸 JSON；正确声明的 JSON 图片结果可以桥接。
- 图片适配器产生明确类型的流式事件，最终用量随结束事件传递。Gemini 在适配器中使用图片索引，序列化 SSE 时由路由解析为持久化使用的图片 ID。
- `validate_base_url` 禁止 Query，`validate_http_url` 允许素材、下载地址的签名 Query。保留原始编码与顺序，不把下载 URL 当 Base URL 重新规范化。
- 视频响应通过适配器的 Pydantic 模型解析，共用 `providers/base.py` 的 `parse_response` 转为 `invalidUpstreamResponse`，畸形可选字段不静默丢弃。字节官方数值字段接受数值字符串，xAI 数值字段保持严格类型；未完成任务可以没有视频结果，成功任务必须有有效 URL。

## 本地状态与交互

- 设置继续使用 LocalStorage 键 `shuanghua.settings.v2`。v4 迁移识别沿用旧内置地址及默认模型的配置，升级其新对话默认项，保留模型列表、连接和 Key；Gemini v2 的 High / Low / Off 转为 HIGH / LOW / MINIMAL。每种格式的 `models` 是列表、`modelId` 是默认项；删除默认项改选列表首项，至少保留一个模型。
- 独立 Key 的 `null` 表示继承全局，空字符串表示已开启独立 Key 但未填写，不能退回全局 Key。对话保存连接和选中模型；切换模型保留草稿和附件，切换对话才重置。后台任务使用提交时的请求快照。
- 保存新一轮时在同一 IndexedDB 事务内读取当前对话，保留期间发生的重命名和模型切换。视频提交结果与助手消息在同一事务内更新，已删除对话不会由异步写入恢复。
- 公网 HTTP 不保证安全上下文 API 可用：标识使用 Nano ID，复制使用 clipboard-copy；容量统计不可用时只显示未提供，不阻塞设置或清空数据。E2E 用映射到本机的 `shuanghua.test` 并断言 `isSecureContext=false`，不能使用浏览器安全豁免标志。

## 开发与部署

- Node.js 范围跟随前端锁定依赖的兼容范围，完整测试当前以 jsdom 的要求为下限。Python 3.12 是代码使用泛型和类型别名语法的下限。已在 Node.js 24.15、npm 11.12、uv 0.9.16 搭配 Python 3.12 / 3.15 验证统一检查入口。
- 前端使用正式 TypeScript 7 和 Oxlint 原生类型感知 lint；Vite 8 的分包配置用 `build.rolldownOptions.output.codeSplitting.groups`。Python 启动入口采用 `uv run python -m ...`，项目脚本和 Playwright 配置有现成示例。
- E2E 的创建按钮点击不等于 IndexedDB 写入和页面载入完成：等待弹窗关闭、消息输入框可见后再操作侧边栏；使用界面断言等待状态，避免固定 sleep 和瞬时检查后静默跳过。
- PM2 更新使用 `pm2 restart deploy/pm2/ecosystem.config.cjs --only shuanghua --update-env`，使配置重新加载并创建项目 `logs/`。仅按进程名重启不会执行目录创建；若目录不存在，PM2 会在应用启动前报日志路径 ENOENT，先创建 `logs/` 即可恢复。完整步骤见 `deploy/README.md`。

## 历史实测边界

- 2026-11-04 SHAPI：Seedream 5.0 pro 的 `/v1/images/generations` 与原生 `/doubao/api/v3/images/generations` 单张 1K、URL 输出成功；`/v1` 只返回 created / data，不能要求原生 model / usage / 尺寸字段。本站已验证签名图片下载与 JPEG Base64 返回链路；原生线路曾拒绝 Base64，后续支持性未复核。
- 同期 SHAPI 的 `doubao-seedance-2-0-260128-se` 完成过 4 秒 MP4，后端也查询到完成结果；`/doubao/...` 查询未必能读取其他协议创建的任务。曾经的任务查找失败复测后恢复，不能推断永久不支持。
