import fs from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * The canonical site URL only becomes known at deploy time, so `robots.txt`,
 * `sitemap.xml` and the social meta tags ship with a `__SITE_URL__` placeholder
 * and get stamped here — in dev via a middleware, at build via the emitted files.
 *
 * Without this, a published site advertises whatever domain was hardcoded when
 * the files were written, which quietly breaks crawling and link previews.
 */
function siteUrl() {
  const raw = process.env.WEBSITE_URL || "http://localhost:4200";
  return raw.replace(/\/+$/, "");
}

const STAMPED = ["robots.txt", "sitemap.xml"];

export default function seoPlugin(): Plugin {
  return {
    name: "orbitl-seo",

    // Dev: serve the stamped version so what you test is what ships.
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split("?")[0]?.replace(/^\//, "") ?? "";
        if (!STAMPED.includes(name)) return next();
        const file = path.resolve(server.config.publicDir, name);
        if (!fs.existsSync(file)) return next();
        res.setHeader("content-type", name.endsWith(".xml") ? "text/xml" : "text/plain");
        res.end(fs.readFileSync(file, "utf8").replaceAll("__SITE_URL__", siteUrl()));
      });
    },

    // Build: replace the placeholder in the HTML entry…
    transformIndexHtml(html) {
      return html.replaceAll("__SITE_URL__", siteUrl());
    },

    // …and in the copied public assets.
    closeBundle() {
      const outDir = path.resolve(process.cwd(), "dist");
      for (const name of STAMPED) {
        const file = path.join(outDir, name);
        if (!fs.existsSync(file)) continue;
        fs.writeFileSync(file, fs.readFileSync(file, "utf8").replaceAll("__SITE_URL__", siteUrl()));
      }
    },
  };
}
