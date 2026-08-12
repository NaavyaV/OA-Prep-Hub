#!/usr/bin/env node
/**
 * OA Prep Hub — data pipeline
 *
 *   1. Fetches company-wise problem lists from the public GitHub repos in SOURCES.md
 *   2. Parses each repo's CSV dialect into a common { company, problemTitle, leetcodeSlug, frequency }
 *   3. Cross-references every slug against LeetCode's public GraphQL API and DROPS
 *      anything with isPaidOnly === true (hard requirement — the site links to free problems only)
 *   4. Dedupes across sources, merging frequency signals
 *   5. Writes src/data/companies.json and src/data/meta.json
 *
 * Usage:
 *   node scripts/build-data.mjs             fetch/update sources, then build
 *   node scripts/build-data.mjs --offline   reuse already-cloned sources (no git network)
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache', 'sources');
const OUT_DIR = path.join(ROOT, 'src', 'data');
const DATA_DIR = path.join(ROOT, 'public', 'data');
const OFFLINE = process.argv.includes('--offline');

/* ------------------------------------------------------------------ config */

const SOURCES = [
  {
    id: 'krishnadey30',
    name: 'LeetCode-Questions-CompanyWise',
    owner: 'krishnadey30',
    url: 'https://github.com/krishnadey30/LeetCode-Questions-CompanyWise',
    license: 'No license file published',
    // {company}_{period}.csv at the repo root
    layout: 'flat',
  },
  {
    id: 'snehasishroy',
    name: 'leetcode-companywise-interview-questions',
    owner: 'snehasishroy',
    url: 'https://github.com/snehasishroy/leetcode-companywise-interview-questions',
    license: 'No license file published',
    // {company}/{period}.csv
    layout: 'nested',
  },
  {
    id: 'adhil48',
    name: 'Leetcode-Companys-wise-Question-and-Solution',
    owner: 'ADHIL48',
    url: 'https://github.com/ADHIL48/Leetcode-Companys-wise-Question-and-Solution',
    license: 'No license file published',
    // {Company}/{n. Period}.csv
    layout: 'nested',
  },
  {
    id: 'liquidslr',
    name: 'leetcode-company-wise-problems',
    owner: 'liquidslr',
    url: 'https://github.com/liquidslr/leetcode-company-wise-problems',
    license: 'No license file published',
    // {Company}/{n. Period}.csv — 470 companies, the widest source
    layout: 'nested',
  },
  {
    id: 'hxu296',
    name: 'leetcode-company-wise-problems-2022',
    owner: 'hxu296',
    url: 'https://github.com/hxu296/leetcode-company-wise-problems-2022',
    license: 'MIT',
    // companies/{Company}.csv, and the only source that states a license
    layout: 'subdir',
    subdir: 'companies',
  },
  // Two further public repos were evaluated and deliberately excluded, because both
  // are republications rather than independent data. Counting a copy as a second
  // source would double-weight its rows in the frequency merge for no added coverage:
  //
  //   singhsoumya0109/LeetCode-Company-Wise-Questions
  //     — all 537 files identical to krishnadey30's once CRLF/LF is normalized.
  //   liquidslr/interview-company-wise-problems
  //     — same 470 companies and rows as liquidslr's other repo, minus Topics.
  //
  // adhil48 and liquidslr DO share an ancestor (about half their files are still
  // identical) but each also carries rows the other lacks, so both are kept and the
  // overlap is removed per-file by content hash during parsing instead.
];

