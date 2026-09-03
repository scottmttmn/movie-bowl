export default function TvBrand({ context }) {
  return (
    <div className="tv-brand" aria-label={context ? `Movie Bowl ${context}` : "Movie Bowl"}>
      <span className="tv-brand-mark" aria-hidden="true">
        MB
      </span>
      <span className="tv-brand-name">Movie Bowl</span>
      {context && <span className="tv-brand-context">{context}</span>}
    </div>
  );
}
