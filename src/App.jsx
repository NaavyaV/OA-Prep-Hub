import { useCallback, useEffect, useMemo, useState } from 'react';
import meta from './data/meta.json';
import CompanyGrid from './components/CompanyGrid.jsx';
import ProblemList from './components/ProblemList.jsx';
import Footer from './components/Footer.jsx';

const companyBySlug = new Map(meta.companies.map((c) => [c.slug, c]));
const USERNAME_COOKIE = 'oa_prep_leetcode_username';
const PROFILE_API = 'https://leetcode-api-faisalshohag.vercel.app';

function readUsername() {
  const entry = document.cookie.split('; ').find((item) => item.startsWith(`${USERNAME_COOKIE}=`));
  return entry ? decodeURIComponent(entry.split('=').slice(1).join('=')) : '';
}

function saveUsername(username) {
  document.cookie = `${USERNAME_COOKIE}=${encodeURIComponent(username)}; max-age=31536000; path=/; SameSite=Lax`;
}

function normalizeProfile(payload) {
  const rawSubmissions = payload.recentSubmissions ?? payload.recentSubmissionList ?? [];
  const submissions = Array.isArray(rawSubmissions) ? rawSubmissions : [];
  const accepted = new Set();
  const languages = new Map();

  submissions.forEach((submission) => {
    const slug = submission.titleSlug ?? submission.slug;
    if (!slug) return;
    if (submission.statusDisplay === 'Accepted' || submission.status === 'Accepted') accepted.add(slug);
    if (submission.lang) languages.set(slug, submission.lang);
  });

  return { accepted, languages, totalSolved: payload.totalSolved ?? payload.matchedUserStats?.acSubmissionNum?.[0]?.count ?? 0 };
}

/** Company views are addressable at #/google so they can be linked and shared. */
function slugFromHash() {
  const slug = window.location.hash.replace(/^#\/?/, '').trim();
  return companyBySlug.has(slug) ? slug : null;
}

export default function App() {
  const [activeSlug, setActiveSlug] = useState(slugFromHash);
  const [problems, setProblems] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [username, setUsername] = useState(readUsername);
  const [usernameInput, setUsernameInput] = useState(readUsername);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [showUsernameModal, setShowUsernameModal] = useState(!readUsername());

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

  useEffect(() => {
    if (!username) return;
    let cancelled = false;
    setProfileLoading(true);
    setProfileError(null);
    fetch(`${PROFILE_API}/${encodeURIComponent(username)}`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((payload) => {
        if (payload.errors?.length || payload.data?.matchedUser === null) throw new Error('That LeetCode username was not found.');
        if (!cancelled) setProfile(normalizeProfile(payload));
      })
      .catch((err) => !cancelled && setProfileError(err.message))
      .finally(() => !cancelled && setProfileLoading(false));
    return () => {
      cancelled = true;
    };
  }, [username]);

  const openCompany = useCallback((slug) => {
    window.location.hash = `/${slug}`;
    window.scrollTo({ top: 0 });
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = '';
    window.scrollTo({ top: 0 });
  }, []);

  const company = activeSlug ? companyBySlug.get(activeSlug) : null;
  const profileLabel = useMemo(() => (username ? `@${username}` : 'Connect LeetCode'), [username]);

  const submitUsername = (event) => {
    event.preventDefault();
    const next = usernameInput.trim();
    if (!next) return;
    saveUsername(next);
    setUsername(next);
    setProfile(null);
    setShowUsernameModal(false);
  };

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
        <button className="profile-button" type="button" onClick={() => { setUsernameInput(username); setShowUsernameModal(true); }}>
          <span className="profile-dot" data-connected={Boolean(username)} />
          {profileLabel}
        </button>
      </header>

      {(showUsernameModal || !username) && (
        <div className="username-layer" role="dialog" aria-modal="true" aria-labelledby="username-title">
          <form className="username-card" onSubmit={submitUsername}>
            <span className="eyebrow">PERSONAL PROGRESS</span>
            <h1 id="username-title">Connect your LeetCode profile.</h1>
            <p>See your recent accepted solutions, languages, and company progress in one place.</p>
            <label htmlFor="leetcode-username">LeetCode username</label>
            <input
              id="leetcode-username"
              value={usernameInput}
              onChange={(event) => setUsernameInput(event.target.value)}
              placeholder="e.g. neal"
              autoFocus
              required
            />
            <button className="username-submit" type="submit">Continue <span>→</span></button>
            {profileError && <p className="notice-error">{profileError}</p>}
          </form>
        </div>
      )}

      <main className="main">
        {company ? (
          <ProblemList
            company={company}
            problems={problems?.[company.slug]}
            error={loadError}
            onBack={goHome}
            profile={profile}
            profileLoading={profileLoading}
            profileError={profileError}
          />
        ) : (
          <CompanyGrid meta={meta} onSelect={openCompany} profile={profile} />
        )}
      </main>

      <Footer sources={meta.sources} generatedAt={meta.generatedAt} />
    </div>
  );
}
