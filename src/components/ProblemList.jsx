import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import CompanyMark from './CompanyMark.jsx';

const nf = new Intl.NumberFormat('en-US');
const DIFFICULTIES = ['All', 'Easy', 'Medium', 'Hard'];
const PAGE = 100;

const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "asked" is a build-time estimate (see build-data.mjs), not a real timestamp, so
 * this is deliberately coarse — days for the first week, then weeks, months, years.
 */
function relativeFromISO(iso) {
  const then = new Date(`${iso}T00:00:00Z`);
  const days = Math.round((Date.now() - then.getTime()) / 86_400_000);
  if (days < 1) return 'today';
  if (days < 7) return rtf.format(-days, 'day');
  if (days < 31) return rtf.format(-Math.round(days / 7), 'week');
  if (days < 330) return rtf.format(-Math.round(days / 30), 'month');
  return rtf.format(-Math.round(days / 365), 'year');
}

export default function ProblemList({ company, problems, error, onBack }) {
  const [query, setQuery] = useState('');
  const [difficulty, setDifficulty] = useState('All');
  const [visible, setVisible] = useState(PAGE);

  // Typing stays responsive on Google's 2,000+ rows: the input updates immediately,
  // the (expensive) filtered list re-renders at a deferred priority.
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    setVisible(PAGE);
  }, [deferredQuery, difficulty, company.slug]);

  const filtered = useMemo(() => {
    if (!problems) return [];
    const q = deferredQuery.trim().toLowerCase();
    return problems.filter(
      (p) =>
        (difficulty === 'All' || p.difficulty === difficulty) &&
        (q === '' || p.title.toLowerCase().includes(q)),
    );
  }, [problems, deferredQuery, difficulty]);

  const counts = useMemo(() => {
    if (!problems) return null;
    return problems.reduce(
      (acc, p) => {
        acc[p.difficulty] = (acc[p.difficulty] ?? 0) + 1;
        return acc;
      },
      { Easy: 0, Medium: 0, Hard: 0 },
    );
  }, [problems]);

  return (
    <>
      <div className="crumb">
        <button className="back" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> All companies
        </button>
      </div>

      <header className="company-head">
        <div className="company-identity">
          <CompanyMark mark={company.mark} size={44} />
          <h1 className="company-title">{company.name}</h1>
        </div>
        {counts && (
          <p className="company-stats">
            <span className="stat">
              <b>{nf.format(company.count)}</b> problems
            </span>
            <span className="stat stat-easy">
              <b>{nf.format(counts.Easy)}</b> easy
            </span>
            <span className="stat stat-medium">
              <b>{nf.format(counts.Medium)}</b> medium
            </span>
            <span className="stat stat-hard">
              <b>{nf.format(counts.Hard)}</b> hard
            </span>
          </p>
        )}
      </header>

      <div className="controls">
        <div className="search">
          <span className="search-icon" aria-hidden="true">
            /
          </span>
          <input
            className="search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Filter ${company.name} problems by title`}
            aria-label={`Filter ${company.name} problems by title`}
            autoComplete="off"
          />
        </div>
        <div className="segmented" role="group" aria-label="Filter by difficulty">
          {DIFFICULTIES.map((level) => (
            <button
              key={level}
              type="button"
              className="segment"
              data-active={difficulty === level}
              data-level={level}
              aria-pressed={difficulty === level}
              onClick={() => setDifficulty(level)}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="notice notice-error">
          Could not load the problem set ({error}). Check your connection and reload.
        </p>
      )}

      {!problems && !error && <p className="notice">Loading {company.name}&rsquo;s problems…</p>}

      {problems && (
        <>
          <p className="list-count">
            {nf.format(filtered.length)}
            {filtered.length === 1 ? ' problem' : ' problems'}
            {filtered.length !== problems.length && ` of ${nf.format(problems.length)}`}
          </p>

          {filtered.length === 0 ? (
            <p className="notice">
              No problems match {query.trim() ? `“${query.trim()}”` : 'that filter'}. Try a different
              title or reset the difficulty.
            </p>
          ) : (
            <div className="table-wrap">
              <table className="problems">
                <thead>
                  <tr>
                    <th className="col-rank" scope="col">
                      #
                    </th>
                    <th className="col-signal" scope="col" title="Relative frequency signal, 0–100">
                      Signal
                    </th>
                    <th className="col-title" scope="col">
                      Title
                    </th>
                    <th className="col-difficulty" scope="col">
                      Difficulty
                    </th>
                    <th className="col-asked" scope="col" title="Estimated from source snapshot dates">
                      Asked
                    </th>
                    <th className="col-freq" scope="col">
                      Score
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, visible).map((p, i) => (
                    <tr key={p.slug}>
                      <td className="col-rank">{i + 1}</td>
                      <td className="col-signal">
                        <span className="signal" title={`Signal ${p.frequency} of 100`}>
                          <span
                            className="signal-bar"
                            style={{ width: `max(3px, ${p.frequency}%)` }}
                          />
                        </span>
                      </td>
                      <td className="col-title">
                        <a
                          className="problem-title"
                          href={p.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {p.title}
                          <span className="ext" aria-hidden="true">
                            ↗
                          </span>
                        </a>
                      </td>
                      <td className="col-difficulty">
                        <span className="difficulty-tab" data-level={p.difficulty}>
                          {p.difficulty}
                        </span>
                      </td>
                      <td className="col-asked">
                        {p.asked ? (
                          <span title={`Estimated ${p.asked}`}>{relativeFromISO(p.asked)}</span>
                        ) : (
                          <span className="na">N/A</span>
                        )}
                      </td>
                      <td className="col-freq">{p.frequency.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {visible < filtered.length && (
            <button className="more" type="button" onClick={() => setVisible((v) => v + PAGE * 5)}>
              Show more &mdash; {nf.format(filtered.length - visible)} remaining
            </button>
          )}
        </>
      )}
    </>
  );
}
