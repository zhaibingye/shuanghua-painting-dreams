import { expect, test, type Page } from 'playwright/test'
import { readFile } from 'node:fs/promises'

const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAEklEQVR4AWL6z8DwH4SZGKAAAAAA//8qMqaOAAAABklEQVQDADYSBAFv606fAAAAAElFTkSuQmCC',
  'base64',
)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(() => {
    localStorage.clear()
    sessionStorage.clear()
    indexedDB.deleteDatabase('shuanghua-workspace')
  })
  await page.reload()
})

test('Key 引导、对话创建和设置持久化', async ({ page }) => {
  await expect(page).toHaveTitle('霜华绘梦')
  await expect(page.getByRole('heading', { name: '欢迎使用霜华绘梦' })).toBeVisible()
  await page.getByLabel('API Key').fill('browser-test-key')
  await page.getByRole('button', { name: '保存 Key 并进入' }).click()

  await page.getByRole('button', { name: /图片对话/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('API 格式')).toHaveValue('openaiImage')
  await expect(dialog.getByLabel('模型 ID')).toHaveCount(0)
  await expect(dialog.getByText(/默认模型：gpt-image-2.5-sunburst/)).toBeVisible()
  await expect(dialog.getByText('https://www.shapi.vip', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '创建对话' }).click()
  await expect(page.getByText('OpenAI Images · gpt-image-2.5-sunburst').last()).toBeVisible()
  await expect(page.getByLabel('当前模型')).toHaveValue('gpt-image-2.5-sunburst')

  await openSettings(page)
  await expect(page.getByLabel('全局 Key', { exact: true })).toHaveValue('browser-test-key')
  await page.getByLabel('全局 Key', { exact: true }).fill('updated-key')
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: '欢迎使用霜华绘梦' })).toHaveCount(0)
  const persistedKey = await page.evaluate(() => {
    const raw = localStorage.getItem('shuanghua.settings.v2')
    return raw ? (JSON.parse(raw) as { globalApiKey?: string }).globalApiKey : null
  })
  expect(persistedKey).toBe('updated-key')
})

test('OpenAI Responses 默认启用可配置的渐进式图片', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'image', 'openaiResponsesImage')
  await page.getByRole('button', { name: '参数', exact: true }).click()

  await expect(page.getByLabel('模型 ID')).toHaveCount(0)
  await expect(page.getByLabel('渐进预览数量')).toHaveValue('2')
  await page.getByLabel('渐进预览数量').fill('3')
  await expect(page.getByLabel('渐进预览数量')).toHaveValue('3')
  await expect(page.getByRole('dialog').getByText('gpt-5.6-luna', { exact: true })).toBeVisible()
})

test('切换对话不会中断正在运行的图片任务', async ({ page }) => {
  await page.getByLabel('API Key').fill('browser-test-key')
  await page.getByRole('button', { name: '保存 Key 并进入' }).click()
  await createConversation(page, 'image', 'openaiImage')

  let signalRequestStarted: (() => void) | undefined
  const requestStarted = new Promise<void>((resolve) => {
    signalRequestStarted = resolve
  })
  await page.route('**/api/v1/images/conversation-turns/stream', async (route) => {
    const payload = route.request().postDataJSON() as { prompt?: string }
    const firstTask = payload.prompt === '后台继续生成的雪花'
    if (firstTask) signalRequestStarted?.()
    await new Promise((resolve) => setTimeout(resolve, firstTask ? 3000 : 300))
    const suffix = firstTask ? 'background' : 'foreground'
    const body = [
      `event: turn.started\ndata: {"requestId":"req_${suffix}","apiFormat":"openaiImage"}\n\n`,
      `event: image.completed\ndata: {"index":0,"image":{"id":"img_${suffix}","mimeType":"image/png","base64Data":"${tinyPng.toString('base64')}","revisedPrompt":null,"thought":false,"thoughtSignature":null},"providerMetadata":null}\n\n`,
      `event: turn.completed\ndata: {"requestId":"req_${suffix}","usage":null,"providerState":null}\n\n`,
    ].join('')
    await route.fulfill({
      status: 200,
      contentType: 'text/event-stream',
      body,
    })
  })

  const prompt = '后台继续生成的雪花'
  await page.getByRole('textbox', { name: '消息', exact: true }).fill(prompt)
  await page.getByRole('button', { name: '发送消息' }).click()
  await requestStarted

  await openNewConversation(page)
  await page.getByRole('dialog').getByLabel('API 格式').selectOption('openaiImage')
  await page.getByRole('dialog').getByRole('button', { name: '创建对话' }).click()
  await expect(page.getByText('开始这段图片对话')).toBeVisible()
  await closeSidebarIfOpen(page)

  await page.getByRole('textbox', { name: '消息', exact: true }).fill('对话二同时生成')
  await page.getByRole('button', { name: '发送消息' }).click()
  await expect(page.getByAltText('生成结果 1')).toBeVisible({ timeout: 5000 })

  await openSidebarIfNeeded(page)
  await page.getByText(prompt, { exact: true }).click()
  await expect(page.getByAltText('生成结果 1')).toBeVisible({ timeout: 5000 })
  await expect(page.getByText('已停止生成。')).toHaveCount(0)
})

