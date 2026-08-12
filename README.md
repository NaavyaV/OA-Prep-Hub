# OA Prep Hub

Which LeetCode problems each company actually asks in online assessments and interviews —
compiled from public company-wise question lists, ranked by frequency, and filtered down
to **free problems only**.

Static site. No backend, no database, no tracking. Deploys to Vercel or Netlify as-is.

- **Frontend:** React 19 + Vite
- **Data:** a standalone Node script that regenerates `public/data/companies.json`
- **Coverage:** 82 companies, 16,882 company-problem listings, 2,761 distinct problems

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

The generated data files are committed, so the app runs immediately after `npm install` —
you only need the pipeline when you want to refresh the data.

```bash
npm run build          # production build to dist/
npm run preview        # serve the production build locally
```

## Refreshing the data

```bash
npm run data           # clone/update sources, re-check LeetCode, rebuild output
npm run data:offline   # rebuild from already-cloned sources (skips git network)
```

The script takes about a minute, most of it spent paging through LeetCode's catalog. It
prints a per-company summary so you can sanity-check the run:

```
  company                   kept   premium-dropped   unresolved
  -------------------------------------------------------------
  Google                    2141               224            6
  Amazon                    1872               216            7
  ...
  -------------------------------------------------------------
  TOTAL (82 companies)     16882              1470           71

  skipped (under 25 free problems): Dropbox (24), Stripe (9), OpenAI (13), ...
```

- **kept** — free problems that shipped to the site
- **premium-dropped** — problems removed because LeetCode reports `isPaidOnly: true`
- **unresolved** — slugs absent from LeetCode's public catalog (renamed or removed). These
  are also dropped: if a problem cannot be verified as free, it does not ship.
- **skipped** — companies that ended up under `MIN_PROBLEMS` (25). A page with nine rows
  reads as broken rather than sparse, so they are cut. Lower the constant to include them.

Source repositories are cloned into `.cache/sources/` (gitignored) and reused between
runs.

### What the pipeline does

1. **Fetch** the five source repositories listed in [SOURCES.md](./SOURCES.md).
2. **Parse** each repo's CSV dialect into a common
   `{ company, problemTitle, leetcodeSlug, frequency }`. The repos disagree on headers,
   difficulty casing, and frequency scale; a column resolver maps them onto one shape.
   Several are forks or refreshes of each other, so identical CSVs are fingerprinted and
   ingested once — the last build skipped 251 duplicate files.
3. **Cross-reference** every slug against LeetCode's public GraphQL endpoint
   (`problemsetQuestionList`, no auth) for `isPaidOnly`, canonical title, and difficulty.
   **Every problem with `isPaidOnly: true` is dropped**, and the script throws rather than
   writing output if any unverified problem survives into the result.
4. **Dedupe** on `(company, slug)`, merging frequency signals across repos and time
   windows, then shrinking each score by how many lists back it (see
   [the note on frequency](./SOURCES.md#a-note-on-the-frequency-signal)).
5. **Resolve** each company's brand mark from simple-icons, copying the SVG path into the
   output so nothing is hotlinked.
6. **Write** `public/data/companies.json` and `src/data/meta.json`.

### Adding a company

Add an entry to `COMPANIES` in `scripts/build-data.mjs` and re-run `npm run data`:

```js
{ slug: 'stripe', name: 'Stripe', aliases: ['stripe'], icon: 'stripe' },
```

`aliases` are the company's folder or filename token in the source repos. Both sides are
reduced to lowercase alphanumerics before comparison, so `Goldman Sachs`,
`goldman-sachs`, and `goldman_sachs` all match one entry — but matching is still
**exact, never substring**. That is deliberate: substring matching would fold
`microstrategy` into Microsoft, `coinswitch-kuber` into Uber, and `snapdeal` into Snap.
Duplicate aliases across two companies throw at startup rather than silently merging.

Check what the sources actually call a company before adding it:

```bash
ls .cache/sources/krishnadey30 | sed 's/_[a-z0-9]*\.csv$//' | sort -u | grep -i stripe
ls .cache/sources/liquidslr .cache/sources/adhil48 | grep -i stripe
```

If a company is missing from a source repo the pipeline just skips it — Accenture, for
example, appears in only four of the five.

`icon` is a [simple-icons](https://github.com/simple-icons/simple-icons) slug and is
optional. simple-icons has dropped many large tech trademarks upstream, so about a third
of the companies have no glyph; those fall back to a generated monogram tile
automatically. The build logs `no simple-icons entry for "..."` if you name one that
does not exist.

## Data shape

`public/data/companies.json` is keyed by company slug and sorted by signal, descending:

```json
{
  "google": [
    {
      "title": "Two Sum",
      "slug": "two-sum",
      "url": "https://leetcode.com/problems/two-sum/",
      "difficulty": "Easy",
      "sources": 5,
      "asked": "2026-07-16",
      "frequency": 100
    }
  ]
}
```

`frequency` is a 0–100 relative signal within that company (its top problem is always
100) and `sources` is how many of the five repositories listed that problem for that
company. `asked` is an estimated date derived from a source's period bucket and its
own snapshot date (see [SOURCES.md](./SOURCES.md#a-note-on-the-asked-around-date)) —
it's omitted entirely for problems with no period-labeled source to estimate from.

`src/data/meta.json` holds company names, difficulty splits, build stats, brand marks,
and source credits. It is statically imported so the landing page renders without a
fetch; `companies.json` (~3 MB, ~150 KB over the wire compressed) is fetched on demand
when a company is opened.

## Deploying

Both platforms need no configuration beyond the defaults:

| | Build command | Output directory |
| --- | --- | --- |
| **Vercel** | `npm run build` | `dist` |
| **Netlify** | `npm run build` | `dist` |

Everything under `public/` is copied to the deploy root, so `companies.json` is served as
a static asset. Company views are hash routes (`/#/google`), so no SPA rewrite rules are
required.

## Scope

The site stores and displays only a problem's **title, difficulty, slug, and an outbound
link**. Problem statements, test cases, editorials, and solutions are never fetched or
shown — every problem opens on leetcode.com.

Only free problems are ever linked. See [SOURCES.md](./SOURCES.md) for full credits,
licensing status of the source repositories, and how the frequency signal is derived.

Not affiliated with LeetCode or any company listed.
