// Pedalability Index pages: the 300-row table and answer on /pedalability-index/,
// 31 country pages, and one page per city that has a human_line in content/city_notes.csv.
import fs from 'node:fs';
import {
  SITE, INDEX_CSV, INDEX_CSV_SRC, DATASET_ID, REPORT_DOI, COUNTRIES, ORG, FOUNDER,
  esc, read, write, exists, parseCsv, ordinal, wordCount, fill, breadcrumbs,
  register, pageExists, shell, emit,
} from './lib.mjs';

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
const linked = (c) => (pageExists(cityUrl(c)) ? `<a href="${cityUrl(c)}">${esc(c.city)}</a>` : esc(c.city));

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

function vars(c, peer) {
  const country = countryOf(c);
  return {
    city: c.city, slug: c.slug, country: country.name, country_in: country.inName,
    rank_ord: ordinal(c.rank), score: score(c), lo_ord: ordinal(c.rank_lo), hi_ord: ordinal(c.rank_hi),
    hr: pct(c.high_risk_share),
    ...(peer && {
      peer: peer.city, peer_rank_ord: ordinal(peer.rank), peer_score: score(peer), peer_hr: pct(peer.high_risk_share),
      peer_lo_ord: ordinal(peer.rank_lo), peer_hi_ord: ordinal(peer.rank_hi),
    }),
  };
}

function checkAnswer(text, where) {
  const n = wordCount(text.replace(/<[^>]+>/g, ''));
  if (n < 40 || n > 60) throw new Error(`${where}: answer paragraph is ${n} words, must be 40–60`);
  return text;
}

const limitsHtml = (t) => `      <h2>${esc(t.limits.heading)}</h2>\n${t.limits.paragraphs.map((p) => `      <p>${esc(p)}</p>`).join('\n')}`;

const faqHtml = (heading, qa) => `      <h2>${esc(heading)}</h2>\n${qa.map(([q, a]) => `      <h3>${esc(q)}</h3>\n      <p>${esc(a)}</p>`).join('\n')}`;

const faqNode = (url, qa) => ({
  '@type': 'FAQPage',
  '@id': `${SITE}${url}#faq`,
  mainEntity: qa.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
});

