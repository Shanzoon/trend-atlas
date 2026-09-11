import { siteConfig as templateConfig } from "./site.config.js?v=20260911-static1";
import { siteConfig as ownerConfig } from "./site.config.owner.js?v=20260911-static1";

const isOwnerHost = (hostname) => hostname === "me.shanzoon.art"
  || hostname === "trend-atlas.pages.dev"
  || hostname.endsWith(".trend-atlas.pages.dev");
const browserProfile = typeof location === "undefined"
  ? ""
  : new URLSearchParams(location.search).get("profile") || (isOwnerHost(location.hostname) ? "owner" : "template");
const nodeProfile = typeof process === "undefined" ? "" : process.env.SITE_PROFILE || "template";

export const siteProfile = browserProfile || nodeProfile;
// Published HTML carries the exact configuration used to render it. A host or
// query-string override must not replace that identity after the first paint.
const embeddedConfig = typeof document === "undefined" ? null : document.getElementById("siteConfig");
export const siteConfig = embeddedConfig
  ? JSON.parse(embeddedConfig.textContent)
  : siteProfile === "owner" ? ownerConfig : templateConfig;
