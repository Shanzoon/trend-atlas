import { parseHTML } from "linkedom";
import { applySiteConfig } from "../site.js";

export function renderSiteHtml(template, config) {
  const { document } = parseHTML(template);
  applySiteConfig(config, document);

  const snapshot = document.createElement("script");
  snapshot.id = "siteConfig";
  snapshot.type = "application/json";
  // Prevent configured text such as </script> from ending this data block.
  snapshot.textContent = JSON.stringify(config).replace(/</g, "\\u003c");
  document.head.append(snapshot);
  return `${document.toString()}\n`;
}
