export default function DrawAnimationModal() {
  return (
    <div className="draw-animation-overlay" role="status" aria-live="polite">
      <div className="draw-animation-stage">
        <div className="draw-bowl" />
        <div className="draw-slip draw-slip-back-left" />
        <div className="draw-slip draw-slip-back-right" />
        <div className="draw-slip draw-slip-front" />
        <div className="draw-spark draw-spark-left" />
        <div className="draw-spark draw-spark-right" />
      </div>
      <p className="draw-animation-label">Drawing a title from the bowl...</p>
    </div>
  );
}
