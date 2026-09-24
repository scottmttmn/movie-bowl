import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { bowl: { starter_pack: null }, movies: [], draws: [], error: null },
  installStarterPack: vi.fn(),
  removeStarterPack: vi.fn(),
}));

vi.mock("../../lib/supabase", () => ({
  supabase: {
    from: vi.fn((table) => {
      const query = {
        select: () => query,
        eq: () => query,
        is: () => query,
        maybeSingle: async () => ({ data: mocks.state.bowl, error: mocks.state.error }),
        then: (resolve) => resolve({
          data: table === "bowl_movies" ? mocks.state.movies : mocks.state.draws,
          error: mocks.state.error,
        }),
      };
      return query;
    }),
  },
}));
vi.mock("../../lib/starterPacks", () => ({
  installStarterPack: mocks.installStarterPack,
  removeStarterPack: mocks.removeStarterPack,
}));

import StarterPackSection from "../StarterPackSection";

const packSlip = (tmdbId) => ({ tmdb_id: tmdbId, starter_pack: "nolan-2000s" });

beforeEach(() => {
  mocks.state = { bowl: { starter_pack: null }, movies: [], draws: [], error: null };
  mocks.installStarterPack.mockReset();
  mocks.removeStarterPack.mockReset();
});
afterEach(cleanup);

describe("StarterPackSection", () => {
  it("lets the owner choose a pack and add it, steering the sample away from titles the bowl has held", async () => {
    mocks.state.movies = [{ tmdb_id: 101, starter_pack: null }];
    mocks.state.draws = [{ tmdb_id: 202 }];
    const onSummaryChange = vi.fn();
    mocks.installStarterPack.mockImplementation(async () => {
      mocks.state.bowl = { starter_pack: "hitchcock-1950s" };
      mocks.state.movies = [...mocks.state.movies, packSlip(301), packSlip(302)];
      return { ok: true, inserted: 2, message: "Added 2 titles from the Hitchcock: The '50s pack." };
    });

    render(<StarterPackSection bowlId="bowl-1" isOwner onSummaryChange={onSummaryChange} />);
    const choice = await screen.findByLabelText("Pack");
    await waitFor(() => expect(onSummaryChange).toHaveBeenCalledWith("None"));
    fireEvent.change(choice, { target: { value: "hitchcock-1950s" } });
    fireEvent.click(screen.getByRole("button", { name: "Add pack" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Added 2 titles from the Hitchcock: The '50s pack.");
    expect(mocks.installStarterPack).toHaveBeenCalledWith({
      bowlId: "bowl-1", slug: "hitchcock-1950s", heldTmdbIds: [101, 202], packSlipCount: 0,
    });
    expect(await screen.findByText("2 of its titles are still in the bowl.")).toBeInTheDocument();
    expect(onSummaryChange).toHaveBeenLastCalledWith("Hitchcock: The '50s");
    // It names TMDB as the source of the titles.
    expect(screen.getByRole("link", { name: "TMDB" })).toHaveAttribute("href", "https://www.themoviedb.org");
  });

  it("lets the owner pull more, and remove the pack only after confirming", async () => {
    mocks.state.bowl = { starter_pack: "nolan-2000s" };
    mocks.state.movies = [packSlip(1), packSlip(2), { tmdb_id: 3, starter_pack: null }];
    mocks.installStarterPack.mockResolvedValue({ ok: false, message: "Everything in the Nolan: The '00s pack has already been in this bowl." });
    mocks.removeStarterPack.mockImplementation(async () => {
      mocks.state.bowl = { starter_pack: null };
      mocks.state.movies = [{ tmdb_id: 3, starter_pack: null }];
      return { ok: true, removed: 2, message: "Removed the pack and its 2 titles still in the bowl." };
    });

    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByText("Nolan: The '00s")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pull more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("has already been in this bowl");
    expect(mocks.installStarterPack).toHaveBeenCalledWith(expect.objectContaining({ slug: "nolan-2000s", packSlipCount: 2 }));

    fireEvent.click(screen.getByRole("button", { name: "Remove pack…" }));
    expect(mocks.removeStarterPack).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove the Nolan: The '00s pack and its 2 titles still in the bowl\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove pack" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Removed the pack and its 2 titles still in the bowl.");
    expect(mocks.removeStarterPack).toHaveBeenCalledWith({ bowlId: "bowl-1" });
    expect(await screen.findByLabelText("Pack")).toBeInTheDocument();
  });

  it("stops offering more once the pack fills its fifteen", async () => {
    mocks.state.bowl = { starter_pack: "nolan-2000s" };
    mocks.state.movies = Array.from({ length: 15 }, (_, index) => packSlip(index + 1));
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("button", { name: "Pull more" })).toBeDisabled();
  });

  it("shows a member which pack is installed, and nothing to press", async () => {
    mocks.state.bowl = { starter_pack: "nolan-2000s" };
    mocks.state.movies = [packSlip(1)];
    render(<StarterPackSection bowlId="bowl-1" isOwner={false} />);
    expect(await screen.findByText("1 of its titles is still in the bowl.")).toBeInTheDocument();
    expect(screen.getByText("Only the bowl owner can change this.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells a member when there is no pack, without offering one", async () => {
    render(<StarterPackSection bowlId="bowl-1" isOwner={false} />);
    expect(await screen.findByText("This bowl has no starter pack.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Pack")).not.toBeInTheDocument();
  });

  it("says so when the bowl's pack cannot be read", async () => {
    mocks.state.error = { message: "boom" };
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this bowl's starter pack.");
    expect(screen.queryByRole("button", { name: "Add pack" })).not.toBeInTheDocument();
  });
});
