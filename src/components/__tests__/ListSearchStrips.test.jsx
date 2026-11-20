import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import MyMoviesStrip from "../MyMoviesStrip";
import WatchedMoviesStrip from "../WatchedMoviesStrip";

const TITLES = ["Heat", "Jaws", "Alien", "Aliens", "Fargo", "Brazil", "Zodiac", "Amélie", "Sicario"];

function slips(titles = TITLES) {
  return titles.map((title, index) => ({ id: `m${index}`, source: "added", title, poster_path: null }));
}

function watched(titles = TITLES) {
  return titles.map((title, index) => ({
    id: `w${index}`,
    drawEventId: `d${index}`,
    title,
    drawn_at: "2026-11-01T02:00:00.000Z",
  }));
}

function shownTitles(container) {
  return within(container)
    .queryAllByRole("button", { name: /^Details for / })
    .map((button) => button.getAttribute("aria-label").replace("Details for ", ""));
}

describe("searching a movie strip", () => {
  afterEach(() => {
    cleanup();
  });

  it("narrows My Movies to the query and shows a crossed magnifier when nothing matches", () => {
    const onQueryChange = vi.fn();
    const { container, rerender } = render(
      <MyMoviesStrip movies={slips()} isSearching query="ali" onQueryChange={onQueryChange} onCloseSearch={vi.fn()} />
    );

    expect(shownTitles(container)).toEqual(["Alien", "Aliens"]);
    expect(screen.getByRole("searchbox", { name: "Search my movies" })).toHaveFocus();
    fireEvent.change(screen.getByRole("searchbox", { name: "Search my movies" }), { target: { value: "ame" } });
    expect(onQueryChange).toHaveBeenCalledWith("ame");

    rerender(<MyMoviesStrip movies={slips()} isSearching query="xyz" onQueryChange={onQueryChange} onCloseSearch={vi.fn()} />);
    expect(shownTitles(container)).toEqual([]);
    expect(screen.getByRole("img", { name: "No matches" })).toBeInTheDocument();
  });

  it("closes My Movies' search with Escape or the cross, and shows everything when not searching", () => {
    const onCloseSearch = vi.fn();
    const { container, rerender } = render(
      <MyMoviesStrip movies={slips()} isSearching query="ali" onQueryChange={vi.fn()} onCloseSearch={onCloseSearch} />
    );

    fireEvent.keyDown(screen.getByRole("searchbox", { name: "Search my movies" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(onCloseSearch).toHaveBeenCalledTimes(2);

    // A query left behind does nothing once the search is closed.
    rerender(<MyMoviesStrip movies={slips()} isSearching={false} query="ali" />);
    expect(shownTitles(container)).toHaveLength(TITLES.length);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("offers the Watched magnifier only once the strip is long and open", () => {
    const { rerender } = render(<WatchedMoviesStrip movies={watched(TITLES.slice(0, 8))} onToggleExpanded={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Search watched movies" })).not.toBeInTheDocument();

    rerender(<WatchedMoviesStrip movies={watched()} isExpanded={false} onToggleExpanded={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Search watched movies" })).not.toBeInTheDocument();

    rerender(<WatchedMoviesStrip movies={watched()} onToggleExpanded={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Search watched movies" })).toBeInTheDocument();
  });

  it("searches Watched in place and puts the whole strip back when closed", () => {
    render(<WatchedMoviesStrip movies={watched()} onToggleExpanded={vi.fn()} />);
    const titles = () => screen.queryAllByText(/^(Heat|Jaws|Alien|Aliens|Fargo|Brazil|Zodiac|Amélie|Sicario)$/).map((node) => node.textContent);

    fireEvent.click(screen.getByRole("button", { name: "Search watched movies" }));
    const field = screen.getByRole("searchbox", { name: "Search watched movies" });
    expect(field).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Search watched movies" })).not.toBeInTheDocument();

    fireEvent.change(field, { target: { value: "AMEL" } });
    expect(new Set(titles())).toEqual(new Set(["Amélie"]));

    fireEvent.change(field, { target: { value: "nothing like it" } });
    expect(screen.getByRole("img", { name: "No matches" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close search" }));
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(new Set(titles())).toEqual(new Set(TITLES));
  });

  it("ends a Watched search when the strip is folded away", () => {
    const onToggleExpanded = vi.fn();
    render(<WatchedMoviesStrip movies={watched()} onToggleExpanded={onToggleExpanded} />);

    fireEvent.click(screen.getByRole("button", { name: "Search watched movies" }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "jaws" } });
    fireEvent.click(screen.getByRole("button", { name: /Watched/ }));

    expect(onToggleExpanded).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });
});
