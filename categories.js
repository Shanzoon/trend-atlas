// 分类配置单一来源：server.mjs 与前端模块共用。
// brand.html 中四个文件夹按钮的 data-category 必须与这里的 id 一致（由冒烟测试校验）。
// id 即 trend-lab 下的分类文件夹名。
export const categoryDefinitions = [
  { id: "01-Dreamscape", label: "Dreamscape", cover: "/media/2026-08-17/01-Dreamscape/interesting-03-sleeveless-record-repair.png", preview: "/assets/folder-wonder.jpg" },
  { id: "02-Lens", label: "Lens", cover: "/media/2026-08-17/02-Lens/hottest-04-silver-raindrop-ticket-booth.png", preview: "/assets/folder-current.jpg" },
  { id: "03-Ink", label: "Ink", cover: "/media/2026-08-26/03-Ink/illustration-01.png", preview: "/assets/folder-underground.jpg" },
  { id: "04-Persona", label: "Persona", cover: "/media/2026-08-27/04-Persona/character-41.png", preview: "/assets/folder-persona.jpg" },
];

export const categories = Object.fromEntries(categoryDefinitions.map(({ id, label }) => [id, label]));

export function categoryFor(id) {
  return categoryDefinitions.find((category) => category.id === id);
}
