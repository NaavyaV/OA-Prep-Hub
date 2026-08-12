/**
 * A company's mark, sized to a square tile.
 *
 * Glyph paths are copied out of simple-icons at build time and live in meta.json,
 * so nothing here requests an image from a third party. simple-icons has dropped a
 * lot of large tech trademarks upstream, so roughly a third of the companies have
 * no glyph; those render a monogram in the same tile at the same weight, which
 * keeps the grid even instead of leaving holes where the big names should be.
 */
export default function CompanyMark({ mark, size = 30 }) {
  if (!mark) return null;

  return (
    <span className="mark" style={{ '--mark': mark.hex, '--mark-size': `${size}px` }}>
      {mark.path ? (
        <svg viewBox="0 0 24 24" width={size * 0.56} height={size * 0.56} aria-hidden="true">
          <path d={mark.path} fill="currentColor" />
        </svg>
      ) : (
        <span className="mark-initials" data-len={mark.initials.length} aria-hidden="true">
          {mark.initials}
        </span>
      )}
    </span>
  );
}
