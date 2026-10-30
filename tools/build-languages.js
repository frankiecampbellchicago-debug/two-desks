// Builds the Spanish, Portuguese and Swedish pages (/es/, /pt/, /sv/) from the English ones, using the same
// translations as the Language menu (i18n.js), so Google can find and list every language.
// Run after changing any English page or translation:  node tools/build-languages.js
// (needs puppeteer-core and Edge or Chrome; set BROWSER to the browser's path if it isn't Edge's usual place)
const puppeteer = require("puppeteer-core");
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), SITE = "https://www.frankandleilastudio.com/";
const PAGES = ["index.html", "services.html", "work.html",
  ...fs.readdirSync(path.join(ROOT, "work")).filter(f => f.endsWith(".html")).map(f => "work/" + f)]; // case studies
const LOCALE = { es: "es_ES", pt: "pt_PT", sv: "sv_SE" };
const DESC = {
  "index.html": {
    es: "F&L Studio es un estudio de diseño web. Frank y Leila diseñan webs a medida y configuran reservas en línea y perfiles de Google para negocios. Reserva una llamada gratuita para pedir presupuesto.",
    pt: "A F&L Studio é um estúdio de web design. O Frank e a Leila criam sites à medida e configuram marcações online e perfis no Google para empresas. Marque uma chamada gratuita para pedir orçamento.",
    sv: "F&L Studio är en webbdesignstudio. Frank och Leila designar skräddarsydda webbplatser och sätter upp onlinebokning och Google-profiler för företag. Boka ett kostnadsfritt samtal om offert.",
  },
  "services.html": {
    es: "Más allá de la web: configuramos perfiles de Google, reservas en línea, pagos y tiendas, email marketing y un plan mensual de mantenimiento para negocios.",
    pt: "Além do site: configuramos perfis no Google, marcações online, pagamentos e lojas, email marketing e um plano mensal de manutenção para empresas.",
    sv: "Mer än en webbplats: vi sätter upp Google-profiler, onlinebokning, betalningar och webbutiker, e-postmarknadsföring och en månatlig skötselplan för företag.",
  },
  "work.html": {
    es: "Mira las webs que F&L Studio ha diseñado y creado: webs de clientes, un rediseño y webs de muestra para restaurantes, inmobiliarias, tiendas y más.",
    pt: "Veja os sites que a F&L Studio desenhou e criou: sites de clientes, um redesign e sites de exemplo para restaurantes, imobiliárias, lojas e muito mais.",
    sv: "Se webbplatser som F&L Studio har designat och byggt: kundsajter, en omdesign och exempelsajter för restauranger, fastigheter, butiker med mera.",
  },
};
const BROWSER = process.env.BROWSER || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";

(async () => {
  const i18n = fs.readFileSync(path.join(ROOT, "i18n.js"), "utf8");
  const browser = await puppeteer.launch({ executablePath: BROWSER });

  const missing = new Set();
  for (const lang of Object.keys(LOCALE)) {
    fs.mkdirSync(path.join(ROOT, lang, "work"), { recursive: true });
    for (const file of PAGES) {
      // the page's own scripts are parked (given a type browsers don't run) so they stay exactly as written
      const page = await browser.newPage();
      await page.setContent(fs.readFileSync(path.join(ROOT, file), "utf8").replace(/<script(?![^>]*\btype=)/g, '<script type="text/x-hold"'));
      const out = await page.evaluate((code, lang, file, site, locale, desc) => {
        (0, eval)(code + "\n;setLang(" + JSON.stringify(lang) + ")");
        const pagePath = file === "index.html" ? "" : file, url = site + lang + "/" + pagePath;
        const $ = s => document.head.querySelector(s), set = (s, a, v) => { const el = $(s); if (el) el.setAttribute(a, v) };
        // English pages' language-redirect script isn't needed here
        for (const sc of document.head.querySelectorAll("script")) if (sc.textContent.includes("English pages:")) sc.remove();
        set('link[rel="canonical"]', "href", url);
        set('meta[property="og:url"]', "content", url);
        set('meta[property="og:locale"]', "content", locale);
        for (const s of ['meta[property="og:title"]', 'meta[name="twitter:title"]']) set(s, "content", document.title);
        // descriptions: from DESC above, or (case studies) the translation of the English one
        desc = desc || t($('meta[name="description"]').getAttribute("content"));
        for (const s of ['meta[name="description"]', 'meta[property="og:description"]', 'meta[name="twitter:description"]']) set(s, "content", desc);
        const alt = $('meta[property="og:image:alt"]'), altEn = alt && alt.getAttribute("content");
        if (alt) alt.setAttribute("content", altEn.startsWith("F&L Studio: ") ? "F&L Studio: " + t("Building websites worth remembering.").replace(/\*/g, "") : t(altEn));
        const ld = $('script[type="application/ld+json"]');
        if (ld) ld.textContent = ld.textContent
          .replace('"inLanguage":"en"', '"inLanguage":"' + lang + '"')
          // breadcrumbs and a case study's own address point at this language; the studio itself keeps its one address
          .replace(/("item":"|"url":"(?=https:\/\/www\.frankandleilastudio\.com\/work\/))https:\/\/www\.frankandleilastudio\.com\//g, "$1" + site + lang + "/");
        // assets live at the site root
        for (const el of document.querySelectorAll("[src],[srcset]")) {
          if (el.hasAttribute("src") && !/^(\/|#|[a-z]+:)/i.test(el.getAttribute("src"))) el.setAttribute("src", "/" + el.getAttribute("src"));
          if (el.hasAttribute("srcset")) el.setAttribute("srcset", el.getAttribute("srcset").replace(/(^|,\s*)(?!\/|[a-z]+:)/gi, "$1/"));
        }
        for (const sc of document.querySelectorAll('script[type="text/x-hold"]')) sc.removeAttribute("type");
        // English text with no translation, so it can be filled in
        const left = [], skip = new Set(["SCRIPT", "STYLE", "TEXTAREA", "svg"]);
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n; (n = w.nextNode());) { const k = n.nodeValue.trim(); if (k && /[a-z]{3}/i.test(k) && !skip.has(n.parentNode.nodeName) && n._en !== undefined && n.nodeValue === n._en) left.push(k) }
        return { html: "<!doctype html>\n" + document.documentElement.outerHTML + "\n", left };
      }, i18n, lang, file, SITE, LOCALE[lang], (DESC[file] || {})[lang]);
      await page.close();
      fs.writeFileSync(path.join(ROOT, lang, file), out.html);
      out.left.forEach(k => missing.add(lang + ": " + k));
    }
  }
  await browser.close();
  console.log("built " + Object.keys(LOCALE).length * PAGES.length + " pages");
  if (missing.size) console.log("not translated (stays English):\n  " + [...missing].join("\n  "));
})();