test('OpenAI Images 对话可读取本地文件并打开遮罩编辑器', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'image', 'openaiImage')

  await page.locator('input[type="file"]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: tinyPng,
  })
  await expect(page.getByText('1/16')).toBeVisible()
  await page.getByRole('button', { name: '绘制遮罩 / 标注' }).click()
  await expect(page.getByRole('heading', { name: 'OpenAI 遮罩编辑器' })).toBeVisible()
})

for (const outputFormat of ['svg', 'gif']) {
  test(`GPT Image 2.6 ${outputFormat} 参数、预览、下载和本地持久化`, async ({ page }) => {
    await page.getByLabel('API Key').fill('browser-test-key')
    await page.getByRole('button', { name: '保存 Key 并进入' }).click()
    await createConversation(page, 'image', 'openaiImage', 'gpt-image-2.6-sunburst')
    await page.getByRole('button', { name: '参数', exact: true }).click()
    await page.getByLabel('复杂度').selectOption('medium')
    await page.getByLabel('输出格式', { exact: true }).selectOption(outputFormat)
    await expect(page.getByLabel('渐进预览数量')).toHaveCount(0)
    if (outputFormat === 'gif') {
      await expect(page.getByLabel('尺寸', { exact: true })).toHaveValue('auto')
      await page.getByLabel('动画帧数').fill('64')
      await page.getByLabel('每帧时长（毫秒）').fill('120')
    }
    await page.screenshot({ path: test.info().outputPath(`${outputFormat}-parameters.png`), fullPage: true })
    await page.getByRole('button', { name: '关闭参数面板' }).click()

    const bytes = outputFormat === 'svg'
      ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><circle cx="64" cy="64" r="48" fill="#38bdf8"/></svg>')
      : Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
    const mimeType = outputFormat === 'svg' ? 'image/svg+xml' : 'image/gif'
    await page.route('**/api/v1/images/conversation-turns/stream', (route) => route.fulfill({
      status: 200, contentType: 'text/event-stream', body: [
        'event: turn.started\ndata: {"requestId":"req_26","apiFormat":"openaiImage"}\n\n',
        `event: image.completed\ndata: ${JSON.stringify({ index: 0, image: { id: 'img_26', mimeType, base64Data: bytes.toString('base64'), revisedPrompt: null, thought: false, thoughtSignature: null }, providerMetadata: null })}\n\n`,
        'event: turn.completed\ndata: {"requestId":"req_26","usage":null,"providerState":null}\n\n',
      ].join(''),
    }))
    const captured = page.waitForRequest('**/api/v1/images/conversation-turns/stream')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill('创建蓝色圆形')
    await page.getByRole('button', { name: '发送消息' }).click()
    expect((await captured).postDataJSON()).toMatchObject({ modelId: 'gpt-image-2.6-sunburst',
      options: { outputFormat, complexity: 'medium', ...(outputFormat === 'gif' ? { frameCount: 64, frameDurationMs: 120 } : { count: 1 }) } })
    await expect(page.getByAltText('生成结果 1')).toBeVisible()
    await expect(page.getByRole('button', { name: '设为基图' })).toHaveCount(0)
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载', exact: true }).click()
    const download = await downloaded
    expect(download.suggestedFilename()).toMatch(new RegExp(`\\.${outputFormat}$`))
    const downloadPath = await download.path()
    expect(downloadPath).not.toBeNull()
    expect(await readFile(downloadPath)).toEqual(bytes)
    await page.reload()
    await expect(page.getByAltText('生成结果 1')).toBeVisible()
  })
}

