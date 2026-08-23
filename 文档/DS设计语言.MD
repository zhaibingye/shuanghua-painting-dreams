# DeepSeek (chat.deepseek.com) 设计语言系统规范 (DS Design System)

> 本文档通过对 DeepSeek 官方 Web 客户端（`chat.deepseek.com`）底层设计工程、样式表架构、组件库规范（`ds-*` 体系）以及 Light/Dark 双模式主题 Token 进行深度提取与全景逆向解析编写而成。旨在为前端重构、组件开发及 UI 一致性提供权威的设计系统规范标准。

---

## 目录

1. [设计理念与视觉基调 (Philosophy & Visual Tone)](#1-设计理念与视觉基调)
2. [设计 Token 体系 (Design Token Architecture)](#2-设计-token-体系)
3. [色彩系统 (Color System)](#3-色彩系统)
   - 3.1 [基础色板 (Static Primitive Palette)](#31-基础色板-static-primitive-palette)
   - 3.2 [语义别名色彩表 (Semantic Alias Tokens)](#32-语义别名色彩表-semantic-alias-tokens)
   - 3.3 [特定场景色彩 (Specific Component Tokens)](#33-特定场景色彩-specific-component-tokens)
4. [排版与字体系统 (Typography System)](#4-排版与字体系统)
   - 4.1 [字体族架构 (Font Families)](#41-字体族架构-font-families)
   - 4.2 [排版阶梯与字号规格 (Type Scale)](#42-排版阶梯与字号规格-type-scale)
   - 4.3 [Markdown 与内容排版规则 (Rich Content Typography)](#43-markdown-与内容排版规则-rich-content-typography)
5. [间距、尺寸与网格布局 (Layout & Spacing Scale)](#5-间距尺寸与网格布局)
   - 5.1 [控件标准高度 (Control Heights)](#51-控件标准高度-control-heights)
   - 5.2 [核心布局区域规范 (Layout Dimensions)](#52-核心布局区域规范-layout-dimensions)
6. [圆角、边框与投影系统 (Shape, Border & Elevation)](#6-圆角边框与投影系统)
   - 6.1 [圆角体系 (Border Radius Scale)](#61-圆角体系-border-radius-scale)
   - 6.2 [投影与层级 (Elevation & Shadows)](#62-投影与层级-elevation--shadows)
   - 6.3 [边框与分割线 (Border & Dividers)](#63-边框与分割线-border--dividers)
7. [核心组件库规范 (Component Specifications)](#7-核心组件库规范)
   - 7.1 [按钮系统 (`.ds-button`)](#71-按钮系统-ds-button)
   - 7.2 [切换与分段控件 (`.ds-toggle-button` / `.ds-segmented`)](#72-切换与分段控件-ds-toggle-button--ds-segmented)
   - 7.3 [输入框与文本域 (`.ds-input` / `.ds-textarea`)](#73-输入框与文本域-ds-input--ds-textarea)
   - 7.4 [全域焦点环机制 (`.ds-focus-ring`)](#74-全域焦点环机制-ds-focus-ring)
   - 7.5 [对话流与深度思考区 (`.ds-think-content`)](#75-对话流与深度思考区-ds-think-content)
   - 7.6 [代码块与技术渲染 (`.md-code-block` / KaTeX)](#76-代码块与技术渲染-md-code-block--katex)
   - 7.7 [浮层与弹窗 (`.ds-modal` / `.ds-toast` / `.ds-tooltip` / `.ds-dropdown-menu`)](#77-浮层与弹窗-ds-modal--ds-toast--ds-tooltip--ds-dropdown-menu)
   - 7.8 [自定义滚动区域 (`.ds-scroll-area`)](#78-自定义滚动区域-ds-scroll-area)
8. [动效与微交互 (Motion & Micro-interactions)](#8-动效与微交互)
9. [CSS 变量工程化落地参考 (Implementation Guide)](#9-css-变量工程化落地参考)

---

## 1. 设计理念与视觉基调

DeepSeek Web 端展现了典型的新一代 AI 工具型产品设计语言：**理智、克制、轻量、高信息密度与极致专注**。

- **冷色调冷中性基底（Bluish Neutral）**：不同于传统的黑白灰，DeepSeek 全量采用混入冷蓝调的中性灰（`#0f1115`, `#151517`, `#61666b`, `#f9fafb` 等），营造极具未来感与科技感的冷峻视觉氛围。
- **高识别度品牌蓝（DeepSeek Blue）**：主品牌色选用明亮且沉稳的电光蓝 `#3964fe`（Dark 模式下自适应调整为 `#5686fe` / `#679efe`），传递智慧、精准与计算能力。
- **胶囊化与大圆角（Capsule & Soft Geometry）**：交互控件（按钮、模式切换器、思考卡片）广泛采用 Pill/Capsule（`4096px` / `120px`）与柔和中圆角（`10px` / `18px`），弱化棱角带来的攻击性，提升触控与点击亲和力。
- **透明度叠加与分层感知（Elevation via Alpha Layering）**：大量采用 `rgba(38,49,72, 0.06)`、`rgba(255,255,255, 0.08)` 等半透明色值与 `backdrop-filter: blur(2px)` 构建微弱的空间深度与浮层层级。
- **深度思考可视化（Reasoning Transparency）**：首创的 R1 思考过程区块（Thinking Block），通过柔和折叠区域、渐变蒙层与独立次级排版（13px/14px），使 AI 推理链路兼具结构性与沉浸感。

---

## 2. 设计 Token 体系

DeepSeek 前端采用了严格的三层 CSS 变量架构体系：

```
[Primitive Tokens (基础原子值)]  --> --dsw-static-* (静态颜色、字号、基础阶梯)
           ↓
[Semantic Tokens (语义别名)]    --> --dsw-alias-*  (根据主题自适应切换的背景/文本/边框)
           ↓
[Component Tokens (组件级局部)]  --> --dsl-*        (按钮、输入框、Tooltip 等组件内私有变量)
```

---

## 3. 色彩系统 (Color System)

### 3.1 基础色板 (Static Primitive Palette)

#### 品牌蓝系 (DeepSeek Brand Blue)
| Token 名 | HEX 色值 | 预览/说明 |
| :--- | :--- | :--- |
| `--dsw-static-deepseek-50` | `#edf3fe` | 浅蓝背景 / 激活态底色 (Light) |
| `--dsw-static-deepseek-100` | `#e4edfd` | 浅蓝边框 / 悬浮高亮 (Light) |
| `--dsw-static-deepseek-200` | `#d3e2ff` | 气泡微高亮 |
| `--dsw-static-deepseek-300` | `#b7c8fe` | 强调边框 / 次级强调 |
| `--dsw-static-deepseek-400` | `#679efe` | 浅主色 / 深色模式文本 |
| `--dsw-static-deepseek-450` | `#5686fe` | 主按钮悬浮态 / 深色模式主色 |
| `--dsw-static-deepseek-500` | `#3964fe` | **主品牌色 (Brand Primary)** |
| `--dsw-static-deepseek-600` | `#4868b2` | 深沉蓝 / 投影晕染色 |
| `--dsw-static-deepseek-800` | `#34415b` | 暗蓝灰 |
| `--dsw-static-deepseek-900` | `#283142` | 暗蓝黑 / 深色模式激活底色 |

#### 冷蓝中性色系 (Bluish Neutral Palette - 核心质感色)
| Token 名 | HEX 色值 | 用途定义 |
| :--- | :--- | :--- |
| `--dsw-static-neutral-bluish-00` | `#ffffff` | 纯白底色 / 高对比前景 |
| `--dsw-static-neutral-bluish-50` | `#f9fafb` | Light 浅底 / Dark 主要文本色 |
| `--dsw-static-neutral-bluish-60` | `#f5f6f7` | 模块平台底色 / 浅灰底 |
| `--dsw-static-neutral-bluish-75` | `#f1f3f5` | 控件 Hover 态 / 选择器背景 |
| `--dsw-static-neutral-bluish-100`| `#ebeef2` | 侧边栏激活底色 / 行内代码底色 |
| `--dsw-static-neutral-bluish-150`| `#e9ecf2` | 浮层遮罩底色 (Overlay) |
| `--dsw-static-neutral-bluish-200`| `#e1e5ee` | 浅灰边框 / 弱化提示 |
| `--dsw-static-neutral-bluish-300`| `#cfd3d6` | 次级浅灰 / 分割线 |
| `--dsw-static-neutral-bluish-400`| `#adb2b8` | Caption 辅助说明文字 |
| `--dsw-static-neutral-bluish-500`| `#979da6` | 中度弱化文本 |
| `--dsw-static-neutral-bluish-600`| `#81858c` | 三级文本 / 图标默认色 |
| `--dsw-static-neutral-bluish-700`| `#61666b` | 次级文本 (Label Secondary) |
| `--dsw-static-neutral-bluish-750`| `#43454a` | 深色模式浮层 / Toast 底色 |
| `--dsw-static-neutral-bluish-800`| `#353638` | 深色模式菜单 / 容器层级 |
| `--dsw-static-neutral-bluish-850`| `#2c2c2e` | 深色模式 Tooltip / 输入框底 |
| `--dsw-static-neutral-bluish-875`| `#232324` | 深色模式 Layer-1 背景 |
| `--dsw-static-neutral-bluish-900`| `#1b1b1c` | 深色模式侧边栏 / 代码块底色 |
| `--dsw-static-neutral-bluish-950`| `#151517` | **深色模式基底 (Dark Base Bg)** |
| `--dsw-static-neutral-bluish-1000`| `#0f1115` | **浅色模式主文本 (Light Primary Text)** |

#### 语义功能色系 (Semantic Colors)
- **红色 / 危险 / 错误 (Red)**:
  - 50: `#fef2f2` | 100: `#fee2e2` | 400: `#f25a5a` | 500: `#ef4444` | 600: `#ec1313` | 900: `#570c0c`
- **绿色 / 成功 (Green)**:
  - 100: `#e6faed` | 400: `#4ed17e` | 500: `#22c55e` | 900: `#233c2c`
- **琥珀 / 警告 (Amber)**:
  - 100: `#fef5e7` | 400: `#f7ad31` | 500: `#f59e0b` | 600: `#dd8629` | 900: `#27241f`
- **信息蓝 (Info Blue)**:
  - 50: `#eff6ff` | 100: `#dbeafe` | 300: `#93c5fd` | 400: `#60a5fa` | 500: `#3b82f6` | 600: `#2563eb`

---

### 3.2 语义别名色彩表 (Semantic Alias Tokens)

以下为核心 Alias Token 在浅色（Light）与深色（Dark）模式下的对应转换矩阵：

| Token 名称 | 浅色模式 (Light) | 深色模式 (`body[data-ds-dark-theme]`) | 语义说明 |
| :--- | :--- | :--- | :--- |
| `--dsw-alias-bg-base` | `#ffffff` | `#151517` (`bluish-950`) | 页面最底层主画布背景 |
| `--dsw-alias-bg-layer-1` | `#ffffff` | `#232324` (`bluish-875`) | 第一层容器底色 |
| `--dsw-alias-bg-layer-2` | `#ffffff` | `#2c2c2e` (`bluish-850`) | 第二层容器/卡片底色 |
| `--dsw-alias-bg-layer-3` | `#ffffff` | `#353638` (`bluish-800`) | 弹出菜单/最高层级底色 |
| `--dsw-alias-brand-primary` | `#3964fe` (`deepseek-500`) | `#5686fe` (`deepseek-450`) | 主品牌色 |
| `--dsw-alias-brand-text` | `#3964fe` (`deepseek-500`) | `#679efe` (`deepseek-400`) | 品牌文字强调色 |
| `--dsw-alias-label-primary` | `#0f1115` (`bluish-1000`)| `#f9fafb` (`bluish-50`) | **主要正文文本色** |
| `--dsw-alias-label-secondary`| `#61666b` (`bluish-700`)| `#cfd3d6` (`bluish-300`) | **次级说明/副标题色** |
| `--dsw-alias-label-tertiary` | `#81858c` (`bluish-600`)| `#adb2b8` (`bluish-400`) | **三级占位符/弱文字色** |
| `--dsw-alias-label-caption`  | `#adb2b8` (`bluish-400`)| `#81858c` (`bluish-600`) | 辅助说明极浅文本 |
| `--dsw-alias-border-l1` | `rgba(0, 0, 0, 0.04)` | `rgba(255, 255, 255, 0.06)`| 极轻微边框 |
| `--dsw-alias-border-l2` | `rgba(0, 0, 0, 0.10)` | `rgba(255, 255, 255, 0.12)`| 标准控件/输入框边框 |
| `--dsw-alias-border-l3` | `rgba(0, 0, 0, 0.12)` | `rgba(255, 255, 255, 0.16)`| 强化边框 |
| `--dsw-alias-border-l4` | `rgba(0, 0, 0, 0.16)` | `rgba(255, 255, 255, 0.20)`| 强分割边框 |
| `--dsw-alias-interactive-bg-hover` | `rgba(38, 49, 72, 0.06)` | `rgba(255, 255, 255, 0.08)` | 通用交互项悬浮底色 |
| `--dsw-alias-interactive-bg-active`| `rgba(38, 49, 72, 0.10)` | `rgba(255, 255, 255, 0.14)` | 通用交互项点击按下底色 |
| `--dsw-alias-toast-bg` | `#353638` (`bluish-800`)| `#43454a` (`bluish-750`) | 全局 Toast 背景色 |
| `--dsw-alias-tooltip-bg` | `#2c2c2e` (`bluish-850`)| `#43454a` (`bluish-750`) | Tooltip 提示框背景色 |

---

### 3.3 特定场景色彩 (Specific Component Tokens)

| Token 名称 | 浅色模式 (Light) | 深色模式 (Dark) | 业务场景 |
| :--- | :--- | :--- | :--- |
| `--dsw-specific-sidebar-fill` | `#f9fafb` | `#1b1b1c` | 左侧历史会话栏背景色 |
| `--dsw-specific-sidebar-nav-item-hover` | `#f1f3f5` | `#2c2c2e` | 侧边栏列表项悬停 |
| `--dsw-specific-sidebar-nav-item-active`| `#ebeef2` | `#43454a` | 侧边栏当前选中会话 |
| `--dsw-specific-input-major` | `#ffffff` | `#2c2c2e` | 主聊天输入框背景底色 |
| `--dsw-specific-bubble` | `#edf3fe` | `#2c2c2e` | 用户提问气泡底色 |
| `--dsw-specific-bubble-highlight` | `#d3e2ff` | `#43454a` | 气泡高亮或引用态 |
| `--dsw-alias-markdown-code-block` | `#f9fafb` | `#1b1b1c` | Markdown 代码块主体背景 |
| `--dsw-alias-markdown-code-block-banner`| `#f9fafb` | `#2c2c2e` | 代码块顶部语言栏背景 |
| `--dsw-alias-markdown-inline-code` | `#ebeef2` | `#2c2c2e` | 行内 `code` 背景色 |
| `--dsw-alias-markdown-citation` | `#ebeef2` | `#353638` | 搜索引用脚注标签底色 |

---

## 4. 排版与字体系统 (Typography System)

### 4.1 字体族架构 (Font Families)

DeepSeek 配置了精细的中西文混排字体栈与 CJK 标点补丁：

```css
/* 主文本字体栈 */
--dsw-font-family: quote-cjk-patch, Inter, system-ui, -apple-system, 
                   BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, 
                   Cantarell, "Open Sans", "Helvetica Neue", sans-serif;

/* 代码与等宽文本字体栈 */
--ds-font-family-code: Menlo, Monaco, Consolas, "Cascadia Mono", 
                       "Ubuntu Mono", "DejaVu Sans Mono", "Liberation Mono", 
                       "JetBrains Mono", "Fira Code", Cousine, "Roboto Mono", 
                       "Courier New", Courier, sans-serif, system-ui;
```

> **特别优化补丁 `quote-cjk-patch`**：
> DeepSeek 通过 `@font-face { font-family: quote-cjk-patch; src: local("PingFangSC-Regular"); unicode-range: U+201C-201D; }` 针对中文弯引号 `“”` 进行专门的字形与基线校准，消除中西文混排时的引号下坠与间距异常。

---

### 4.2 排版阶梯与字号规格 (Type Scale)

| 规格级别 | 字号 (Font Size) | 行高 (Line Height) | 字重 (Font Weight) | Token 定义 | 典型应用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **XL-24** | `24px` | `32px` | 600 (Semi-bold) | `--dsw-font-xl-24` | 欢迎语标题 / 大模块标题 |
| **L-20** | `20px` | `28px` | 500 (Medium) | `--dsw-font-l-20` | 模态框标题 / 登录卡片标题 |
| **M-18** | `16px` | `28px` | 500 (Medium) | `--dsw-font-m-18` | 中型卡片标题 / 强调行 |
| **Base-16**| `16px` | `24px` | 400 (Regular) | `--dsw-font-base-16` | 主输入框内容 / 大号正文 |
| **Base-Strong** | `16px` | `24px` | 500 (Medium) | `--dsw-font-base-strong-16`| 强调正文 |
| **S-14** (Default) | `14px` | `22px` / `25px` | 400 (Regular) | `--dsw-font-s-14` | **全局默认正文 / 侧边栏列表 / 按钮** |
| **S-Strong-14** | `14px` | `22px` | 500 (Medium) | `--dsw-font-s-strong-14` | 按钮文字 / 选中状态项 |
| **XS-13** | `13px` | `20px` / `23px` | 400 (Regular) | `--dsw-font-xs-13` | Toggle 按钮 / 模式选择器 |
| **XS-Strong-13**| `13px` | `20px` | 500 (Medium) | `--dsw-font-xs-strong-13` | 深度思考 / 智能搜索开关文字 |
| **XXS-12** | `12px` | `18px` / `21px` | 400 (Regular) | `--dsw-font-xxs-12` | 底部免责声明 / 脚注 / 计数器 |
| **Code-13**| `13px` | `22px` | 400 (Regular) | `--dsw-font-markdown-code-block` | **代码块主体代码** |

---

### 4.3 Markdown 与内容排版规则 (Rich Content Typography)

AI 回复区（`.ds-markdown`）与深度思考区（`.ds-think-content`）有着精密的排版规则：

```css
/* 标准 Markdown 阶梯 */
--dsw-font-markdown-h1: 700 24px/34px var(--dsw-font-family);
--dsw-font-markdown-h2: 700 22px/32px var(--dsw-font-family);
--dsw-font-markdown-h3: 700 20px/30px var(--dsw-font-family);
--dsw-font-markdown-h4: 600 16px/28px var(--dsw-font-family);
--dsw-font-markdown-base: 400 16px/28px var(--dsw-font-family);
--dsw-font-markdown-table: 400 15px/25px var(--dsw-font-family);
--dsw-font-markdown-small: 400 14px/24px var(--dsw-font-family); /* 思考区专用 */
--dsw-font-markdown-code: 400 14px/22px var(--ds-font-family-code);
```

#### Markdown 排版核心细节：
1. **段落间距**：`p`, `ul`, `ol`, `blockquote` 统一 `margin: 12px 0`，避免排版过挤。
2. **紧凑列表衔接**：通过 `:has()` 伪类实现标题与列表间的紧凑排版（`h3:has(+ul) { margin-bottom: 4px; }`，`h3 + ul { margin-top: 4px; }`）。
3. **表格规范**：表头 `font-weight: 500`，字号 `15px/25px`，边框使用 `--dsw-alias-border-l2`（`1px solid`）。
4. **思考过程排版**：`.ds-think-content` 全域字号缩小为 `14px/24px`，字体颜色锁定为次级文本 `--dsw-alias-label-secondary`（`#61666b` / `#cfd3d6`），视觉上明显从最终结论中剥离。

---

## 5. 间距、尺寸与网格布局 (Layout & Spacing Scale)

### 5.1 控件标准高度 (Control Heights)

DeepSeek 严格规范了交互控件的高度标准：

| 级别 Token | 高度值 | 对应组件场景 |
| :--- | :--- | :--- |
| `--ds-control-height-xl` | `44px` | 大号表单输入框、主要大按钮 |
| `--ds-control-height-l` | `48px` | 欢迎页大输入框、大号选择器 |
| `--ds-control-height-m` | `36px` / `34px` | **通用标准按钮、标准选择框、搜索开关** |
| `--ds-control-height-s` | `32px` / `28px` | 紧凑型按钮、小号操作胶囊 |
| `--ds-control-height-xs`| `28px` / `24px` | 极小标签、行内辅助操作按钮 |

---

### 5.2 核心布局区域规范 (Layout Dimensions)

```
+-----------------------------------------------------------------------------------+
|  [Sidebar 261px]   |                     [Main Chat Viewport]                     |
|                    |                                                              |
|  [+ 新建会话]      |  Header Bar (模式选择: 快速 / 专家 / 识图 - 120px Pill)       |
|                    |  ----------------------------------------------------------  |
|  会话历史列表      |                                                              |
|  - 今天            |  [Message Stream Area] (Max-width: 840px / 712px)            |
|  - 过去 7 天       |    - User Message Bubble (右/自适应背景: #edf3fe)            |
|                    |    - Assistant Think Block (折叠卡片 + 渐变)                 |
|                    |    - Assistant Final Response (Markdown 流式生成)            |
|                    |                                                              |
|  ----------------- |  ----------------------------------------------------------  |
|  [底部用户/设置]   |  [Floating Input Container] (Max-width: 840px, Radius: 24px)|
|                    |    [Textarea Auto-height]                                    |
|                    |    [深度思考 Toggle] [智能搜索 Toggle] ---- [附件] [发送 Button] |
+-----------------------------------------------------------------------------------+
```

- **侧边栏宽度**：`--sider-width: 261px;`（固定宽度，支持收起折叠）。
- **消息内容流宽度**：
  - 宽屏（>= 1200px）：`--message-list-max-width: 840px;`，水平内边距 `--message-list-padding-horizontal: 44px;`。
  - 窄屏（< 1200px）：`--message-list-max-width: 712px;`，水平内边距 `--message-list-padding-horizontal: 36px;`。
- **输入框最大宽度**：跟随消息区域居中对齐（`max-width: 840px` / `712px`），离视口底部间距 `24px`。

---

## 6. 圆角、边框与投影系统 (Shape, Border & Elevation)

### 6.1 圆角体系 (Border Radius Scale)

| 圆角级别 | 像素值 | 应用场景 |
| :--- | :--- | :--- |
| **Pill / Capsule** | `4096px` / `120px` / `100px` | 胶囊按钮（`.ds-button--capsule`）、模式切换分段组、新建会话按钮 |
| **Circle** | `50%` | 发送圆形按钮（`.ds-button--circle`）、用户头像、圆形图标按钮 |
| **XL** | `24px` | 主输入框外层容器、大型引导卡片 |
| **L** | `18px` | 深度思考 / 智能搜索 Toggle 按钮（`border-radius: 18px;`） |
| **MD** | `12px` | 模态框（Modal）、下拉菜单（Dropdown）、Toast 提示框、历史记录卡片 |
| **SM** | `10px` / `8px` | 表单输入框（`.ds-input`）、菜单选项（`.ds-dropdown-menu-option`）、代码块 |
| **Sharp** | `0px` | 分割线、全屏贴边组件 |

---

### 6.2 投影与层级 (Elevation & Shadows)

DeepSeek 采用多重扩散的极浅投影体系，保证清爽通透的高级感：

```css
/* Level 1: 基础轻微悬浮 (用于小卡片、微交互) */
--dsw-shadow-lv1: 0 2px 4px 0 rgba(0, 0, 0, 0.05);
--dsw-shadow-lv1-blur: 0 4px 12px 0 rgba(0, 0, 0, 0.02);

/* Level 2: 中层悬浮 (用于浮动按钮、次级弹窗) */
--dsw-shadow-lv2: 0 4px 12px 0 rgba(0, 0, 0, 0.02), 
                  0 2px 8px 0 rgba(0, 0, 0, 0.04);

/* Level 3: 顶层浮层 (用于主下拉菜单、模态框 Modal、大型 Floating Bar) */
--dsw-shadow-lv3: 0 0 1px 0 rgba(0, 0, 0, 0.20), 
                  0 0 4px 0 rgba(0, 0, 0, 0.02), 
                  0 12px 32px 0 rgba(0, 0, 0, 0.08);

/* 主输入框发光投影 (Light Mode 专用双层蓝色辉光投影) */
box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02), 
            0 2px 2px rgba(72, 104, 178, 0.01), 
            0 30px 60px rgba(72, 104, 178, 0.03);

/* Tooltip 专用深邃投影 */
--dsl-tooltip-box-shadow: 0 6px 16px 0 rgba(0, 0, 0, 0.08), 
                          0 3px 6px -4px rgba(0, 0, 0, 0.12), 
                          0 9px 28px 8px rgba(0, 0, 0, 0.05);
```

> **深色模式处理**：深色模式下，主输入框与大多数平面卡片的 `box-shadow` 均降解为 `none`，转而依靠 `--dsw-alias-border-l2`（`rgba(255,255,255, 0.12)`）来界定空间轮廓。

---

### 6.3 边框与分割线 (Border & Dividers)

- **默认控件线框**：`1px solid var(--dsw-alias-border-l2)` 或精细亚像素边框 `0.8px solid rgba(0, 0, 0, 0.1)`。
- **内发光聚焦边框 (Inset Border)**：
  - 输入框与文本域采用 `box-shadow: inset 0 0 0 1px var(--dsw-alias-border-l2);`，确保元素尺寸在聚焦/失焦时不产生 1px 抖动。

---

## 7. 核心组件库规范 (Component Specifications)

### 7.1 按钮系统 (`.ds-button`)

DeepSeek 的按钮分为形态（Shape）、变体（Variant）与尺寸（Size）正交组合：

```
.ds-button
  ├── Variants:
  │    ├── .ds-button--primary       (填充主品牌色: #3964fe, 文字: #fff)
  │    ├── .ds-button--filled        (浅灰填充: --dsw-specific-selector)
  │    ├── .ds-button--outlined      (线框按钮: 1px solid --dsw-alias-border-l2)
  │    ├── .ds-button--borderless    (无边框幽灵按钮: 背景透明, Hover 显示灰底)
  │    ├── .ds-button--error         (危险红按钮: #ef4444)
  │    └── .ds-button--textLink      (纯文本链接按钮)
  ├── Shapes:
  │    ├── .ds-button--capsule       (全胶囊型: border-radius: 4096px)
  │    ├── .ds-button--circle        (圆形: border-radius: 50%)
  │    └── .ds-button--roundRect     (圆角矩形: border-radius: 10px)
  └── Sizes:
       ├── .ds-button--xl            (Height: 44px, Padding: 0 14px, Font: 14px/500)
       ├── .ds-button--l             (Height: 48px, Padding: 0 14px, Font: 14px)
       ├── .ds-button--m             (Height: 36px, Padding: 0 14px, Font: 14px)
       └── .ds-button--s             (Height: 32px, Padding: 0 14px, Font: 14px, Icon: 14px)
```

#### 发送按钮（Send Button）特殊实现：
- 采用 `.ds-button--circle.ds-button--primary`（尺寸 `34px * 34px`）。
- **禁用态（Disabled）**：背景维持 `--dsw-static-deepseek-500`，但设置 `opacity: 0.45` 且 `cursor: not-allowed`。
- **可发送态**：`opacity: 1`，悬停触发渐变亮化 `--dsw-static-deepseek-450`。

---

### 7.2 切换与分段控件 (`.ds-toggle-button` / `.ds-segmented`)

#### 1. 深度思考 / 智能搜索 Toggle 按钮 (`.ds-toggle-button`)
底部输入栏核心功能开关：
- **未选中态**：
  - `height: 34px; border-radius: 18px; padding: 0 12px; font-size: 13px; font-weight: 500;`
  - `background: transparent; border: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary);`
- **选中激活态 (`.ds-toggle-button--selected`)**：
  - `background: #edf3fe` (`--dsw-static-deepseek-50` / Dark: `#283142`)
  - `border-color: #b7c8fe` (`--dsw-static-deepseek-300` / Dark: `#4868b2`)
  - `color: #3964fe` (`--dsw-static-deepseek-500` / Dark: `#679efe`)
- **图标尺寸**：`14px * 14px`，图标与文字间距 `4px`。

#### 2. 顶栏模式选择器（Radio Segmented Group）
页面顶部 "快速模式 / 专家模式 / 识图模式" 胶囊分段栏：
- **外层容器**：`border-radius: 120px; border: 0.8px solid rgba(0,0,0,0.1); padding: 1px; background: #fff;`
- **单选项**：`height: 34px; padding: 4px 22px; border-radius: 120px; font-size: 14px;`
- **选中项**：字体颜色高亮为 `--dsw-alias-brand-primary`（`#3964fe`），带白色微投影高亮药丸滑块背景。

---

### 7.3 输入框与文本域 (`.ds-input` / `.ds-textarea`)

#### 主聊天输入卡片（Floating Main Input Bar）
- **外层卡片**：`border-radius: 24px; background: var(--dsw-specific-input-major); border: 1px solid var(--dsw-alias-border-l2);`
- **Textarea 区域**：
  - `padding: 12px 12px 0 16px; font-size: 16px; line-height: 25px;`
  - 无原生边框（`border: none; outline: none; background: transparent;`）
  - 自动增高机制（Auto-expanding height，最小 `60px`，最大 `240px` 触发内部滚动）。
  - Placeholder 文本色：`--dsw-alias-label-tertiary`（`#81858c`）。
- **底栏动作条（Actions Toolbar）**：
  - 左侧：深度思考 Toggle + 智能搜索 Toggle。
  - 右侧：附件上传按钮（`.ds-button--icon`） + 发送圆形按钮。

---

### 7.4 全域焦点环机制 (`.ds-focus-ring`)

DeepSeek 使用了非常优雅的纯 CSS 变量驱动焦点环组件，完全解耦了元素聚焦逻辑与轮廓渲染：

```css
.ds-focus-ring {
  --on: 0;
  --dsl-focus-ring-offset: 0;
  --dsl-focus-ring-offset-x: var(--dsl-focus-ring-offset);
  --dsl-focus-ring-offset-y: var(--dsl-focus-ring-offset);
  --dsl-focus-ring-color: var(--dsw-alias-button-primary-fill);
  --dsl-focus-ring-box-shadow: 0 0 0 calc(2px * var(--on)) var(--dsl-focus-ring-color);
  
  position: absolute;
  top: var(--dsl-focus-ring-offset-y);
  right: var(--dsl-focus-ring-offset-x);
  bottom: var(--dsl-focus-ring-offset-y);
  left: var(--dsl-focus-ring-offset-x);
  border-radius: inherit;
  pointer-events: none;
  z-index: 1;
  opacity: var(--on);
  box-shadow: var(--dsl-focus-ring-box-shadow);
  transition: opacity 0.2s cubic-bezier(0.4, 0, 0.2, 1), 
              box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 当父级触发键盘聚焦时激活 */
:focus-visible > .ds-focus-ring {
  --on: 1;
}
```

---

### 7.5 对话流与深度思考区 (`.ds-think-content`)

DeepSeek-R1 模型的思考推理卡片是其标志性 UI 设计：

1. **容器形态**：
   - 采用左侧细边框或浅底卡片包裹，背景色为 `--dsw-static-neutral-bluish-50`（Dark: `#1b1b1c`）。
   - 左侧带有呼吸式状态图标（思考中 Shimmering 动画 / 思考完毕 Check 图标）。
2. **渐变遮罩（Gradient Mask）**：
   - 折叠状态下使用 `--dsw-linear-gradient-think` 实现平滑的下边界渐变消失：
   - `background: linear-gradient(180deg, #fff 20.19%, rgba(255, 255, 255, 0) 100%);`
   - Dark 模式对应：`linear-gradient(180deg, #151517 20.19%, rgba(21, 21, 23, 0) 100%);`
3. **字号与文本反差**：
   - 正文字号：`14px/24px`（小于主回答的 `16px/28px`）。
   - 文本颜色：固定次级文本 `--dsw-alias-label-secondary`（`#61666b`），避免分散对最终结论的注意力。

---

### 7.6 代码块与技术渲染 (`.md-code-block` / KaTeX)

#### 代码块设计（Code Block）
- **外层容器**：`border-radius: 8px; overflow: hidden; margin: 16px 0; background: var(--dsw-alias-markdown-code-block);`
- **粘性顶部标题栏（Sticky Language Banner）**：
  - `height: 36px; padding: 0 16px; background: var(--dsw-alias-markdown-code-block-banner);`
  - 左侧：小写语言标示（如 `python`, `typescript`, `json`），字体：12px 等宽。
  - 右侧：一键复制按钮（`.ds-markdown-code-copy-button`），点击后图标平滑切换为绿色勾选状态。
  - 向上滚动代码时，Banner 具备 `position: sticky; top: 12px;` 吸顶特性。
- **数学公式渲染**：
  - 基于 KaTeX，行内公式（`.ds-markdown-math`）与独立公式块（`.ds-markdown-math-display`），居中展示，字号自适应缩放。

---

### 7.7 浮层与弹窗 (`.ds-modal` / `.ds-toast` / `.ds-tooltip` / `.ds-dropdown-menu`)

#### 1. 模态弹窗遮罩 (`.ds-modal-overlay`)
```css
.ds-modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.36); /* Dark: rgba(0, 0, 0, 0.60) */
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
  pointer-events: none;
}
```

#### 2. 全局 Toast 提示 (`.ds-toast`)
- **尺寸与排版**：`padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 400;`
- **配色方案**：深色胶囊背景 `--dsw-alias-toast-bg`（`#353638`），前景色 `#f5f5f5`，自带 1px 半透明边框 `--dsw-alias-border-inverted`。
- **状态图标**：成功（绿色 `#22c55e`）、警告（琥珀色 `#f7ad31`）、错误（红色 `#ef4444`）。

#### 3. 下拉菜单 (`.ds-dropdown-menu`)
- **容器规格**：`min-width: 124px; max-width: 280px; padding: 4px; border-radius: 12px;`
- **阴影**：三级投影 `--dsw-shadow-lv3`。
- **菜单项（Option）**：`height: 24px; padding: 8px 10px; border-radius: 8px; font-size: 14px;`
- **悬停态**：`background: var(--dsw-alias-interactive-bg-hover)`（`rgba(38,49,72, 0.06)`）。
- **危险/删除项**：文本与图标标红 `--dsw-alias-state-error-primary`，悬停底色为浅红 `rgba(236, 19, 19, 0.05)`。

---

### 7.8 自定义滚动区域 (`.ds-scroll-area`)

DeepSeek 全站摒弃了原生粗糙滚动条，封装了专有的无侵入浮动滚动条：

- **轨道（Gutter）**：默认完全透明，只有在焦点在容器内或 Hover 时显现（`.ds-scroll-area--show-on-focus-within`）。
- **滑块（Bar）**：
  - 宽/高：垂直 `6px` / 水平 `6px`。
  - 颜色：`--scroll-color: rgba(0, 0, 0, 0.08);`（Dark: `rgba(255, 255, 255, 0.15)`）。
  - 悬浮滑块颜色：`--scroll-color-hover: rgba(0, 0, 0, 0.15);`（Dark: `rgba(255, 255, 255, 0.24)`）。
  - 滑块圆角：`3px`。

---

## 8. 动效与微交互 (Motion & Micro-interactions)

### 8.1 缓动函数与持续时间 (Easing & Durations)

```css
/* 缓动曲线 Tokens */
--ds-ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);  /* 标准平滑缓动 */
--ds-ease-in:     cubic-bezier(0.4, 0, 1, 1);    /* 入场加速 */
--ds-ease-out:    cubic-bezier(0, 0, 0.2, 1);    /* 出场减速 (最常用) */

/* 持续时间 Tokens */
--ds-transition-duration-fast: 0.1s;  /* 微交互、按钮 Hover、Icon 变换 */
--ds-transition-duration:      0.2s;  /* 标准状态过渡、Toggle 切换、焦点环 */
--ds-transition-duration-slow: 0.3s;  /* 抽屉打开、Modal 弹窗、高度折叠展开 */
```

### 8.2 常用关键帧动效 (Keyframe Animations)

1. **入场缩放展开 (`.ds-fade-in-zoom-in-expand`)**：
   - 初始状态：`opacity: 0; transform: scale(0.8);`
   - 终止状态：`opacity: 1; transform: scale(1); transition: opacity 0.1s, transform 0.1s;`
2. **骨架屏流动光泽 (`.ds-skeleton`)**：
   - `@keyframes ds-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }`
   - 线性背景在 `rgba(0,0,0,0.04)` 与 `rgba(0,0,0,0.08)` 之间平滑扫过。
3. **AI 生成打字光标（Streaming Cursor）**：
   - 采用竖线光标，`animation: blink 1s step-end infinite;` 维持高度节奏感。

---

## 9. CSS 变量工程化落地参考 (Implementation Guide)

如需在本项目（Tailwind CSS / SCSS / 原生 CSS）中快速复刻 DeepSeek 设计语言，可将以下预设直接置入全局样式入口（如 `globals.css`）：

```css
@layer base {
  :root {
    /* 核心品牌色 */
    --ds-brand-primary: #3964fe;
    --ds-brand-hover: #5686fe;
    --ds-brand-subtle: #edf3fe;
    --ds-brand-border: #b7c8fe;

    /* 冷蓝中性色 (Light) */
    --ds-bg-base: #ffffff;
    --ds-bg-sidebar: #f9fafb;
    --ds-bg-input: #ffffff;
    --ds-bg-hover: rgba(38, 49, 72, 0.06);
    --ds-bg-active: rgba(38, 49, 72, 0.10);
    
    /* 文本色 */
    --ds-text-primary: #0f1115;
    --ds-text-secondary: #61666b;
    --ds-text-tertiary: #81858c;
    --ds-text-caption: #adb2b8;

    /* 边框与分割 */
    --ds-border-light: rgba(0, 0, 0, 0.04);
    --ds-border-default: rgba(0, 0, 0, 0.10);
    --ds-border-strong: rgba(0, 0, 0, 0.16);

    /* 投影 */
    --ds-shadow-card: 0 4px 12px rgba(0, 0, 0, 0.02), 0 2px 2px rgba(72, 104, 178, 0.01), 0 30px 60px rgba(72, 104, 178, 0.03);
    --ds-shadow-popup: 0 0 1px rgba(0, 0, 0, 0.20), 0 0 4px rgba(0, 0, 0, 0.02), 0 12px 32px rgba(0, 0, 0, 0.08);

    /* 尺寸与布局 */
    --ds-sider-width: 261px;
    --ds-chat-max-width: 840px;
    --ds-radius-pill: 4096px;
    --ds-radius-card: 24px;
    --ds-radius-toggle: 18px;
    --ds-radius-modal: 12px;
    --ds-radius-input: 10px;
  }

  [data-theme="dark"], .dark {
    /* 核心品牌色 (Dark) */
    --ds-brand-primary: #5686fe;
    --ds-brand-hover: #679efe;
    --ds-brand-subtle: #283142;
    --ds-brand-border: #4868b2;

    /* 冷蓝中性色 (Dark) */
    --ds-bg-base: #151517;
    --ds-bg-sidebar: #1b1b1c;
    --ds-bg-input: #2c2c2e;
    --ds-bg-hover: rgba(255, 255, 255, 0.08);
    --ds-bg-active: rgba(255, 255, 255, 0.14);

    /* 文本色 */
    --ds-text-primary: #f9fafb;
    --ds-text-secondary: #cfd3d6;
    --ds-text-tertiary: #adb2b8;
    --ds-text-caption: #81858c;

    /* 边框与分割 */
    --ds-border-light: rgba(255, 255, 255, 0.06);
    --ds-border-default: rgba(255, 255, 255, 0.12);
    --ds-border-strong: rgba(255, 255, 255, 0.20);

    /* 投影降解为线框 */
    --ds-shadow-card: none;
    --ds-shadow-popup: 0 0 1px rgba(0, 0, 0, 0.4), 0 8px 24px rgba(0, 0, 0, 0.3);
  }
}
```

---

## 10. 总结与设计特征速查

| 维度 | DeepSeek 设计标准 (DS Standard) |
| :--- | :--- |
| **主调性** | 冷蓝中性调（Bluish Neutral） + 电光品牌蓝（`#3964fe`） |
| **排版基石** | 正文 14px / 16px，行高 22px / 28px，等宽代码 13px，CJK 弯引号专用补丁 |
| **典型控件外形** | 极度偏好 Capsule 全胶囊（120px / 4096px）与 Soft Radius（18px / 24px） |
| **交互特征** | 解耦式绝对定位 `.ds-focus-ring`，高透气微投影，平滑淡入展开动效 |
| **思考区块 (R1)** | 14px 次级灰字 + 渐变遮罩 + 独立折叠交互 + 轻量状态图标 |
| **深色适配** | 全量 Token 映射，从 `#ffffff` 映射至 `#151517` / `#1b1b1c`，投影自动降解为精细边框 |
