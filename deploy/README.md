# PM2 部署教程

以下以 Ubuntu / Debian 为例，安装目录为 `~/shuanghua`，默认端口为 `3002`。三部分都使用同一个 Linux 用户执行 PM2 命令。

## 1. 部署

准备 Git、curl、Node.js 24.15 或更高的 24.x 版本、npm 和 uv。新服务器可以用下面的命令安装。 [nvm 安装说明](https://github.com/nvm-sh/nvm#installing-and-updating) · [uv 安装说明](https://docs.astral.sh/uv/getting-started/installation/)

```bash
sudo apt update && sudo apt install -y git curl ca-certificates
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.41.0/install.sh | bash
. "${NVM_DIR:-$HOME/.nvm}/nvm.sh"
nvm install 24
curl -fsSL https://astral.sh/uv/install.sh | sh
export PATH="$HOME/.local/bin:$PATH"
```

安装 PM2、下载项目并启动服务。

```bash
npm install -g pm2 &&
git clone --branch main https://github.com/zhaibingye/shuanghua-painting-dreams.git "$HOME/shuanghua" &&
cd "$HOME/shuanghua" &&
cp backend/.env.example backend/.env &&
npm run setup &&
pm2 start deploy/pm2/ecosystem.config.cjs --only shuanghua
```

PM2 启动时会先构建前端。用 `pm2 logs shuanghua --lines 50 --nostream` 查看进度，构建完成后运行健康检查。

```bash
curl -fsS http://127.0.0.1:3002/api/v1/health/ready
```

返回 `"status":"ready"` 后，运行 `pm2 startup`，按提示执行它输出的命令，再运行 `pm2 save`，让服务在服务器重启后自动恢复。 [PM2 开机自启说明](https://pm2.keymetrics.io/docs/usage/startup/)

需要从外部访问时，在服务器防火墙和云安全组中放行 TCP `3002`，然后打开 `http://服务器公网IP:3002`，填写 API Key 并在「设置」中配置上游地址和模型。若修改了 `backend/.env` 中的 `PORT`，访问地址、健康检查和放行规则都使用新端口。

## 2. 卸载

从 PM2 移除应用并保存进程列表，避免服务器重启后恢复。确认 `~/shuanghua` 是安装目录后，再删除目录及其中的配置和日志。

```bash
pm2 delete shuanghua &&
pm2 save --force &&
cd "$HOME" && rm -rf -- "$HOME/shuanghua"
```

如果这个用户的 PM2 只用于霜华绘梦，可以运行 `pm2 unstartup` 并按提示移除 PM2 的开机自启。若部署时为本站单独放行了端口，可一并移除对应的防火墙和云安全组规则。浏览器里的 API Key 和对话记录可通过清除此站点的数据删除。 [PM2 命令参考](https://pm2.keymetrics.io/docs/usage/commands/)

## 3. 更新

拉取新版代码后暂停服务，再安装依赖并按配置重启。更新期间服务会中断，`backend/.env` 会保留。

```bash
cd "$HOME/shuanghua" &&
git pull --ff-only origin main &&
pm2 stop shuanghua &&
npm run setup &&
pm2 restart deploy/pm2/ecosystem.config.cjs --only shuanghua --update-env &&
pm2 save
```

重启时会重新构建前端。构建完成后，使用部署部分的健康检查确认服务恢复。
