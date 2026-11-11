import FilmStripGlyph from "./FilmStripGlyph";
import ForkKnifeGlyph from "./ForkKnifeGlyph";
import { isRestaurantKind } from "../utils/restaurants";

// What a bowl's count is counted in: films, or places to eat.
export default function BowlCountGlyph({ kind, className = "h-4 w-4" }) {
  const Glyph = isRestaurantKind(kind) ? ForkKnifeGlyph : FilmStripGlyph;
  return <Glyph className={className} />;
}
