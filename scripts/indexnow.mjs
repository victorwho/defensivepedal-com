// Tells IndexNow (Bing, and through it ChatGPT search) which URLs changed.
// Run AFTER a production deploy:  node scripts/indexnow.mjs            (submits)
//                                 node scripts/indexnow.mjs --dry-run  (prints only)
//                                 node scripts/indexnow.mjs --all      (resubmits every URL)
// "Changed" = a sitemap URL whose content hash (content/lastmod.json) differs from the last
// successful submission, recorded in content/indexnow-state.json. Commit that file after a run.
import fs from 'node:fs';
import { SITE, read, write, exists } from './lib.mjs';

const STATE = 'content/indexnow-state.json';
const args = new Set(process.argv.slice(2));
const host = new URL(SITE).host;

const keyFile = fs.readdirSync(new URL('..', import.meta.url)).find((f) => /^[a-f0-9]{32}\.txt$/.test(f));
if (!keyFile) throw new Error('No IndexNow key file (<32 hex chars>.txt) at the site root.');
const key = read(keyFile).trim();
if (`${key}.txt` !== keyFile) throw new Error(`${keyFile} must contain exactly its own name without .txt`);

const locs = (xml) => [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const hashes = JSON.parse(read('content/lastmod.json'));
const current = Object.fromEntries(
  locs(read('sitemap.xml')).flatMap((sitemap) => locs(read(new URL(sitemap).pathname.slice(1))))
    .map((url) => [url, hashes[new URL(url).pathname].hash]));
const previous = exists(STATE) ? JSON.parse(read(STATE)) : {};
const changed = Object.keys(current).filter((url) => args.has('--all') || previous[url] !== current[url]).sort();

console.log(`${changed.length} of ${Object.keys(current).length} URLs changed since the last submission.`);
for (const url of changed) console.log(`  ${url}`);
if (!changed.length || args.has('--dry-run')) process.exit(0);

// The key must already be live, or IndexNow rejects the batch.
const keyLocation = `${SITE}/${keyFile}`;
const live = await fetch(keyLocation);
if (!live.ok || (await live.text()).trim() !== key) {
  throw new Error(`${keyLocation} is not live yet (HTTP ${live.status}). Deploy first, then run this again.`);
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host, key, keyLocation, urlList: changed }),
});
if (!response.ok) throw new Error(`IndexNow answered HTTP ${response.status}: ${await response.text()}`);
write(STATE, JSON.stringify(Object.fromEntries(Object.keys(current).sort().map((u) => [u, current[u]])), null, 1) + '\n');
console.log(`Submitted (HTTP ${response.status}). Recorded in ${STATE}.`);
