import { STARTER_PACK_SUGGESTIONS, starterPackDecade } from "../utils/starterPacks";
import LaurelWreath from "./LaurelWreath";
import StarterPackPhoto from "./StarterPackPhoto";

// The three packs offered before anyone opens the full shelf -- on an empty
// bowl's dashboard, and in Bowl Settings while the bowl has no pack. One tap
// on a tile chooses that pack.
function SuggestionTile({ pack, profilePath, isSelected, disabled, onSelect }) {
  return (
    <button
      type="button"
      aria-pressed={isSelected}
      aria-label={pack.name}
      disabled={disabled}
      onClick={() => onSelect(pack.slug)}
      className={`flex min-w-0 flex-col overflow-hidden rounded-2xl border text-left transition ${
        isSelected
          ? "border-rose-400 bg-rose-950/30 shadow-[0_0_0_4px_rgba(244,63,94,0.14)]"
          : "border-slate-700/60 bg-slate-950/45 hover:border-slate-500"
      }`}
    >
      {pack.kind === "best-picture" ? (
        <span className="flex h-28 items-center justify-center bg-gradient-to-br from-yellow-950/60 to-slate-950">
          <span className="relative flex aspect-[76/58] w-full max-w-[84px] items-center justify-center">
            <LaurelWreath className="absolute inset-0 h-full w-full" />
            <span className="relative text-base font-extrabold text-amber-200">{starterPackDecade(pack)}</span>
          </span>
        </span>
      ) : (
        <span className="relative block">
          <StarterPackPhoto profilePath={profilePath} className="h-28" />
          <span className="starter-pack-slip absolute bottom-1.5 right-1.5 !px-2 !py-0.5 !text-sm" aria-hidden="true">
            the {starterPackDecade(pack)}
          </span>
        </span>
      )}
      <span className="px-2.5 py-2 text-xs font-bold leading-snug text-slate-100">
        {pack.kind === "best-picture" ? "Best Picture" : pack.person}
      </span>
    </button>
  );
}

export default function StarterPackSuggestions({ people = {}, selectedSlug, disabled, onSelect }) {
  return (
    <div role="group" aria-label="Suggested starter packs" className="grid grid-cols-3 gap-2 sm:gap-3">
      {STARTER_PACK_SUGGESTIONS.map((pack) => (
        <SuggestionTile
          key={pack.slug}
          pack={pack}
          profilePath={pack.person ? people[pack.person] : null}
          isSelected={pack.slug === selectedSlug}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
