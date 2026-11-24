// Site-wide step: keeps the hand-written pages consistent (one Organization block,
// page schema, hreflang, real dates), and writes the sitemaps, llms.txt, llms-full.txt and feed.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, SITE, DATASET_ID, REPORT_DOI, ORG, FOUNDER, INDEX_CSV, COUNTRIES,
  esc, read, write, humanDate, ldJson, register, pages, hreflangLinks, sectionLinks,
  stamp, setPublished, textsFor,
} from './lib.mjs';

const WEBSITE = (lang) => ({
  '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Defensive Pedal', inLanguage: lang,
  publisher: { '@id': ORG['@id'] },
});

const service = (url, name, serviceType, areaServed) => ({
  '@type': 'Service', '@id': `${SITE}${url}#service`, name, serviceType,
  provider: { '@id': ORG['@id'] }, areaServed, url: `${SITE}${url}`,
});

// Hand-written pages. `key` pairs translations; `nodes` are page-specific JSON-LD the build maintains.
const HAND = [
  { file: 'index.html', url: '/', lang: 'en', key: 'home' },
  { file: 'ro/index.html', url: '/ro/', lang: 'ro', key: 'home' },
  { file: 'methodology.html', url: '/methodology', lang: 'en', key: 'methodology' },
  { file: 'ro/methodology.html', url: '/ro/methodology', lang: 'ro', key: 'methodology' },
  { file: 'privacy.html', url: '/privacy', lang: 'en', key: 'privacy' },
  { file: 'ro/privacy.html', url: '/ro/privacy', lang: 'ro', key: 'privacy' },
  { file: 'terms.html', url: '/terms', lang: 'en', key: 'terms' },
  { file: 'ro/terms.html', url: '/ro/terms', lang: 'ro', key: 'terms' },
  { file: 'cities.html', url: '/cities', lang: 'en', key: 'cities',
    nodes: [service('/cities', 'Street Risk Review', 'Cycling risk assessment for municipalities', 'Europe')] },
  { file: 'partners.html', url: '/partners', lang: 'en', key: 'partners',
    nodes: [service('/partners', 'White-label cycling risk layer', 'Cycling risk evidence for transport consultancies', 'Europe')] },
  { file: 'fleets.html', url: '/fleets', lang: 'en', key: 'fleets',
    nodes: [service('/fleets', 'Fleet Route-Risk Audit', 'Route-risk audit for courier and e-bike fleets', { '@type': 'City', name: 'Bucharest' })] },
  { file: 'pedalability-index/index.html', url: '/pedalability-index/', lang: 'en', key: 'index' },
  { file: 'pedalability-index/report/index.html', url: '/pedalability-index/report/', lang: 'en', key: 'index/report',
    nodes: [{
      '@type': 'ScholarlyArticle', '@id': `${SITE}/pedalability-index/report/#article`,
      headline: 'The European Cycling Risk Index: Methodology, Validation, and a City-Level Analysis of 219 Cities',
      version: '1.0', author: FOUNDER, publisher: { '@id': ORG['@id'] }, datePublished: '2026-09',
      identifier: REPORT_DOI, sameAs: REPORT_DOI, url: `${SITE}/pedalability-index/report/`,
      license: 'https://creativecommons.org/licenses/by/4.0/', inLanguage: 'en', isBasedOn: { '@id': DATASET_ID },
    }, {
      '@type': 'BreadcrumbList', '@id': `${SITE}/pedalability-index/report/#breadcrumbs`,
      itemListElement: [['Home', '/'], ['Pedalability Index', '/pedalability-index/'], ['The study', '/pedalability-index/report/']]
        .map(([name, href], i) => ({ '@type': 'ListItem', position: i + 1, name, item: `${SITE}${href}` })),
    }] },
  // Not public pages: they get the Organization block only.
  { file: '404.html', url: '/404', lang: 'en', key: '404', hidden: true },
  { file: 'pitch.html', url: '/pitch', lang: 'en', key: 'pitch', hidden: true },
];

const LD = /<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/;
const FOOT_DATE = /((?:Page updated|Pagină actualizată la) )<time datetime="[^"]*">[^<]*<\/time>/;

function patchLd(html, mutate) {
  const found = html.match(LD);
  const data = found ? JSON.parse(found[1]) : { '@context': 'https://schema.org', '@graph': [] };
  mutate(data['@graph']);
  const block = `<script type="application/ld+json">\n${ldJson(data)}\n  </script>`;
  return found ? html.replace(LD, () => block) : html.replace(/<\/head>/, () => `  ${block}\n</head>`);
}

