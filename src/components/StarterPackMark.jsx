import { getStarterPack } from "../utils/starterPacks";
import LaurelWreath from "./LaurelWreath";
import StarterPackPhoto from "./StarterPackPhoto";

// Where a watched card carries its contributor's initial, a pack title carries
// its pack: the person's face, or the laurel for Best Picture. The pack's name
// is the mark's accessible name, since nothing beside it says it.
export default function StarterPackMark({ movie, people = {} }) {
  const pack = getStarterPack(movie?.starter_pack);
  const name = String(movie?.added_by_name || pack?.name || "").trim();
  const label = name ? `From the ${name} pack` : "From the starter pack";
  const isBestPicture = pack?.kind === "best-picture";
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`starter-pack-mark ${isBestPicture ? "is-laurel" : ""}`}
    >
      {isBestPicture ? (
        <LaurelWreath className="h-[92%] w-[92%]" />
      ) : (
        <StarterPackPhoto profilePath={pack?.person ? people[pack.person] : null} width="w185" className="h-full w-full" />
      )}
    </span>
  );
}
