import movieBowlImage from "../assets/movie-bowl.webp";
import restaurantBowlImage from "../assets/restaurant-bowl.webp";
import ForkKnifeGlyph from "./ForkKnifeGlyph";
import { isRestaurantKind } from "../utils/restaurants";

// The bowl a bowl is drawn as in lists and pickers. A restaurant bowl is the
// same bowl in teal, so it stands apart from across a list, with a fork and
// knife on its corner that says what it holds up close. `className` sizes it.
export default function BowlArt({ kind, className = "h-9 w-9" }) {
  if (!isRestaurantKind(kind)) {
    return <img src={movieBowlImage} alt="" aria-hidden="true" className={`${className} object-contain`} />;
  }
  return (
    <span aria-hidden="true" data-bowl-kind="restaurants" className={`relative inline-block ${className}`}>
      <img src={restaurantBowlImage} alt="" className="h-full w-full object-contain" />
      <span className="absolute -bottom-0.5 -right-1 flex h-[46%] w-[46%] items-center justify-center rounded-full bg-amber-100 text-slate-900 ring-2 ring-slate-900">
        <ForkKnifeGlyph className="h-[68%] w-[68%]" />
      </span>
    </span>
  );
}
