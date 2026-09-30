import bowlImage from "../assets/movie-bowl.webp";

// holdState comes from HoldToDrawButton: "holding" rattles the bowl harder as
// the fill grows, "tap" gives it one wobble.
export default function BowlIllustration({ className = "", drawTitle = "", isDrawing = false, holdState = "idle" }) {
  const holdClass = holdState === "holding" ? "is-holding" : holdState === "tap" ? "is-nudged" : "";
  return (
    <div
      aria-hidden="true"
      className={`bowl-illustration-stage ${isDrawing ? "is-drawing" : ""} ${holdClass} ${className}`}
    >
      <img
        src={bowlImage}
        alt=""
        className="bowl-illustration-image"
      />
      <span className="bowl-draw-pop-slip">
        <span className="bowl-draw-pop-fold bowl-draw-pop-fold-left" />
        <span className="bowl-draw-pop-fold bowl-draw-pop-fold-right" />
        <span className="bowl-draw-pop-title">{drawTitle || "Drawing..."}</span>
      </span>
    </div>
  );
}
