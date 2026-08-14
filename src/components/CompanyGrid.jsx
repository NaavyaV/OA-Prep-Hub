import { useDeferredValue, useMemo, useState } from 'react';
import CompanyMark from './CompanyMark.jsx';

const nf = new Intl.NumberFormat('en-US');

export default function CompanyGrid({ meta, onSelect, profile }) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const companies = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return meta.companies;
    return meta.companies.filter((c) => c.name.toLowerCase().includes(q));
  }, [meta.companies, deferredQuery]);

  const stats = [
    { value: meta.companies.length, label: 'companies' },
    { value: meta.distinctProblems, label: 'problems' },
    { value: meta.totalProblems, label: 'listings' },
    { value: meta.sources.length, label: 'sources' },
  ];

  return (
    <>
      <section className="statband" aria-label="Dataset summary">
        {stats.map((s) => (
          <div className="stat-cell" key={s.label}>
            <span className="stat-value">{nf.format(s.value)}</span>
            <span className="stat-label">{s.label}</span>
          </div>
        ))}
      </section>

      <section className="grid-section" aria-labelledby="companies-heading">
        <div className="section-head">
          <h1 id="companies-heading" className="section-title">
            Companies
          </h1>
          <div className="search search-compact">
            <span className="search-icon" aria-hidden="true">
              /
            </span>
            <input
              className="search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search companies"
              aria-label="Search companies"
              autoComplete="off"
            />
          </div>
        </div>

        {companies.length === 0 ? (
          <p className="notice">No company matches “{query.trim()}”.</p>
        ) : (
          <ul className="company-grid">
            {companies.map((c) => (
              <li key={c.slug}>
                <button className="company-card" type="button" onClick={() => onSelect(c.slug)}>
                  <span className="company-id">
                    <CompanyMark mark={c.mark} />
                    <span className="company-name">{c.name}</span>
                  </span>

                  <span className="company-figures">
                    <span className="company-count">{nf.format(c.count)}</span>
                    {/* Widths are the real Easy/Medium/Hard split, so the bar reports
                        the shape of a company's set rather than decorating the card. */}
                    <span
                      className="ratio"
                      title={`${c.easy} easy · ${c.medium} medium · ${c.hard} hard`}
                    >
                      <span className="ratio-seg" data-level="Easy" style={{ flexGrow: c.easy }} />
                      <span
                        className="ratio-seg"
                        data-level="Medium"
                        style={{ flexGrow: c.medium }}
                      />
                      <span className="ratio-seg" data-level="Hard" style={{ flexGrow: c.hard }} />
                    </span>
                    <span className="company-progress-label">{profile ? 'Progress syncs on company view' : 'Connect profile'}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
