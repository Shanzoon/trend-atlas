// 分类配置单一来源：server.mjs 与前端模块共用。
// brand.html 中四个文件夹按钮的 data-category 必须与这里的 id 一致（由冒烟测试校验）。
export const categoryDefinitions = [
  { id: "01-interesting", label: "有趣", cover: "/media/2026-08-17/01-interesting/interesting-04-moonlight-diner-double-sunrise.png", preview: "/assets/folder-wonder.jpg" },
  { id: "02-hottest", label: "最热", cover: "/media/2026-08-08/02-hottest/h02_night_market_kite_mender.png", preview: "/assets/folder-current.jpg" },
  { id: "03-niche", label: "小众", cover: "/media/2026-08-08/03-niche/n03_folded_city_book.png", preview: "/assets/folder-underground.jpg" },
  { id: "04-best-character", label: "角色", cover: "/media/2026-08-08/04-best-character/c02_punk_ballet_footmaker.png", preview: "/assets/folder-persona.jpg" },
];

export const categories = Object.fromEntries(categoryDefinitions.map(({ id, label }) => [id, label]));

export function categoryFor(id) {
  return categoryDefinitions.find((category) => category.id === id);
}
