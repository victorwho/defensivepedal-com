# Build scripts

The site is static HTML, committed to the repo and served as Cloudflare Workers static assets.
These scripts turn data and Markdown into that HTML. No dependencies; Node 24.2 or newer.
`scripts/` and `content/` are listed in `.assetsignore` and are not served.

## Build

```
node scripts/build.mjs
```

Run it, review `git diff`, commit. Running it twice gives no diff.

| Input | Output |
|---|---|
| `C:\dev\european-cycling-risk-ranking\data\eu300_city_index.csv` (copied to `pedalability-index/data/`) | the 300-row table, answer and FAQ on `/pedalability-index/`; 31 country pages |
| `content/city_notes.csv` | one city page per row that has a `human_line`; all other cities are skipped and listed |
| `C:\dev\social_media_automation\seo-geo\drafts\{lang}\*.md` + `drafts\LOG.md` | `/guides/`, `/research/`, `/apps/` pages and hubs, for drafts marked `approved` |
| `content/template_text.json` | every fixed sentence in the generated pages |
| `content/llms_static.md` | the hand-written part of `llms.txt` |
| the hand-written pages | one Organization block, page schema, canonical, hreflang, dates |

Also written: `sitemap.xml` (an index) with `sitemap-core.xml`, `sitemap-cities.xml`, `sitemap-guides.xml`;
`llms.txt`; `llms-full.txt`; the generated items in `feed.xml`; `content/lastmod.json`.

### Rules the build enforces

- A city page is built only if its `city_notes.csv` row has a `human_line`.
- A draft is built only if a line in `LOG.md` contains its exact question and ends with the status `approved`,
  `needs_confirmation` is empty, and the file has no `HUMAN LINE NEEDED` or `NATIVE REVIEW NEEDED`.
- The first paragraph after the H1 must be 40–60 words, or the page is not built.
- A translated draft needs wording for its language under `i18n` in `content/template_text.json`.
- Links, navigation and hreflang only point at pages that exist in this build.
- A page's date (`dateModified`, sitemap `lastmod`, the visible "Updated" line) changes only when
  its content changes. `content/lastmod.json` records this; don't edit dates by hand.

### `content/city_notes.csv`

`slug` is the `slug` column of the index CSV (`thehague`); the page URL uses the city name (`/netherlands/the-hague/`). `human_line` is one sentence a person wrote or checked.
`arterials` and `calm_areas` are free text. `peers` is a `;`-separated list of slugs; if empty, the
three cities nearest in rank from the same country are used. Quote any cell that contains a comma.

### Hand-written pages

Edit them as before, then run the build. The build owns only: the JSON-LD Organization node, the
schema nodes listed in `build-site.mjs`, `dateModified`, canonical and hreflang links, and anything
between `<!-- build:name -->` and `<!-- /build:name -->`. A new hand-written page goes in the `HAND`
list in `build-site.mjs`.

## After each production deploy: IndexNow

```
node scripts/indexnow.mjs --dry-run   # see what would be sent
node scripts/indexnow.mjs             # send it, then commit content/indexnow-state.json
```

It submits the URLs whose sitemap `lastmod` changed since the last submission. The key file
(`/<key>.txt` at the site root) must be live first, so the first run comes after the first deploy.
