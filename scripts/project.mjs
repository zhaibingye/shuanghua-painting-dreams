import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDirectory, '..')
const backendDirectory = path.join(projectRoot, 'backend')
const frontendDirectory = path.join(projectRoot, 'frontend')
const frontendModules = path.join(frontendDirectory, 'node_modules')
const frontendIndex = path.join(frontendDirectory, 'dist', 'index.html')
const backendEnvironment = path.join(backendDirectory, '.venv')

const npmCommand = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : 'npm'
const uvCommand = process.platform === 'win32' ? 'uv.exe' : 'uv'
const activeChildren = new Set()

function npmArguments(args) {
  return process.platform === 'win32' ? ['/d', '/s', '/c', 'npm', ...args] : args
}
let requestedSignal = null
let forceExitTimer = null

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => requestShutdown(signal))
}

function log(message) {
  console.log(`[project] ${message}`)
}

function assertSupportedNodeVersion() {
  const majorVersion = Number.parseInt(process.versions.node.split('.')[0], 10)
  if (!Number.isFinite(majorVersion) || majorVersion < 20) {
    throw new Error(`需要 Node.js 20 或更高版本，当前版本为 ${process.version}`)
  }
}

async function assertPathExists(targetPath, message) {
  try {
    await access(targetPath)
  } catch {
    throw new Error(message)
  }
}

function parsePort(value, variableName) {
  const port = Number.parseInt(value, 10)
  if (!Number.isInteger(port) || String(port) !== value || port < 1 || port > 65535) {
    throw new Error(`${variableName} 必须是 1 到 65535 之间的整数，当前值为 ${JSON.stringify(value)}`)
  }
  return port
}

function resolveDevelopmentPort() {
  if (process.env.PORT !== undefined) {
    return parsePort(process.env.PORT, 'PORT')
  }
  if (process.env.SHUANGHUA_PORT !== undefined) {
    return parsePort(process.env.SHUANGHUA_PORT, 'SHUANGHUA_PORT')
  }
  return 3001
}

function commandText(command, args) {
  return [command, ...args].join(' ')
}

function startProcess(command, args, { cwd, env = process.env, label }) {
  log(`${label}: ${commandText(command, args)}`)
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  })
  activeChildren.add(child)

  const completion = new Promise((resolve, reject) => {
    child.once('error', (error) => {
      activeChildren.delete(child)
      reject(new Error(`${label} 无法启动：${error.message}`, { cause: error }))
    })
    child.once('exit', (code, signal) => {
      activeChildren.delete(child)
      if (code === 0 || requestedSignal !== null) {
        resolve({ code, signal })
        return
      }
      const result = signal === null ? `退出码 ${code}` : `信号 ${signal}`
      reject(new Error(`${label} 异常结束（${result}）`))
    })
  })

  return { child, completion, label }
}

async function runProcess(command, args, options) {
  const processHandle = startProcess(command, args, options)
  return processHandle.completion
}

function terminateChild(child, signal) {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return
  }

  try {
    if (process.platform === 'win32') {
      child.kill(signal)
    } else {
      process.kill(-child.pid, signal)
    }
  } catch (error) {
    if (error?.code !== 'ESRCH') {
      console.error(`[project] 结束子进程失败：${error.message}`)
    }
  }
}

function terminateAll(signal) {
  for (const child of activeChildren) {
    terminateChild(child, signal)
  }
}

function requestShutdown(signal) {
  if (requestedSignal !== null) {
    return
  }

  requestedSignal = signal
  log(`收到 ${signal}，正在关闭子进程……`)
  terminateAll(signal)
  forceExitTimer = setTimeout(() => {
    log('子进程未在 30 秒内退出，执行强制关闭。')
    terminateAll('SIGKILL')
  }, 30_000)
  forceExitTimer.unref()
}

async function verifyTools() {
  assertSupportedNodeVersion()
  await runProcess(npmCommand, npmArguments(['--version']), {
    cwd: projectRoot,
    label: '检查 npm',
  })
  await runProcess(uvCommand, ['--version'], {
    cwd: projectRoot,
    label: '检查 uv',
  })
}

async function verifyInstalledDependencies() {
  await assertPathExists(
    frontendModules,
    '缺少 frontend/node_modules，请先在项目根目录执行 npm run setup',
  )
  await assertPathExists(
    backendEnvironment,
    '缺少 backend/.venv，请先在项目根目录执行 npm run setup',
  )
}

async function setup() {
  log('安装后端完整依赖……')
  await runProcess(uvCommand, ['sync', '--frozen'], {
    cwd: backendDirectory,
    label: '后端依赖安装',
  })
  log('安装前端完整依赖……')
  await runProcess(npmCommand, npmArguments(['ci']), {
    cwd: frontendDirectory,
    label: '前端依赖安装',
  })
  log('依赖安装完成。')
}

