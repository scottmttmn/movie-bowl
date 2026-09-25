import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { bowl: { starter_pack: null, starter_pack_installed_at: null }, movies: [], draws: [], error: null },
  installStarterPack: vi.fn(),
  removeStarterPack: vi.fn(),
  fetchStarterPackPeople: vi.fn(),
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
vi.mock("../../lib/starterPacks", async (importOriginal) => ({
  // The real read, against the mocked client above.
  readBowlStarterPack: (await importOriginal()).readBowlStarterPack,
  installStarterPack: mocks.installStarterPack,
  removeStarterPack: mocks.removeStarterPack,
  fetchStarterPackPeople: mocks.fetchStarterPackPeople,
  getStarterPackPhotoUrl: (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null),
}));

import StarterPackSection from "../StarterPackSection";

const packSlip = (tmdbId, slug = "spielberg-1980s") => ({ tmdb_id: tmdbId, starter_pack: slug });

beforeEach(() => {
  mocks.state = { bowl: { starter_pack: null, starter_pack_installed_at: null }, movies: [], draws: [], error: null };
  mocks.installStarterPack.mockReset();
  mocks.removeStarterPack.mockReset();
  mocks.fetchStarterPackPeople.mockReset().mockResolvedValue({ "Steven Spielberg": "/spielberg.jpg" });
});
afterEach(cleanup);

describe("StarterPackSection shelf", () => {
  it("shows one card per person with their photo, or a silhouette until there is one", async () => {
    const { container } = render(<StarterPackSection bowlId="bowl-1" isOwner />);
    const spielberg = await screen.findByRole("group", { name: "Steven Spielberg decades" });
    expect(within(spielberg).getAllByRole("button").map((button) => button.textContent)).toEqual(["'70s", "'80s", "'90s", "'00s"]);
    await waitFor(() => expect(container.querySelector('img[src="https://image.tmdb.org/t/p/w342/spielberg.jpg"]')).not.toBeNull());
    // Nobody else has a photo in this run, so nine cards have one image.
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Tom Hanks decades" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Best Picture decades" })).toBeInTheDocument();
  });

  it("says what a chosen pack puts in before anything is poured, and pours it", async () => {
    mocks.state.movies = [{ tmdb_id: 101, starter_pack: null }];
    mocks.state.draws = [{ tmdb_id: 202, starter_pack: null }];
    const onSummaryChange = vi.fn();
    mocks.installStarterPack.mockImplementation(async () => {
      mocks.state.bowl = { starter_pack: "spielberg-1980s", starter_pack_installed_at: "2026-09-24T18:00:00Z" };
      mocks.state.movies = [...mocks.state.movies, packSlip(301), packSlip(302)];
      return { ok: true, inserted: 2, message: "Added 2 titles from the Spielberg: The '80s pack." };
    });

    render(<StarterPackSection bowlId="bowl-1" isOwner onSummaryChange={onSummaryChange} />);
    const pour = await screen.findByRole("button", { name: /Pour into the bowl/ });
    expect(pour).toBeDisabled();
    expect(screen.getByText("Choose a decade above to see what goes in.")).toBeInTheDocument();
    await waitFor(() => expect(onSummaryChange).toHaveBeenCalledWith("None"));

    fireEvent.click(screen.getByRole("button", { name: "Spielberg: The '80s" }));
    expect(screen.getByRole("button", { name: "Spielberg: The '80s" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Up to 15 of the movies Steven Spielberg directed from 1980 to 1989/)).toBeInTheDocument();
    fireEvent.click(pour);

    expect(await screen.findByRole("status")).toHaveTextContent("Added 2 titles from the Spielberg: The '80s pack.");
    expect(mocks.installStarterPack).toHaveBeenCalledWith({
      bowlId: "bowl-1", slug: "spielberg-1980s", heldTmdbIds: [101, 202], packSlipCount: 0,
    });
    expect(await screen.findByRole("heading", { name: "Spielberg: The '80s" })).toBeInTheDocument();
    expect(screen.getByText("2 waiting in the bowl")).toBeInTheDocument();
    expect(onSummaryChange).toHaveBeenLastCalledWith("Spielberg: The '80s");
  });

  it("puts every Best Picture winner of a decade in, and says so", async () => {
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    const nineties = await screen.findByRole("button", { name: "Best Picture Winners: The '90s" });
    expect(nineties).toHaveTextContent("10 films");
    fireEvent.click(nineties);
    expect(screen.getByText(/All 10 Best Picture winners from 1990 to 1999/)).toBeInTheDocument();
  });

  it("names TMDB as the source of the photos and titles", async () => {
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("link", { name: "TMDB" })).toHaveAttribute("href", "https://www.themoviedb.org");
  });

  it("still shows the shelf when the photos cannot be loaded", async () => {
    mocks.fetchStarterPackPeople.mockResolvedValue({});
    const { container } = render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("group", { name: "Steven Spielberg decades" })).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
  });
});

