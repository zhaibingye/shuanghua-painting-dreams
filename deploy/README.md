# Linux 单端口部署

本文档适用于 **Linux + Nginx/宝塔 + PM2**。项目生产模式只监听一个本地 HTTP 端口，FastAPI 同时提供前端页面、静态资源和 `/api/v1/*` 接口。

外部部署结构：

```text
浏览器
  ↓ HTTPS
Nginx / 宝塔反向代理
  ↓ HTTP，整个域名全部转发
127.0.0.1:3002
  ↓
FastAPI API + frontend/dist
```

不再需要创建独立的前端静态网站，也不再需要单独创建 `/api/` 反向代理。

## 1. 环境要求

服务器需要安装：

- Python 3.12；
- uv；
- Node.js 20 或更高版本；
- npm；
- PM2；
- Nginx，或带 Nginx 的宝塔面板。

示例安装 PM2：

```bash
npm install -g pm2
pm2 --version
```

建议仅向公网开放 SSH、HTTP 80 和 HTTPS 443。统一应用端口只监听 `127.0.0.1`，不要向公网开放 3002。

## 2. 放置项目

本文以 `/opt/shuanghua` 为例：

```bash
mkdir -p /opt/shuanghua /etc/shuanghua
```

将完整项目上传或拉取到 `/opt/shuanghua`：

```text
/opt/shuanghua/
├── package.json
├── package-lock.json
├── backend/
├── frontend/
├── scripts/
└── deploy/
```

PM2 配置会根据自身文件位置自动计算项目根目录，因此项目也可以部署到其他目录，不需要修改绝对路径。

## 3. 配置环境变量

复制后端配置：

```bash
cp /opt/shuanghua/backend/.env.example /etc/shuanghua/shuanghua.env
chmod 600 /etc/shuanghua/shuanghua.env
ln -sfn /etc/shuanghua/shuanghua.env /opt/shuanghua/backend/.env
```

编辑 `/etc/shuanghua/shuanghua.env`，主要配置如下：

```dotenv
SHUANGHUA_ENV=production
SHUANGHUA_HOST=127.0.0.1
PORT=3002
WEB_CONCURRENCY=2
SHUANGHUA_FORWARDED_ALLOW_IPS=127.0.0.1
SHUANGHUA_LOG_LEVEL=INFO
```

说明：

- `PORT` 默认 `3002`，也可以在启动命令或 PM2 环境中覆盖；
- 兼容旧变量 `SHUANGHUA_PORT`，但新部署建议只使用 `PORT`；
- `WEB_CONCURRENCY` 默认 `2`，可根据 CPU 和内存调整；
- 兼容 `SHUANGHUA_WORKERS`，但新部署建议只使用 `WEB_CONCURRENCY`；
- `SHUANGHUA_HOST` 应保持 `127.0.0.1`，避免绕过 Nginx 直接访问应用；
- `SHUANGHUA_FORWARDED_ALLOW_IPS=127.0.0.1` 表示只信任本机反向代理发送的转发头；
- 前端与 API 为同源访问，生产环境不依赖 CORS。只有额外的跨域客户端需要配置 `SHUANGHUA_CORS_ORIGINS`；
- 不要将供应商 API Key 写入服务端环境变量。Key 由用户保存在浏览器本地。

端口优先级：

```text
PORT → SHUANGHUA_PORT → 3002
```

worker 优先级：

```text
WEB_CONCURRENCY → SHUANGHUA_WORKERS → 2
```

## 4. 安装依赖

在项目根目录执行统一安装命令：

```bash
cd /opt/shuanghua
npm run setup
```

该命令会执行：

- `uv sync --frozen`，安装后端运行、开发和检查依赖；
- `npm ci`，安装前端运行、构建和检查依赖。

`npm start` 不会自动安装依赖。更新 lock 文件后应重新执行 `npm run setup`。

## 5. 前台验证生产启动

先在终端中验证：

```bash
cd /opt/shuanghua
npm start
```

每次启动会依次：

1. 检查 Node.js、npm、uv 和依赖目录；
2. 执行 TypeScript 检查；
3. 执行 Vite 生产构建；
4. 检查 `frontend/dist/index.html`；
5. 启动 Uvicorn/FastAPI；
6. 由 FastAPI 在同一端口提供前端和 API。

