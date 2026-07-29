export default function TvBrand({ context = "TV" }) {
  return (
    <div className="tv-brand" aria-label={`Movie Bowl ${context}`}>
      <span className="tv-brand-mark" aria-hidden="true">
        MB
      </span>
      <span className="tv-brand-name">Movie Bowl</span>
      <span className="tv-brand-context">{context}</span>
    </div>
  );
}
