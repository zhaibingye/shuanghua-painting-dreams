# 部署、更新与删除

使用 Linux + PM2 运行，前端页面和 API 共用一个端口，默认 `3002`。以下以 Ubuntu / Debian、项目目录 `~/shuanghua` 为例。

## 一、部署并通过端口访问

### 1. 准备环境和代码

在服务器终端中执行。安装和后续 PM2 操作使用同一个 Linux 用户。

```bash
sudo apt update
sudo apt install -y git curl ca-certificates

git clone --branch main https://github.com/zhaibingye/shuanghua-painting-dreams.git "$HOME/shuanghua"
cd "$HOME/shuanghua"
```

通过 [nvm](https://github.com/nvm-sh/nvm#installing-and-updating) 安装仓库 `.nvmrc` 指定的 Node.js 26 LTS，再安装 npm、PM2 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)：

```bash
export NVM_DIR="$HOME/.nvm"
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
. "$NVM_DIR/nvm.sh"
nvm install
nvm alias default "$(cat .nvmrc)"
npm install -g npm@12.2.2 pm2

curl -LsSf https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

项目要求 uv 0.13.7+。下一步安装依赖时，uv 会按 `backend/.python-version` 自动准备 Python 3.15.2。

### 2. 配置端口并启动

```bash
cd "$HOME/shuanghua"
cat > backend/.env <<'EOF'
SHUANGHUA_ENV=production
SHUANGHUA_HOST=0.0.0.0
PORT=3002
WEB_CONCURRENCY=2
EOF

npm run setup
pm2 start deploy/pm2/ecosystem.config.cjs --only shuanghua
pm2 save
```

`0.0.0.0` 允许从服务器外部连接。修改 `PORT` 即可换端口；后文的访问地址、端口转发和防火墙规则也要使用同一端口。

首次启动会先构建前端，再启动服务。查看状态与日志：

```bash
pm2 status
pm2 logs shuanghua --lines 50 --nostream
curl -fsS http://127.0.0.1:3002/api/v1/health/ready
```

健康检查返回 `"status":"ready"` 表示服务已启动。若仍在构建，稍后重新检查；启动失败时查看上面的日志。

设置开机自启：

```bash
pm2 startup
```

执行它输出的注册命令，然后运行 `pm2 save`。[PM2 官方说明](https://pm2.keymetrics.io/docs/usage/startup/)

### 3. 通过端口访问

如需从公网检查页面，先在云服务器安全组和系统防火墙中放行 **TCP 3002**。使用 UFW 的服务器可执行：

```bash
sudo ufw allow 3002/tcp
```

浏览器直接打开 **`http://服务器公网IP:3002`** 即可使用。也可以通过指向该服务器的域名加端口访问。

进入页面后填写 API Key，在「设置」中配置上游地址、接口格式和模型。供应商 Key 在浏览器中填写，不需要写入服务器 `.env`。

## 二、更新

在服务器上执行；每一步成功后再继续。安装依赖期间会暂停服务，重启时会重新构建前端。

```bash
cd "$HOME/shuanghua"
git pull --ff-only origin main
pm2 stop shuanghua
npm run setup
npm run check
pm2 restart deploy/pm2/ecosystem.config.cjs --only shuanghua --update-env
pm2 save
curl -fsS http://127.0.0.1:3002/api/v1/health/ready
```

重启后的健康检查可能需要等待构建完成。失败时查看 `pm2 logs shuanghua --lines 50 --nostream`。

更新时通过配置文件重启，PM2 会重新读取配置并创建项目的 `logs/` 目录。仅按进程名重启不会执行这一步；若旧命令报 `ENOENT ... logs/shuanghua.out.log`，在项目目录执行 `mkdir -p logs`，再运行上面的重启命令。

`backend/.env` 不受 Git 管理，常规更新会保留它；浏览器中的对话、图片和设置也会保留。继续使用相同的浏览器与访问地址，才能读取原有本地记录。

如果更新后 Node.js 版本要求变化，先运行 `nvm install && nvm use`，重新安装 npm 和 PM2，并按 `pm2 startup` 的输出更新开机自启配置，再继续上述安装与重启步骤。

仅修改 `backend/.env` 时，执行 `pm2 restart deploy/pm2/ecosystem.config.cjs --only shuanghua --update-env` 即可。

## 三、删除

先移除服务，并保存 PM2 进程列表，防止重启服务器后恢复：

```bash
pm2 delete shuanghua
pm2 save --force
```

确认 `~/shuanghua` 就是本教程创建的项目目录后，删除代码、依赖、配置和日志：

```bash
cd "$HOME"
rm -rf -- "$HOME/shuanghua"
```

若前面用 UFW 放行过端口，再移除该规则，并在云服务器安全组中删除对应规则：

```bash
sudo ufw delete allow 3002/tcp
```

删除服务器项目不会清除浏览器本地数据。如需一并删除 Key、设置、对话和图片，在浏览器设置中清除此站点的网站数据。