function upsert(graph, node) {
  const i = graph.findIndex((n) => n['@id'] === node['@id']);
  if (i === -1) graph.push(node); else graph[i] = node;
}

const setDates = (html, graphDate, visible) => patchLd(html, (graph) => {
  for (const n of graph) if ('dateModified' in n) n.dateModified = graphDate;
})
  .replace(/(<meta name="last-modified" content=")[^"]*/, `$1${graphDate}`)
  .replace(/(<meta property="article:modified_time" content=")[^"]*/, `$1${graphDate}T00:00:00Z`)
  .replace(FOOT_DATE, (m, lead) => `${lead}<time datetime="${graphDate}">${visible}</time>`);

function block(html, name, content, file) {
  const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`, 'g');
  if (!re.test(html)) throw new Error(`${file}: missing <!-- build:${name} --> markers`);
  return html.replace(re, (m, open, close) => `${open}${content}${close}`);
}

export function plan() {
  for (const p of HAND) {
    const title = read(p.file).match(/<title>([\s\S]*?)<\/title>/)[1].trim().replace(/&amp;/g, '&');
    register({ ...p, group: 'core', hand: true, title: title.replace(/ — Defensive Pedal$/, '') });
  }
}

export function renderHandPages(extraNodes, texts) {
  for (const page of pages.filter((p) => p.hand)) {
    let html = read(page.file);
    html = patchLd(html, (graph) => {
      upsert(graph, ORG);
      if (page.hidden) return;
      if (!graph.some((n) => n['@type'] === 'WebSite')) graph.splice(1, 0, WEBSITE(page.lang));
      if (!graph.some((n) => n['@type'] === 'WebPage')) {
        graph.push({
          '@type': 'WebPage', '@id': `${SITE}${page.url}#webpage`, url: `${SITE}${page.url}`, name: page.title,
          inLanguage: page.lang, isPartOf: { '@id': `${SITE}/#website` }, dateModified: '',
        });
      }
      for (const node of [...(page.nodes || []), ...(extraNodes[page.url] || [])]) upsert(graph, node);
    });
    if (!page.hidden) {
      // Canonical and hreflang: one self-referencing canonical, then the reciprocal set.
      html = html.replace(/\s*<link rel="alternate" hreflang="[^"]*" href="[^"]*"\s*\/?>/g, '');
      const canonical = `<link rel="canonical" href="${SITE}${page.url}" />`;
      html = /<link rel="canonical"/.test(html)
        ? html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, canonical)
        : html.replace(/(<title>[\s\S]*?<\/title>)/, `$1\n  ${canonical}`);
      html = html.replace(canonical, `${canonical}\n${hreflangLinks(page)}`);
    }
    if (page.key === 'home') {
      const links = sectionLinks(page.lang, textsFor(texts, page.lang) || texts).map((l) => `<a href="${l.href}">${esc(l.label)}</a>`).join('');
      html = block(html, 'sections', links, page.file);
    }
    const dates = stamp(page.url, setDates(html, '@@', '@@'));
    const published = html.match(/"datePublished": "(\d{4}-\d{2}-\d{2})"/);
    if (published) setPublished(page.url, published[1]);
    write(page.file, setDates(html, dates.modified, humanDate(dates.modified, page.lang)));
    Object.assign(page, dates);
  }
}

// ---------- sitemaps ----------
const GROUPS = { core: 'sitemap-core.xml', cities: 'sitemap-cities.xml', answers: 'sitemap-guides.xml' };

