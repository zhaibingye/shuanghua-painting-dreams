const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '../..')
const logDirectory = path.join(projectRoot, 'logs')
fs.mkdirSync(logDirectory, { recursive: true })

module.exports = {
  apps: [
    {
      name: 'shuanghua',
      cwd: projectRoot,
      script: path.join(projectRoot, 'scripts', 'project.mjs'),
      args: 'start',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      restart_delay: 5000,
      min_uptime: '10s',
      max_restarts: 10,
      kill_timeout: 30000,
      time: true,
      merge_logs: true,
      out_file: path.join(logDirectory, 'shuanghua.out.log'),
      error_file: path.join(logDirectory, 'shuanghua.error.log'),
      env: {
        NODE_ENV: 'production',
        PYTHONUNBUFFERED: '1',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
  ],
}
