import bowlImage from "../assets/bowl-illustration-v3.png";

export default function BowlIllustration({ className = "", drawTitle = "", isDrawing = false }) {
  return (
    <div
      aria-hidden="true"
      className={`bowl-illustration-stage ${isDrawing ? "is-drawing" : ""} ${className}`}
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
