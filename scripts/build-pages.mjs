// Guides, research and apps pages, rendered from the content bot's approved Markdown drafts.
// A draft is built only if LOG.md marks it approved and it carries no open review marker.
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, SITE, DATASET_ID, ORG, FOUNDER, LANG_NAMES, esc, wordCount, fill, breadcrumbs,
  register, pages, shell, emit, textsFor, localized,
} from './lib.mjs';

const DRAFTS = process.env.DRAFTS_DIR || 'C:/dev/social_media_automation/seo-geo/drafts';
const SECTIONS = ['guides', 'research', 'apps'];
const MARKERS = ['HUMAN LINE NEEDED', 'NATIVE REVIEW NEEDED'];
const DOI = /\b(10\.\d{4,9}\/[^\s"'<>)\],;]+[^\s"'<>)\],;.])/g;

const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');
const inlineList = (s) => { const inner = s.trim().replace(/^\[|\]$/g, '').trim(); return inner ? inner.split(',').map(unquote) : []; };

/** Parses the front matter format in orca-bot/SOUL.md: scalars, [inline lists], and lists of maps. */
export function parseDraft(text) {
  const m = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  let key = null;
  for (const line of m[1].split(/\r?\n/)) {
    const top = line.match(/^([A-Za-z_]+):\s*(.*)$/);
    const item = line.match(/^\s+-\s+(.*)$/);
    const cont = line.match(/^\s+([A-Za-z_]+):\s*(.*)$/);
    if (top) {
      key = top[1];
      meta[key] = top[2] === '' ? [] : top[2].trim().startsWith('[') ? inlineList(top[2]) : unquote(top[2]);
    } else if (item && Array.isArray(meta[key])) {
      const pair = item[1].match(/^([A-Za-z_]+):\s*(.*)$/);
      meta[key].push(pair ? { [pair[1]]: unquote(pair[2]) } : unquote(item[1]));
    } else if (cont && Array.isArray(meta[key]) && typeof meta[key].at(-1) === 'object') {
      meta[key].at(-1)[cont[1]] = unquote(cont[2]);
    }
  }
  return { meta, body: m[2] };
}

function inline(text) {
  return esc(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label, href) =>
      `<a href="${href}"${/^https?:/.test(href) ? ' target="_blank" rel="noopener"' : ''}>${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

/** Minimal Markdown: headings, paragraphs, lists, block quotes and pipe tables. */
export function markdown(src) {
  const out = [];
  const lines = src.replace(/\r/g, '').split('\n');
  for (let i = 0; i < lines.length;) {
    const line = lines[i];
    const take = (test) => { const got = []; while (i < lines.length && test(lines[i])) got.push(lines[i++]); return got; };
    if (!line.trim() || /^<!--.*-->$/.test(line.trim())) { i++; continue; }
    const h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) { out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); i++; continue; }
    if (/^\s*[-*]\s+/.test(line)) {
      out.push(`<ul>\n${take((l) => /^\s*[-*]\s+/.test(l)).map((l) => `  <li>${inline(l.replace(/^\s*[-*]\s+/, ''))}</li>`).join('\n')}\n</ul>`);
    } else if (/^\s*\d+\.\s+/.test(line)) {
      out.push(`<ol>\n${take((l) => /^\s*\d+\.\s+/.test(l)).map((l) => `  <li>${inline(l.replace(/^\s*\d+\.\s+/, ''))}</li>`).join('\n')}\n</ol>`);
    } else if (/^>/.test(line)) {
      out.push(`<blockquote><p>${inline(take((l) => /^>/.test(l)).map((l) => l.replace(/^>\s?/, '')).join(' '))}</p></blockquote>`);
    } else if (/^\|/.test(line) && /^\|[\s:|-]+\|?$/.test(lines[i + 1] || '')) {
      const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
      const [head, , ...rows] = take((l) => /^\|/.test(l));
      out.push(`<table>\n  <thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr></thead>\n  <tbody>\n${rows.map((r) => `    <tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('\n')}\n  </tbody>\n</table>`);
    } else {
      const first = lines[i++]; // always consume the current line, so no input can stall the loop
      out.push(`<p>${inline([first, ...take((l) => l.trim() && !/^(#{2,4}\s|\s*[-*]\s|\s*\d+\.\s|>|\|)/.test(l))].join(' '))}</p>`);
    }
  }
  return out;
}


export const plainText = (html) => html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');

/** A LOG.md line approves a draft when it contains the exact question and its last field is "approved". */
function approvedIn(log, meta) {
  return log.split(/\r?\n/).some((line) => {
    const fields = line.split(/[|,;\t]|\s[-–—]\s/).map((f) => f.trim().replace(/^[*_`([]+|[*_`)\].]+$/g, '')).filter(Boolean);
    return line.includes(meta.question) && /^approved$/i.test(fields.at(-1) || '');
  });
}

