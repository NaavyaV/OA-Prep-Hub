/**
 * Source credit is a requirement, not a nicety — these repos are the entire dataset.
 * The scope note stays too: it is the site's standing claim about what it does and
 * does not copy from LeetCode.
 */
export default function Footer({ sources, generatedAt }) {
  const built = generatedAt
    ? new Date(generatedAt).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <footer className="footer">
      <div className="footer-col">
        <h2 className="footer-title">Data sources</h2>
        <ul className="sources">
          {sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.owner}/{s.name}
              </a>
              <span className="source-license">{s.license}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="footer-col">
        <h2 className="footer-title">Scope</h2>
        <ul className="facts">
          <li>Free problems only — premium problems are filtered out before build.</li>
          <li>Titles, difficulty, and link only. No statements, tests, or editorials.</li>
          <li>Frequency is a merged relative signal, not an official LeetCode statistic.</li>
          <li>Not affiliated with LeetCode or any company listed.</li>
          {built && <li>Last built {built}.</li>}
        </ul>
      </div>
    </footer>
  );
}
