import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetchShared: vi.fn() }));

vi.mock("../../lib/watchHistoryShare", () => ({
  fetchSharedWatchHistory: mocks.fetchShared,
}));

import SharedWatchHistoryPage from "../SharedWatchHistoryPage";

function renderPage(token = "tok") {
  return render(
    <MemoryRouter initialEntries={[`/w/${token}`]}>
      <Routes>
        <Route path="/w/:token" element={<SharedWatchHistoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const ENTRIES = [
  { title: "Paris, Texas", release_date: "1984-05-19", watched_on: "2026-11-08", personal_note: "The phone booth scene.", poster_path: null },
  { title: "Local Hero", release_date: "1983-02-17", watched_on: "2026-11-06", personal_note: null, poster_path: null },
  { title: "Sabrina", release_date: "1954-09-22", watched_on: "2025-09-27", personal_note: null, poster_path: null },
];

beforeEach(() => mocks.fetchShared.mockReset());
afterEach(cleanup);

describe("SharedWatchHistoryPage", () => {
  it("shows the owner's calendar for the newest year, by day", async () => {
    mocks.fetchShared.mockResolvedValue({ status: "ready", displayName: "Scott", includeComments: false, entries: ENTRIES });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Scott’s movies" })).toBeInTheDocument();
    expect(mocks.fetchShared).toHaveBeenCalledWith("tok");
    expect(screen.getByRole("heading", { name: "Paris, Texas" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Local Hero" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sabrina" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Year watched" })).toHaveValue("2026");
    expect(screen.getByText("(1984)")).toBeInTheDocument();
    // Comments are off for this link, even where the entry carries one.
    expect(screen.queryByText("The phone booth scene.")).toBeNull();
    // Read-only: nothing to tap on a movie.
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the owner's comments when they chose to share them", async () => {
    mocks.fetchShared.mockResolvedValue({ status: "ready", displayName: "Scott", includeComments: true, entries: ENTRIES });
    renderPage();
    expect(await screen.findByText("The phone booth scene.")).toBeInTheDocument();
  });

  it("falls back to a plain title when the owner has no name", async () => {
    mocks.fetchShared.mockResolvedValue({ status: "ready", displayName: "", includeComments: false, entries: [] });
    renderPage();
    expect(await screen.findByRole("heading", { name: "Watch History" })).toBeInTheDocument();
    expect(screen.getByText("Nothing watched yet.")).toBeInTheDocument();
  });

  it("says a turned-off link is off", async () => {
    mocks.fetchShared.mockResolvedValue({ status: "off" });
    renderPage();
    expect(await screen.findByText("This link is off")).toBeInTheDocument();
  });

  it("says when the page could not load", async () => {
    mocks.fetchShared.mockResolvedValue({ status: "error" });
    renderPage();
    expect(await screen.findByText(/Could not load this page/)).toBeInTheDocument();
  });
});
