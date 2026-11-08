import ForkKnifeGlyph from "./ForkKnifeGlyph";

// The strip's card for a restaurant: the paper slip itself, since there is no
// poster to stand in for it.
export default function RestaurantSlip({ movie, size = "card" }) {
  const big = size === "big";
  return (
    <div className={`restaurant-slip ${big ? "restaurant-slip-big" : "h-40 w-28"}`}>
      <ForkKnifeGlyph className={big ? "h-7 w-7 text-rose-700/80" : "h-5 w-5 text-rose-700/80"} />
      <p className={`restaurant-slip-name ${big ? "text-xl sm:text-2xl" : "text-[0.95rem]"}`}>{movie.title}</p>
      {movie.cuisine && <span className="restaurant-slip-cuisine">{movie.cuisine}</span>}
    </div>
  );
}