function loadDrafts(texts) {
  const logFile = path.join(DRAFTS, 'LOG.md');
  if (!fs.existsSync(logFile)) {
    // A missing drafts folder must never read as "unpublish every answer page".
    const live = SECTIONS.filter((s) => fs.existsSync(path.resolve(ROOT, s)));
    if (live.length) throw new Error(`${logFile} not found, but /${live.join('/, /')}/ are published. Set DRAFTS_DIR to the drafts folder.`);
    return { drafts: [], cityDrafts: [], rejected: [], note: `No ${logFile}; nothing approved.` };
  }
  const log = fs.readFileSync(logFile, 'utf8');
  const drafts = [], cityDrafts = [], rejected = [];
  for (const lang of fs.readdirSync(DRAFTS, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
    for (const name of fs.readdirSync(path.join(DRAFTS, lang)).filter((f) => f.endsWith('.md')).sort()) {
      const file = `${lang}/${name}`;
      const text = fs.readFileSync(path.join(DRAFTS, lang, name), 'utf8');
      const draft = parseDraft(text);
      const reject = (why) => rejected.push({ file, why });
      const filled = (v) => typeof v === 'string' && v.trim() !== '';
      if (!draft || !filled(draft.meta.question) || !filled(draft.meta.slug)) { reject('no front matter with question and slug'); continue; }
      const { meta } = draft;
      if (!approvedIn(log, meta)) { reject('not marked approved in LOG.md'); continue; }
      const marker = MARKERS.find((mk) => text.includes(mk));
      if (marker) { reject(`still carries "${marker}"`); continue; }
      if ([].concat(meta.needs_confirmation || []).length) { reject('needs_confirmation is not empty'); continue; }
      const language = meta.language || lang;
      if (!LANG_NAMES[language]) { reject(`unknown language "${language}"`); continue; }
      if (!textsFor(texts, language)) { reject(`no template wording for "${language}" under i18n in content/template_text.json`); continue; }
      const rel = meta.slug.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+|\/+$/g, '').replace(new RegExp(`^${language}/`), '');
      const [section] = rel.split('/');
      // City drafts extend a generated city page; build-cities.mjs decides whether that page exists.
      if (section === 'pedalability-index' && /^pedalability-index\/[a-z0-9-]+\/[a-z0-9-]+$/.test(rel)) {
        cityDrafts.push({ file, meta, body: draft.body, language, url: `${language === 'en' ? '' : `/${language}`}/${rel}/` });
        continue;
      }
      if (!SECTIONS.includes(section) || !/^[a-z0-9-]+(\/[a-z0-9-]+)+$/.test(rel)) { reject(`slug "${meta.slug}" must be lowercase letters, digits and hyphens under /guides/, /research/ or /apps/`); continue; }
      drafts.push({ file, meta, body: draft.body, language, section, rel });
    }
  }
  return { drafts, cityDrafts, rejected };
}

