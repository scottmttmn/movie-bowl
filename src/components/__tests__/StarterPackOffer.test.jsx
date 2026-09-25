import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readBowlStarterPack: vi.fn(),
  installStarterPack: vi.fn(),
  fetchStarterPackPeople: vi.fn(),
}));

vi.mock("../../lib/starterPacks", () => ({
  readBowlStarterPack: mocks.readBowlStarterPack,
  installStarterPack: mocks.installStarterPack,
  fetchStarterPackPeople: mocks.fetchStarterPackPeople,
  getStarterPackPhotoUrl: (path) => (path ? `https://image.tmdb.org/t/p/w342${path}` : null),
}));

import StarterPackOffer from "../StarterPackOffer";

const noPack = { isLoading: false, loadError: null, slug: null, heldTmdbIds: [7, 8] };

beforeEach(() => {
  mocks.readBowlStarterPack.mockReset().mockResolvedValue(noPack);
  mocks.installStarterPack.mockReset();
  mocks.fetchStarterPackPeople.mockReset().mockResolvedValue({ "Steven Spielberg": "/spielberg.jpg" });
});
afterEach(cleanup);

describe("StarterPackOffer", () => {
  it("offers three packs, says what one puts in, and pours it", async () => {
    const onInstalled = vi.fn();
    mocks.installStarterPack.mockResolvedValue({ ok: true, inserted: 12, message: "Added 12 titles." });
    const { container } = render(<StarterPackOffer bowlId="bowl-1" onSeeAll={vi.fn()} onInstalled={onInstalled} />);

    const suggestions = await screen.findByRole("group", { name: "Suggested starter packs" });
    expect(within(suggestions).getAllByRole("button").map((button) => button.getAttribute("aria-label"))).toEqual([
      "Spielberg: The '80s", "Best Picture Winners: The '90s", "Nolan: The '00s",
    ]);
    await waitFor(() => expect(container.querySelector('img[src$="/spielberg.jpg"]')).not.toBeNull());
    const pour = screen.getByRole("button", { name: "Pour into the bowl" });
    expect(pour).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Nolan: The '00s" }));
    expect(screen.getByRole("button", { name: "Nolan: The '00s" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/Up to 15 of the movies Christopher Nolan directed from 2000 to 2009/)).toBeInTheDocument();
    fireEvent.click(pour);

    await waitFor(() => expect(onInstalled).toHaveBeenCalledTimes(1));
    expect(mocks.installStarterPack).toHaveBeenCalledWith({
      bowlId: "bowl-1", slug: "nolan-2000s", heldTmdbIds: [7, 8], packSlipCount: 0,
    });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says why a pour failed and leaves the bowl as it was", async () => {
    const onInstalled = vi.fn();
    mocks.installStarterPack.mockResolvedValue({ ok: false, message: "Could not load that starter pack. Please try again." });
    render(<StarterPackOffer bowlId="bowl-1" onSeeAll={vi.fn()} onInstalled={onInstalled} />);
    fireEvent.click(await screen.findByRole("button", { name: "Best Picture Winners: The '90s" }));
    expect(screen.getByText(/All 10 Best Picture winners from 1990 to 1999/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pour into the bowl" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load that starter pack.");
    expect(onInstalled).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pour into the bowl" })).toBeEnabled();
  });

  it("opens the full shelf from See all", async () => {
    const onSeeAll = vi.fn();
    render(<StarterPackOffer bowlId="bowl-1" onSeeAll={onSeeAll} />);
    fireEvent.click(await screen.findByRole("button", { name: "See all" }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
  });

  it("points a bowl whose pack has run out back to that pack, without offering another", async () => {
    const onSeeAll = vi.fn();
    mocks.readBowlStarterPack.mockResolvedValue({ ...noPack, slug: "spielberg-1980s" });
    render(<StarterPackOffer bowlId="bowl-1" onSeeAll={onSeeAll} />);
    fireEvent.click(await screen.findByRole("button", { name: "Pull more from the Spielberg: The '80s pack" }));
    expect(onSeeAll).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("group", { name: "Suggested starter packs" })).not.toBeInTheDocument();
    expect(mocks.fetchStarterPackPeople).not.toHaveBeenCalled();
  });

  it("still points to the shelf when the bowl's pack cannot be read", async () => {
    mocks.readBowlStarterPack.mockResolvedValue({ ...noPack, loadError: "Could not load this bowl's starter pack." });
    render(<StarterPackOffer bowlId="bowl-1" onSeeAll={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Start with a starter pack" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Suggested starter packs" })).not.toBeInTheDocument();
    expect(mocks.fetchStarterPackPeople).not.toHaveBeenCalled();
  });
});
