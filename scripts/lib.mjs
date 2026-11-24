// Shared helpers for the static-site build. No dependencies beyond Node.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://defensivepedal.tech';
export const TODAY = process.env.BUILD_DATE || new Date().toISOString().slice(0, 10);
export const INDEX_CSV_SRC = 'C:/dev/european-cycling-risk-ranking/data/eu300_city_index.csv';
export const INDEX_CSV = 'pedalability-index/data/eu300_city_index.csv';
export const DATASET_ID = `${SITE}/pedalability-index/#dataset`;
export const REPORT_DOI = 'https://doi.org/10.5281/zenodo.22771452';
export const SEVERITY_DOI = 'https://doi.org/10.5281/zenodo.23051502';
export const UMAMI = '<!-- Umami analytics --><script defer src="https://cloud.umami.is/script.js" data-website-id="2201d96e-6770-41c0-a4e4-58438afda362"></script>';

// Victor creates the Wikidata item; put its URL here and rebuild. Empty = not emitted.
export const WIKIDATA_URL = '';

export const FOUNDER = {
  '@type': 'Person',
  '@id': `${SITE}/#founder`,
  name: 'Victor Rotariu',
  sameAs: ['https://www.linkedin.com/in/victorrotariu/'],
};

// The one Organization block. Every page carries exactly this.
export const ORG = {
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'Defensive Pedal',
  legalName: 'Defensive Pedal SRL',
  url: `${SITE}/`,
  logo: `${SITE}/app_icon_23Apr26_v1.png`,
  founder: FOUNDER,
  sameAs: [
    'https://www.linkedin.com/company/defensive-pedal/',
    'https://www.instagram.com/defensive.pedal/',
    'https://www.facebook.com/defensive.pedal/',
    'https://play.google.com/store/apps/details?id=com.defensivepedal.mobile',
    'https://apps.apple.com/ro/app/defensive-pedal/id6778694757',
    ...(WIKIDATA_URL ? [WIKIDATA_URL] : []),
  ],
};

export const LANG_NAMES = { en: 'English', ro: 'Română', de: 'Deutsch', fr: 'Français', es: 'Español' };

// iso2 -> [name, slug, name as used after "in"]
export const COUNTRIES = {
  AT: ['Austria', 'austria'], BE: ['Belgium', 'belgium'], BG: ['Bulgaria', 'bulgaria'],
  CH: ['Switzerland', 'switzerland'], CY: ['Cyprus', 'cyprus'],
  CZ: ['Czechia', 'czechia'], DE: ['Germany', 'germany'], DK: ['Denmark', 'denmark'],
  EE: ['Estonia', 'estonia'], ES: ['Spain', 'spain'], FI: ['Finland', 'finland'],
  FR: ['France', 'france'], GB: ['United Kingdom', 'united-kingdom', 'the United Kingdom'],
  GR: ['Greece', 'greece'], HR: ['Croatia', 'croatia'], HU: ['Hungary', 'hungary'],
  IE: ['Ireland', 'ireland'], IS: ['Iceland', 'iceland'], IT: ['Italy', 'italy'],
  LT: ['Lithuania', 'lithuania'], LU: ['Luxembourg', 'luxembourg'], LV: ['Latvia', 'latvia'],
  MT: ['Malta', 'malta'], NL: ['Netherlands', 'netherlands', 'the Netherlands'],
  NO: ['Norway', 'norway'], PL: ['Poland', 'poland'], PT: ['Portugal', 'portugal'],
  RO: ['Romania', 'romania'], SE: ['Sweden', 'sweden'], SI: ['Slovenia', 'slovenia'],
  SK: ['Slovakia', 'slovakia'],
};

export const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export const read = (rel) => fs.readFileSync(path.resolve(ROOT, rel), 'utf8');
export const exists = (rel) => fs.existsSync(path.resolve(ROOT, rel));

export function write(rel, content) {
  const file = path.resolve(ROOT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) return false;
  fs.writeFileSync(file, content);
  return true;
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  const src = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c !== '')) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