// `aliases` are matched EXACTLY against a repo's company token, after both sides are
// normalized to lowercase alphanumerics (so "Goldman Sachs", "goldman-sachs" and
// "goldman_sachs" all collapse to one key). Matching is never by substring:
// substring matching would wrongly fold "microstrategy" into Microsoft,
// "coinswitch-kuber" into Uber, "snapdeal" into Snap, and "morgan-stanley" into
// JP Morgan. Extra aliases below are real spelling variants, not guesses.
//
// `icon` is a simple-icons slug. Many major brands (Amazon, Microsoft, Adobe,
// Oracle, LinkedIn, Salesforce, IBM...) were removed from simple-icons upstream
// over trademark concerns, so companies without one render a monogram tile
// instead — see buildIcons().
const COMPANIES = [
  { slug: 'google', name: 'Google', aliases: ['google'], icon: 'google' },
  { slug: 'amazon', name: 'Amazon', aliases: ['amazon'] },
  { slug: 'meta', name: 'Meta', aliases: ['meta', 'facebook'], icon: 'meta' },
  { slug: 'apple', name: 'Apple', aliases: ['apple'], icon: 'apple' },
  { slug: 'microsoft', name: 'Microsoft', aliases: ['microsoft'] },
  { slug: 'netflix', name: 'Netflix', aliases: ['netflix'], icon: 'netflix' },
  { slug: 'uber', name: 'Uber', aliases: ['uber'], icon: 'uber' },
  { slug: 'bloomberg', name: 'Bloomberg', aliases: ['bloomberg'] },
  { slug: 'paypal', name: 'PayPal', aliases: ['paypal'], icon: 'paypal' },
  { slug: 'accenture', name: 'Accenture', aliases: ['accenture'], icon: 'accenture' },
  { slug: 'adobe', name: 'Adobe', aliases: ['adobe'] },
  { slug: 'salesforce', name: 'Salesforce', aliases: ['salesforce'] },
  { slug: 'goldman-sachs', name: 'Goldman Sachs', aliases: ['goldman sachs'], icon: 'goldmansachs' },
  { slug: 'jp-morgan', name: 'JP Morgan', aliases: ['jpmorgan', 'jp morgan', 'jp morgan chase'] },
  { slug: 'cisco', name: 'Cisco', aliases: ['cisco'], icon: 'cisco' },
  { slug: 'oracle', name: 'Oracle', aliases: ['oracle'] },
  { slug: 'linkedin', name: 'LinkedIn', aliases: ['linkedin'] },
  { slug: 'bytedance', name: 'ByteDance', aliases: ['bytedance'], icon: 'bytedance' },
  { slug: 'tiktok', name: 'TikTok', aliases: ['tiktok'], icon: 'tiktok' },
  { slug: 'ebay', name: 'eBay', aliases: ['ebay'], icon: 'ebay' },
  { slug: 'visa', name: 'Visa', aliases: ['visa'], icon: 'visa' },
  { slug: 'nvidia', name: 'Nvidia', aliases: ['nvidia'], icon: 'nvidia' },
  { slug: 'ibm', name: 'IBM', aliases: ['ibm'] },
  { slug: 'intel', name: 'Intel', aliases: ['intel'], icon: 'intel' },
  { slug: 'atlassian', name: 'Atlassian', aliases: ['atlassian'], icon: 'atlassian' },
  { slug: 'doordash', name: 'DoorDash', aliases: ['doordash'], icon: 'doordash' },
  { slug: 'airbnb', name: 'Airbnb', aliases: ['airbnb'], icon: 'airbnb' },
  { slug: 'vmware', name: 'VMware', aliases: ['vmware'], icon: 'vmware' },
  { slug: 'servicenow', name: 'ServiceNow', aliases: ['servicenow'] },
  { slug: 'intuit', name: 'Intuit', aliases: ['intuit'], icon: 'intuit' },
  { slug: 'expedia', name: 'Expedia', aliases: ['expedia'], icon: 'expedia' },
  { slug: 'pinterest', name: 'Pinterest', aliases: ['pinterest'], icon: 'pinterest' },
  { slug: 'samsung', name: 'Samsung', aliases: ['samsung'], icon: 'samsung' },
  { slug: 'capital-one', name: 'Capital One', aliases: ['capital one'] },
  { slug: 'roblox', name: 'Roblox', aliases: ['roblox'], icon: 'roblox' },
  { slug: 'lyft', name: 'Lyft', aliases: ['lyft'], icon: 'lyft' },
  { slug: 'sap', name: 'SAP', aliases: ['sap'], icon: 'sap' },
  { slug: 'qualcomm', name: 'Qualcomm', aliases: ['qualcomm'], icon: 'qualcomm' },
  { slug: 'morgan-stanley', name: 'Morgan Stanley', aliases: ['morgan stanley'] },
  { slug: 'databricks', name: 'Databricks', aliases: ['databricks'], icon: 'databricks' },
  { slug: 'tesla', name: 'Tesla', aliases: ['tesla'], icon: 'tesla' },
  { slug: 'yelp', name: 'Yelp', aliases: ['yelp'], icon: 'yelp' },
  { slug: 'snowflake', name: 'Snowflake', aliases: ['snowflake'], icon: 'snowflake' },
  { slug: 'x-twitter', name: 'X (Twitter)', aliases: ['twitter', 'x'], icon: 'x' },
  { slug: 'snap', name: 'Snap', aliases: ['snap', 'snapchat'], icon: 'snapchat' },
  { slug: 'walmart', name: 'Walmart', aliases: ['walmart', 'walmart labs', 'walmart global tech'] },
  { slug: 'tcs', name: 'TCS', aliases: ['tcs'], icon: 'tcs' },
  { slug: 'spotify', name: 'Spotify', aliases: ['spotify'], icon: 'spotify' },
  { slug: 'dropbox', name: 'Dropbox', aliases: ['dropbox'], icon: 'dropbox' },
  { slug: 'stripe', name: 'Stripe', aliases: ['stripe'], icon: 'stripe' },
  { slug: 'palantir', name: 'Palantir', aliases: ['palantir', 'palantir technologies'], icon: 'palantir' },
  { slug: 'openai', name: 'OpenAI', aliases: ['openai'] },
  { slug: 'coinbase', name: 'Coinbase', aliases: ['coinbase'], icon: 'coinbase' },
  { slug: 'robinhood', name: 'Robinhood', aliases: ['robinhood'], icon: 'robinhood' },
  { slug: 'american-express', name: 'American Express', aliases: ['american express'], icon: 'americanexpress' },
  { slug: 'barclays', name: 'Barclays', aliases: ['barclays'], icon: 'barclays' },
  { slug: 'deutsche-bank', name: 'Deutsche Bank', aliases: ['deutsche bank'], icon: 'deutschebank' },
  { slug: 'blackrock', name: 'BlackRock', aliases: ['blackrock'] },
  { slug: 'citadel', name: 'Citadel', aliases: ['citadel'] },
  { slug: 'de-shaw', name: 'DE Shaw', aliases: ['de shaw', 'd e shaw'] },
  { slug: 'jane-street', name: 'Jane Street', aliases: ['jane street'] },
  { slug: 'splunk', name: 'Splunk', aliases: ['splunk'], icon: 'splunk' },
  { slug: 'indeed', name: 'Indeed', aliases: ['indeed'], icon: 'indeed' },
  { slug: 'zillow', name: 'Zillow', aliases: ['zillow'], icon: 'zillow' },
  { slug: 'qualtrics', name: 'Qualtrics', aliases: ['qualtrics'], icon: 'qualtrics' },
  { slug: 'wayfair', name: 'Wayfair', aliases: ['wayfair'] },
  { slug: 'twilio', name: 'Twilio', aliases: ['twilio'] },
  { slug: 'reddit', name: 'Reddit', aliases: ['reddit'], icon: 'reddit' },
  { slug: 'instacart', name: 'Instacart', aliases: ['instacart'], icon: 'instacart' },
  { slug: 'square', name: 'Square', aliases: ['square'], icon: 'square' },
  { slug: 'shopify', name: 'Shopify', aliases: ['shopify'], icon: 'shopify' },
  { slug: 'box', name: 'Box', aliases: ['box'], icon: 'box' },
  { slug: 'quora', name: 'Quora', aliases: ['quora'], icon: 'quora' },
  { slug: 'booking', name: 'Booking.com', aliases: ['booking com', 'bookingcom', 'booking'], icon: 'bookingdotcom' },
  { slug: 'docusign', name: 'Docusign', aliases: ['docusign'] },
  { slug: 'mathworks', name: 'MathWorks', aliases: ['mathworks'] },
  { slug: 'nutanix', name: 'Nutanix', aliases: ['nutanix'], icon: 'nutanix' },
  { slug: 'rubrik', name: 'Rubrik', aliases: ['rubrik'] },
  { slug: 'arista-networks', name: 'Arista Networks', aliases: ['arista networks'] },
  { slug: 'dell', name: 'Dell', aliases: ['dell'], icon: 'dell' },
  { slug: 'asana', name: 'Asana', aliases: ['asana'], icon: 'asana' },
  { slug: 'affirm', name: 'Affirm', aliases: ['affirm'] },
  { slug: 'yandex', name: 'Yandex', aliases: ['yandex'] },
  { slug: 'yahoo', name: 'Yahoo', aliases: ['yahoo'] },
  { slug: 'alibaba', name: 'Alibaba', aliases: ['alibaba'], icon: 'alibabadotcom' },
  { slug: 'tencent', name: 'Tencent', aliases: ['tencent'] },
  { slug: 'baidu', name: 'Baidu', aliases: ['baidu'], icon: 'baidu' },
  { slug: 'huawei', name: 'Huawei', aliases: ['huawei'], icon: 'huawei' },
  { slug: 'grab', name: 'Grab', aliases: ['grab'], icon: 'grab' },
  { slug: 'zoho', name: 'Zoho', aliases: ['zoho'], icon: 'zoho' },
  { slug: 'infosys', name: 'Infosys', aliases: ['infosys'], icon: 'infosys' },
  { slug: 'wipro', name: 'Wipro', aliases: ['wipro'], icon: 'wipro' },
  { slug: 'cognizant', name: 'Cognizant', aliases: ['cognizant'] },
  { slug: 'flipkart', name: 'Flipkart', aliases: ['flipkart'] },
  { slug: 'phonepe', name: 'PhonePe', aliases: ['phonepe'], icon: 'phonepe' },
  { slug: 'paytm', name: 'Paytm', aliases: ['paytm'], icon: 'paytm' },
  { slug: 'swiggy', name: 'Swiggy', aliases: ['swiggy'], icon: 'swiggy' },
  { slug: 'zomato', name: 'Zomato', aliases: ['zomato'], icon: 'zomato' },
];

