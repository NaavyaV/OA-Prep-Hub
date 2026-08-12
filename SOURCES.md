# Sources & credits

OA Prep Hub does not collect any interview data of its own. Every company-to-problem
association shown on the site comes from the community-maintained repositories below.
All credit for that data belongs to their authors and contributors.

These credits are also rendered in the site footer, not just here.

## Company problem lists

| Repository | Author | License |
| --- | --- | --- |
| [LeetCode-Questions-CompanyWise](https://github.com/krishnadey30/LeetCode-Questions-CompanyWise) | [krishnadey30](https://github.com/krishnadey30) | No license file published |
| [leetcode-companywise-interview-questions](https://github.com/snehasishroy/leetcode-companywise-interview-questions) | [snehasishroy](https://github.com/snehasishroy) | No license file published |
| [Leetcode-Companys-wise-Question-and-Solution](https://github.com/ADHIL48/Leetcode-Companys-wise-Question-and-Solution) | [ADHIL48](https://github.com/ADHIL48) | No license file published |
| [leetcode-company-wise-problems](https://github.com/liquidslr/leetcode-company-wise-problems) | [liquidslr](https://github.com/liquidslr) | No license file published |
| [leetcode-company-wise-problems-2022](https://github.com/hxu296/leetcode-company-wise-problems-2022) | [hxu296](https://github.com/hxu296) | MIT |

**On licensing:** as of the last check, only `hxu296/leetcode-company-wise-problems-2022`
ships a license (MIT). The other four publish no `LICENSE` file and state no terms in
their READMEs. Under GitHub's terms those repositories are public and forkable, but
absent an explicit license no broader reuse grant is given. They are credited here by
name and link. If you are an author of one of these repositories and want your data
removed or credited differently, open an issue and it will be actioned.

### Repositories evaluated and excluded

Two further public repositories were checked and deliberately left out, because each is
a republication rather than an independent dataset. Counting a copy as a second source
would double-weight its rows in the frequency merge without adding any coverage:

| Repository | Why excluded |
| --- | --- |
| [singhsoumya0109/LeetCode-Company-Wise-Questions](https://github.com/singhsoumya0109/LeetCode-Company-Wise-Questions) | All 537 CSVs are byte-identical to krishnadey30's once CRLF/LF line endings are normalized. |
| [liquidslr/interview-company-wise-problems](https://github.com/liquidslr/interview-company-wise-problems) | Same 470 companies and same rows as liquidslr's other repository, minus the `Topics` column. |

`ADHIL48` and `liquidslr` do share a common ancestor — roughly half their files are
still identical — but each also carries rows the other lacks, so both are kept and the
overlap is removed per file by content hash during parsing. The last build skipped 251
duplicate files this way.

## Problem metadata

Titles, difficulties, and premium (`isPaidOnly`) status come from LeetCode's public
GraphQL endpoint (`https://leetcode.com/graphql`, `problemsetQuestionList`, no
authentication). This endpoint is used solely to:

1. Determine whether a problem is premium, so it can be **excluded**
2. Read the canonical title and difficulty, so the site does not display stale values

No problem statements, test cases, editorials, solutions, or discussion content are
fetched, stored, or displayed. Every problem links out to `leetcode.com` and is read
there.

OA Prep Hub is not affiliated with, endorsed by, or sponsored by LeetCode or any company
listed on the site. Company names are used descriptively to identify publicly reported
interview question sets.

## Company marks

Brand glyphs come from [simple-icons](https://github.com/simple-icons/simple-icons)
(CC0-1.0 for the icon data, MIT for the package). Paths are copied into
`src/data/meta.json` at build time and served from this site, so no image is ever
requested from a third-party host.

simple-icons has removed many large technology trademarks upstream, so roughly a third
of the companies here have no glyph available; those render a generated monogram
instead. Company logos and names are trademarks of their respective owners and are used
here only to identify the company whose question list is being shown.

## A note on the frequency signal

The source repositories express "frequency" on mutually incompatible scales — an
unbounded float, a `"100.0%"` string, a 0–100 float, and a raw occurrence count — and
most split their lists across overlapping time windows (30 days, 3 months, 6 months,
all-time).

The pipeline reconciles them in three steps:

1. **Normalize** each file to 0–1 against that file's own maximum, so every list
   contributes a within-list ranking rather than a raw number.
2. **Average** across every source and window a problem appears in.
3. **Shrink** that average toward zero by how much evidence backs it — a problem seen on
   `n` lists keeps `n / (n + 4)` of its score. Without this step a problem that appears
   on a single short list and happens to top it outranks one that appears on every list,
   which put *Create Hello World Function* above *Number of Islands* for Google.

The result is rescaled so each company's most-asked problem sits at 100. The **signal**
value is therefore a *relative, within-company* indicator of how prominently a problem
features in that company's aggregated lists. It is not an official LeetCode statistic
and should not be read as a probability that a given problem will appear on a given
assessment.

## A note on the "asked around" date

The nested and flat source layouts split a company's list across period buckets —
Thirty Days, Three Months, Six Months, and so on. Each source repo is fetched as a
shallow clone, so its most recent commit date stands in for "when this snapshot was
taken." A problem's date is the midpoint of the narrowest period bucket any source
carries it under, counted back from that source's snapshot date — e.g. a problem seen
only on a "Thirty Days" list pulled on the 1st is placed about 15 days before the 1st.

This is an estimate, not a timestamp LeetCode publishes, so it is shown as a relative
label ("3 weeks ago") and only for problems where a period-labeled source exists — the
last build could estimate a date for 7,874 of 16,882 listings. hxu296's data has no
period buckets at all, so problems found only there never get one.
