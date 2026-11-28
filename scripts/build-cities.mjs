// Pedalability Index pages: the 300-row table and answer on /pedalability-index/,
// 31 country pages, and one page per city that has a human_line in content/city_notes.csv.
import fs from 'node:fs';
import {
  SITE, INDEX_CSV, INDEX_CSV_SRC, DATASET_ID, REPORT_DOI, COUNTRIES, ORG, FOUNDER,
  esc, read, write, exists, parseCsv, ordinal, wordCount, fill, breadcrumbs,
  register, pageExists, shell, emit, textsFor, localized,
} from './lib.mjs';
import { markdown, plainText } from './build-pages.mjs';

const NOTES = 'content/city_notes.csv';
const NOTES_HEADER = 'slug,human_line,arterials,calm_areas,peers\n';
const OG_IMAGE = `${SITE}/pedalability-index/social-card.png`;
// Columns Victor has not yet defined; never shown or labelled.
const UNLABELLED = /^(S_|R_|A_|access_composite$|locked_pop_share$)/;

const pct = (share) => (Number(share) * 100).toFixed(1);
const score = (c) => Number(c.index).toFixed(1);
const flag = (iso) => String.fromCodePoint(...[...iso].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const list = (cell) => cell.split(';').map((s) => s.trim()).filter(Boolean);
const countryOf = (c) => { const [name, slug, inName] = COUNTRIES[c.iso2]; return { name, slug, inName: inName || name }; };
const countryUrl = (c) => `/pedalability-index/${countryOf(c).slug}/`;
// URL slug from the city name ("the-hague"); the CSV slug ("thehague") stays the key in city_notes.csv.
const FOLD = { ł: 'l', ø: 'o', ß: 'ss', đ: 'd', æ: 'ae' };
const pathSlug = (c) => c.city.toLowerCase().replace(/[łøßđæ]/g, (ch) => FOLD[ch]).normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const cityUrl = (c) => `${countryUrl(c)}${pathSlug(c)}/`;
// Number formats per language. Translated pages exist only where a native draft extends them.
const FORMAT = {
  en: { locale: 'en-GB', ord: ordinal, pc: (x) => `${x}%` },
  fr: { locale: 'fr-FR', ord: (n) => (n === 1 ? '1er' : `${n}e`), pc: (x) => `${x}\u00a0%` },
};
const fmt = (lang) => {
  const f = FORMAT[lang];
  if (!f) throw new Error(`No number format for "${lang}" in build-cities.mjs`);
  const dec = (x) => (lang === 'en' ? x : x.replace('.', ','));
  return { ...f, num: (x, d = 1) => dec(Number(x).toFixed(d)), pct: (share) => dec(pct(share)), score: (c) => dec(score(c)) };
};
const nameOf = (c, t) => t.city_names?.[c.slug] || c.city;
const linked = (c, t = null, lang = 'en') => {
  const name = esc(t ? nameOf(c, t) : c.city);
  return pageExists(cityUrl(c)) ? `<a href="${localized(cityUrl(c), lang).url}">${name}</a>` : name;
};

function loadCities() {
  if (fs.existsSync(INDEX_CSV_SRC)) write(INDEX_CSV, fs.readFileSync(INDEX_CSV_SRC, 'utf8'));
  const rows = parseCsv(read(INDEX_CSV)).map((r) =>
    Object.fromEntries(Object.entries(r).filter(([k]) => !UNLABELLED.test(k))));
  for (const c of rows) {
    if (!COUNTRIES[c.iso2]) throw new Error(`No country name for ${c.iso2} (${c.city})`);
    for (const k of ['rank', 'rank_lo', 'rank_hi']) c[k] = Number(c[k]);
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

function vars(c, peer, lang = 'en', t = {}) {
  const country = countryOf(c), f = fmt(lang);
  return {
    city: nameOf(c, t), slug: c.slug, country: t.countries?.[c.iso2] || country.name, country_in: country.inName,
    rank_ord: f.ord(c.rank), score: f.score(c), lo_ord: f.ord(c.rank_lo), hi_ord: f.ord(c.rank_hi),
    hr: f.pct(c.high_risk_share),
    ...(peer && {
      peer: nameOf(peer, t), peer_rank_ord: f.ord(peer.rank), peer_score: f.score(peer), peer_hr: f.pct(peer.high_risk_share),
      peer_lo_ord: f.ord(peer.rank_lo), peer_hi_ord: f.ord(peer.rank_hi),
    }),
  };
}

function checkAnswer(text, where) {
  const n = wordCount(text.replace(/<[^>]+>/g, ''));
  if (n < 40 || n > 60) throw new Error(`${where}: answer paragraph is ${n} words, must be 40–60`);
  return text;
}

// ---------- City drafts: approved Markdown that extends a generated city page ----------
// The build keeps owning the answer checks, key numbers, limits, FAQ and sources; a draft adds its own sections
// after the key numbers. A draft section can stand in for the template's peer table or its "starting out" block.
// Which headings the build owns or replaces is set per language in city.patterns of content/template_text.json.
const DOI = /\b(10\.\d{4,9}\/[^\s"'<>)\],;]+[^\s"'<>)\],;.])/g;
const indent = (html) => html.split('\n').map((l) => (l ? `      ${l}` : l)).join('\n');

function extension(draft, t) {
  if (!draft) return null;
  const re = Object.fromEntries(Object.entries(t.city.patterns).map(([k, v]) => [k, new RegExp(v, 'i')]));
  const blocks = markdown(draft.body.replace(/^\s*#\s+.*\n/, ''));
  const first = blocks[0]?.startsWith('<p>') ? blocks[0] : null;
  const words = first ? wordCount(plainText(first)) : 0;
  const answer = first && words >= 40 && words <= 60 ? first : null;
  const sections = [];
  let current = null;
  for (const block of blocks.slice(answer ? 1 : 0)) {
    const h = block.match(/^<h2>(.*)<\/h2>$/);
    if (h) { current = { heading: plainText(h[1]).trim(), html: block, blocks: [] }; sections.push(current); continue; }
    if (!current || /^<p><em>Updated\b/.test(block)) continue;
    current.blocks.push(block);
  }
  const faq = [];
  for (const block of sections.find((sec) => re.faq.test(sec.heading))?.blocks || []) {
    const m = block.match(/^<p><strong>(.+?\?)<\/strong>\s*([\s\S]+)<\/p>$/);
    if (m) faq.push([plainText(m[1]).trim(), plainText(m[2]).trim()]);
  }
  const kept = sections.filter((sec) => !re.owned.test(sec.heading));
  const questions = kept.filter((sec) => /\?$/.test(sec.heading))
    .map((sec) => [sec.heading, sec.blocks.map(plainText).join(' ').replace(/\s+/g, ' ').trim()]).filter(([, a]) => a);
  const sources = [...new Set([].concat(draft.meta.sources || []).map((x) => (typeof x === 'string' ? x : x.from)).filter(Boolean))];
  return { file: draft.file, answer, sections: kept, faq, questions, sources, replaces: (key) => kept.find((sec) => re[key].test(sec.heading)) };
}

const limitsHtml = (t) => `      <h2>${esc(t.limits.heading)}</h2>\n${t.limits.paragraphs.map((p) => `      <p>${esc(p)}</p>`).join('\n')}`;

const faqHtml = (heading, qa) => `      <h2>${esc(heading)}</h2>\n${qa.map(([q, a]) => `      <h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n')}`;

const faqNode = (url, qa) => ({
  '@type': 'FAQPage',
  '@id': `${SITE}${url}#faq`,
  mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const webPageNode = (url, name, description, lang = 'en') => ({
  '@type': 'WebPage',
  '@id': `${SITE}${url}#webpage`,
  url: `${SITE}${url}`,
  name,
  description,
  inLanguage: lang,
  isPartOf: { '@id': `${SITE}/#website` },
  datePublished: '@@PUBLISHED@@',
  dateModified: '@@MODIFIED@@',
  author: FOUNDER,
  publisher: { '@id': ORG['@id'] },
});

const VARIABLES = ['Rank among 300 European cities', 'Index score (0–100, higher = lower assessed risk)', 'Likely rank range', 'Tier', 'Share of street length rated High risk'];

const subsetNode = (url, name, description, place) => ({
  '@type': 'Dataset',
  '@id': `${SITE}${url}#dataset`,
  name,
  description,
  url: `${SITE}${url}`,
  isPartOf: { '@id': DATASET_ID },
  creator: { '@id': ORG['@id'] },
  license: 'https://creativecommons.org/licenses/by/4.0/',
  spatialCoverage: place,
  temporalCoverage: '2026',
  variableMeasured: VARIABLES,
  distribution: { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/${INDEX_CSV}` },
});

export const datasetNode = () => ({
  '@type': 'Dataset',
  '@id': DATASET_ID,
  name: 'Pedalability Index 2026: Cycling Risk',
  description: 'Cycling risk of the street networks of 300 European cities: rank, index score (0–100, higher = lower assessed risk), 90% rank interval, tier and share of street length rated High risk. Built from 74 million scored road segments.',
  url: `${SITE}/pedalability-index/`,
  creator: { '@id': ORG['@id'] },
  license: 'https://creativecommons.org/licenses/by/4.0/',
  identifier: REPORT_DOI,
  spatialCoverage: { '@type': 'Place', name: 'Europe' },
  temporalCoverage: '2026',
  variableMeasured: VARIABLES,
  distribution: { '@type': 'DataDownload', encodingFormat: 'text/csv', contentUrl: `${SITE}/${INDEX_CSV}` },
});

function cityRowsTable(cities, t, lang = 'en') {
  const f = fmt(lang);
  const rows = cities.map((c) => `          <tr><td>${c.rank}</td><td>${linked(c, t, lang)}</td><td>${f.score(c)}</td><td>${c.rank_lo}–${c.rank_hi}</td><td>${esc(f.pc(f.pct(c.high_risk_share)))}</td><td>${esc(t.tiers[c.tier])}</td></tr>`);
  return `      <table>
        <thead><tr>${t.city.table_heads.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>`;
}

/** Registers every page this module will write, and returns the function that writes them. */
export function plan(texts, cityDrafts = []) {
  const cities = loadCities();
  const bySlug = new Map(cities.map((c) => [c.slug, c]));
  if (!exists(NOTES)) write(NOTES, NOTES_HEADER);
  const notes = new Map(parseCsv(read(NOTES)).map((n) => [n.slug, n]));
  for (const slug of notes.keys()) if (!bySlug.has(slug)) throw new Error(`city_notes.csv: unknown slug "${slug}"`);

  const built = cities.filter((c) => notes.get(c.slug)?.human_line);
  const skipped = cities.filter((c) => !notes.get(c.slug)?.human_line);
  const isoList = [...new Set(cities.map((c) => c.iso2))].sort((a, b) => COUNTRIES[a][0].localeCompare(COUNTRIES[b][0]));

  const countryPages = isoList.map((iso) => {
    const members = cities.filter((c) => c.iso2 === iso);
    const { slug, inName } = countryOf(members[0]);
    return register({
      url: `/pedalability-index/${slug}/`, file: `pedalability-index/${slug}/index.html`, lang: 'en',
      key: `index/${slug}`, group: 'cities', title: fill(texts.country.h1, { country_in: inName }), members,
    });
  });
  const draftsByUrl = new Map();
  const unusedDrafts = [];
  const translated = [];
  for (const d of cityDrafts) {
    const enUrl = d.language === 'en' ? d.url : d.url.slice(d.language.length + 1);
    const city = cities.find((c) => cityUrl(c) === enUrl);
    const unused = (why) => unusedDrafts.push({ file: d.file, why });
    if (!city) unused(`no city in the index has the URL ${enUrl}`);
    else if (!notes.get(city.slug)?.human_line) unused(`${city.slug} has no human_line in ${NOTES}`);
    else if (d.language === 'en') draftsByUrl.set(d.url, d);
    else if (translated.some((x) => x.d.url === d.url)) unused(`another draft already builds ${d.url}`);
    // A translated city page is the native draft plus its approved human line and the template numbers.
    else if (!String(d.meta.human_line || '').trim()) unused('no approved human_line in its front matter');
    else if (!FORMAT[d.language]) unused(`no number format for "${d.language}" in build-cities.mjs`);
    else if (!extension(d, textsFor(texts, d.language)).answer) unused('first paragraph after the H1 must be the 40–60-word answer');
    else translated.push({ city, d });
  }
  const cityPages = built.map((c) => register({
    url: cityUrl(c), file: `${cityUrl(c).slice(1)}index.html`, lang: 'en',
    key: cityUrl(c), group: 'cities', title: fill(texts.city.h1, { city: c.city }), city: c,
  }));
  const translatedPages = translated.map(({ city, d }) => register({
    url: d.url, file: `${d.url.slice(1)}index.html`, lang: d.language,
    key: cityUrl(city), group: 'cities', title: d.meta.question, city, draft: d,
  }));

  const allAvg = mean(cities.map((c) => Number(c.index))).toFixed(1);
  const allHr = (mean(cities.map((c) => Number(c.high_risk_share))) * 100).toFixed(1);

  function peersOf(c) {
    const named = list(notes.get(c.slug)?.peers || '').map((slug) => {
      if (!bySlug.has(slug)) throw new Error(`city_notes.csv: ${c.slug} lists unknown peer "${slug}"`);
      return bySlug.get(slug);
    });
    if (named.length) return named;
    const byDistance = (pool) => pool.filter((p) => p !== c).sort((a, b) => Math.abs(a.rank - c.rank) - Math.abs(b.rank - c.rank) || a.rank - b.rank);
    const sameCountry = byDistance(cities.filter((p) => p.iso2 === c.iso2));
    return [...sameCountry, ...byDistance(cities.filter((p) => p.iso2 !== c.iso2))].slice(0, 3);
  }

  function renderCity(page, guide, research) {
    const lang = page.lang, en = lang === 'en', local = textsFor(texts, lang), f = fmt(lang);
    const c = page.city, t = local.city, note = notes.get(c.slug);
    const peers = peersOf(c), peer = peers[0], v = vars(c, peer, lang, local);
    const ext = extension(en ? draftsByUrl.get(page.url) : page.draft, local);
    const base = fill(t.answer, v);
    const withRoute = `${base} ${t.answer_route}`;
    const answer = en ? checkAnswer(wordCount(withRoute) <= 60 ? withRoute : base, page.url) : null;
    const h1 = en ? fill(t.h1, v) : page.draft.meta.question, description = fill(t.description, v);
    const humanLine = en ? note.human_line : page.draft.meta.human_line;
    const cityName = v.city, countryName = v.country;
    if (ext) page.extendedBy = ext.file;
    const answerHtml = ext?.answer || `<p>${esc(answer)}</p>`;
    const answerPlain = ext?.answer ? plainText(ext.answer).replace(/\s+/g, ' ').trim() : answer;
    const overlap = c.rank_lo <= peer.rank_hi && peer.rank_lo <= c.rank_hi;
    const peerAnswer = overlap ? t.faq_peer_tie : c.rank < peer.rank ? t.faq_peer_lower : t.faq_peer_higher;
    const faq = [
      [fill(t.faq_peer_q, v), fill(peerAnswer, v)],
      [fill(t.faq_score_q, v), fill(t.faq_score_a, v)],
      [fill(t.faq_crash_q, v), fill(t.faq_crash_a, v)],
    ];
    const rows = [
      [t.rows.rank, f.ord(c.rank)], [t.rows.range, `${f.ord(c.rank_lo)}–${f.ord(c.rank_hi)}`],
      [t.rows.score, f.score(c)], [t.rows.score_range, `${f.num(c.index_lo)}–${f.num(c.index_hi)}`],
      [t.rows.tier, local.tiers[c.tier]], [t.rows.hr, f.pc(f.pct(c.high_risk_share))],
      [t.rows.street_km, `${Math.round(Number(c.street_km)).toLocaleString(f.locale)}${en ? ' ' : '\u00a0'}km`],
      [t.rows.population, Number(c.population).toLocaleString(f.locale)],
    ];
    // The calm-areas and arterials cells in city_notes.csv are English, so only English pages show them.
    const optional = (heading, cell) => (cell && en ? `      <h2>${esc(fill(heading, v))}</h2>\n      <p>${esc(cell)}</p>\n` : '');
    const draftFaq = (ext?.faq || []).filter(([q]) => !faq.some(([q2]) => q2 === q));
    const visibleFaq = [...faq, ...draftFaq];
    const schemaFaq = [...visibleFaq, ...(ext?.questions || []).filter(([q]) => !visibleFaq.some(([q2]) => q2 === q))];
    const own = (p) => p && localized(p.key, lang);
    const colon = en ? ':' : '\u00a0:';
    const startLinks = [guide && `<a href="${own(guide).url}">${esc(t.start_guide)}${colon} ${esc(own(guide).title)}</a>`,
      research && `<a href="${own(research).url}">${esc(t.start_research)}${colon} ${esc(own(research).title)}</a>`].filter(Boolean);
    const startSection = ext?.replaces('start');
    const extSections = (ext?.sections || []).map((sec) => [sec.html, ...sec.blocks,
      ...(sec === startSection && startLinks.length ? [`<p>${startLinks.join(' · ')}</p>`] : [])].join('\n'));
    const extHtml = extSections.length ? `${indent(extSections.join('\n\n'))}\n\n` : '';
    const peersHtml = ext?.replaces('peers') ? '' : `      <h2>${esc(fill(t.peers_heading, v))}</h2>
      <p>${esc(t.peers_intro)}</p>
${cityRowsTable([c, ...peers].sort((a, b) => a.rank - b.rank), local, lang)}

`;
    const startHtml = startSection ? '' : `      <h2>${esc(fill(t.start_heading, v))}</h2>
      <p>${esc(t.start)}${startLinks.length ? ` ${startLinks.join(' · ')}` : ''}</p>

`;
    const sourcesHtml = ext?.sources.length ? `      <h2>${esc(local.page.sources_heading)}</h2>
      <ul>
${ext.sources.map((x) => `        <li>${esc(x).replace(DOI, '<a href="https://doi.org/$1" target="_blank" rel="noopener">$1</a>')}</li>`).join('\n')}
      </ul>

` : '';
    const body = `      <nav class="answer-crumbs" aria-label="Breadcrumb"><a href="/pedalability-index/">Pedalability Index</a> › <a href="${countryUrl(c)}">${esc(countryName)}</a> › ${esc(cityName)}</nav>
      <h1>${esc(h1)}</h1>
${indent(answerHtml)}
      <p>${esc(humanLine)}</p>
      <p class="meta">${fill(t.updated, { date: '<time datetime="@@MODIFIED@@">@@MODIFIED_HUMAN@@</time>' })}</p>

      <h2>${esc(fill(t.numbers_heading, v))}</h2>
      <table>
        <tbody>
${rows.map(([k, val]) => `          <tr><th scope="row">${esc(k)}</th><td>${esc(val)}</td></tr>`).join('\n')}
        </tbody>
      </table>
      <p>${esc(local.scale_note)}</p>

${extHtml}${optional(t.calm_heading, note.calm_areas)}${optional(t.arterials_heading, note.arterials)}${peersHtml}${startHtml}${limitsHtml(local)}

${faqHtml(fill(t.faq_heading, v), visibleFaq)}

${sourcesHtml}      <p class="meta">${t.source}</p>
      <p class="meta">${fill(t.app, v)}</p>`;
    const graph = [
      ORG,
      webPageNode(page.url, h1, description, lang),
      subsetNode(page.url, `Pedalability Index 2026: ${cityName}`, description,
        { '@type': 'Place', name: cityName, address: { '@type': 'PostalAddress', addressLocality: cityName, addressCountry: c.iso2 } }),
      faqNode(page.url, [[h1, answerPlain], ...schemaFaq]),
      breadcrumbs(page.url, [[local.shell.home, localized('home', lang).url], ['Pedalability Index', '/pedalability-index/'], [countryName, countryUrl(c)], [cityName, page.url]]),
    ];
    page.summary = answerPlain;
    emit(page, shell({ page, title: `${h1} Pedalability Index 2026`, description, body, graph, ogImage: OG_IMAGE, texts: local }));
  }

  function renderCountry(page) {
    const t = texts.country, members = page.members;
    const best = members[0], worst = members.at(-1);
    const { name, inName } = countryOf(best);
    const v = {
      country: name, country_in: inName, n: members.length, avg: mean(members.map((c) => Number(c.index))).toFixed(1),
      all_avg: allAvg, all_hr: allHr, best: best.city, best_rank_ord: ordinal(best.rank), best_score: score(best),
      worst: worst.city, worst_rank_ord: ordinal(worst.rank), worst_score: score(worst),
      lo_ord: ordinal(best.rank_lo), hi_ord: ordinal(best.rank_hi), hr: pct(best.high_risk_share),
    };
    const answer = checkAnswer(fill(members.length > 1 ? t.answer_many : t.answer_one, v), page.url);
    const h1 = fill(t.h1, v), description = fill(t.description, v).replace(/^1 cities in (.+?) are/, '1 city in $1 is');
    const faq = [
      [fill(t.faq_best_q, v), fill(t.faq_best_a, v)],
      [texts.index.faq.at(-1).q, texts.index.faq.at(-1).a],
    ];
    const body = `      <nav class="answer-crumbs" aria-label="Breadcrumb"><a href="/pedalability-index/">Pedalability Index</a> › ${esc(name)}</nav>
      <h1>${esc(h1)}</h1>
      <p>${esc(answer)}</p>
      <p class="meta">${fill(texts.city.updated, { date: '<time datetime="@@MODIFIED@@">@@MODIFIED_HUMAN@@</time>' })}</p>

      <h2>${esc(fill(t.table_heading, v))}</h2>
${cityRowsTable(members, texts)}
      <p>${esc(texts.scale_note)}</p>

${limitsHtml(texts)}

${faqHtml(fill(t.faq_heading, v), faq)}

      <p class="meta">${texts.city.source}</p>`;
    const graph = [
      ORG,
      webPageNode(page.url, h1, description),
      subsetNode(page.url, `Pedalability Index 2026: ${name}`, description, { '@type': 'Country', name }),
      faqNode(page.url, [[h1, answer], ...faq]),
      breadcrumbs(page.url, [['Home', '/'], ['Pedalability Index', '/pedalability-index/'], [name, page.url]]),
    ];
    page.summary = answer;
    emit(page, shell({ page, title: `${h1} Pedalability Index 2026`, description, body, graph, ogImage: OG_IMAGE, texts }));
  }

  /** Rewrites the generated blocks of the hand-built index page; returns its extra JSON-LD nodes. */
  function renderIndexPage() {
    const file = 'pedalability-index/index.html';
    const top5 = cities.slice(0, 5).map((c) => c.city);
    const first = cities[0];
    const v = {
      top5: `${top5.slice(0, 4).join(', ')} and ${top5[4]}`, copenhagen_ord: ordinal(bySlug.get('copenhagen').rank),
      first: first.city, first_score: score(first), first_lo_ord: ordinal(first.rank_lo), first_hi_ord: ordinal(first.rank_hi),
    };
    const answer = fill(texts.index.answer, v); // Victor's wording from question-bank.md, used as written
    const faq = texts.index.faq.map(({ q, a }) => [q, fill(a, v)]);
    const tierLabel = { 1: 'Tier 1 — lower assessed risk', 2: 'Tier 2 — middle', 3: 'Tier 3 — higher assessed risk' };
    const rows = [];
    let tier = 0;
    for (const c of cities) {
      if (c.tier !== tier) { tier = c.tier; rows.push(`<tr class="grp gt${tier}"><td colspan="7">${tierLabel[tier]}</td></tr>`); }
      const star = Number(c.tier_stability) < 2 / 3 ? '*' : '';
      rows.push(`<tr><td class="r">${c.rank}</td><td>${flag(c.iso2)}&nbsp;${linked(c)}${star}</td><td><a href="${countryUrl(c)}">${esc(countryOf(c).name)}</a></td><td class="r">${score(c)}</td><td class="r ci">${Number(c.index_lo).toFixed(1)}–${Number(c.index_hi).toFixed(1)}</td><td class="r ci">${c.rank_lo}–${c.rank_hi}</td><td class="r">${c.tier}</td></tr>`);
    }
    const blocks = {
      answer: `<p class="dek">${answer} <b>${esc(texts.direction)}</b></p>`,
      faq: `<h2>${esc(texts.index.faq_heading)}</h2>\n${faq.map(([q, a]) => `<h3>${esc(q)}</h3>\n<p>${esc(a)}</p>`).join('\n')}`,
      table: `<div class="tblwrap"><table>
<thead><tr><th>#</th><th>City</th><th>Country</th><th>Score</th><th>Score range</th><th>Likely rank range</th><th>Tier</th></tr></thead>
<tbody>${rows.join('\n')}</tbody>
</table></div>`,
    };
    let html = read(file);
    for (const [name, content] of Object.entries(blocks)) {
      const re = new RegExp(`(<!-- build:${name} -->)[\\s\\S]*?(<!-- /build:${name} -->)`);
      if (!re.test(html)) throw new Error(`${file}: missing <!-- build:${name} --> markers`);
      html = html.replace(re, (m, open, close) => `${open}\n${content}\n${close}`);
    }
    write(file, html);
    return [datasetNode(), faqNode('/pedalability-index/', faq),
      breadcrumbs('/pedalability-index/', [['Home', '/'], ['Pedalability Index', '/pedalability-index/']])];
  }

  function render({ guide, research } = {}) {
    for (const page of [...cityPages, ...translatedPages]) renderCity(page, guide, research);
    for (const page of countryPages) renderCountry(page);
    return { indexNodes: renderIndexPage() };
  }

  return { cities, built, skipped, cityPages, translatedPages, countryPages, unusedDrafts, render, texts };
}

if (import.meta.main) import('./build.mjs');
