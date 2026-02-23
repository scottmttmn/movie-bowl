export default function DrawAnimationModal() {
  return (
    <div className="draw-animation-overlay" role="status" aria-live="polite">
      <div className="draw-animation-stage">
        <div className="draw-bowl" />
        <div className="draw-slip" />
      </div>
      <p className="draw-animation-label">Drawing a title from the bowl...</p>
    </div>
  );
}
