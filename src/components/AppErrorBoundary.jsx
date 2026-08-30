import React from "react";
import { isStaleChunkError, reloadForNewBuild } from "../utils/appVersion";

// The floor under every screen. Without a boundary, one throw during render
// unmounts the whole tree and leaves a blank page with no way out but a manual
// refresh -- and the most common cause is not a bug at all, it is a deploy
// landing under an open tab so the route's chunk is gone. That case fixes
// itself with one reload, so take it. Everything else gets a sentence and a
// button, because a blank screen is never an acceptable resting state.
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isStaleBuild: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, isStaleBuild: isStaleChunkError(error) };
  }

  componentDidCatch(error) {
    console.error("[AppErrorBoundary] A screen failed to render", error);

    // If the reload is refused (already tried, or no storage to track it), the
    // rendered fallback below is what the user gets.
    if (isStaleChunkError(error)) reloadForNewBuild();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="page-container py-10">
        <div
          className="panel mx-auto max-w-lg space-y-4 text-center"
          role="alert"
          data-testid="app-error-boundary"
        >
          <p className="text-sm text-slate-300">
            {this.state.isStaleBuild
              ? "Movie Bowl was just updated. Reload to pick up the new version."
              : "Something went wrong loading this page."}
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload Movie Bowl
          </button>
        </div>
      </div>
    );
  }
}
