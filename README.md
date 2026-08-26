# Shanzoon

Shanzoon 的品牌型个人主页。应用运行时直接扫描同级的 `../trend-lab/<分类>/YYYY-MM-DD/` 作为图片事实源，不会复制或改写原图。

## 启动

```bash
cd /Users/shanzoon/Developer/imageboard/trend-atlas
npm run dev
```

浏览器打开 <http://127.0.0.1:4173>。

如需更换端口：

```bash
PORT=5173 npm run dev
```

## 交互

- 首屏：全页黑色波点矩阵上展示 Shanzoon、中英文 slogan 与一张不可点击的每日精选大图。
- 每日精选：按上海自然日从完整归档中稳定选择，同一天刷新不会换图。
- 转场：正常向下滚动时，舞台轻微收束、精选图与首屏介绍退场，`GENERATIVE ARCHIVE`、一句归档主张及其下方的 `VIEW ALL` 接替标题，四个视觉文件夹进入视野；第二幕底部延续同款滚动提示，不接管滚轮。
- 四个入口：固定对应有趣、最热、小众、角色；桌面端悬停时三张同类图片像扑克牌一样展开，点击后从当前封面图进入该类别的详情浏览。
- 首页续篇：沿用首屏的滚动吸附语法，以三个连续满屏场景呈现系统主张、`comic-assets` 的角色/场景/状态素材，以及 `Loomicc` 本地运行基础设施与联系方式；后者只作为真实界面证据，不代表线上服务或用户规模。
- 收束：页面不设置独立第四幕，也没有简历、公司履历或商业化入口；邮箱与 GitHub 留在最终系统场景。
- `VIEW ALL`：把四类图片按最新日期合并为等宽、不等高的瀑布流，不显示分类筛选。
- 图片详情：随浏览器视口高度伸展，大图与文字底部对齐；桌面端缩略片带位于左侧竖排，平板与手机移到顶部横排，并显示当前位置；支持缩略图、按钮和方向键切换。
- 移动端与减少动态效果：保留完整内容，吸附场景改为静态顺序排布，详情页改为上下结构。

## 目录约束

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

四个分类目录是主页图片的事实源，可在 Finder 中按分类和日期浏览、删除不再展示的单图。`_runs` 保存每日的 manifest、调用记录、报告、总览图和历史脚本；它们不会进入主页归档。对外图片 URL 仍保持 `/media/YYYY-MM-DD/<分类>/<文件名>` 格式。

首页产品区使用 `project-drama-data.png`、`project-lingjing-ai.png` 与 `project-loomicc-local-dashboard.jpg` 三张界面证据图；`assets/folder-*.jpg` 是四个既定封面的轻量首页预览，点击后仍按原始归档路径进入详情。额外的悬停预览只在访客开始进入第二幕后加载。服务端只对白名单中的静态素材开放路径。
