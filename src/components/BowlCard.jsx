import bowlImage from "../assets/movie-bowl.webp";
import FilmStripGlyph from "./FilmStripGlyph";
import HomeGlyph from "./HomeGlyph";
import PeopleGlyph from "./PeopleGlyph";

// One row per bowl: the bowl, its name, and two counts drawn as icons -- a
// film strip for titles left to draw, people for members -- with a chevron
// saying the row opens. The home bowl is marked here, never set here: the one
// command that moves it lives in the dashboard picker. Owner and member need
// no badge, because the section a row sits in already says which it is.
export default function BowlCard({ bowl, onSelect, isHome = false }) {
  const remaining = Number(bowl.remainingCount) || 0;
  const members = Number(bowl.memberCount) || 0;
  const label = [
    bowl.name,
    isHome ? "home bowl" : null,
    `${remaining} ${remaining === 1 ? "title" : "titles"} to draw`,
    `${members} ${members === 1 ? "member" : "members"}`,
  ].filter(Boolean).join(", ");

  return (
    <button
      type="button"
      aria-label={label}
      className="panel bowl-card group flex w-full items-center gap-3 p-3 text-left transition hover:border-slate-600 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-800/60"
      onClick={() => onSelect(bowl.id)}
    >
      <img src={bowlImage} alt="" aria-hidden="true" className="h-12 w-12 shrink-0 object-contain" />
      <span className="min-w-0 flex-1" aria-hidden="true">
        <span className="flex items-center gap-1.5">
          {isHome && <HomeGlyph className="h-4 w-4 shrink-0 text-slate-400" />}
          <span className="bowl-card-name truncate text-lg font-semibold text-slate-100">{bowl.name}</span>
        </span>
        <span className="mt-1 flex items-center gap-4 text-sm tabular-nums text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <FilmStripGlyph />
            {remaining}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <PeopleGlyph />
            {members}
          </span>
        </span>
      </span>
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-slate-300" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}
