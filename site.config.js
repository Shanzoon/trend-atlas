// Fork 的默认配置：只使用仓库内资源，不依赖任何外部账户或 Shanzoon 的 R2。
// 这里只放公开展示信息；不要写入令牌、Access Key 或账户凭证。
export const siteConfig = {
  site: {
    title: "Your Name — Portfolio",
    description: "A personal portfolio for creative work, visual experiments, and projects.",
    language: "zh-CN",
    signature: "Your Name",
    homeLabel: "返回首页",
    logo: "/assets/example-logo.svg",
    favicon: "/assets/example-logo.svg",
    preconnectOrigins: [],
  },
  hero: {
    kicker: "你的名字 · 个人主页",
    name: "Your Name",
    role: "YOUR ROLE · YOUR PRACTICE · YOUR INTERESTS",
    introduction: ["用一句话介绍你关注的方向，", "以及你希望做成的事情。"],
  },
  archive: {
    manifestPath: "/archive.example.json",
    title: "VISUAL ARCHIVE",
    introduction: ["这里先展示仓库内的示例图像，", "准备好后再换成你自己的作品。"],
    categories: [
      { id: "01-Dreamscape", label: "Dreamscape", cover: "/assets/example-dreamscape.svg", preview: "/assets/example-dreamscape.svg" },
      { id: "02-Lens", label: "Lens", cover: "/assets/example-lens.svg", preview: "/assets/example-lens.svg" },
      { id: "03-Ink", label: "Ink", cover: "/assets/example-ink.svg", preview: "/assets/example-ink.svg" },
      { id: "04-Persona", label: "Persona", cover: "/assets/example-persona.svg", preview: "/assets/example-persona.svg" },
    ],
  },
  systems: {
    title: "SELECTED PROJECTS",
    introduction: ["选择三个最能代表你的项目，", "保留现有滚动叙事与交互。"],
  },
  projects: [
    {
      title: "Project One",
      summary: "用一句话说明项目解决了什么问题。",
      image: { src: "/assets/example-project-one.svg", width: 1600, height: 1000, alt: "Project One 示例封面" },
      link: { href: "https://example.com", label: "访问 Project One" },
    },
    {
      title: "Project Two",
      summary: "用一句话说明你的角色或项目价值。",
      image: { src: "/assets/example-project-two.svg", width: 1600, height: 900, alt: "Project Two 示例封面" },
      link: { href: "https://example.com", label: "访问 Project Two" },
    },
    {
      title: "Project Three",
      summary: "尚未公开的项目可以使用状态标签。",
      image: { src: "/assets/example-project-three.svg", width: 1500, height: 1000, alt: "Project Three 示例封面" },
      availability: "PRIVATE PROTOTYPE",
    },
  ],
  contacts: [
    { href: "mailto:you@example.com", label: "you@example.com" },
    { href: "https://github.com/your-name", label: "github.com/your-name", rel: "me" },
  ],
  publishing: {
    sourceRoot: "./content/images",
    bucket: "",
    mediaOrigin: "",
  },
};
