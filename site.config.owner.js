// Shanzoon 的公开生产配置。Fork 用户不需要修改或启用此文件。
// 这里不包含令牌或账户凭证。
export const siteConfig = {
  site: {
    title: "shanzoon.art",
    description: "张丰（Shanzoon）的个人主页：在技术、图像与叙事之间，把模糊的想法做成真实的东西。",
    language: "zh-CN",
    signature: "Shanzoon",
    homeLabel: "返回 Shanzoon 首页",
    logo: "/assets/shanzoon-glyph.svg",
    favicon: "/assets/shanzoon-glyph-favicon.svg",
    preconnectOrigins: ["https://media.shanzoon.art"],
  },
  hero: {
    kicker: "张丰 · 个人主页",
    name: "Shanzoon",
    role: "AI Product · Creative Technology · Visual Systems",
    introduction: ["在技术、图像与叙事之间，", "把模糊的想法做成真实的东西。"],
  },
  archive: {
    manifestPath: "/archive.json",
    title: "GENERATIVE ARCHIVE",
    introduction: ["探索生成式图像的边界，", "也决定哪些结果值得成为作品。"],
    categories: [
      { id: "01-Dreamscape", label: "Dreamscape", cover: "https://media.shanzoon.art/01-Dreamscape/2026-08-11__niche-02.webp", preview: "https://media.shanzoon.art/01-Dreamscape/2026-08-11__niche-02.webp" },
      { id: "02-Lens", label: "Lens", cover: "https://media.shanzoon.art/02-Lens/2026-08-07__hottest-01-sleeve-activism.webp", preview: "https://media.shanzoon.art/02-Lens/2026-08-07__hottest-01-sleeve-activism.webp" },
      { id: "03-Ink", label: "Ink", cover: "https://media.shanzoon.art/03-Ink/2026-08-26__illustration-12.webp", preview: "https://media.shanzoon.art/03-Ink/2026-08-26__illustration-12.webp" },
      { id: "04-Persona", label: "Persona", cover: "https://media.shanzoon.art/04-Persona/2026-07-11__character-01.webp", preview: "https://media.shanzoon.art/04-Persona/2026-07-11__character-01.webp" },
    ],
  },
  systems: {
    title: "LIVE PRODUCTS",
    introduction: ["从发现方向，", "到构建真正运行的产品。"],
  },
  projects: [
    {
      title: "灵境 AI 创作平台",
      summary: "把剧本拆成角色、场景和可复用的视觉资产。",
      image: { src: "https://media.shanzoon.art/site-assets/project-lingjing-ai.webp", width: 1586, height: 992, alt: "灵境 AI 创作平台，展示剧本上传、素材创作、素材库与项目界面" },
      link: { href: "https://animeworkbench.lingjingai.cn/sandbox", label: "访问灵境创作平台" },
    },
    {
      title: "漫剧有数",
      summary: "从平台数据中发现正在形成的内容方向。",
      image: { src: "https://media.shanzoon.art/site-assets/project-drama-data.webp", width: 1672, height: 941, alt: "漫剧有数海外漫剧数据与 AI 内容洞察平台，展示 YouTube 长视频数据界面" },
      link: { href: "https://manjuyoushu.com", label: "访问漫剧有数" },
    },
    {
      title: "Loomicc",
      summary: "把生图、筛选、提示词与视觉资产管理收进一个本地工作台。",
      image: { src: "https://media.shanzoon.art/site-assets/project-loomicc-card-v2.webp", width: 1536, height: 1024, alt: "Loomicc 图片生成与视觉资产管理工作台，展示结构化提示词、图片资产库和生成元信息" },
      availability: "LOCAL PROTOTYPE",
    },
  ],
  contacts: [
    { href: "mailto:zmark4847@gmail.com", label: "zmark4847@gmail.com" },
    { href: "https://github.com/shanzoon", label: "github.com/shanzoon", rel: "me" },
  ],
  publishing: {
    sourceRoot: "../trend-lab",
    bucket: "shanzoon-me-art-image",
    mediaOrigin: "https://media.shanzoon.art",
  },
};
