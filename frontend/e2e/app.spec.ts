import { expect, test, type Page } from 'playwright/test'

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

  await createConversation(page, 'image', 'openaiResponsesImage')
  await expect(page.getByText('OpenAI Responses 图像 · gpt-5.6-luna').last()).toBeVisible()
  await expect(page.getByText('Key 已就绪')).toBeVisible()

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
  await page.getByRole('button', { name: '绘制遮罩' }).click()
  await expect(page.getByRole('heading', { name: 'OpenAI 遮罩编辑器' })).toBeVisible()
})

test('Seedance 2.0 隐藏并省略不支持的 service_tier 参数', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'video', 'byteDanceVideo')
  await page.getByRole('button', { name: '参数', exact: true }).click()

  await expect(page.getByText('自动决定时长')).toBeVisible()
  await expect(page.getByText('生成同步音频')).toBeVisible()
  await expect(page.getByText('Web Search')).toBeVisible()
  await expect(page.getByText('服务等级')).toHaveCount(0)
  await expect(page.getByLabel('分辨率')).toHaveValue('720p')
  await expect(page.getByLabel('分辨率').locator('option[value="4k"]')).toHaveCount(1)
  await expect(page.getByLabel('分辨率').locator('option[value="1080p"]')).toHaveCount(1)
})

test('Seedance 2.0 fast-se 可选择 1080p 但不能选择 4k', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'video', 'byteDanceVideo', 'doubao-seedance-2-0-fast-260128-se')
  await page.getByRole('button', { name: '参数', exact: true }).click()

  const resolution = page.getByLabel('分辨率')
  await expect(resolution.locator('option[value="1080p"]')).toHaveCount(1)
  await expect(resolution.locator('option[value="4k"]')).toHaveCount(0)
  await resolution.selectOption('1080p')
  await expect(resolution).toHaveValue('1080p')
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
}

async function openSidebarIfNeeded(page: Page): Promise<void> {
  const sidebar = page.locator('aside')
  if ((await sidebar.getAttribute('data-open')) === 'true') return
  const openSidebar = page.getByRole('button', { name: '打开侧边栏' })
  if (await openSidebar.isVisible()) {
    await openSidebar.click()
    await page.waitForTimeout(350)
  }
}

async function closeSidebarIfOpen(page: Page): Promise<void> {
  const sidebar = page.locator('aside')
  if ((await sidebar.getAttribute('data-open')) !== 'true') return
  await sidebar.getByRole('button', { name: '关闭侧边栏' }).click()
  await page.waitForTimeout(350)
}

async function openNewConversation(page: Page): Promise<void> {
  await openSidebarIfNeeded(page)
  await page.locator('aside').getByRole('button', { name: '开启新对话' }).click()
}

async function openSettings(page: Page): Promise<void> {
  await openSidebarIfNeeded(page)
  await page.locator('aside').getByRole('button', { name: '设置', exact: true }).click()
}


test('按格式管理模型，新对话无需填写模型，且可切换并持久化', async ({ page }) => {
  await ignoreKeyGate(page)
  await createConversation(page, 'image', 'byteDanceImage', 'ep-custom-image')
  await expect(page.getByLabel('当前模型')).toHaveValue('ep-custom-image')
  await page.getByLabel('消息', { exact: true }).fill('保留的草稿')
  await page.getByLabel('当前模型').selectOption('doubao-seedream-5-0-pro-260628')
  await expect(page.getByLabel('消息', { exact: true })).toHaveValue('保留的草稿')
  await page.getByRole('button', { name: '参数', exact: true }).click()
  await expect(page.getByLabel('尺寸', { exact: true })).toHaveValue('2K')
  await expect(page.getByLabel('添加水印')).toBeChecked()
  await page.getByRole('button', { name: '关闭参数面板' }).click()
  await page.screenshot({ path: test.info().outputPath('chat-models.png'), fullPage: true })
  await page.reload()
  await expect(page.getByLabel('当前模型').locator('option[value="ep-custom-image"]')).toHaveCount(1)
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
