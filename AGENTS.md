# AGENTS.md

## 范围

- 本仓库是 Shanzoon 个人主页（trend-atlas）。

## 事实入口

- 产品与设计意图、目录约束、启动方式：`README.md`。
- 页面结构：`brand.html`。
- 脚本入口：`app.js`。模块：`views.js`（页面/导航/渲染）、`home.js`（首屏动效）、`utils.js`、`state.js`、`elements.js`、`media.js`、`timelines.js`、`categories.js`（分类配置，server 与前端共用）。
- 样式：`base.css` / `home.css` / `systems.css` / `collection.css` / `detail.css`。
- 服务端：`server.mjs`。

## 约定

- 可运行 `npm run check`（零依赖冒烟测试 + 语法检查）。