export function writeSitemaps() {
  const index = [];
  for (const [group, file] of Object.entries(GROUPS)) {
    const members = pages.filter((p) => p.group === group && !p.hidden).sort((a, b) => a.url.localeCompare(b.url));
    if (!members.length) { fs.rmSync(path.resolve(ROOT, file), { force: true }); continue; }
    const urls = members.map((p) => {
      const alts = hreflangLinks(p).replace(/<link rel="alternate" /g, '<xhtml:link rel="alternate" ').replace(/^ {2}/gm, '    ');
      return `  <url>\n    <loc>${SITE}${p.url}</loc>\n    <lastmod>${p.modified}</lastmod>\n${alts}\n  </url>`;
    });
    write(file, `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls.join('\n')}
</urlset>
`);
    const latest = members.map((p) => p.modified).sort().at(-1);
    index.push(`  <sitemap>\n    <loc>${SITE}/${file}</loc>\n    <lastmod>${latest}</lastmod>\n  </sitemap>`);
  }
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${index.join('\n')}
</sitemapindex>
`);
}

// ---------- llms.txt and llms-full.txt ----------
const text = (html) => html
  .replace(/<(script|style)[\s\S]*?<\/\1>/g, '')
  .replace(/<\/(p|h[1-6]|li|tr|table|ul|ol)>/g, '\n').replace(/<\/t[dh]>\s*<t[dh][^>]*>/g, ' | ')
  .replace(/<h([1-6])[^>]*>/g, (m, n) => `\n${'#'.repeat(Number(n))} `).replace(/<li[^>]*>/g, '- ')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&minus;/g, '−').replace(/&rsquo;/g, '’').replace(/&quot;/g, '"')
  .split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();

export function writeLlms({ cities, texts }) {
  const link = (p) => `- [${p.title}](${SITE}${p.url})${p.summary ? `: ${p.summary}` : ''}`;
  const group = (test) => pages.filter(test).sort((a, b) => a.url.localeCompare(b.url));
  const top10 = cities.slice(0, 10).map((c) => `${c.rank}. ${c.city} (${COUNTRIES[c.iso2][0]}) ${Number(c.index).toFixed(1)}`).join(' · ');
  const countryPages = group((p) => p.group === 'cities' && p.members);
  const cityPages = group((p) => p.group === 'cities' && p.city);
  const section = (name) => {
    const members = group((p) => p.group === 'answers' && p.section === name && !p.hub && p.lang === 'en');
    return members.length ? `## ${texts.sections[name].nav}\n\n${members.map(link).join('\n')}\n` : '';
  };
  const generated = [
    `## Pedalability Index

- [Pedalability Index 2026: Cycling Risk](${SITE}/pedalability-index/): 300 European cities ranked by the cycling risk of their street networks, from 74 million scored road segments. ${texts.direction} A score of 0.0 means the lowest of the 300 cities, not an absence of safety.
- Top 10: ${top10}
- [City data file, CSV, CC BY 4.0](${SITE}/${INDEX_CSV})
- [The study, v1.0, 219 cities](${SITE}/pedalability-index/report/): Rotariu, V. (2026), The European Cycling Risk Index: Methodology, Validation, and a City-Level Analysis of 219 Cities, ${REPORT_DOI}
- [Full text for language models](${SITE}/llms-full.txt): methodology, limits and the 300-row table as plain text.

### Countries

${countryPages.map((p) => `- [${p.title}](${SITE}${p.url})`).join('\n')}
${cityPages.length ? `\n### Cities\n\n${cityPages.map(link).join('\n')}\n` : ''}`,
    section('guides'), section('research'), section('apps'),
  ].filter(Boolean).join('\n');
  write('llms.txt', read('content/llms_static.md').replace('{{GENERATED}}', () => generated.trim()));

  const methodology = read('methodology.html').match(/<article[^>]*>([\s\S]*?)<\/article>/)[1];
  const table = cities.map((c) => [c.rank, c.city, COUNTRIES[c.iso2][0], Number(c.index).toFixed(1), `${c.rank_lo}–${c.rank_hi}`, c.tier].join(' | '));
  write('llms-full.txt', `# Defensive Pedal: full text for language models

Source: ${SITE}/ · Licence for the index data: CC BY 4.0 · Short version: ${SITE}/llms.txt

${text(methodology)}

## ${texts.limits.heading}

${texts.limits.paragraphs.join('\n')}

## Pedalability Index 2026: all 300 cities

${texts.scale_note}

Rank | City | Country | Score | Likely rank range | Tier
${table.join('\n')}
`);
}

// ---------- feed ----------
export function writeFeed() {
  const xml = (s) => esc(s).replace(/&quot;/g, '"');
  const generated = pages.filter((p) => !p.hand && p.summary)
    .sort((a, b) => b.modified.localeCompare(a.modified) || a.url.localeCompare(b.url)).slice(0, 50);
  const rfc = (iso) => new Date(`${iso}T12:00:00Z`).toUTCString();
  const items = generated.map((p) => `
    <item>
      <title>${xml(p.title)}</title>
      <link>${SITE}${p.url}</link>
      <guid isPermaLink="false">${SITE}${p.url}#${p.modified}</guid>
      <pubDate>${rfc(p.modified)}</pubDate>
      <description>${xml(p.summary)}</description>
    </item>
`).join('');
  let feed = block(read('feed.xml'), 'feed', `${items}\n    `, 'feed.xml');
  const latest = [...feed.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => new Date(m[1])).sort((a, b) => b - a)[0];
  feed = feed.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, `<lastBuildDate>${latest.toUTCString()}</lastBuildDate>`);
  write('feed.xml', feed);
}

if (import.meta.main) import('./build.mjs');