// A company ships only if it has at least this many verified-free problems. Below
// this a "company page" is a handful of rows and reads as broken rather than sparse.
const MIN_PROBLEMS = 25;

// Shrinkage constant for the frequency signal. A problem seen on n source lists keeps
// n/(n+K) of its mean score, so one strong showing counts for little and evidence
// from several independent lists counts for nearly all of it. 4 is tuned by eye
// against the classic per-company sets (Two Sum / Number of Islands / LRU Cache).
const CONFIDENCE_WEIGHT = 4;

const GRAPHQL_ENDPOINT = 'https://leetcode.com/graphql';
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;

// Days implied by a source file's period label, keyed by its normalized token (see
// periodKey()). "More than six months" and "all time" are deliberately absent — an
// open-ended or unbounded window can't anchor a single estimated date. Two spellings
// exist for six months because the flat layout uses "6months" and the nested layout
// uses the word "Six Months".
const PERIOD_DAYS = {
  thirtydays: 30,
  threemonths: 90,
  sixmonths: 180,
  '6months': 180,
  '1year': 365,
  '2year': 730,
};

/* ------------------------------------------------------------------- utils */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(...args) {
  console.log(...args);
}

/** Minimal RFC-4180 CSV parser — repo3's `Topics` column contains quoted commas. */
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip BOM
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

