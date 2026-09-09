import bowlImage from "../../assets/movie-bowl.webp";

export default function TvBrand({ context }) {
  return (
    <div className="tv-brand" aria-label={context ? `Movie Bowl ${context}` : "Movie Bowl"}>
      <img className="tv-brand-mark" src={bowlImage} alt="" aria-hidden="true" />
      <span className="tv-brand-name">Movie Bowl</span>
      {context && <span className="tv-brand-context">{context}</span>}
    </div>
  );
}
