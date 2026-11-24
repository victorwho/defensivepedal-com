// Full static build: node scripts/build.mjs
// Reads the index CSV, content/city_notes.csv and the approved drafts; writes committed HTML,
// sitemaps, llms.txt, llms-full.txt and the feed. Running it twice gives no diff.
import { read, saveManifest, pages } from './lib.mjs';
import { plan as planCities } from './build-cities.mjs';
import { plan as planPages } from './build-pages.mjs';
import { plan as planSite, renderHandPages, writeSitemaps, writeLlms, writeFeed } from './build-site.mjs';

const texts = JSON.parse(read('content/template_text.json'));

// Register every page first, so links, hreflang and navigation only ever point at pages that exist.
planSite();
const answers = planPages(texts);
const index = planCities(texts);

answers.render();
const { indexNodes } = index.render({ guide: answers.guide, research: answers.research });
renderHandPages({ '/pedalability-index/': indexNodes }, texts);
writeSitemaps();
writeLlms({ cities: index.cities, texts });
writeFeed();
saveManifest();

const publicPages = pages.filter((p) => !p.hidden);
console.log(`Pages: ${publicPages.length} public (${index.countryPages.length} country, ${index.built.length} city, ${answers.built.length} answer, ${answers.hubs.length} hub).`);
console.log(`City pages built (${index.built.length}): ${index.built.map((c) => c.slug).join(', ') || 'none'}`);
console.log(`City pages skipped, no human_line (${index.skipped.length}): ${index.skipped.map((c) => c.slug).join(', ') || 'none'}`);
if (answers.note) console.log(answers.note);
console.log(`Drafts built (${answers.built.length}): ${answers.built.map((p) => p.url).join(', ') || 'none'}`);
for (const r of answers.rejected) console.log(`Draft skipped: ${r.file}: ${r.why}`);
