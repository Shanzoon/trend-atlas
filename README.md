# Trend Atlas

一个将生成式视觉归档、每日精选与真实创作系统放在一起的个人主页。

## 亮点

- 每日精选与四类视觉归档，支持瀑布流和线性详情浏览。
- 用滚动叙事呈现公开作品与本地原型，并明确区分它们的状态。
- 暗色、克制、以图像为主的界面；不做简历或商业化入口。
- 支持键盘、触控和 `prefers-reduced-motion`。
- 线上图片由根目录 `archive.json` 索引，使用公开 R2 WebP 地址加载。

## 本地启动

```bash
git clone https://github.com/Shanzoon/trend-atlas.git
cd trend-atlas
npm install
npm run dev
```

打开 <http://127.0.0.1:4173>。需要其他端口时：`PORT=5173 npm run dev`。

## 图片源与发布

维护图片时，源 PNG 放在同级 `../trend-lab/01-Dreamscape` 至 `04-Persona`，文件名使用 `YYYY-MM-DD__名称.png`。先预览增量发布：

```bash
npm run publish:images:dry
```

确认后运行 `npm run publish:images`：脚本将新增图片转换为 WebP、上传，并在构建侧为全部图片生成或保留 ThumbHash 元数据后更新 `archive.json`；不会生成额外低清图，也不会删除或覆盖本地原图。所有公网 404 候选都会由 R2 直接复核，脚本探测到未入清单的同名对象或无法确认的状态时会立即中止，避免正常发布流程覆盖既有对象；同一工作目录内的正式发布也会通过锁文件串行执行。

## 验证

```bash
npm run check
```

## License

[MIT](LICENSE)