test('GPT Image 2.6 标注编辑提交独立透明 PNG', async ({ page }) => {
  await page.getByLabel('API Key').fill('browser-test-key')
  await page.getByRole('button', { name: '保存 Key 并进入' }).click()
  await createConversation(page, 'image', 'openaiImage', 'gpt-image-2.6-sunburst')
  const base = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 64
    canvas.height = 64
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.fillRect(0, 0, 64, 64)
    const dataUrl = canvas.toDataURL()
    return dataUrl.slice(dataUrl.indexOf(',') + 1)
  })
  await page.locator('input[type="file"]').setInputFiles({ name: 'base.png', mimeType: 'image/png', buffer: Buffer.from(base, 'base64') })
  await expect(page.getByText('1/16')).toBeVisible()
  await page.getByRole('button', { name: '绘制遮罩 / 标注' }).click()
  await page.getByLabel('编辑方式').selectOption('markup')
  await page.getByLabel('画笔大小').fill('4')
  await page.locator('.mask-stage canvas').click()
  await page.getByRole('button', { name: '应用标注' }).click()
  await expect(page.getByRole('button', { name: '标注已就绪' })).toBeVisible()
  await page.route('**/api/v1/images/conversation-turns/stream', (route) => route.fulfill({ status: 200,
    contentType: 'text/event-stream', body: 'event: turn.completed\ndata: {"requestId":"req_markup","usage":null,"providerState":null}\n\n' }))
  const captured = page.waitForRequest('**/api/v1/images/conversation-turns/stream')
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('将标注位置改成蓝色')
  await page.getByRole('button', { name: '发送消息' }).click()
  const payload = (await captured).postDataJSON()
  expect(payload.mask).toBeNull()
  expect(payload.markup.filename).toBe('markup.png')
  expect(payload.markup.dataUrl).toMatch(/^data:image\/png;base64,/)
  expect(payload.sourceImages).toHaveLength(1)
  const overlay = await page.evaluate(async (dataUrl: string) => {
    const image = await createImageBitmap(await (await fetch(dataUrl)).blob())
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas unavailable')
    context.drawImage(image, 0, 0)
    return { width: image.width, height: image.height,
      cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
      centerAlpha: context.getImageData(32, 32, 1, 1).data[3] }
  }, payload.markup.dataUrl)
  expect(overlay).toMatchObject({ width: 64, height: 64, cornerAlpha: 0 })
  expect(overlay.centerAlpha).toBeGreaterThan(0)
})

test('Seedance 2.5 默认模型、清晰度、自动时长和同步音频', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'video', 'byteDanceVideo')
  await page.getByRole('button', { name: '参数', exact: true }).click()
  await expect(page.getByRole('dialog').getByText('doubao-seedance-2-5-260628', { exact: true })).toBeVisible()
  await expect(page.getByLabel('分辨率')).toHaveValue('720p')
  await expect(page.getByLabel('分辨率').locator('option')).toHaveText(['480p', '720p', '1080p'])
  await expect(page.getByLabel('自动决定时长')).toBeChecked()
  await expect(page.getByLabel('生成同步音频')).toBeChecked()
  await page.getByLabel('自动决定时长').uncheck()
  await expect(page.getByLabel('时长（秒）')).toHaveAttribute('max', '30')
  await page.getByLabel('时长（秒）').fill('30')
  await page.getByLabel('生成模式').selectOption('firstFrameToVideo')
  await expect(page.getByLabel('画面比例').locator('option')).toHaveText(['adaptive'])
})