export function ordinal(n) {
  const v = n % 100;
  const suffix = v >= 11 && v <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
  return `${n}${suffix}`;
}

const MONTHS = {
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  ro: ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'],
};
export function humanDate(iso, lang = 'en') {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${(MONTHS[lang] || MONTHS.en)[m - 1]} ${y}`;
}

export const wordCount = (text) => text.split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

export const fill = (template, vars) => template.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

/** JSON for a <script> block: "<" is escaped so no text can close the element. */
export const ldJson = (data) => JSON.stringify(data, null, 2).replace(/</g, '\\u003c');

export const jsonLd = (graph) =>
  `<script type="application/ld+json">\n${ldJson({ '@context': 'https://schema.org', '@graph': graph })}\n  </script>`;

export const breadcrumbs = (url, trail) => ({
  '@type': 'BreadcrumbList',
  '@id': `${SITE}${url}#breadcrumbs`,
  itemListElement: trail.map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${href}` })),
});

// ---- lastmod manifest: a page's date changes only when its content does ----
const MANIFEST = 'content/lastmod.json';
const manifest = exists(MANIFEST) ? JSON.parse(read(MANIFEST)) : {};
const seen = new Set();

/** Returns { modified, published } for a page, given its content with dates left out. */
export function stamp(url, contentWithoutDates) {
  const hash = crypto.createHash('sha256').update(contentWithoutDates).digest('hex').slice(0, 16);
  const prev = manifest[url];
  if (!prev) manifest[url] = { hash, modified: TODAY, published: TODAY };
  else if (prev.hash !== hash) manifest[url] = { ...prev, hash, modified: TODAY };
  seen.add(url);
  return manifest[url];
}

/** For hand-written pages that already state when they were first published. */
export function setPublished(url, date) {
  if (manifest[url] && date && date < manifest[url].published) manifest[url].published = date;
}

export function saveManifest() {
  // A generated page that is no longer built (note removed, draft withdrawn) is deleted, not orphaned.
  for (const url of Object.keys(manifest).filter((u) => !seen.has(u) && u.endsWith('/'))) {
    const file = path.resolve(ROOT, `${url.slice(1)}index.html`);
    if (!fs.existsSync(file)) continue;
    fs.rmSync(file);
    if (!fs.readdirSync(path.dirname(file)).length) fs.rmdirSync(path.dirname(file));
    console.log(`Removed ${url} (no longer built). If it was live, add a 301 for it in _redirects.`);
  }
  const kept = Object.fromEntries(Object.keys(manifest).filter((u) => seen.has(u)).sort().map((u) => [u, manifest[u]]));
  write(MANIFEST, JSON.stringify(kept, null, 1) + '\n');
}

// ---- page registry: every public page, used for hreflang, sitemap, llms.txt, feed ----
export const pages = [];
export function register(page) { pages.push(page); return page; }
export const pageExists = (url) => pages.some((p) => p.url === url);

/** Reciprocal hreflang set for a page: every page sharing its key, plus x-default = EN. */
export function alternates(page) {
  const group = pages.filter((p) => p.key === page.key).sort((a, b) => a.lang.localeCompare(b.lang));
  const en = group.find((p) => p.lang === 'en');
  return [...group.map((p) => [p.lang, p.url]), ...(en ? [['x-default', en.url]] : [])];
}

export const hreflangLinks = (page) => alternates(page)
  .map(([lang, url]) => `  <link rel="alternate" hreflang="${lang}" href="${SITE}${url}" />`).join('\n');

const merge = (base, over) => (over && typeof over === 'object' && !Array.isArray(over)
  ? { ...base, ...Object.fromEntries(Object.entries(over).map(([k, v]) => [k, merge(base?.[k], v)])) }
  : over);

/** Template wording for a language: EN, or EN overlaid with texts.i18n[lang]. Null if that language has none. */
export function textsFor(texts, lang) {
  if (lang === 'en') return texts;
  return texts.i18n?.[lang] ? merge(texts, texts.i18n[lang]) : null;
}

/** The page with this key in the given language, falling back to English. */
export const localized = (key, lang) => pages.find((p) => p.key === key && p.lang === lang) || pages.find((p) => p.key === key && p.lang === 'en');

/** Links to the guides / research / apps hubs that exist in this language. */
export function sectionLinks(lang, texts) {
  const prefix = lang === 'en' ? '' : `/${lang}`;
  return ['guides', 'research', 'apps']
    .filter((s) => pageExists(`${prefix}/${s}/`))
    .map((s) => ({ href: `${prefix}/${s}/`, label: texts.sections[s].nav }));
}

/** The shell shared by every generated page. `body` is the inner HTML of <article>. */
export function shell({ page, title, description, body, graph, ogImage, texts }) {
  const lang = page.lang;
  const sections = sectionLinks(lang, texts).map((l) => `<a href="${l.href}">${esc(l.label)}</a>`);
  const to = (key) => `<a href="${localized(key, lang).url}">${esc(texts.shell[key])}</a>`;
  const nav = [`<a href="/pedalability-index/" class="nav__index">Pedalability Index</a>`, ...sections, to('methodology')];
  const foot = [to('home'), `<a href="/pedalability-index/">Pedalability Index</a>`, ...sections,
    to('methodology'), to('privacy'), to('terms'), `<a href="/feed.xml">${esc(texts.shell.feed)}</a>`];
  const others = alternates(page).filter(([l]) => l !== lang && l !== 'x-default')
    .map(([l, url]) => `<a href="${url}" lang="${l}" hreflang="${l}">${LANG_NAMES[l] || l}</a>`);
  const canonical = `${SITE}${page.url}`;
  const image = ogImage || `${SITE}/feature%20graphic_8May26.png`;
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="author" content="Victor Rotariu" />
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}" />
  <meta name="robots" content="index,follow" />
  <link rel="canonical" href="${canonical}" />
${hreflangLinks(page)}
  <link rel="alternate" type="application/rss+xml" title="Defensive Pedal updates" href="${SITE}/feed.xml" />
  <link rel="icon" href="/app_icon_23Apr26_v1.png" type="image/png" />
  <meta property="og:type" content="article" />
  <meta property="article:modified_time" content="@@MODIFIED@@T00:00:00Z" />
  <meta property="og:title" content="${esc(title)}" />
  <meta property="og:description" content="${esc(description)}" />
  <meta property="og:url" content="${canonical}" />
  <meta property="og:image" content="${image}" />
  <meta name="last-modified" content="@@MODIFIED@@" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/styles.css?v=2" />
  <link rel="stylesheet" href="/answers.css?v=1" />
  ${jsonLd(graph)}
  ${UMAMI}
</head>
<body>
  <header class="nav is-scrolled">
    <div class="container nav__inner">
      <a href="${localized('home', lang).url}" class="nav__logo" aria-label="Defensive Pedal">
        <img src="/logo_yellow.png" alt="Defensive Pedal" width="160" height="40" />
      </a>
      <nav class="nav__links" aria-label="Primary">
        ${nav.join('\n        ')}
      </nav>
      <div class="nav__actions">
        <a href="${localized('home', lang).url}" class="btn btn--install btn--sm">${esc(texts.shell.app_button)}</a>
      </div>
    </div>
  </header>

  <main class="answer">
    <article class="answer-doc">
${body}
    </article>
    <p class="answer-foot">© @@YEAR@@ ${ORG.legalName} · ${[...foot, ...others].join(' · ')}</p>
  </main>
</body>
</html>
`;
}

/** Render a generated page: date it from its content, write it, register it. */
export function emit(page, html) {
  const dates = stamp(page.url, html);
  const out = html
    .replaceAll('@@MODIFIED@@', dates.modified)
    .replaceAll('@@YEAR@@', TODAY.slice(0, 4)) // filled after dating, so a new year alone changes no date
    .replaceAll('@@PUBLISHED@@', dates.published)
    .replaceAll('@@MODIFIED_HUMAN@@', humanDate(dates.modified, page.lang));
  write(page.file, out);
  Object.assign(page, dates);
}
