import { siteConfig } from "./site-profile.js?v=20260902-touch1";

function requireString(value, path) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} 必须是非空文本`);
}

function requireImage(image, path) {
  if (!image || typeof image !== "object") throw new Error(`${path} 必须是图片配置`);
  requireString(image.src, `${path}.src`);
  requireString(image.alt, `${path}.alt`);
  if (!Number.isFinite(image.width) || image.width <= 0 || !Number.isFinite(image.height) || image.height <= 0) {
    throw new Error(`${path}.width 和 ${path}.height 必须是正数`);
  }
}

export function validateSiteConfig(config = siteConfig) {
  if (!config || typeof config !== "object") throw new Error("site.config.js 必须导出 siteConfig 对象");
  ["title", "description", "language", "signature", "homeLabel", "logo", "favicon"].forEach((key) => requireString(config.site?.[key], `site.${key}`));
  ["kicker", "name", "role"].forEach((key) => requireString(config.hero?.[key], `hero.${key}`));
  requireString(config.archive?.manifestPath, "archive.manifestPath");
  requireString(config.archive?.title, "archive.title");
  requireString(config.systems?.title, "systems.title");

  for (const [path, lines] of [["hero.introduction", config.hero?.introduction], ["archive.introduction", config.archive?.introduction], ["systems.introduction", config.systems?.introduction]]) {
    if (!Array.isArray(lines) || lines.length !== 2) throw new Error(`${path} 必须包含两行文本`);
    lines.forEach((line, index) => requireString(line, `${path}[${index}]`));
  }

  if (!Array.isArray(config.archive?.categories) || config.archive.categories.length !== 4) {
    throw new Error("archive.categories 必须保留 4 个分类");
  }
  config.archive.categories.forEach((category, index) => {
    ["id", "label", "cover", "preview"].forEach((key) => requireString(category?.[key], `archive.categories[${index}].${key}`));
    if ([".", ".."].includes(category.id) || category.id.includes("/") || category.id.includes("\\")) {
      throw new Error(`archive.categories[${index}].id 必须是单一路径段`);
    }
  });

  if (!Array.isArray(config.projects) || config.projects.length !== 3) throw new Error("projects 必须保留 3 个项目");
  config.projects.forEach((project, index) => {
    requireString(project?.title, `projects[${index}].title`);
    requireString(project?.summary, `projects[${index}].summary`);
    requireImage(project?.image, `projects[${index}].image`);
    if (project.link) {
      requireString(project.link.href, `projects[${index}].link.href`);
      requireString(project.link.label, `projects[${index}].link.label`);
    } else {
      requireString(project.availability, `projects[${index}].availability`);
    }
  });

  if (!Array.isArray(config.contacts) || config.contacts.length !== 2) throw new Error("contacts 必须保留 2 个联系方式");
  config.contacts.forEach((contact, index) => {
    requireString(contact?.href, `contacts[${index}].href`);
    requireString(contact?.label, `contacts[${index}].label`);
  });
  return config;
}

function setTwoLineCopy(element, lines) {
  element.replaceChildren(document.createTextNode(lines[0]), document.createElement("br"), document.createTextNode(lines[1]));
}

function configureProject(sheet, project) {
  sheet.querySelector(".project-title").textContent = project.title;
  sheet.querySelector(".project-sheet-copy p").textContent = project.summary;
  const image = sheet.querySelector(".project-board img");
  image.src = project.image.src;
  image.width = project.image.width;
  image.height = project.image.height;
  image.alt = project.image.alt;
  sheet.style.setProperty("--project-aspect", String(project.image.width / project.image.height));

  const link = sheet.querySelector(".project-visit");
  const availability = sheet.querySelector(".project-availability");
  link.hidden = !project.link;
  availability.hidden = Boolean(project.link);
  if (project.link) {
    link.href = project.link.href;
    link.firstChild.textContent = `${project.link.label} `;
  } else {
    availability.textContent = project.availability;
  }

  image.addEventListener("error", () => {
    image.hidden = true;
    sheet.querySelector(".project-board").dataset.imageError = "项目图片不可用，请检查 site.config.js";
  }, { once: true });
}

export function applySiteConfig(config = siteConfig) {
  validateSiteConfig(config);
  document.documentElement.lang = config.site.language;
  document.title = config.site.title;
  document.querySelector('meta[name="description"]').content = config.site.description;
  document.querySelector("#siteFavicon").href = config.site.favicon;
  document.querySelector("#homeLink").ariaLabel = config.site.homeLabel;
  document.querySelector("#siteLogo").src = config.site.logo;
  document.querySelector("#siteSignature").textContent = config.site.signature;
  document.querySelector("#identityKicker").textContent = config.hero.kicker;
  document.querySelector("#brandName").textContent = config.hero.name;
  document.querySelector("#identityRole").textContent = config.hero.role;
  setTwoLineCopy(document.querySelector("#identityIntroduction"), config.hero.introduction);
  document.querySelector("#archiveIdentity").textContent = config.archive.title;
  setTwoLineCopy(document.querySelector("#archiveIntroduction"), config.archive.introduction);
  const dailyCategory = config.archive.categories[0];
  document.querySelector("#dailyImageWrap").ariaLabel = `当前 ${dailyCategory.label} 精选，点击换一张`;
  document.querySelector("#dailyRefresh").ariaLabel = `随机换一张 ${dailyCategory.label} 图像`;
  document.querySelector(".daily-caption span:first-child").textContent = `${dailyCategory.label.toUpperCase()} PICK`;
  document.querySelector("#systemsTitle").textContent = config.systems.title;
  setTwoLineCopy(document.querySelector("#systemsIntroduction"), config.systems.introduction);

  document.querySelectorAll(".folder-portal").forEach((button, index) => {
    const category = config.archive.categories[index];
    button.dataset.category = category.id;
    button.ariaLabel = `打开 ${category.label} 图库`;
    button.querySelector(".folder-label").textContent = category.label.toUpperCase();
  });

  document.querySelectorAll("[data-project-sheet]").forEach((sheet, index) => configureProject(sheet, config.projects[index]));
  document.querySelectorAll("#systemsContact a").forEach((link, index) => {
    const contact = config.contacts[index];
    link.href = contact.href;
    link.textContent = contact.label;
    if (contact.rel) link.rel = contact.rel;
    else link.removeAttribute("rel");
  });

  document.querySelectorAll("#sitePreconnects").forEach((link) => link.remove());
  config.site.preconnectOrigins?.forEach((origin) => {
    const link = document.createElement("link");
    link.id = "sitePreconnects";
    link.rel = "preconnect";
    link.href = origin;
    document.head.append(link);
  });
  return config;
}

export { siteConfig };