test('侧边栏省略超长标题和模型且保持操作按钮可见', async ({ page }) => {
  await ignoreKeyGate(page)
  const modelId = 'long-model-'.repeat(20)
  const title = '超长对话标题'.repeat(40)
  await createConversation(page, 'video', 'byteDanceVideo', modelId)
  await openSidebarIfNeeded(page)
  const sidebar = page.locator('aside:visible')
  const initialWidth = await sidebar.evaluate((element) => element.getBoundingClientRect().width)
  await sidebar.getByRole('button', { name: /^对话操作：/ }).click()
  page.once('dialog', (dialog) => void dialog.accept(title))
  await sidebar.getByRole('button', { name: '重命名', exact: true }).click()
  const link = sidebar.locator('.conversation-link')
  await expect(link.locator('span').first()).toHaveText(title)
  for (const span of await link.locator('span').all()) {
    const metrics = await span.evaluate((element) => ({
      client: element.clientWidth, scroll: element.scrollWidth,
      ellipsis: getComputedStyle(element).textOverflow,
    }))
    expect(metrics.scroll).toBeGreaterThan(metrics.client)
    expect(metrics.ellipsis).toBe('ellipsis')
  }
  const bounds = await sidebar.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    client: element.clientWidth, scroll: element.scrollWidth,
  }))
  expect(bounds.width).toBe(initialWidth)
  expect(bounds.scroll).toBeLessThanOrEqual(bounds.client)
  const actions = sidebar.getByRole('button', { name: `对话操作：${title}` })
  await expect(actions).toBeInViewport()
  await actions.click()
  await expect(sidebar.getByRole('button', { name: '删除', exact: true })).toBeVisible()
})

async function ignoreKeyGate(page: Page): Promise<void> {
  await page.getByRole('button', { name: '暂时忽略' }).click()
}

async function createConversation(
  page: Page,
  kind: 'image' | 'video',
  format: string,
  modelId?: string,
): Promise<void> {
  if (modelId) {
    await openSettings(page)
    await page.getByLabel('API 格式配置').selectOption(format)
    await page.getByLabel('添加模型 ID').fill(modelId)
    await page.getByRole('button', { name: '添加', exact: true }).click()
    await page.getByLabel('默认模型', { exact: true }).selectOption(modelId)
    await page.getByRole('button', { name: '关闭设置' }).click()
  }
  const name = kind === 'image' ? /图片对话/ : /视频对话/
  await page.getByRole('button', { name }).first().click()
  const dialog = page.getByRole('dialog')
  if (kind === 'video') await dialog.getByRole('button', { name: '视频对话' }).click()
  await dialog.getByLabel('API 格式').selectOption(format)
  await expect(dialog.getByLabel('模型 ID', { exact: true })).toHaveCount(0)
  await dialog.getByRole('button', { name: '创建对话' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeVisible()
}

async function openSidebarIfNeeded(page: Page): Promise<void> {
  const sidebar = page.locator('aside')
  if (!await sidebar.isVisible()) {
    await page.getByRole('button', { name: '打开侧边栏' }).click()
  }
  await expect(sidebar).toBeVisible()
}

async function closeSidebarIfOpen(page: Page): Promise<void> {
  const sidebar = page.locator('aside')
  if (!await sidebar.isVisible() || await page.getByRole('button', { name: '打开侧边栏' }).isHidden()) return
  await sidebar.getByRole('button', { name: '关闭侧边栏' }).click()
  await expect(sidebar).toBeHidden()
}

async function openNewConversation(page: Page): Promise<void> {
  await openSidebarIfNeeded(page)
  await page.locator('aside').getByRole('button', { name: '开启新对话' }).click()
}

async function openSettings(page: Page): Promise<void> {
  await openSidebarIfNeeded(page)
  await page.locator('aside').getByRole('button', { name: /^设置/ }).click()
}


test('按格式管理模型，新对话无需填写模型，且可切换并持久化', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'image', 'byteDanceImage', 'vendor/ep-custom-image')
  await expect(page.getByLabel('当前模型')).toHaveValue('vendor/ep-custom-image')
  await page.getByLabel('消息', { exact: true }).fill('保留的草稿')
  await page.getByLabel('当前模型').selectOption('doubao-seedream-5-0-pro-260628')
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('保留的草稿')
  await page.getByRole('button', { name: '参数', exact: true }).click()
  await expect(page.getByLabel('尺寸', { exact: true })).toHaveValue('2K')
  await expect(page.getByLabel('添加水印')).toBeChecked()
  await page.getByRole('button', { name: '关闭参数面板' }).click()
  await page.screenshot({ path: test.info().outputPath('chat-models.png'), fullPage: true })
  await page.reload()
  await expect(page.getByLabel('当前模型').locator('option[value="vendor/ep-custom-image"]')).toHaveCount(1)
  await expect(page.getByLabel('当前模型')).toHaveValue('doubao-seedream-5-0-pro-260628')
})

