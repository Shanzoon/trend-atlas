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

确认后运行 `npm run publish:images`：脚本将新增图片转换为 WebP、上传并更新 `archive.json`；不会删除或覆盖本地原图和既有 R2 对象。

## 验证

```bash
npm run check
```

## License

[MIT](LICENSE)
