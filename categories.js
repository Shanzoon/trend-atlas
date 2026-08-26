// 分类配置单一来源：server.mjs 与前端模块共用。
// brand.html 中四个文件夹按钮的 data-category 必须与这里的 id 一致（由冒烟测试校验）。
// id 即 trend-lab 下的分类文件夹名。
export const categoryDefinitions = [
  { id: "01-Dreamscape", label: "Dreamscape", cover: "https://media.shanzoon.art/01-Dreamscape/2026-08-11__niche-02.webp", preview: "https://media.shanzoon.art/01-Dreamscape/2026-08-11__niche-02.webp" },
  { id: "02-Lens", label: "Lens", cover: "https://media.shanzoon.art/02-Lens/2026-08-07__hottest-01-sleeve-activism.webp", preview: "https://media.shanzoon.art/02-Lens/2026-08-07__hottest-01-sleeve-activism.webp" },
  { id: "03-Ink", label: "Ink", cover: "https://media.shanzoon.art/03-Ink/2026-08-26__illustration-12.webp", preview: "https://media.shanzoon.art/03-Ink/2026-08-26__illustration-12.webp" },
  { id: "04-Persona", label: "Persona", cover: "https://media.shanzoon.art/04-Persona/2026-07-11__character-01.webp", preview: "https://media.shanzoon.art/04-Persona/2026-07-11__character-01.webp" },
];

export const categories = Object.fromEntries(categoryDefinitions.map(({ id, label }) => [id, label]));

export function categoryFor(id) {
  return categoryDefinitions.find((category) => category.id === id);
}