test('独立 Key 不会改写全局 Key 或其他格式', async ({ page }) => {
  await ignoreKeyGate(page)
  await openSettings(page)
  await page.getByLabel('API 格式配置').selectOption('byteDanceImage')
  await page.getByLabel('使用独立 Key').check()
  await page.getByLabel('独立 Key', { exact: true }).fill('seedream-only')
  await expect(page.getByLabel('全局 Key', { exact: true })).toHaveValue('')
  await page.getByLabel('API 格式配置').selectOption('openaiImage')
  await expect(page.getByLabel('使用独立 Key')).not.toBeChecked()
  await page.getByLabel('API 格式配置').selectOption('byteDanceImage')
  await expect(page.getByLabel('独立 Key', { exact: true })).toHaveValue('seedream-only')
  await page.screenshot({ path: test.info().outputPath('settings.png'), fullPage: true })
})

test('恢复默认设置会更新配置并在刷新后保留', async ({ page }) => {
  await ignoreKeyGate(page)
  await openSettings(page)
  await page.getByLabel('Base URL').fill('https://custom.example')
  await page.getByLabel('添加模型 ID').fill('custom-model')
  await page.getByRole('button', { name: '添加', exact: true }).click()
  await page.getByLabel('默认模型', { exact: true }).selectOption('custom-model')
  await page.getByLabel('主题').selectOption('dark')
  await page.getByRole('button', { name: '恢复默认设置' }).click()
  await expect(page.getByLabel('Base URL')).toHaveValue('https://www.shapi.vip')
  await expect(page.getByLabel('默认模型', { exact: true })).toHaveValue('gpt-image-2.5-sunburst')
  await expect(page.getByLabel('主题')).toHaveValue('system')
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.reload()
  await openSettings(page)
  await expect(page.getByLabel('Base URL')).toHaveValue('https://www.shapi.vip')
  await expect(page.getByLabel('默认模型', { exact: true })).toHaveValue('gpt-image-2.5-sunburst')
})


