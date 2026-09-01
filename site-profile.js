import { siteConfig as templateConfig } from "./site.config.js?v=20260902-archivehardening1";
import { siteConfig as ownerConfig } from "./site.config.owner.js?v=20260902-archivehardening1";

const isOwnerHost = (hostname) => hostname === "me.shanzoon.art"
  || hostname === "trend-atlas.pages.dev"
  || hostname.endsWith(".trend-atlas.pages.dev");
const browserProfile = typeof location === "undefined"
  ? ""
  : new URLSearchParams(location.search).get("profile") || (isOwnerHost(location.hostname) ? "owner" : "template");
const nodeProfile = typeof process === "undefined" ? "" : process.env.SITE_PROFILE || "template";

export const siteProfile = browserProfile || nodeProfile;
export const siteConfig = siteProfile === "owner" ? ownerConfig : templateConfig;