另开终端检查：

```bash
curl -i http://127.0.0.1:3002/
curl -i http://127.0.0.1:3002/create/image
curl -i http://127.0.0.1:3002/api/v1/health/ready
```

三个请求都应返回 HTTP 200，其中前两个返回前端 HTML，第三个返回健康检查 JSON。

验证结束后在启动终端按 `Ctrl+C`，启动器会将退出信号转发给 Uvicorn 并关闭 worker。

临时覆盖端口和 worker：

```bash
PORT=4000 WEB_CONCURRENCY=4 npm start
```

## 6. 使用 PM2 守护

项目提供：

```text
deploy/pm2/ecosystem.config.cjs
```

启动：

```bash
cd /opt/shuanghua
pm2 start deploy/pm2/ecosystem.config.cjs --only shuanghua
pm2 status
```

PM2 直接守护与 `npm start` 相同的生产启动器 `scripts/project.mjs start`，避免额外的 npm shell 层。默认日志写入：

```text
/opt/shuanghua/logs/shuanghua.out.log
/opt/shuanghua/logs/shuanghua.error.log
```

查看日志：

```bash
pm2 logs shuanghua --lines 100
```

验证：

```bash
curl -i http://127.0.0.1:3002/api/v1/health/ready
```

PM2 只启动一个受守护的启动器实例，Uvicorn 默认在其下创建两个 worker。不要再使用 PM2 `instances` 扩容，否则会与 `WEB_CONCURRENCY` 叠加。

### 开机自启

以当前运行 PM2 的 Linux 用户执行：

```bash
pm2 startup
pm2 save
```

按照 `pm2 startup` 输出的命令完成 systemd 注册。服务器重启后使用以下命令确认：

```bash
pm2 status
curl -i http://127.0.0.1:3002/api/v1/health/ready
```

### 修改环境变量

修改 `/etc/shuanghua/shuanghua.env` 后执行：

```bash
pm2 restart shuanghua --update-env
```

由于生产启动按要求每次都重新构建前端，PM2 重启时也会先执行前端构建，再启动服务。

## 7. 配置宝塔或 Nginx 反向代理

将域名的整个路径 `/` 代理到：

```text
http://127.0.0.1:3002
```

不要只代理 `/api/`，也不要再将网站根目录设置为 `frontend/dist`。前端页面和 API 现在都由统一端口提供。

宝塔面板中的建议值：

| 配置项 | 建议值 |
| --- | --- |
| 代理名称 | `shuanghua` |
| 代理目录 | `/` |
| 目标 URL | `http://127.0.0.1:3002` |
| 发送域名 | `$host` |
| 内容替换 | 留空 |
| 缓存 | 关闭 |
| WebSocket | 开启 |

不要配置路径重写，必须保留原始路径，例如：

```text
/create/image → /create/image
/api/v1/health/ready → /api/v1/health/ready
/assets/app-xxxx.js → /assets/app-xxxx.js
```

## 8. Nginx 关键参数

图片请求可能包含较大的 Base64 数据，图片生成最长可能等待约 10 分钟。建议在站点 `server` 块中设置：

```nginx
client_max_body_size 128m;
```

在反向代理 `location /` 中确认：

```nginx
proxy_http_version 1.1;
proxy_connect_timeout 30s;
proxy_send_timeout 620s;
proxy_read_timeout 620s;
proxy_request_buffering off;
proxy_buffering off;

proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Request-ID $request_id;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection $connection_upgrade;

proxy_pass http://127.0.0.1:3002;
```

宝塔通常会自动生成其中大部分配置，已有项不要重复添加。`$connection_upgrade` 可能由宝塔自动定义；若纯手写 Nginx，需要在 `http` 块中配置相应的 `map`，或者按实际需求移除 WebSocket 两行。

图片对话使用 SSE 传输渐进式图片。必须确保 `/api/v1/images/conversation-turns/stream` 不被缓存、缓冲或合并；建议在通用 `location /` 之前增加精确规则：

```nginx
location = /api/v1/images/conversation-turns/stream {
    proxy_pass http://127.0.0.1:3002;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Accept-Encoding "";

    proxy_connect_timeout 30s;
    proxy_send_timeout 620s;
    proxy_read_timeout 620s;
    proxy_request_buffering off;
    proxy_buffering off;
    gzip off;
}
```

