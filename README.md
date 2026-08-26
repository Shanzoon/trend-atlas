# Shanzoon

Shanzoon 的品牌型个人主页：夜间黑色舞台 + 每日精选图像 + 四个图像文件夹入口 + 滚动驱动的作品系统展示。应用运行时直接扫描同级的 `../trend-lab/<分类>/YYYY-MM-DD/` 作为图片事实源，不会复制或改写原图。

品牌调性：夜间、收敛、精确。界面像一间从安静的暗色波点中浮现的黑棚舞台；只展示真实存在的作品证据，不设简历、履历或商业化入口。

## 启动

```bash
cd /Users/shanzoon/Developer/imageboard/trend-atlas
npm run dev
```

浏览器打开 <http://127.0.0.1:4173>。如需更换端口：`PORT=5173 npm run dev`。

## 事实源与目录约束

应用目录必须和 `trend-lab` 保持当前同级关系：

```text
imageboard/
├── trend-atlas/
└── trend-lab/
    ├── 01-interesting/YYYY-MM-DD/
    ├── 02-hottest/YYYY-MM-DD/
    ├── 03-niche/YYYY-MM-DD/
    ├── 04-best-character/YYYY-MM-DD/
    └── _runs/YYYY-MM-DD/
```

四个分类目录是主页图片的事实源，可在 Finder 中按分类和日期浏览、删除不再展示的单图。`_runs` 保存每日的 manifest、调用记录、报告、总览图和历史脚本；它们不会进入主页归档。对外图片 URL 保持 `/media/YYYY-MM-DD/<分类>/<文件名>` 格式。

分类与封面配置是单一来源：`categories.js`（id、label、封面图 cover、首页预览 preview），服务端与前端共用；`brand.html` 中四个文件夹按钮的 `data-category` 与之一致（由冒烟测试校验）。

## 页面与交互

- 首屏：全页黑色波点矩阵上展示 Shanzoon、中英文 slogan 与一张不可点击的每日精选大图。
- 每日精选：按上海自然日从完整归档中稳定选择，同一天刷新不会换图。
- 转场：正常向下滚动时，舞台轻微收束、精选图与首屏介绍退场，`GENERATIVE ARCHIVE`、一句归档主张及其下方的 `VIEW ALL` 接替标题，四个视觉文件夹进入视野；第二幕底部延续同款滚动提示，不接管滚轮。
- 四个入口：固定对应有趣、最热、小众、角色；桌面端悬停时三张同类图片像扑克牌一样展开，点击后从当前封面图进入该类别的详情浏览。
- 首页续篇：沿用首屏的滚动吸附语法，以三个连续满屏场景呈现系统主张、漫剧有数、灵境 AI 创作平台与 Loomicc 本地运行基础设施和联系方式；后者只作为真实界面证据，不代表线上服务或用户规模。
- 收束：页面不设置独立第四幕；邮箱与 GitHub 留在最终系统场景。
- `VIEW ALL`：把四类图片按最新日期合并为等宽、不等高的瀑布流，不显示分类筛选。
- 图片详情：随浏览器视口高度伸展，大图与文字底部对齐；桌面端缩略片带位于左侧竖排，平板与手机移到顶部横排，并显示当前位置；支持缩略图、按钮和方向键切换。
- 移动端与减少动态效果：保留完整内容，吸附场景改为静态顺序排布，详情页改为上下结构。

## 设计系统

- 方向：黑色舞台从更暗的房间中浮现；页面近黑并携带细灰点阵；圆角舞台只轻微抬升，绝不用白色。首屏为左文右图构图，一句话中文主张 + 克制的英文回声。原生滚动中精选图退场，四个视觉文件夹升起；归档主张与开场 slogan 同属一个字号层级。
- 色彩：全部为 `brand.css` 中的 OKLCH 自定义属性（`--night` 外层夜色、`--stage` 舞台、`--night-ink`/`--stage-ink` 正文墨色、`--night-muted` 弱化、`--rose`/`--cyan` 点缀、`--danger` 错误）。
- 字体：Futura Medium + 中文系统回退；Shanzoon 是开场的主展示词，slogan 保持紧凑平衡；日期只出现在归档与详情元数据中。
- 布局：首屏 story 高于视口、sticky 舞台完成 identity→archive 转场，滚动不劫持；第二个满屏帧用紧凑的 `GENERATIVE ARCHIVE` 标题块 + 左主张右 `VIEW ALL` + 四个比例各异的重叠文件夹；手机端该行改为居中堆叠。产品区为一个 sticky 叠层：三块大板（漫剧有数、灵境 AI 创作平台、Loomicc）互相叠压，较早的板只露出边缘；两个公开产品带访问链接，Loomicc 明确标注为本地原型；Loomicc 收束到联系方式。归档为四列等宽瀑布流，手机上两列。
- 动效：滚动进度映射舞台缩放、图片淡出、identity 交叉淡化、文件夹错峰入场与 `VIEW ALL` 出现，从不 `preventDefault` 或改写滚轮行为；只动 transform、opacity 与有限模糊；链接只在所在产品激活时获得指针与键盘可达性。移动端与 `prefers-reduced-motion` 用户得到相同内容的静态序列。

## 设计原则与无障碍

1. 先让身份可读，再谈导航。
2. 让作品本身携带色彩。
3. 用一段短滚动序列把介绍变成发现。
4. 四个入口在视觉上彼此区分，首页上不依赖文字。
5. 归档之后展示真实作品证据，但不变成常规作品集。
6. 没有安全的公开形态时，保持私有系统私有。
7. 归档是唯一事实源。
8. 每种交互都同时支持指针、键盘与触控。

目标 WCAG 2.2 AA 对比度与焦点行为；尊重 `prefers-reduced-motion`；图片提供替代文本；绝不只用颜色编码分类。

## 代码结构

```text
server.mjs         HTTP 服务：/api/archive、/media/*、静态白名单（ARCHIVE_ROOT 可用环境变量覆盖事实源）
brand.html         页面结构（文件夹按钮的 data-category 与 categories.js 一致）
categories.js      分类配置单一来源（server 与前端共用）
app.js             脚本入口：启动、事件接线、数据加载
views.js           页面状态/导航/路由/渲染（home / collection / detail）
home.js            首屏与系统场景的滚动动效
elements.js        DOM 引用；state.js 运行时状态；media.js 媒体查询；timelines.js 动效时间线；utils.js 工具函数
base.css           令牌、重置、页头（通用）
home.css           首屏舞台与文件夹；systems.css 产品叠层；collection.css 归档瀑布流；detail.css 详情页
test/smoke.test.mjs 零依赖冒烟测试（node:test + fetch）
```

## 开发约定

- 任何改动后运行 `npm run check`（语法检查 + 冒烟测试）。
- 重构只搬移、不改行为；视觉改动需人工验收。
- 首页产品区使用 `project-drama-data.png`、`project-lingjing-ai.png` 与 `project-loomicc-local-dashboard.jpg` 三张界面证据图；`assets/folder-*.jpg` 是四个既定封面的轻量首页预览，点击后仍按原始归档路径进入详情。额外的悬停预览只在访客开始进入第二幕后加载。服务端只对白名单中的静态素材开放路径。