async function buildFrontend() {
  await verifyInstalledDependencies()
  log('检查 TypeScript 并构建前端生产产物……')
  await runProcess(npmCommand, npmArguments(['run', 'build']), {
    cwd: frontendDirectory,
    label: '前端生产构建',
  })
  await assertPathExists(frontendIndex, '前端构建结束，但 frontend/dist/index.html 不存在')
  log('前端生产产物检查通过。')
}

async function startProduction() {
  await buildFrontend()
  log('启动生产服务；默认地址为 http://127.0.0.1:3001，可通过 PORT 覆盖。')
  await runProcess(
    uvCommand,
    ['run', '--frozen', '--no-sync', 'python', '-m', 'app.server'],
    {
      cwd: backendDirectory,
      label: 'FastAPI 生产服务',
      env: { ...process.env, NODE_ENV: process.env.NODE_ENV ?? 'production' },
    },
  )
}

async function startDevelopment() {
  await verifyInstalledDependencies()
  const backendPort = resolveDevelopmentPort()
  const backendHost = process.env.SHUANGHUA_HOST ?? '127.0.0.1'
  const proxyHost = backendHost === '0.0.0.0' || backendHost === '::' ? '127.0.0.1' : backendHost
  const sharedEnvironment = {
    ...process.env,
    PORT: String(backendPort),
    SHUANGHUA_DEV_API_TARGET: `http://${proxyHost}:${backendPort}`,
  }

  log(`开发后端：http://${proxyHost}:${backendPort}`)
  log('开发前端：http://127.0.0.1:5173')

  const backend = startProcess(
    uvCommand,
    [
      'run', '--frozen', '--no-sync', 'python', '-m', 'uvicorn', 'app.main:app',
      '--host', backendHost, '--port', String(backendPort), '--reload',
    ],
    {
      cwd: backendDirectory,
      env: sharedEnvironment,
      label: 'FastAPI 开发服务',
    },
  )
  const frontend = startProcess(
    npmCommand,
    npmArguments(['run', 'dev', '--', '--host', '127.0.0.1']),
    {
      cwd: frontendDirectory,
      env: sharedEnvironment,
      label: 'Vite 开发服务',
    },
  )

  try {
    const firstResult = await Promise.race([
      backend.completion.then(() => backend.label),
      frontend.completion.then(() => frontend.label),
    ])
    if (requestedSignal === null) {
      throw new Error(`${firstResult}提前结束，正在关闭另一项开发服务`)
    }
  } finally {
    terminateAll('SIGTERM')
    await Promise.allSettled([backend.completion, frontend.completion])
  }
}

async function checkProject() {
  await verifyInstalledDependencies()

  const checks = [
    [
      uvCommand,
      ['run', '--frozen', '--no-sync', 'python', '-m', 'pytest'],
      backendDirectory,
      'Pytest',
    ],
    [
      uvCommand,
      ['run', '--frozen', '--no-sync', 'python', '-m', 'ruff', 'check', '.'],
      backendDirectory,
      'Ruff',
    ],
    [
      uvCommand,
      ['run', '--frozen', '--no-sync', 'python', '-m', 'ruff', 'format', '--check', '.'],
      backendDirectory,
      'Ruff 格式',
    ],
    [
      uvCommand,
      ['run', '--frozen', '--no-sync', 'python', '-m', 'mypy', 'app', 'tests'],
      backendDirectory,
      'mypy',
    ],
    [npmCommand, npmArguments(['run', 'lint']), frontendDirectory, 'ESLint'],
    [npmCommand, npmArguments(['run', 'typecheck']), frontendDirectory, 'TypeScript'],
    [npmCommand, npmArguments(['run', 'test']), frontendDirectory, 'Vitest'],
    [npmCommand, npmArguments(['run', 'build']), frontendDirectory, '前端构建'],
  ]

  for (const [command, args, cwd, label] of checks) {
    await runProcess(command, args, { cwd, label })
  }
  await assertPathExists(frontendIndex, '完整检查后未找到 frontend/dist/index.html')
  log('全部检查通过。')
}

const commands = {
  setup,
  dev: startDevelopment,
  build: buildFrontend,
  start: startProduction,
  check: checkProject,
}

async function main() {
  const command = process.argv[2]
  if (!(command in commands)) {
    const availableCommands = Object.keys(commands).join(', ')
    throw new Error(`未知命令 ${JSON.stringify(command)}，可用命令：${availableCommands}`)
  }

  await verifyTools()
  await commands[command]()
}

try {
  await main()
} catch (error) {
  if (requestedSignal === null) {
    console.error(`[project] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
} finally {
  if (forceExitTimer !== null) {
    clearTimeout(forceExitTimer)
  }
  if (requestedSignal === 'SIGINT') {
    process.exitCode = 130
  } else if (requestedSignal === 'SIGTERM') {
    process.exitCode = 143
  }
}
