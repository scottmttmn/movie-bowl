import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    pool: {
      rows: [],
      bowls: [],
      bowlIds: [],
      isLoading: false,
      errorMessage: "",
    },
    draw: {
      isDrawing: false,
      result: null,
      errorMessage: "",
      canRetrySave: false,
    },
  };

  return {
    state,
    reload: vi.fn(),
    draw: vi.fn(),
    retrySave: vi.fn(),
    dismissResult: vi.fn(),
    clearError: vi.fn(),
    runLookups: vi.fn(),
    poolStatus: { current: "unfiltered", poolCount: 0 },
  };
});

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: { user: { id: "user-1" } } }),
}));
vi.mock("../../hooks/useSoloDrawPool", () => ({
  default: () => ({ ...mocks.state.pool, reload: mocks.reload }),
}));
vi.mock("../../hooks/useSoloDraw", () => ({
  default: () => ({
    ...mocks.state.draw,
    draw: mocks.draw,
    retrySave: mocks.retrySave,
    dismissResult: mocks.dismissResult,
    clearError: mocks.clearError,
  }),
}));
vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => ({ streamingServices: [], defaultDrawSettings: {} }),
}));
vi.mock("../../hooks/useDrawPoolCount", () => ({
  default: () => ({
    status: mocks.poolStatus.current,
    poolCount: mocks.poolStatus.poolCount,
    runLookups: mocks.runLookups,
  }),
  DRAW_POOL_STATUS: {
    unfiltered: "unfiltered",
    manual: "manual",
    counting: "counting",
    ready: "ready",
  },
}));

import SoloDrawPage from "../SoloDrawPage";

function movie(id, bowlId) {
  return { id, bowl_id: bowlId, tmdb_id: 100, title: `Movie ${id}`, genres: [], runtime: 100 };
}

function renderPage(initialPath = "/solo-draw") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SoloDrawPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  mocks.state.pool = {
    rows: [movie("m1", "bowl-1"), movie("m2", "bowl-2")],
    bowls: [
      { id: "bowl-1", name: "First Bowl", titleCount: 1 },
      { id: "bowl-2", name: "Second Bowl", titleCount: 1 },
    ],
    bowlIds: ["bowl-1", "bowl-2"],
    isLoading: false,
    errorMessage: "",
  };
  mocks.state.draw = { isDrawing: false, result: null, errorMessage: "", canRetrySave: false };
  mocks.poolStatus.current = "unfiltered";
  mocks.poolStatus.poolCount = 0;
  mocks.draw.mockReset();
  mocks.retrySave.mockReset();
  mocks.reload.mockReset();
  mocks.runLookups.mockReset();
});

afterEach(cleanup);

describe("SoloDrawPage", () => {
  it("starts with every bowl from the personal surface", async () => {
    renderPage();

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("starts with one bowl when it came from that bowl's dashboard", async () => {
    renderPage("/solo-draw?bowl=bowl-2");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  });

  // A bowl you have left cannot narrow the scope to nothing.
  it("falls back to every bowl when the entry bowl is not yours", async () => {
    renderPage("/solo-draw?bowl=bowl-gone");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "First Bowl, 1 title" })).toHaveAttribute(
        "aria-pressed",
        "true"
      )
    );
    expect(screen.getByRole("button", { name: "Second Bowl, 1 title" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
  });

  it("draws from the selected scope only", () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Second Bowl, 1 title" }));
    fireEvent.click(screen.getByRole("button", { name: /hold to draw/i }));

    // The hold gesture is pointer-only; a click arrives as keyboard activation
    // and opens the confirm dialog instead of drawing.
    fireEvent.click(screen.getByRole("button", { name: "Draw" }));

    expect(mocks.draw).toHaveBeenCalledTimes(1);
    expect(mocks.draw.mock.calls[0][0].map((row) => row.id)).toEqual(["m1"]);
  });

  it("asks for a bowl when the scope is empty", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "First Bowl, 1 title" }));
    fireEvent.click(screen.getByRole("button", { name: "Second Bowl, 1 title" }));

    expect(screen.getByText("Choose at least one bowl.")).toBeInTheDocument();
  });

  it("points at adding a movie when there is nothing anywhere", () => {
    mocks.state.pool = { rows: [], bowls: [], bowlIds: [], isLoading: false, errorMessage: "" };
    renderPage();

    expect(
      screen.getByText("You have no movies to draw. Add a movie to a bowl to get started.")
    ).toBeInTheDocument();
  });

  it("offers Retry for a failed read rather than an empty pool", async () => {
    mocks.state.pool = {
      rows: [],
      bowls: [],
      bowlIds: [],
      isLoading: false,
      errorMessage: "Could not load your movies. Please try again.",
    };
    renderPage();

    expect(screen.queryByText(/no movies to draw/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.reload).toHaveBeenCalled();
  });

  it("waits for a tap before paying for lookups on a large pool", async () => {
    mocks.poolStatus.current = "manual";
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Check filter matches" }));
    expect(mocks.runLookups).toHaveBeenCalled();
  });

  it("retries a failed save instead of starting a new draw", async () => {
    mocks.state.draw = {
      isDrawing: false,
      result: null,
      errorMessage: "Could not save this draw. Please try again.",
      canRetrySave: true,
    };
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.retrySave).toHaveBeenCalled();
    expect(mocks.draw).not.toHaveBeenCalled();
  });

  // The draw is committed by the time it is on screen, so the reveal offers
  // nothing that would imply otherwise.
  it("reveals a committed pick with no acceptance or redraw controls", () => {
    mocks.state.draw = {
      isDrawing: false,
      result: { id: "m1", title: "Movie m1", tmdb_id: 100, watchEventId: "event-1" },
      errorMessage: "",
      canRetrySave: false,
    };
    renderPage();

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("Movie m1");
    expect(dialog).toHaveTextContent("Saved to your watch history.");
    expect(screen.queryByRole("button", { name: /keep|accept|draw again|redraw|remove/i })).toBeNull();
  });
});
