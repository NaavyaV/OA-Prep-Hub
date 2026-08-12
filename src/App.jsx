import { useCallback, useEffect, useState } from 'react';
import meta from './data/meta.json';
import CompanyGrid from './components/CompanyGrid.jsx';
import ProblemList from './components/ProblemList.jsx';
import Footer from './components/Footer.jsx';

const companyBySlug = new Map(meta.companies.map((c) => [c.slug, c]));

/** Company views are addressable at #/google so they can be linked and shared. */
function slugFromHash() {
  const slug = window.location.hash.replace(/^#\/?/, '').trim();
  return companyBySlug.has(slug) ? slug : null;
}

export default function App() {
  const [activeSlug, setActiveSlug] = useState(slugFromHash);
  const [problems, setProblems] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const onHashChange = () => setActiveSlug(slugFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  // ~1.9MB of problems (~96KB brotli) — fetched on demand, not bundled, so the
  // landing page stays light. One fetch serves every company for the session.
  useEffect(() => {
    if (!activeSlug || problems || loadError) return;
    let cancelled = false;
    fetch(`${import.meta.env.BASE_URL}data/companies.json`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => !cancelled && setProblems(data))
      .catch((err) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [activeSlug, problems, loadError]);

  const openCompany = useCallback((slug) => {
    window.location.hash = `/${slug}`;
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '';
    window.scrollTo({ top: 0 });
  }, []);

  const company = activeSlug ? companyBySlug.get(activeSlug) : null;

  return (
    <div className="app">
      <header className="masthead">
        <a
          className="masthead-title"
          href="#/"
          onClick={(e) => {
            e.preventDefault();
            goHome();
          }}
        >
          BIGVIG&rsquo;S OA PREP HUB
        </a>
      </header>

      <main className="main">
        {company ? (
          <ProblemList
            company={company}
            problems={problems?.[company.slug]}
            error={loadError}
            onBack={goHome}
          />
        ) : (
          <CompanyGrid meta={meta} onSelect={openCompany} />
        )}
      </main>

      <Footer sources={meta.sources} generatedAt={meta.generatedAt} />
    </div>
  );
}
