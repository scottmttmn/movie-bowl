import { configure } from "@testing-library/dom";
import "@testing-library/jest-dom/vitest";

// Testing Library gives waitFor/findBy 1000ms by default. Several dashboard
// tests wait on chained TMDB lookups feeding a derived count, and under the
// suite's two-worker parallelism that occasionally takes longer than a second
// on a loaded machine -- surfacing as a failure with the pre-update value still
// rendered. The extra headroom costs nothing on a green run and only delays how
// long a genuinely broken assertion takes to report.
// Kept well under vite.config.js's testTimeout so a wait that fails still
// reports its own assertion rather than being swallowed by the test budget.
configure({ asyncUtilTimeout: 5000 });