const normalizeHeader = (h) => h.toLowerCase().replace(/[^a-z]/g, '');

/**
 * Company tokens across the six repos are spelled as folder names ("Goldman Sachs"),
 * hyphenated file stems ("goldman-sachs"), and underscored ones ("goldman_sachs").
 * Reducing both sides to lowercase alphanumerics makes those one key while keeping
 * the match EXACT — "snapdeal" still never matches "snap".
 */
const companyKey = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const ALIAS_INDEX = new Map();
for (const c of COMPANIES) {
  for (const alias of [c.name, ...c.aliases]) {
    const key = companyKey(alias);
    const owner = ALIAS_INDEX.get(key);
    if (owner && owner !== c) {
      throw new Error(`alias "${alias}" claimed by both ${owner.slug} and ${c.slug}`);
    }
    ALIAS_INDEX.set(key, c);
  }
}

const matchCompany = (token) => ALIAS_INDEX.get(companyKey(token)) ?? null;

/**
 * A period file's basename to a PERIOD_DAYS key: strips a leading "N. " ordinal
 * (adhil48/liquidslr: "1. Thirty Days") and all separators, so "Thirty Days",
 * "thirty-days", and "1. Thirty Days" all resolve to "thirtydays".
 */
const periodKey = (token) =>
  token
    .replace(/^\d+\.\s*/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

/** Resolve a logical column to its index, tolerating each repo's header spelling. */
function columnIndex(headers, candidates) {
  const normalized = headers.map(normalizeHeader);
  for (const candidate of candidates) {
    const idx = normalized.indexOf(normalizeHeader(candidate));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** `https://leetcode.com/problems/two-sum/` (or with junk/whitespace) -> `two-sum` */
function slugFromUrl(raw) {
  if (!raw) return null;
  const cleaned = String(raw).trim().replace(/\/+$/, '');
  const match = cleaned.match(/problems\/([a-z0-9-]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function parseFrequency(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const n = Number(String(raw).replace('%', '').trim());
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ----------------------------------------------------------- source repos */

async function ensureSources() {
  await fs.mkdir(CACHE, { recursive: true });
  for (const source of SOURCES) {
    const dir = path.join(CACHE, source.id);
    if (existsSync(path.join(dir, '.git'))) {
      if (OFFLINE) {
        log(`  · ${source.id} — using cached clone`);
        continue;
      }
      log(`  · ${source.id} — updating`);
      try {
        execFileSync('git', ['-C', dir, 'pull', '--ff-only', '--quiet'], { stdio: 'pipe' });
      } catch {
        log(`    (pull failed, keeping existing clone)`);
      }
    } else {
      if (OFFLINE) throw new Error(`--offline given but ${source.id} is not cached at ${dir}`);
      log(`  · ${source.id} — cloning`);
      execFileSync('git', ['clone', '--depth', '1', '--quiet', `${source.url}.git`, dir], {
        stdio: 'pipe',
      });
    }
  }
}

/**
 * Each source is a shallow (`--depth 1`) clone, so every file in it shares the same
 * single commit — there's no real per-file history to mine. That one commit's date
 * is still a legitimate anchor for "when this snapshot was taken," which combined
 * with a file's period label ("Thirty Days") is what "asked around" is estimated
 * from. Mutates `source.snapshotDate` in place.
 */
async function resolveSnapshotDates() {
  for (const source of SOURCES) {
    const dir = path.join(CACHE, source.id);
    try {
      source.snapshotDate =
        execFileSync('git', ['-C', dir, 'log', '-1', '--format=%aI'], {
          encoding: 'utf8',
        }).trim() || null;
    } catch {
      source.snapshotDate = null;
    }
  }
}

/**
 * Every CSV in a source repo that belongs to one of our target companies.
 * Returns [{ company, file, sourceId }]
 */
async function locateCompanyFiles(source) {
  const dir = path.join(CACHE, source.id);
  const found = [];

  if (source.layout === 'nested') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === '.git') continue;
      const company = matchCompany(entry.name);
      if (!company) continue;
      const sub = path.join(dir, entry.name);
      for (const f of await fs.readdir(sub)) {
        if (!f.endsWith('.csv')) continue;
        const periodDays = PERIOD_DAYS[periodKey(f.slice(0, -4))] ?? null;
        found.push({ company, file: path.join(sub, f), sourceId: source.id, periodDays });
      }
    }
    return found;
  }

  // Both flat layouts are one CSV per (company, period) in a single directory; they
  // differ only in whether a period suffix is glued onto the company name.
  const base = source.layout === 'subdir' ? path.join(dir, source.subdir) : dir;
  for (const entry of await fs.readdir(base)) {
    if (!entry.endsWith('.csv')) continue;
    const name = entry.slice(0, -4);
    const hasPeriodSuffix = source.layout !== 'subdir' && name.includes('_');
    // "goldman-sachs_alltime.csv" -> "goldman-sachs" (split on the LAST underscore,
    // so hyphenated and underscored company names survive intact). The `subdir`
    // layout has no period suffix — the whole basename is the company.
    const token = hasPeriodSuffix ? name.slice(0, name.lastIndexOf('_')) : name;
    const company = matchCompany(token);
    if (!company) continue;
    const periodDays = hasPeriodSuffix
      ? (PERIOD_DAYS[periodKey(name.slice(name.lastIndexOf('_') + 1))] ?? null)
      : null;
    found.push({ company, file: path.join(base, entry), sourceId: source.id, periodDays });
  }
  return found;
}

/**
 * Parse one CSV into common-shape records.
 *
 * Frequency is normalized per-file to 0..1 (value / max-in-file) because the three
 * repos use incompatible scales: unbounded floats, "100.0%" strings, and 0-100 floats.
 * Normalizing makes "how often, relative to this company's other problems" comparable
 * across sources so the merge in step 3 is meaningful.
 */
async function parseCompanyFile({ company, file, sourceId, periodDays, source }, seenContent) {
  const text = await fs.readFile(file, 'utf8');

  // Several of these repos are forks or refreshes of each other, so the same CSV
  // can arrive more than once. Fingerprint the content (line endings normalized,
  // since a CRLF-only difference is not new data) and ingest each list once —
  // otherwise a duplicated file would count twice in the frequency average.
  const fingerprint = createHash('sha1')
    .update(company.slug + '::' + text.replace(/\r/g, ''))
    .digest('hex');
  if (seenContent.has(fingerprint)) return null;
  seenContent.add(fingerprint);

  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const headers = rows[0];
  const iTitle = columnIndex(headers, ['Title', 'problem_name']);
  const iLink = columnIndex(headers, ['Leetcode Question Link', 'URL', 'Link', 'problem_link']);
  // `num_occur` (hxu296) is a raw occurrence count rather than a percentage — the
  // per-file normalization below puts it on the same 0..1 footing as the others.
  const iFreq = columnIndex(headers, ['Frequency', 'Frequency %', 'num_occur']);

  if (iTitle === -1 || iLink === -1) {
    log(`    ! skipping ${path.basename(file)} — unrecognized headers: ${headers.join(',')}`);
    return [];
  }

  const raw = [];
  for (const row of rows.slice(1)) {
    const slug = slugFromUrl(row[iLink]);
    if (!slug) continue;
    raw.push({
      company: company.slug,
      problemTitle: (row[iTitle] ?? '').trim(),
      leetcodeSlug: slug,
      frequency: iFreq === -1 ? null : parseFrequency(row[iFreq]),
      sourceId,
      periodDays,
      snapshotDate: source?.snapshotDate ?? null,
    });
  }

  const max = Math.max(0, ...raw.map((r) => r.frequency ?? 0));
  return raw.map((r) => ({
    ...r,
    frequency: max > 0 && r.frequency != null ? r.frequency / max : null,
  }));
}

/* -------------------------------------------------- leetcode public catalog */

const CATALOG_QUERY = `query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data {
      title
      titleSlug
      difficulty
      paidOnly: isPaidOnly
    }
  }
}`;

async function fetchPage(skip, attempt = 1) {
  try {
    const res = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // LeetCode rejects requests without a browser-ish UA / referer.
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Referer: 'https://leetcode.com/problemset/all/',
      },
      body: JSON.stringify({
        query: CATALOG_QUERY,
        variables: { categorySlug: '', limit: PAGE_SIZE, skip, filters: {} },
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors).slice(0, 200)}`);
    const data = json.data?.problemsetQuestionList;
    if (!data) throw new Error('missing problemsetQuestionList in response');
    return data;
  } catch (err) {
    if (attempt >= 4) throw new Error(`failed at skip=${skip} after ${attempt} attempts: ${err.message}`);
    const backoff = 1000 * 2 ** (attempt - 1);
    log(`\n    retry ${attempt} at skip=${skip} (${err.message}) — waiting ${backoff}ms`);
    await sleep(backoff);
    return fetchPage(skip, attempt + 1);
  }
}

/** slug -> { title, difficulty, paidOnly } for every problem LeetCode lists publicly. */
async function fetchCatalog() {
  const catalog = new Map();
  let skip = 0;
  let total = Infinity;

  while (skip < total) {
    const page = await fetchPage(skip);
    total = page.total;
    for (const q of page.questions) {
      catalog.set(q.titleSlug, {
        title: q.title,
        difficulty: q.difficulty,
        paidOnly: q.paidOnly,
      });
    }
    skip += PAGE_SIZE;
    process.stdout.write(`\r  fetched ${Math.min(skip, total)}/${total} problems`);
    if (skip < total) await sleep(REQUEST_DELAY_MS);
  }
  process.stdout.write('\n');
  return catalog;
}

/* ------------------------------------------------------------------- icons */

/** Relative luminance of a #rrggbb string, 0 (black) .. 1 (white). */
function luminance(hex) {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Darken a hex toward black by `amount` (0..1). */
function darken(hex, amount) {
  return [0, 2, 4]
    .map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - amount)))
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Resolve each company's mark from simple-icons, bundling the glyph locally.
 *
 * Nothing is hotlinked: the SVG path data is copied into meta.json at build time,
 * so the site never requests an image from a third party. simple-icons has removed
 * many large tech trademarks upstream (Amazon, Microsoft, Adobe, Oracle, LinkedIn,
 * Salesforce, IBM, ...), so a company without a glyph gets `initials` instead and
 * the UI renders a monogram tile in the same slot.
 */
async function buildIcons() {
  let si;
  try {
    si = await import('simple-icons');
  } catch {
    log('  ! simple-icons not installed — every company will use a monogram');
    si = {};
  }

  const marks = {};
  let glyphs = 0;

  for (const c of COMPANIES) {
    const key = c.icon && 'si' + c.icon.charAt(0).toUpperCase() + c.icon.slice(1);
    const icon = key ? si[key] : null;

    if (c.icon && !icon) log(`  ! no simple-icons entry for "${c.icon}" (${c.slug})`);

    // Brand colors are chosen for their own backgrounds; on a light page the pale
    // ones (Snap yellow, Booking white) vanish. Darken anything too light to keep
    // the mark legible without abandoning the brand hue.
    let hex = icon?.hex ?? deriveHex(c.slug);
    if (luminance(hex) > 0.6) hex = darken(hex, 0.45);

    if (icon) glyphs++;
    marks[c.slug] = {
      hex: `#${hex}`,
      ...(icon ? { path: icon.path } : { initials: initialsFor(c.name) }),
    };
  }

  log(`  · ${glyphs} brand glyphs, ${COMPANIES.length - glyphs} monograms`);
  return marks;
}

/**
 * "Goldman Sachs" -> "GS", "IBM" -> "IBM", "Amazon" -> "A"
 *
 * Mixed-case pairs ("Am", "Mi", "Bl") read as truncated words rather than marks, so
 * a single-word name gets one capital and an existing acronym is left whole.
 */
function initialsFor(name) {
  const words = name
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const w = words[0] ?? '?';
  if (w === w.toUpperCase() && w.length <= 3) return w; // IBM, SAP, TCS
  return w[0].toUpperCase();
}

/** Stable, evenly-spread hue for companies with no brand glyph. */
function deriveHex(slug) {
  let h = 0;
  for (const ch of slug) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  // Fixed S/L keeps every monogram at comparable weight next to the real glyphs.
  const [r, g, b] = hslToRgb(hue / 360, 0.55, 0.38);
  return [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

/* -------------------------------------------------------------------- main */

async function main() {
  log('\nOA Prep Hub — data pipeline\n');

  log("[1/6] Fetching source repos");
  await ensureSources();
  await resolveSnapshotDates();

  log("\n[2/6] Parsing company lists");
  const records = [];
  const seenContent = new Set();
  for (const source of SOURCES) {
    const files = await locateCompanyFiles(source);
    let count = 0;
    let duplicates = 0;
    for (const f of files) {
      const parsed = await parseCompanyFile({ ...f, source }, seenContent);
      if (parsed === null) {
        duplicates++;
        continue;
      }
      records.push(...parsed);
      count += parsed.length;
    }
    const companies = new Set(files.map((f) => f.company.slug));
    const dup = duplicates ? `, ${duplicates} duplicate files skipped` : '';
    log(
      `  · ${source.id}: ${count} rows from ${files.length - duplicates}/${files.length} files across ${companies.size} companies${dup}`,
    );
  }
  log(`  total raw rows: ${records.length}`);

  log('\n[3/6] Fetching LeetCode catalog (public GraphQL, no auth)');
  const catalog = await fetchCatalog();
  const paidCount = [...catalog.values()].filter((q) => q.paidOnly).length;
  log(`  catalog: ${catalog.size} problems (${paidCount} premium-only)`);

  log('\n[4/6] Filtering premium problems + deduping');

  // Merge per (company, slug) first so the drop counts below are per unique problem.
  const merged = new Map();
  for (const r of records) {
    const key = `${r.company}::${r.leetcodeSlug}`;
    let entry = merged.get(key);
    if (!entry) {
      entry = {
        company: r.company,
        slug: r.leetcodeSlug,
        fallbackTitle: r.problemTitle,
        scores: [],
        sources: new Set(),
        bestPeriodDays: null,
        bestSnapshotDate: null,
      };
      merged.set(key, entry);
    }
    if (r.frequency != null) entry.scores.push(r.frequency);
    entry.sources.add(r.sourceId);
    // The narrowest period any source reported this problem under is the strongest
    // recency evidence available; a tie goes to whichever source snapshot is newer.
    if (r.periodDays != null && r.snapshotDate) {
      if (
        entry.bestPeriodDays == null ||
        r.periodDays < entry.bestPeriodDays ||
        (r.periodDays === entry.bestPeriodDays && r.snapshotDate > entry.bestSnapshotDate)
      ) {
        entry.bestPeriodDays = r.periodDays;
        entry.bestSnapshotDate = r.snapshotDate;
      }
    }
  }

  const stats = new Map(
    COMPANIES.map((c) => [c.slug, { kept: 0, droppedPaid: 0, droppedUnknown: 0 }]),
  );
  const companies = Object.fromEntries(COMPANIES.map((c) => [c.slug, []]));

  for (const entry of merged.values()) {
    const stat = stats.get(entry.company);
    const meta = catalog.get(entry.slug);

    if (!meta) {
      // Not in the public catalog at all (renamed, removed, or premium-gated out of
      // listings). We cannot prove it is free, so it does not ship.
      stat.droppedUnknown++;
      continue;
    }
    if (meta.paidOnly) {
      stat.droppedPaid++;
      continue;
    }

    stat.kept++;

    // A plain mean of the normalized scores rewards a problem that appears on one
    // list and happens to top it over a problem that appears on every list — it put
    // "Create Hello World Function" above "Number of Islands" for Google. Shrink each
    // mean toward zero by how much evidence backs it, so a problem has to show up
    // consistently to rank, not just show up strongly once.
    const n = entry.scores.length;
    const mean = n ? entry.scores.reduce((a, b) => a + b, 0) / n : 0;

    // "Asked around" is the midpoint of the narrowest period window on record,
    // anchored to that source's own snapshot date — e.g. a problem seen only on a
    // "Thirty Days" list pulled on the 1st is placed ~15 days before the 1st. It is
    // an estimate, not a real timestamp, so it's omitted rather than guessed when no
    // period-labeled source carries the problem.
    let asked = null;
    if (entry.bestPeriodDays != null) {
      const anchor = new Date(entry.bestSnapshotDate);
      anchor.setUTCDate(anchor.getUTCDate() - Math.round(entry.bestPeriodDays / 2));
      asked = anchor.toISOString().slice(0, 10);
    }

    companies[entry.company].push({
      title: meta.title || entry.fallbackTitle,
      slug: entry.slug,
      url: `https://leetcode.com/problems/${entry.slug}/`,
      difficulty: meta.difficulty,
      score: mean * (n / (n + CONFIDENCE_WEIGHT)),
      sources: entry.sources.size,
      ...(asked ? { asked } : {}),
    });
  }

  // Rescale each company's set so its most-asked problem is 100. Signal is explicitly
  // a within-company ranking, and shrinkage leaves raw scores on different footings
  // for a company with 40 source lists and one with 4.
  for (const list of Object.values(companies)) {
    const top = Math.max(0, ...list.map((p) => p.score));
    for (const p of list) {
      p.frequency = top > 0 ? Math.round((p.score / top) * 1000) / 10 : 0;
      delete p.score;
    }
  }

  const order = { Easy: 0, Medium: 1, Hard: 2 };
  for (const list of Object.values(companies)) {
    list.sort(
      (a, b) =>
        b.frequency - a.frequency ||
        (order[a.difficulty] ?? 3) - (order[b.difficulty] ?? 3) ||
        a.title.localeCompare(b.title),
    );
  }

  // Companies too thin to be worth a page are cut here rather than shipped empty.
  const shipped = COMPANIES.filter((c) => companies[c.slug].length >= MIN_PROBLEMS);
  const cut = COMPANIES.filter((c) => companies[c.slug].length < MIN_PROBLEMS);
  for (const c of cut) delete companies[c.slug];

  log('');
  log('  company                   kept   premium-dropped   unresolved');
  log('  ' + '-'.repeat(61));
  let totalKept = 0;
  let totalPaid = 0;
  let totalUnknown = 0;
  for (const c of shipped) {
    const s = stats.get(c.slug);
    totalKept += s.kept;
    totalPaid += s.droppedPaid;
    totalUnknown += s.droppedUnknown;
    log(
      `  ${c.name.padEnd(24)}${String(s.kept).padStart(5)}${String(s.droppedPaid).padStart(18)}${String(s.droppedUnknown).padStart(13)}`,
    );
  }
  log('  ' + '-'.repeat(61));
  log(
    `  ${`TOTAL (${shipped.length} companies)`.padEnd(24)}${String(totalKept).padStart(5)}${String(totalPaid).padStart(18)}${String(totalUnknown).padStart(13)}`,
  );
  if (cut.length) {
    log(
      `\n  skipped (under ${MIN_PROBLEMS} free problems): ` +
        cut.map((c) => `${c.name} (${stats.get(c.slug).kept})`).join(', '),
    );
  }

  const dated = Object.values(companies)
    .flat()
    .filter((p) => p.asked).length;
  log(`\n  "asked around" date estimated for ${dated} of ${totalKept} problems`);

  // Belt-and-braces: nothing premium may reach the frontend.
  const leaked = Object.values(companies)
    .flat()
    .filter((p) => catalog.get(p.slug)?.paidOnly !== false);
  if (leaked.length) {
    throw new Error(`premium filter failed — ${leaked.length} unverified problems in output`);
  }

  log('\n[5/6] Resolving company marks');
  const marks = await buildIcons();

  log('\n[6/6] Writing output');
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.mkdir(DATA_DIR, { recursive: true });

  // The problem set is ~1.9MB minified (~96KB brotli over the wire). It lives in
  // public/ and is fetched on demand rather than bundled, so the landing page
  // stays tiny — the app only needs meta.json to render the company grid.
  await fs.writeFile(path.join(DATA_DIR, 'companies.json'), JSON.stringify(companies));

  const meta = {
    generatedAt: new Date().toISOString(),
    totalProblems: totalKept,
    distinctProblems: new Set(
      Object.values(companies)
        .flat()
        .map((p) => p.slug),
    ).size,
    premiumFiltered: totalPaid,
    unresolvedFiltered: totalUnknown,
    catalogSize: catalog.size,
    companies: shipped.map((c) => ({
      slug: c.slug,
      name: c.name,
      count: companies[c.slug].length,
      easy: companies[c.slug].filter((p) => p.difficulty === 'Easy').length,
      medium: companies[c.slug].filter((p) => p.difficulty === 'Medium').length,
      hard: companies[c.slug].filter((p) => p.difficulty === 'Hard').length,
      mark: marks[c.slug],
    })),
    sources: SOURCES.map((s) => ({
      name: s.name,
      owner: s.owner,
      url: s.url,
      license: s.license,
    })),
  };
  await fs.writeFile(path.join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2) + '\n');

  log(`  · public/data/companies.json  (${totalKept} problems)`);
  log(`  · src/data/meta.json`);
  log(`\nDone. ${totalPaid} premium problems filtered out.\n`);
}

main().catch((err) => {
  console.error(`\nPipeline failed: ${err.message}\n`);
  process.exit(1);
});
