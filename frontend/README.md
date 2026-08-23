# 霜华绘梦前端

建议从项目根目录统一启动：

```bash
npm run setup
npm run dev
npm start
```

开发模式由 Vite 提供 `http://127.0.0.1:5173`，并将 `/api` 代理到默认的 `http://127.0.0.1:3001`。根目录开发启动器会自动设置代理目标；单独启动 Vite 时也可以手动指定：

```bash
SHUANGHUA_DEV_API_TARGET=http://127.0.0.1:4000 npm run dev
```

## 单独运行前端命令

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run test
npm run build
npm run e2e:install  # 首次运行 Playwright 时执行
npm run e2e
```

更新后端契约后生成类型：

```bash
npm run api:generate
```

生产构建输出到 `frontend/dist`，由 FastAPI 统一提供，不需要单独启动静态文件服务器。
