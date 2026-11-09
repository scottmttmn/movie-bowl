import ForkKnifeGlyph from "./ForkKnifeGlyph";

// A restaurant has no poster, so its card is the paper slip itself: the name
// as it was written, and the cuisine under it.
export default function RestaurantSlip({ slip, size = "card", className = "", style }) {
  const big = size === "big";
  return (
    <div
      className={`restaurant-slip ${big ? "restaurant-slip-big" : "h-40 w-28"} ${className}`}
      style={style}
    >
      <ForkKnifeGlyph className={big ? "h-7 w-7 text-rose-700/80" : "h-5 w-5 text-rose-700/80"} />
      <p className={`restaurant-slip-name ${big ? "text-xl sm:text-2xl" : "text-[0.95rem]"}`}>{slip.title}</p>
      {slip.cuisine && <span className="restaurant-slip-cuisine">{slip.cuisine}</span>}
    </div>
  );
}