for (const viewport of [
  { width: 320, height: 568 }, { width: 390, height: 844 },
  { width: 768, height: 1024 }, { width: 1024, height: 768 },
  { width: 1440, height: 900 }, { width: 1920, height: 1080 },
  { width: 844, height: 390 },
]) {
  test(`屏幕适配 ${viewport.width}×${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await expect(page.locator('.app-shell')).toHaveCSS('height', `${viewport.height}px`)
    await assertInViewport(page.getByRole('dialog'), viewport)
    await ignoreKeyGate(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    await createConversation(page, 'image', 'openaiImage')
    await page.getByRole('textbox', { name: '消息', exact: true }).fill(Array.from({ length: 20 }, () => '一段很长的创作描述').join('\n'))
    await assertInViewport(page.locator('.composer-card'), viewport)
    const messages = await page.locator('.message-scroll').boundingBox()
    const composer = await page.locator('.chat-composer').boundingBox()
    expect(messages).not.toBeNull()
    expect(composer).not.toBeNull()
    expect((messages?.y ?? 0) + (messages?.height ?? 0)).toBeLessThanOrEqual((composer?.y ?? 0) + 1)
    await expect(page.getByRole('button', { name: '发送消息' })).toBeInViewport()
    await page.getByRole('button', { name: '参数', exact: true }).click()
    await assertInViewport(page.getByRole('dialog'), viewport)
    await page.getByRole('button', { name: '关闭参数面板' }).click()
    await openSettings(page)
    await assertInViewport(page.getByRole('dialog'), viewport)
    await page.getByLabel('主题').selectOption('dark')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
}

async function assertInViewport(
  locator: ReturnType<Page['locator']>, viewport: { width: number; height: number },
): Promise<void> {
  await expect(locator).toBeVisible()
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  if (!box) throw new Error('Missing layout box')
  expect(box.x).toBeGreaterThanOrEqual(-1)
  expect(box.y).toBeGreaterThanOrEqual(-1)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
}

test('窗口缩小后输入区仍可见，抽屉支持 Escape', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await ignoreKeyGate(page)
  await createConversation(page, 'image', 'openaiImage')
  await page.setViewportSize({ width: 390, height: 360 })
  await expect(page.getByRole('textbox', { name: '消息', exact: true })).toBeInViewport()
  await openSidebarIfNeeded(page)
  await expect(page.getByRole('dialog', { name: '对话导航' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog', { name: '对话导航' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开侧边栏' })).toBeFocused()
  expect(pageErrors).toEqual([])
})

test('OpenAI 九种比例分辨率预设与 max 质量随请求保存', async ({ page }) => {
  await page.getByLabel('API Key').fill('browser-test-key')
  await page.getByRole('button', { name: '保存 Key 并进入' }).click()
  await createConversation(page, 'image', 'openaiImage')
  await page.getByRole('button', { name: '参数', exact: true }).click()
  await expect(page.getByLabel('快捷比例').locator('option')).toHaveCount(9)
  await page.getByLabel('快捷比例').selectOption('16:9')
  await page.getByRole('button', { name: /4K/ }).click()
  await expect(page.getByRole('textbox', { name: /^尺寸/ })).toHaveValue('3840x2160')
  await page.getByLabel('质量', { exact: true }).selectOption('max')
  await page.getByRole('button', { name: '关闭参数面板' }).click()

  const captured = page.waitForRequest('**/api/v1/images/conversation-turns/stream')
  await page.route('**/api/v1/images/conversation-turns/stream', (route) => route.fulfill({
    status: 200, contentType: 'text/event-stream',
    body: [
      'event: turn.started\ndata: {"requestId":"req_presets","apiFormat":"openaiImage"}\n\n',
      `event: image.completed\ndata: {"index":0,"image":{"id":"img_presets","mimeType":"image/png","base64Data":"${tinyPng.toString('base64')}","revisedPrompt":null,"thought":false,"thoughtSignature":null},"providerMetadata":null}\n\n`,
      'event: turn.completed\ndata: {"requestId":"req_presets","usage":null,"providerState":null}\n\n',
    ].join(''),
  }))
  await page.getByRole('textbox', { name: '消息', exact: true }).fill('测试预设')
  await page.getByRole('button', { name: '发送消息' }).click()
  expect((await captured).postDataJSON()).toMatchObject({
    options: { size: '3840x2160', quality: 'max' },
  })
  await expect(page.getByAltText('生成结果 1')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '参数', exact: true }).click()
  await expect(page.getByRole('textbox', { name: /^尺寸/ })).toHaveValue('3840x2160')
  await expect(page.getByLabel('质量', { exact: true })).toHaveValue('max')
})
