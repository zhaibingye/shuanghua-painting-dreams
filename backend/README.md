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
uv run uvicorn app.main:app --host 127.0.0.1 --port 3002 --reload
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

```bash
uv run python scripts/export_openapi.py
```
