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

  await page.getByRole('button', { name: /图片对话/ }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByLabel('API 格式')).toHaveValue('openaiImage')
  await expect(dialog.getByLabel('模型 ID')).toHaveValue('gpt-image-2.5-sunburst')
  await expect(dialog.getByText('https://www.shapi.vip', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '创建对话' }).click()
  await expect(page.getByText('OpenAI Images · gpt-image-2.5-sunburst').last()).toBeVisible()
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
  await expect(page.getByText('gpt-5.6-luna', { exact: true })).toBeVisible()
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
  const name = kind === 'image' ? /图片对话/ : /视频对话/
  await page.getByRole('button', { name }).first().click()
  const dialog = page.getByRole('dialog')
  if (kind === 'video') await dialog.getByRole('button', { name: '视频对话' }).click()
  await dialog.getByLabel('API 格式').selectOption(format)
  if (modelId) await dialog.getByLabel('模型 ID').fill(modelId)
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


test('恢复默认设置会更新配置并在刷新后保留', async ({ page }) => {
  await ignoreKeyGate(page)
  await openSettings(page)
  await page.getByLabel('Base URL').fill('https://custom.example')
  await page.getByLabel('默认模型 ID').fill('custom-model')
  await page.getByLabel('主题').selectOption('dark')
  await page.getByRole('button', { name: '恢复默认设置' }).click()
  await expect(page.getByLabel('Base URL')).toHaveValue('https://www.shapi.vip')
  await expect(page.getByLabel('默认模型 ID')).toHaveValue('gpt-image-2.5-sunburst')
  await expect(page.getByLabel('主题')).toHaveValue('system')
  await page.getByRole('button', { name: '关闭设置' }).click()
  await page.reload()
  await openSettings(page)
  await expect(page.getByLabel('Base URL')).toHaveValue('https://www.shapi.vip')
  await expect(page.getByLabel('默认模型 ID')).toHaveValue('gpt-image-2.5-sunburst')
})