describe("StarterPackSection installed", () => {
  it("shows the pack with its photo, what is waiting and what was drawn, and lets the owner pull more", async () => {
    mocks.state.bowl = { starter_pack: "spielberg-1980s", starter_pack_installed_at: "2026-09-24T18:00:00Z" };
    mocks.state.movies = [packSlip(1), packSlip(2), { tmdb_id: 3, starter_pack: null }];
    mocks.state.draws = [
      { tmdb_id: 4, starter_pack: "spielberg-1980s", removed_at: null },
      // Removed from the watched history: not counted as drawn, still never re-offered.
      { tmdb_id: 6, starter_pack: "spielberg-1980s", removed_at: "2026-09-25T00:00:00Z" },
      { tmdb_id: 5, starter_pack: null, removed_at: null },
    ];
    mocks.installStarterPack.mockResolvedValue({ ok: false, message: "Everything in the Spielberg: The '80s pack has already been in this bowl." });

    const { container } = render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("heading", { name: "Spielberg: The '80s" })).toBeInTheDocument();
    expect(screen.getByText("2 waiting in the bowl")).toBeInTheDocument();
    expect(screen.getByText("1 drawn so far")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "2 titles waiting, 1 drawn" })).toBeInTheDocument();
    expect(screen.getByText(/Poured in on/)).toBeInTheDocument();
    await waitFor(() => expect(container.querySelector('img[src$="/spielberg.jpg"]')).not.toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Pull more" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("has already been in this bowl");
    expect(mocks.installStarterPack).toHaveBeenCalledWith(expect.objectContaining({
      slug: "spielberg-1980s", packSlipCount: 2, heldTmdbIds: [1, 2, 3, 4, 6, 5],
    }));
  });

  it("removes the pack only after confirming", async () => {
    mocks.state.bowl = { starter_pack: "spielberg-1980s", starter_pack_installed_at: null };
    mocks.state.movies = [packSlip(1), packSlip(2)];
    mocks.removeStarterPack.mockImplementation(async () => {
      mocks.state.bowl = { starter_pack: null, starter_pack_installed_at: null };
      mocks.state.movies = [];
      return { ok: true, removed: 2, message: "Removed the pack and its 2 titles still in the bowl." };
    });

    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    fireEvent.click(await screen.findByRole("button", { name: "Remove this pack…" }));
    expect(mocks.removeStarterPack).not.toHaveBeenCalled();
    expect(screen.getByText(/Remove the Spielberg: The '80s pack and its 2 titles still waiting\?/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove pack" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Removed the pack and its 2 titles still in the bowl.");
    expect(mocks.removeStarterPack).toHaveBeenCalledWith({ bowlId: "bowl-1" });
    expect(await screen.findByRole("group", { name: "Best Picture decades" })).toBeInTheDocument();
  });

  it("stops offering more once the pack holds fifteen", async () => {
    mocks.state.bowl = { starter_pack: "spielberg-1980s", starter_pack_installed_at: null };
    mocks.state.movies = Array.from({ length: 15 }, (_, index) => packSlip(index + 1));
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("button", { name: "Pull more" })).toBeDisabled();
  });

  it("shows a Best Picture pack in its laurel rather than a photo", async () => {
    mocks.state.bowl = { starter_pack: "best-picture-1990s", starter_pack_installed_at: null };
    mocks.state.movies = [packSlip(1, "best-picture-1990s")];
    const { container } = render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("heading", { name: "Best Picture Winners: The '90s" })).toBeInTheDocument();
    expect(screen.getByText("Best Picture")).toBeInTheDocument();
    expect(container.querySelectorAll("img")).toHaveLength(0);
    // Nothing on this view shows a face, so no lookup is spent on one.
    expect(mocks.fetchStarterPackPeople).not.toHaveBeenCalled();
  });
});

describe("StarterPackSection for members and failures", () => {
  it("shows a member which pack is installed, and nothing to press", async () => {
    mocks.state.bowl = { starter_pack: "spielberg-1980s", starter_pack_installed_at: null };
    mocks.state.movies = [packSlip(1)];
    render(<StarterPackSection bowlId="bowl-1" isOwner={false} />);
    expect(await screen.findByText("1 waiting in the bowl")).toBeInTheDocument();
    expect(screen.getByText("Only the bowl owner can change the pack.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("tells a member when there is no pack, without offering the shelf", async () => {
    render(<StarterPackSection bowlId="bowl-1" isOwner={false} />);
    expect(await screen.findByText("This bowl has no starter pack.")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Best Picture decades" })).not.toBeInTheDocument();
    expect(mocks.fetchStarterPackPeople).not.toHaveBeenCalled();
  });

  it("says so when the bowl's pack cannot be read", async () => {
    mocks.state.error = { message: "boom" };
    render(<StarterPackSection bowlId="bowl-1" isOwner />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this bowl's starter pack.");
    expect(screen.queryByRole("button", { name: /Pour into the bowl/ })).not.toBeInTheDocument();
  });
});
