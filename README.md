# Trend Atlas Portfolio Template

一个轻量、可复刻的个人主页模板。它保留现有的滚动叙事、图像归档、分类浏览和详情交互，把需要替换的个人内容集中到一个配置文件中。

页面仍使用 **4 个图像分类、3 个项目、2 个联系方式**。这是现有布局与动画的边界；修改这些内容不需要搜索全仓库，改变数量则属于继续设计网站。

## 本地启动

```bash
git clone https://github.com/Shanzoon/trend-atlas.git
cd trend-atlas
npm ci
npm run dev
```

打开 <http://127.0.0.1:4173>。需要其他端口时运行 `PORT=5173 npm run dev`。

默认配置只使用仓库内的 SVG 示例图和 `archive.example.json`，不需要 Cloudflare 账户、同级图片目录或任何外部服务。示例图带有 `REPLACE ME` 标记，因此图片尚未替换时也不会出现含义不明的空白。

## 只需要理解的入口

| 文件 | 用途 |
| --- | --- |
| `site.config.js` | 姓名、介绍、Logo、分类、项目、联系方式和图片发布公开参数 |
| `assets/` | Logo、favicon、项目图，以及少量本地归档图 |
| `archive.example.json` | 开箱即用的本地归档示例 |
| `archive.json` | 可选图片发布脚本生成的正式归档 |

Fork 用户只需编辑 `site.config.js`，不需要全仓库搜索替换姓名、域名或图片地址。

仓库维护者的现有公开内容保存在 `site.config.owner.js`。维护者运行 `npm run build:owner` 生成生产页面；本地检查可运行 `npm run dev:owner`，或在本地页面 URL 后加 `?profile=owner`。Fork 用户使用默认的 `npm run build`，不需要修改或删除维护者配置。

`brand.html` 是共用模板。构建时使用与浏览器相同的配置渲染函数，把姓名、标题、Logo、介绍、项目和联系方式写进 HTML，输出到 `dist/`。页面携带生成时的配置快照，浏览器不会再按域名或查询参数切换身份。首次访问和脚本不可用时也能直接看到真实内容；图库与动画仍需要 JavaScript。本地服务也使用同一渲染函数。HTML 解析依赖只在开发和构建时运行，不发送到浏览器。

## 替换内容

在 `site.config.js` 中修改：

- `site`：页面标题、描述、签名、Logo 和 favicon。
- `hero`：姓名、角色和首屏介绍。
- `archive`：归档标题、清单路径，以及 4 个分类的 ID、名称、封面和预览图。
- `systems`：项目章节标题和介绍。
- `projects`：3 个项目的标题、说明、图片和链接；未公开项目使用 `availability` 代替 `link`。
- `contacts`：2 个联系方式。

配置项缺失、分类 ID 不是安全的单层目录名、图片尺寸无效，页面或命令行都会指出具体字段。项目图片加载失败时，卡片会提示检查 `site.config.js`。

项目图应填写真实的 `width`、`height` 和清楚的 `alt`，以稳定布局并提供无障碍说明。例如：

```js
image: {
  src: "/assets/my-project.webp",
  width: 1600,
  height: 1000,
  alt: "项目首页，展示搜索和结果列表",
},
```

## 替换图片

### 少量图片：全部放在仓库内

把图片放进 `assets/`，仿照 `archive.example.json` 创建自己的清单，并让 `archive.manifestPath` 指向它。每项至少需要 `id`、`category`、`categoryLabel`、`file`、`title`、`width`、`height` 和 `src`。

```json
{
  "id": "01-Dreamscape/my-image.webp",
  "category": "01-Dreamscape",
  "categoryLabel": "Dreamscape",
  "file": "my-image.webp",
  "title": "My Image",
  "width": 1600,
  "height": 1000,
  "src": "/assets/my-image.webp"
}
```

### 大量图片：使用公开对象存储

前端只要求归档 JSON 中的 `src` 能被浏览器公开读取，不依赖 Cloudflare SDK，也不需要把凭证放进网页。

