# 霜华绘梦后端

FastAPI 无状态 API 适配层，同时负责在生产模式下提供 `frontend/dist` 中的前端资源。

建议从项目根目录使用统一命令：

```bash
npm run setup
npm run dev
npm start
npm run check
```

## 单独启动后端开发服务

```bash
uv sync
uv run python -m uvicorn app.main:app --host 127.0.0.1 --port 3002 --reload
```

## 单独启动后端生产服务

前端必须已经构建到 `frontend/dist`：

```bash
PORT=3002 WEB_CONCURRENCY=2 uv run python -m app.server
```

生产服务入口会读取：

- `PORT`，兼容 `SHUANGHUA_PORT`，默认 `3002`
- `WEB_CONCURRENCY`，兼容 `SHUANGHUA_WORKERS`，默认 `2`
- `SHUANGHUA_HOST`，默认 `127.0.0.1`
- `SHUANGHUA_FORWARDED_ALLOW_IPS`，默认 `127.0.0.1`

## 后端检查

```bash
uv run pytest
uv run ruff check .
uv run ruff format --check .
uv run mypy app tests
```

## 导出 OpenAPI

从项目根目录运行 `npm run api:generate --prefix frontend`，统一生成后端 OpenAPI、前端 TypeScript 类型以及 `provider-catalog.json`。图片、视频和视频续写的参数字段、默认值、枚举和限制以 Pydantic 请求模型为准，在 `app/domain/options.py` 注册；前端表单和提交校验共用导出的 JSON Schema。

仅导出 OpenAPI 和参数目录时，在 backend 目录运行：

```bash
uv run python scripts/export_openapi.py
```

后端使用 `backend/.python-version` 指定的 Python 3.15.2，建议使用 uv 0.13.7 或更高版本安装和管理解释器。

## 字节视频素材

`inputs.firstFrameUrl`、`lastFrameUrl` 和 `referenceImageUrls[]` 接受图片公网 URL、`data:image/<格式>;base64,...` 或 `asset://<素材ID>`，本地图片直接转发给上游，不落盘。

多段参考视频 / 音频使用 `referenceVideoUrls[]`、`referenceAudioUrls[]`；原单项 `referenceVideoUrl`、`referenceAudioUrl` 仍可使用，数量合并计算。音频另外支持 `data:audio/wav;base64,...`、`data:audio/mp3;base64,...`。参考模式的提示词可选，首尾帧与全模态参考素材互斥。各模型的数量限制维护在 `app/domain/seedance.py`，不再使用 content 合计 5 项的旧限制。

Seedance 2.5 全模态参考可通过 `options.omniReferenceTaskType` 指定 `auto` / `reference` / `edit` / `extend`。编辑和延长需要参考视频及 `aspectRatio=adaptive`；编辑还需 `duration=-1`。`outputFormat` 支持 `mp4` / `mov`，2.x 的 `priority` 为 0–9。远程素材时长、格式和大小由上游检查，本项目不预先下载视频或音频。单图应小于 30MB，请求体不超过 64MB；大素材建议使用公网 URL。