const webPageNode = (url, name, description) => ({
  '@type': 'WebPage',
  '@id': `${SITE}${url}#webpage`,
  url: `${SITE}${url}`,
  name,
  description,
  inLanguage: 'en',
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

function cityRowsTable(cities, t) {
  const rows = cities.map((c) => `          <tr><td>${c.rank}</td><td>${linked(c)}</td><td>${score(c)}</td><td>${c.rank_lo}–${c.rank_hi}</td><td>${pct(c.high_risk_share)}%</td><td>${esc(t.tiers[c.tier])}</td></tr>`);
  return `      <table>
        <thead><tr><th>Rank of 300</th><th>City</th><th>Score</th><th>Likely rank range</th><th>Street length rated High risk</th><th>Tier</th></tr></thead>
        <tbody>
${rows.join('\n')}
        </tbody>
      </table>`;
}

/** Registers every page this module will write, and returns the function that writes them. */
export function plan(texts) {
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
  const cityPages = built.map((c) => register({
    url: cityUrl(c), file: `${cityUrl(c).slice(1)}index.html`, lang: 'en',
    key: cityUrl(c), group: 'cities', title: fill(texts.city.h1, { city: c.city }), city: c,
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
    const c = page.city, t = texts.city, note = notes.get(c.slug);
    const peers = peersOf(c), peer = peers[0], v = vars(c, peer);
    const base = fill(t.answer, v);
    const withRoute = `${base} ${t.answer_route}`;
    const answer = checkAnswer(wordCount(withRoute) <= 60 ? withRoute : base, page.url);
    const h1 = fill(t.h1, v), description = fill(t.description, v);
    const overlap = c.rank_lo <= peer.rank_hi && peer.rank_lo <= c.rank_hi;
    const peerAnswer = overlap ? t.faq_peer_tie : c.rank < peer.rank ? t.faq_peer_lower : t.faq_peer_higher;
    const faq = [
      [fill(t.faq_peer_q, v), fill(peerAnswer, v)],
      [fill(t.faq_score_q, v), fill(t.faq_score_a, v)],
      [fill(t.faq_crash_q, v), fill(t.faq_crash_a, v)],
    ];
    const country = countryOf(c);
    const rows = [
      [t.rows.rank, `${ordinal(c.rank)}`], [t.rows.range, `${ordinal(c.rank_lo)}–${ordinal(c.rank_hi)}`],
      [t.rows.score, score(c)], [t.rows.score_range, `${Number(c.index_lo).toFixed(1)}–${Number(c.index_hi).toFixed(1)}`],
      [t.rows.tier, texts.tiers[c.tier]], [t.rows.hr, `${pct(c.high_risk_share)}%`],
      [t.rows.street_km, `${Math.round(Number(c.street_km)).toLocaleString('en-GB')} km`],
      [t.rows.population, Number(c.population).toLocaleString('en-GB')],
    ];
    const optional = (heading, cell) => (cell ? `      <h2>${esc(fill(heading, v))}</h2>\n      <p>${esc(cell)}</p>\n` : '');
    const startLinks = [guide && `<a href="${guide.url}">${esc(t.start_guide)}: ${esc(guide.title)}</a>`,
      research && `<a href="${research.url}">${esc(t.start_research)}: ${esc(research.title)}</a>`].filter(Boolean);
    const body = `      <nav class="answer-crumbs" aria-label="Breadcrumb"><a href="/pedalability-index/">Pedalability Index</a> › <a href="${countryUrl(c)}">${esc(country.name)}</a> › ${esc(c.city)}</nav>
      <h1>${esc(h1)}</h1>
      <p>${esc(answer)}</p>
      <p>${esc(note.human_line)}</p>
      <p class="meta">${fill(t.updated, { date: '<time datetime="@@MODIFIED@@">@@MODIFIED_HUMAN@@</time>' })}</p>

      <h2>${esc(fill(t.numbers_heading, v))}</h2>
      <table>
        <tbody>
${rows.map(([k, val]) => `          <tr><th scope="row">${esc(k)}</th><td>${esc(val)}</td></tr>`).join('\n')}
        </tbody>
      </table>
      <p>${esc(texts.scale_note)}</p>

${optional(t.calm_heading, note.calm_areas)}${optional(t.arterials_heading, note.arterials)}      <h2>${esc(fill(t.peers_heading, v))}</h2>
      <p>${esc(t.peers_intro)}</p>
${cityRowsTable([c, ...peers].sort((a, b) => a.rank - b.rank), texts)}

      <h2>${esc(fill(t.start_heading, v))}</h2>
      <p>${esc(t.start)}${startLinks.length ? ` ${startLinks.join(' · ')}` : ''}</p>

${limitsHtml(texts)}

${faqHtml(fill(t.faq_heading, v), faq)}

      <p class="meta">${t.source}</p>
      <p class="meta">${fill(t.app, v)}</p>`;
    const graph = [
      ORG,
      webPageNode(page.url, h1, description),
      subsetNode(page.url, `Pedalability Index 2026: ${c.city}`, description,
        { '@type': 'Place', name: c.city, address: { '@type': 'PostalAddress', addressLocality: c.city, addressCountry: c.iso2 } }),
      faqNode(page.url, [[h1, answer], ...faq]),
      breadcrumbs(page.url, [['Home', '/'], ['Pedalability Index', '/pedalability-index/'], [country.name, countryUrl(c)], [c.city, page.url]]),
    ];
    page.summary = answer;
    emit(page, shell({ page, title: `${h1} Pedalability Index 2026`, description, body, graph, ogImage: OG_IMAGE, texts }));
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
    for (const page of cityPages) renderCity(page, guide, research);
    for (const page of countryPages) renderCountry(page);
    return { indexNodes: renderIndexPage() };
  }

  return { cities, built, skipped, cityPages, countryPages, render, texts };
}

if (import.meta.main) import('./build.mjs');