仓库附带可选的 R2 增量发布脚本。它扫描 4 个分类目录中的 `YYYY-MM-DD__名称.png`，转换为 WebP，为图片生成或保留 ThumbHash，上传不存在的新对象，验证公开 URL，再更新 `archive.json`。历史图片若在公网探测中返回 404，脚本会直接向 R2 复核；无法确认时会中止。它不会删除本地原图或既有 R2 对象。

先在 `site.config.js` 填写非敏感的公开参数：

```js
publishing: {
  sourceRoot: "./content/images",
  bucket: "your-public-bucket-name",
  mediaOrigin: "https://media.example.com",
},
```

并将 `archive.manifestPath` 改为 `/archive.json`。源目录中必须有与 `archive.categories[*].id` 对应的 4 个真实目录；符号链接和越界路径会被拒绝。

运行：

```bash
npm run publish:images:dry
npm run publish:images
npm run check
```

也可以在当前终端导出公开参数，不提交它们；这些值会同时供 dry-run 和正式发布使用：

```bash
export ARCHIVE_ROOT=/absolute/path/to/images
export R2_BUCKET=your-public-bucket-name
export MEDIA_ORIGIN=https://media.example.com
npm run publish:images:dry
npm run publish:images
```

Shanzoon 维护现有图片时使用 `npm run publish:images:owner:dry` 和 `npm run publish:images:owner`；这两个命令读取 `site.config.owner.js`。

## Cloudflare：Agent 与用户的边界

Agent 可以完成：修改代码和公开配置、整理归档清单、检查图片目录、运行测试、审查 diff，以及在用户已完成授权后执行明确批准的发布命令。

以下操作必须由用户本人完成：

- 登录 Cloudflare，并在浏览器或 Wrangler 中授权自己的账户。
- 创建 R2 bucket，决定公开访问方式，绑定自己的媒体域名。
- 在 Cloudflare Pages 中连接自己的 Git 仓库并选择账户、项目和生产分支。
- 绑定自定义域名，确认 DNS、TLS、配额和可能产生的费用。

不要把 API Token、Access Key、账户凭证或 Wrangler 本地状态写进配置或提交到仓库。`.env*` 与 `.wrangler/` 已被忽略；网页配置只应包含最终会公开的信息。

## 部署

这是一个在发布前生成 HTML 的静态网站。部署前运行：

```bash
npm run check
npm run build
git diff --check
```

Cloudflare Pages 设置：

1. 用户登录 Cloudflare Pages，连接自己的 Git 仓库并完成授权。
2. Framework preset 选无框架，构建命令为 `npm run build`，输出目录为 `dist`。Shanzoon 自己的 Pages 项目使用 `npm run build:owner`。
3. 先推送非生产分支并检查预览站点，再合并到生产分支。
4. 用户绑定自定义域名并确认 DNS/TLS。
5. 上线后检查 `/`、`/brand.html`、配置中的归档 JSON，以及至少一张真实图片。

如果已有 Pages 项目设置了 `SKIP_DEPENDENCY_INSTALL`，构建命令使用 `npm ci --ignore-scripts && npm run build:owner`（Fork 使用 `npm run build`），先安装锁定依赖。HTML 构建不需要图片发布工具的安装脚本。

`dist/index.html` 和 `dist/brand.html` 包含相同的完整页面，根入口无需跳转。只发布 `dist/`，不要直接发布源码目录；`dist/` 不提交到 Git。仓库的 `vercel.json` 也使用此构建流程，部署维护者版本时设置环境变量 `SITE_PROFILE=owner`。`server.mjs` 只用于本地开发。

## 验证与常见反馈

```bash
npm run check
```

检查覆盖语法、配置结构、模板资源、初始 HTML 内容、配置快照一致性、HTML 转义、静态构建、归档格式、ThumbHash、服务端路径安全、图片发布参数和既有交互契约。

- “站点配置错误”：按提示修复 `site.config.js` 中的字段。
- “图像归档读取失败”：确认 `archive.manifestPath` 指向已提交且可访问的 JSON。
- “项目图片不可用”：确认路径、文件名大小写和 `assets/` 中的文件。
- “图片发布尚未配置”：补齐源目录、bucket 和公开 origin；这不是登录凭证错误。

## License

[MIT](LICENSE)
