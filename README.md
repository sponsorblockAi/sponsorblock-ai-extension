# SponsorBlock AI · 智能跳过广告

[English](#english) | [中文](#chinese)

---

<h2 id="english">English</h2>

Browser extension that auto-detects sponsor segments in YouTube videos using AI (OpenAI-compatible API) and submits results to SponsorBlock. Works with free models — zero cost.

> ⚠️ **This extension does NOT skip ads by itself.** It identifies and submits sponsor segments to SponsorBlock's database. To actually skip ads, you must also install the [SponsorBlock](https://sponsor.ajay.app/) extension. Think of it as: **you contribute data → everyone (including you next time) benefits.**

### How It Works

This extension + [SponsorBlock extension](https://sponsor.ajay.app/) = complete ad-skipping:

| Step                                     | Who                        |
| ---------------------------------------- | -------------------------- |
| 1. Extract transcript                    | This extension             |
| 2. AI detects sponsor segments           | This extension             |
| 3. Submit segments to SponsorBlock       | This extension             |
| 4. Actually skip the ads during playback | **SponsorBlock extension** |

The page auto-refreshes after submission so SponsorBlock picks up the new segments — ads start skipping right away.

---

### For Users (No Coding Required)

#### Step 1: Install the extension

1. Go to [Releases](https://github.com/<user>/sponsorblock-ai-extension/releases) and download `sponsorblock-ai-extension.zip` (or clone this repo and use the `dist/` folder directly)
2. Unzip the file
3. Open `chrome://extensions/` in Chrome
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** and select the unzipped folder

#### Step 2: Configure your LLM

1. Click the extension icon in the toolbar → settings popup opens
2. Fill in:
   - **API Base URL** — e.g. `https://api.openai.com/v1`
   - **API Key** — your API key
   - **Model Name** — e.g. `openrouter/owl-alpha` (free!)
3. Click **Save Settings**

> 💡 **Recommended setup (completely free):**
>
> 1. Get a free API key at [OpenRouter](https://openrouter.ai/keys)
> 2. Base URL: `https://openrouter.ai/api/v1`
> 3. Model: `openrouter/owl-alpha` — **free, no cost at all**
>
> Other options:
>
> - [OpenAI](https://platform.openai.com/api-keys) — `gpt-4o-mini` is ~$0.15/million tokens
> - [Ollama](https://ollama.com/) — run locally for free (Base URL: `http://localhost:11434/v1`)

That's it! Open a YouTube video and the extension works automatically.

> 💡 **After segments are submitted**, the page automatically refreshes. This ensures the SponsorBlock extension picks up the new data and starts skipping ads immediately. YouTube auto-resumes your playback position.

### Supported LLM Providers

Any OpenAI-compatible API works:

| Provider          | Base URL                       | Model Example          |
| ----------------- | ------------------------------ | ---------------------- |
| OpenRouter (free) | `https://openrouter.ai/api/v1` | `openrouter/owl-alpha` |
| OpenAI            | `https://api.openai.com/v1`    | `gpt-4o-mini`          |
| Ollama (local)    | `http://localhost:11434/v1`    | `llama3`               |
| LiteLLM           | your proxy URL                 | any                    |

**Recommended: [`openrouter/owl-alpha`](https://openrouter.ai/models/owl-alpha) — completely free, no credit card needed.** Just get a free API key from [OpenRouter](https://openrouter.ai/keys).

### Cost Estimate

With `openrouter/owl-alpha`:

| Scenario        | Cost          |
| --------------- | ------------- |
| 10-minute video | **$0 (free)** |
| 100 videos      | **$0 (free)** |
| Unlimited       | **$0 (free)** |

If using a paid model like `gpt-4o-mini` (~$0.15/1M input tokens): ~$0.0005 per video, ~$0.05 per 100 videos.

### Privacy

- Your API key stays in your browser's local storage, never leaves your machine
- Transcripts are sent only to your configured LLM endpoint
- SponsorBlock submissions use an anonymous, randomly-generated user ID
- No analytics, no tracking, no external servers

### Permissions

| Permission         | Why                              |
| ------------------ | -------------------------------- |
| `storage`          | Save your API settings and cache |
| `youtube.com`      | Extract video transcripts        |
| `sponsor.ajay.app` | Query and submit segments        |

---

### For Developers

```bash
git clone https://github.com/<user>/sponsorblock-ai-extension
cd sponsorblock-ai-extension
npm install
```

#### Available Commands

```bash
npm run build        # Build to dist/
npm run typecheck    # TypeScript type checking
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier formatting
npm run format:check # Prettier format check
npm run test         # Run tests
npm run test:watch   # Run tests in watch mode
```

#### Project Structure

```
src/
├── types/global.d.ts        # Shared type definitions
├── lib/
│   ├── llm.ts               # LLM client (OpenAI-compatible API)
│   ├── sponsorblock.ts      # SponsorBlock API client
│   └── transcript.ts        # YouTube transcript extraction
├── background.ts            # Service worker (orchestrator)
├── content_script.ts        # Content script (injected into YouTube)
├── inject.ts                # Page-context script (XHR intercept)
├── popup/                   # Settings popup
│   ├── popup.html/css/ts
├── manifest.json
└── icons/
tests/
├── llm.test.ts              # Unit tests for LLM parsing
├── llm-integration.test.js  # Integration scenarios
├── sponsorblock.test.js     # Cache & API logic tests
└── chrome-mock.js           # Chrome API mock helper
```

#### Tech Stack

- **TypeScript** — type-safe development
- **Vite** — multi-entry build (ES module + IIFE)
- **Vitest** — unit testing
- **ESLint** + **Prettier** — code quality

---

<h2 id="chinese">中文</h2>

一款浏览器扩展，使用 AI（兼容 OpenAI 的 API）自动检测 YouTube 视频中的赞助片段，并提交到 SponsorBlock。支持免费模型，零成本使用。

> ⚠️ **本插件本身不会跳过广告。** 它的作用是识别并提交赞助片段到 SponsorBlock 数据库。要实际跳过广告，必须同时安装 [SponsorBlock](https://sponsor.ajay.app/) 插件。简而言之：**你贡献数据 → 所有人（包括下次看这个视频的你）受益。**

### 工作原理

本插件 + [SponsorBlock 插件](https://sponsor.ajay.app/) = 完整的广告跳过方案：

| 步骤                       | 负责方                |
| -------------------------- | --------------------- |
| 1. 提取字幕                | 本插件                |
| 2. AI 识别赞助片段         | 本插件                |
| 3. 提交片段到 SponsorBlock | 本插件                |
| 4. 播放时真正跳过广告      | **SponsorBlock 插件** |

提交后页面自动刷新，SponsorBlock 加载刚提交的片段并开始跳过广告。

---

### 普通用户使用（无需编程）

#### 第一步：安装扩展

1. 前往 [Releases](https://github.com/<user>/sponsorblock-ai-extension/releases) 下载 `sponsorblock-ai-extension.zip`（或者直接 clone 本仓库，使用里面的 `dist/` 文件夹）
2. 解压 zip 文件
3. 打开 Chrome 浏览器，地址栏输入 `chrome://extensions/`
4. 打开右上角的 **开发者模式** 开关
5. 点击 **加载已解压的扩展程序**，选择刚才解压的文件夹

#### 第二步：配置 LLM

1. 点击浏览器工具栏上的扩展图标 → 弹出设置窗口
2. 填写以下信息：
   - **API Base URL** — 例如 `https://api.openai.com/v1`
   - **API Key** — 你的 API 密钥
   - **Model Name** — 例如 `openrouter/owl-alpha`（免费！）
3. 点击 **Save Settings** 保存

> 💡 **推荐配置（完全免费）：**
>
> 1. 在 [OpenRouter](https://openrouter.ai/keys) 免费注册获取 API Key
> 2. Base URL：`https://openrouter.ai/api/v1`
> 3. Model：`openrouter/owl-alpha` — **完全免费，无需充值**
>
> 其他选择：
>
> - [OpenAI](https://platform.openai.com/api-keys) — `gpt-4o-mini` 约 1 元/百万 tokens
> - [Ollama](https://ollama.com/) — 本地免费运行（Base URL：`http://localhost:11434/v1`）

就这些！打开一个 YouTube 视频，扩展会自动运行。

> 💡 **提交成功后**，页面会自动刷新。这确保 SponsorBlock 插件能加载到刚提交的数据并开始跳过广告。YouTube 会自动恢复播放进度。

### 支持的 LLM 服务商

任何兼容 OpenAI 接口的 API 都可以使用：

| 服务商             | Base URL                       | 模型示例               |
| ------------------ | ------------------------------ | ---------------------- |
| OpenRouter（免费） | `https://openrouter.ai/api/v1` | `openrouter/owl-alpha` |
| OpenAI             | `https://api.openai.com/v1`    | `gpt-4o-mini`          |
| Ollama（本地）     | `http://localhost:11434/v1`    | `llama3`               |
| LiteLLM            | 你的代理地址                   | 任意                   |

**推荐：[`openrouter/owl-alpha`](https://openrouter.ai/models/owl-alpha) — 完全免费，无需绑卡。** 只需在 [OpenRouter](https://openrouter.ai/keys) 免费注册获取 API Key 即可。

### 费用估算

使用 `openrouter/owl-alpha`：

| 场景        | 费用           |
| ----------- | -------------- |
| 10 分钟视频 | **¥0（免费）** |
| 100 个视频  | **¥0（免费）** |
| 无限使用    | **¥0（免费）** |

如果使用付费模型如 `gpt-4o-mini`（约 1 元/百万 token）：每个视频约 ¥0.003，100 个视频约 ¥0.3。

### 隐私说明

- API 密钥仅保存在浏览器本地存储中，不会上传到任何第三方
- 字幕内容仅发送到你配置的 LLM 端点
- SponsorBlock 提交使用匿名随机生成的用户 ID
- 无分析、无追踪、无外部服务器

### 权限说明

| 权限               | 用途                |
| ------------------ | ------------------- |
| `storage`          | 保存 API 设置和缓存 |
| `youtube.com`      | 提取视频字幕        |
| `sponsor.ajay.app` | 查询和提交片段      |

---

### 开发者指南

```bash
git clone https://github.com/<user>/sponsorblock-ai-extension
cd sponsorblock-ai-extension
npm install
```

#### 常用命令

```bash
npm run build        # 构建到 dist/
npm run typecheck    # TypeScript 类型检查
npm run lint         # ESLint 检查
npm run lint:fix     # ESLint 自动修复
npm run format       # Prettier 格式化
npm run format:check # Prettier 格式检查
npm run test         # 运行测试
npm run test:watch   # 监听模式运行测试
```

#### 项目结构

```
src/
├── types/global.d.ts        # 公共类型定义
├── lib/
│   ├── llm.ts               # LLM 客户端（OpenAI 兼容 API）
│   ├── sponsorblock.ts      # SponsorBlock API 客户端
│   └── transcript.ts        # YouTube 字幕提取
├── background.ts            # Service Worker（调度中心）
├── content_script.ts        # Content Script（注入 YouTube 页面）
├── inject.ts                # 页面上下文脚本（拦截 XHR）
├── popup/                   # 设置弹窗
│   ├── popup.html/css/ts
├── manifest.json
└── icons/
tests/
├── llm.test.ts              # LLM 解析单元测试
├── llm-integration.test.js  # 集成场景测试
├── sponsorblock.test.js     # 缓存和 API 逻辑测试
└── chrome-mock.js           # Chrome API Mock 辅助
```

#### 技术栈

- **TypeScript** — 类型安全开发
- **Vite** — 多入口构建（ES Module + IIFE）
- **Vitest** — 单元测试
- **ESLint** + **Prettier** — 代码质量
