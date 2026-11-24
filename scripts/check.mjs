// Checks the built site on disk: node scripts/check.mjs
// Every sitemap URL resolves to a file; each page has one Organization block identical to the
// canonical one, a self-referencing canonical, reciprocal hreflang, no noindex/nosnippet/noai,
// valid JSON-LD with a real dateModified, and no internal link that 404s.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, SITE, ORG, read } from './lib.mjs';

const problems = [];
const fail = (url, msg) => problems.push(`${url}: ${msg}`);

function fileFor(urlPath) {
  const clean = decodeURIComponent(urlPath.split(/[?#]/)[0]);
  const candidates = clean.endsWith('/') ? [`${clean}index.html`] : [clean, `${clean}.html`, `${clean}/index.html`];
  return candidates.map((c) => path.join(ROOT, c)).find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
}

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const urls = locs(read('sitemap.xml')).flatMap((sm) => locs(read(new URL(sm).pathname.slice(1))));
const hreflang = new Map();
let links = 0;

for (const url of urls) {
  const p = new URL(url).pathname;
  const file = fileFor(p);
  if (!file) { fail(p, 'in the sitemap but no file'); continue; }
  const html = fs.readFileSync(file, 'utf8');

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => {
    try { return JSON.parse(m[1]); } catch (e) { fail(p, `JSON-LD does not parse: ${e.message}`); return {}; }
  });
  const nodes = blocks.flatMap((b) => b['@graph'] || [b]);
  const orgs = nodes.filter((n) => n['@type'] === 'Organization');
  if (orgs.length !== 1) fail(p, `${orgs.length} Organization blocks, expected 1`);
  else if (JSON.stringify(orgs[0]) !== JSON.stringify(ORG)) fail(p, 'Organization block differs from the canonical one');
  const dated = nodes.filter((n) => 'dateModified' in n);
  if (!dated.length) fail(p, 'no dateModified in JSON-LD');
  for (const n of dated) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.dateModified)) fail(p, `bad dateModified "${n.dateModified}"`);
    if (n.datePublished && n.datePublished > n.dateModified) fail(p, `datePublished ${n.datePublished} is after dateModified ${n.dateModified}`);
  }

  const canonical = html.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
  if (canonical !== url) fail(p, `canonical is ${canonical}`);
  if (/<meta name="robots" content="[^"]*(noindex|nosnippet|noai)/i.test(html)) fail(p, 'noindex / nosnippet / noai');
  if (!/<html lang="[a-z]{2}"/.test(html)) fail(p, 'no <html lang>');
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) fail(p, 'not exactly one <h1>');

  hreflang.set(url, [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g)].map((m) => [m[1], m[2]]));

  const base = new URL(url);
  for (const m of html.replace(/<script[\s\S]*?<\/script>|<!--[\s\S]*?-->/g, '').matchAll(/\s(?:href|src)="([^"]+)"/g)) {
    const raw = m[1].replace(/&amp;/g, '&');
    if (/^(mailto:|tel:|data:|javascript:|#)/.test(raw)) continue;
    const target = new URL(raw, base);
    if (target.origin !== SITE) continue;
    links++;
    if (!fileFor(target.pathname)) fail(p, `broken internal link ${raw}`);
  }
}

for (const [url, alts] of hreflang) {
  if (!alts.some(([lang]) => lang === 'x-default')) fail(url, 'no x-default hreflang');
  for (const [lang, target] of alts) {
    if (!hreflang.has(target)) fail(url, `hreflang ${lang} points at ${target}, which is not a sitemap page`);
    else if (lang !== 'x-default' && !hreflang.get(target).some(([, back]) => back === url)) fail(url, `hreflang ${lang} target ${target} does not link back`);
  }
}

console.log(`${urls.length} sitemap pages, ${links} internal links checked.`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('All checks pass: one identical Organization block per page, canonicals, hreflang, dates, no noindex, no broken internal links.');
