import { siteConfig } from "./site-profile.js?v=20260829-detailstage1";

// 分类配置单一来源：site.config.js、server.mjs、发布脚本与前端共用。
// brand.html 中四个文件夹按钮的 data-category 必须与这里的 id 一致（由冒烟测试校验）。
export const categoryDefinitions = Array.isArray(siteConfig.archive?.categories) ? siteConfig.archive.categories : [];

export const categories = Object.fromEntries(categoryDefinitions.map(({ id, label }) => [id, label]));

export function categoryFor(id) {
  return categoryDefinitions.find((category) => category.id === id);
}