export function plan(texts) {
  const { drafts, cityDrafts, rejected, note } = loadDrafts(texts);
  const prefix = (lang) => (lang === 'en' ? '' : `/${lang}`);
  const built = [];

  for (const d of drafts) {
    const blocks = markdown(d.body.replace(/^\s*#\s+.*\n/, ''));
    const first = blocks.find((b) => b.startsWith('<p>'));
    const words = first ? wordCount(plainText(first)) : 0;
    if (blocks[0] !== first || words < 40 || words > 60) {
      rejected.push({ file: d.file, why: `first paragraph after the H1 must be the 40–60-word answer (found ${words} words)` });
      continue;
    }
    const url = `${prefix(d.language)}/${d.rel}/`;
    if (built.some((p) => p.url === url)) { rejected.push({ file: d.file, why: `another draft already builds ${url}` }); continue; }
    // A translation pairs with its English page through the draft's hreflang line, since the slugs differ.
    const enSlug = String(d.meta.hreflang || '').replace(/https?:\/\/[^/\s,}]+/g, '').replace(/["']/g, '')
      .match(/\ben:\s*\/?([^,}\s]+?)\/?(?=[,}\s]|$)/)?.[1];
    if (d.language !== 'en' && !enSlug) console.log(`Draft has no English pair in its hreflang line: ${d.file}`);
    built.push(register({
      url, file: `${url.slice(1)}index.html`, lang: d.language, key: enSlug || d.rel, group: 'answers',
      section: d.section, title: d.meta.question, summary: plainText(first), draft: d, blocks,
    }));
  }

  const hubs = [];
  for (const lang of [...new Set(built.map((p) => p.lang))].sort()) {
    for (const section of SECTIONS.filter((s) => built.some((p) => p.lang === lang && p.section === s))) {
      const url = `${prefix(lang)}/${section}/`;
      hubs.push(register({ url, file: `${url.slice(1)}index.html`, lang, key: section, group: 'answers', section, hub: true, title: textsFor(texts, lang).sections[section].h1 }));
    }
  }

  function renderPage(page) {
    const { meta, section } = page.draft, local = textsFor(texts, page.lang), t = local.page;
    const hubUrl = `${prefix(page.lang)}/${section}/`;
    const sectionName = local.sections[section].nav;
    // The build owns the date line, the related block and the sources list.
    const kept = [];
    const owned = [t.related_heading, t.sources_heading, 'Related questions', 'Sources'].map((h) => h.toLowerCase());
    const dateLine = /^<p><em>(Updated|Mis à jour|Actualizat)\b/;
    let skipping = false;
    for (const block of page.blocks.slice(1)) {
      const heading = block.match(/^<h2>(.*)<\/h2>$/);
      if (heading) skipping = owned.includes(plainText(heading[1]).trim().toLowerCase());
      if (skipping || dateLine.test(block)) continue;
      kept.push(block);
    }
    const related = [].concat(meta.internal_links || [])
      .map((href) => `/${href.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '')}`)
      .map((href) => pages.find((p) => p.url === href || p.url === `${href}/`))
      .filter((p, i, all) => p && p !== page && all.indexOf(p) === i);
    const sources = [...new Set([].concat(meta.sources || []).map((s) => (typeof s === 'string' ? s : s.from)).filter(Boolean))]
      .map((s) => s.replace(/[A-Za-z]:[\\/][^\s,;]*[\\/]/g, ''));
    const faq = [[meta.question, page.summary]];
    kept.forEach((block, i) => {
      const q = block.match(/^<h2>(.*\?)<\/h2>$/);
      if (!q) return;
      const end = kept.findIndex((b, j) => j > i && /^<h2>/.test(b));
      const text = kept.slice(i + 1, end === -1 ? undefined : end).map(plainText).join(' ').replace(/\s+/g, ' ').trim();
      if (text) faq.push([plainText(q[1]), text]);
    });
    const indent = (html) => html.split('\n').map((l) => `      ${l}`).join('\n');
    const body = `      <nav class="answer-crumbs" aria-label="Breadcrumb"><a href="${hubUrl}">${esc(sectionName)}</a> › ${esc(meta.question)}</nav>
      <h1>${esc(meta.question)}</h1>
${indent(page.blocks[0])}
      <p class="meta">${fill(t.updated, { date: '<time datetime="@@MODIFIED@@">@@MODIFIED_HUMAN@@</time>' })}</p>

${indent(kept.join('\n'))}
${related.length ? `\n      <h2>${esc(t.related_heading)}</h2>\n      <ul>\n${related.map((p) => `        <li><a href="${p.url}">${esc(p.title)}</a></li>`).join('\n')}\n      </ul>` : ''}
${sources.length ? `\n      <h2>${esc(t.sources_heading)}</h2>\n      <ul>\n${sources.map((s) => `        <li>${esc(s).replace(DOI, '<a href="https://doi.org/$1" target="_blank" rel="noopener">$1</a>')}</li>`).join('\n')}\n      </ul>` : ''}`;
    const schema = [].concat(meta.schema || []);
    const graph = [
      ORG,
      {
        '@type': 'Article',
        '@id': `${SITE}${page.url}#article`,
        headline: meta.question,
        description: page.summary,
        inLanguage: page.lang,
        mainEntityOfPage: `${SITE}${page.url}`,
        author: FOUNDER,
        publisher: { '@id': ORG['@id'] },
        datePublished: '@@PUBLISHED@@',
        dateModified: '@@MODIFIED@@',
        ...(schema.includes('Dataset') && { isBasedOn: { '@id': DATASET_ID } }),
      },
      {
        '@type': 'FAQPage',
        '@id': `${SITE}${page.url}#faq`,
        mainEntity: faq.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
      },
      breadcrumbs(page.url, [[local.shell.home, localized('home', page.lang).url], [sectionName, hubUrl], [meta.question, page.url]]),
    ];
    emit(page, shell({ page, title: meta.question, description: page.summary, body, graph, texts: local }));
  }

  function renderHub(hub) {
    const local = textsFor(texts, hub.lang), s = local.sections[hub.section];
    const members = built.filter((p) => p.lang === hub.lang && p.section === hub.section).sort((a, b) => a.url.localeCompare(b.url));
    const body = `      <h1>${esc(s.h1)}</h1>
      <p>${esc(s.intro)}</p>
${members.map((p) => `      <h2><a href="${p.url}">${esc(p.title)}</a></h2>\n      <p>${esc(p.summary)}</p>`).join('\n')}`;
    const graph = [
      ORG,
      {
        '@type': 'CollectionPage', '@id': `${SITE}${hub.url}#webpage`, url: `${SITE}${hub.url}`, name: s.h1, inLanguage: hub.lang,
        isPartOf: { '@id': `${SITE}/#website` }, dateModified: '@@MODIFIED@@',
        hasPart: members.map((p) => ({ '@id': `${SITE}${p.url}#article` })),
      },
      breadcrumbs(hub.url, [[local.shell.home, localized('home', hub.lang).url], [s.nav, hub.url]]),
    ];
    hub.summary = s.intro;
    emit(hub, shell({ page: hub, title: `${s.h1} — Defensive Pedal`, description: `${s.intro} ${members.map((p) => p.title).join(' ')}`.slice(0, 300), body, graph, texts: local }));
  }

  function render() {
    built.forEach(renderPage);
    hubs.forEach(renderHub);
  }

  // City pages link to the beginner guide and to one research page, when those exist.
  const en = built.filter((p) => p.lang === 'en');
  const guide = en.find((p) => p.url === '/guides/start-cycling-to-work/') || en.find((p) => p.section === 'guides');
  const research = en.filter((p) => p.section === 'research').sort((a, b) => a.url.localeCompare(b.url))[0];

  return { built, hubs, cityDrafts, rejected, note, render, guide, research };
}

if (import.meta.main) import('./build.mjs');
