import { configure } from "@testing-library/dom";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";

// vite.config.js does not set `globals`, so @testing-library/react registers
// no automatic cleanup of its own and every render stays mounted for the rest
// of the file. The failure that costs is not a red test: it is a query that
// should have been ambiguous quietly resolving against DOM an earlier test
// left behind, so the suite reports green for the wrong reason.
//
// Registered here rather than by turning `globals` on, so the reason is
// visible where the behaviour is set instead of being a side effect of a
// config flag.
afterEach(() => cleanup());

// Testing Library gives waitFor/findBy 1000ms by default. Several dashboard
// tests wait on chained TMDB lookups feeding a derived count, and under the
// suite's two-worker parallelism that occasionally takes longer than a second
// on a loaded machine -- surfacing as a failure with the pre-update value still
// rendered. The extra headroom costs nothing on a green run and only delays how
// long a genuinely broken assertion takes to report.
// Kept well under vite.config.js's testTimeout so a wait that fails still
// reports its own assertion rather than being swallowed by the test budget.
configure({ asyncUtilTimeout: 5000 });