其他前端静态资源可以开启 gzip/Brotli。FastAPI 会为前端资源返回缓存头：

- `index.html`：`Cache-Control: no-cache`；
- Vite 哈希资源 `/assets/*`：一年强缓存并带 `immutable`；
- favicon 等其他静态文件：缓存一小时。

## 9. SSL

在宝塔或 Nginx 中为域名配置证书，并将 HTTP 强制跳转到 HTTPS。应用内部仍使用本地 HTTP：

```text
公网 HTTPS → Nginx → http://127.0.0.1:3002
```

确认 Nginx 传递 `X-Forwarded-Proto`，Uvicorn 会信任来自 `127.0.0.1` 的代理头。

## 10. 更新部署

更新代码后：

```bash
cd /opt/shuanghua
npm run setup
npm run check
pm2 restart shuanghua --update-env
pm2 save
curl -i http://127.0.0.1:3002/api/v1/health/ready
```

如果 lock 文件没有变化，可以省略 `npm run setup`。`pm2 restart` 会触发生产启动器重新构建前端。

常用命令：

```bash
pm2 status
pm2 describe shuanghua
pm2 logs shuanghua
pm2 restart shuanghua --update-env
pm2 stop shuanghua
pm2 delete shuanghua
pm2 save
```

## 11. 故障排查

### `npm start` 提示缺少依赖

```bash
cd /opt/shuanghua
npm run setup
```

确认存在：

```text
/opt/shuanghua/backend/.venv
/opt/shuanghua/frontend/node_modules
```

### PM2 显示 `errored`

```bash
pm2 describe shuanghua
pm2 logs shuanghua --lines 200
```

重点检查：

- Node.js 是否至少为 20；
- Python 是否为 3.12；
- `uv` 是否可被 PM2 运行用户从 `PATH` 找到；
- `npm run setup` 是否执行成功；
- 3002 是否被其他进程占用；
- 前端 TypeScript 或 Vite 构建是否失败；
- `/opt/shuanghua/backend/.env` 软链接是否有效。

### 域名访问返回 502

先测试本地应用：

```bash
curl -i http://127.0.0.1:3002/api/v1/health/ready
```

若本地失败，检查 PM2；若本地成功，检查宝塔/Nginx 的目标是否为 `http://127.0.0.1:3002`。

### 前端子路由刷新返回 404

确认反向代理覆盖整个 `/`，并且没有路径重写。FastAPI 已内置 SPA fallback，不需要再配置 Nginx `try_files`。

### API 不存在的路径返回前端 HTML

正常实现会让 `/api/*` 未知路径保持 HTTP 404，不会回退到 `index.html`。若出现 HTML，检查 Nginx 是否仍残留旧的静态站点 `try_files` 配置。

### 上传返回 413

提高 Nginx `client_max_body_size`。若使用 CDN，也要同步提高 CDN 请求体限制。

### 图片生成返回 504

检查 `proxy_read_timeout` 和 `proxy_send_timeout` 是否至少为 620 秒，并检查上游供应商是否提前超时。

### 修改端口后无法访问

如果将 `PORT` 改为其他值，必须同步修改：

1. `/etc/shuanghua/shuanghua.env`；
2. Nginx/宝塔反向代理目标；
3. 健康检查命令。

然后执行：

```bash
pm2 restart shuanghua --update-env
```

## 12. 性能说明

- API 与静态资源共享 Uvicorn 端口，不会给 API 增加额外的代理层；
- PM2 只负责进程守护，运行时开销可以忽略；
- Vite 哈希资源带长期缓存，重复访问通常不会再次从应用读取；
- Nginx 仍负责 TLS、压缩、连接管理和公网流量承接；
- 默认两个 Uvicorn worker 可以利用多个 CPU 核心；
- 极高静态流量场景下可以再引入 CDN，但普通单机部署通常没有必要。

相比原先“静态站点 + 单独 `/api/` 代理”的结构，主要差异是首次静态文件请求由 FastAPI 返回。对该项目的常规访问规模，性能影响通常很小，而部署、更新和 PM2 守护会明显简化。
