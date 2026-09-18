import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEffect, useState } from "react";
import AddMovieModal from "../AddMovieModal";

describe("AddMovieModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders add mode with search input", () => {
    render(<AddMovieModal onClose={vi.fn()} onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Search Movies")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Movie pin" })).not.toBeInTheDocument();
  });

  it("renders detail mode with movie metadata", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      poster_path: "/abc.jpg",
      streamingProviders: ["Netflix", "Prime Video"],
      added_by_name: "Dad",
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByRole("heading", { name: "Dune", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("155 min")).toBeInTheDocument();
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Where to watch" })).toBeInTheDocument();
    expect(screen.getByText("✓ Your services")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
    expect(screen.getAllByText("Netflix")).toHaveLength(1);
    expect(screen.getByText("Netflix")).toHaveTextContent("(in your services)");
    expect(screen.getByText("Prime Video")).not.toHaveTextContent("(in your services)");
    expect(screen.queryByRole("group", { name: "Movie pin" })).not.toBeInTheDocument();
  });

  it("hides where to watch when the caller opts out", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      streamingProviders: ["Netflix", "Prime Video"],
    };

    render(
      <AddMovieModal
        movie={movie}
        onClose={vi.fn()}
        userStreamingServices={["Netflix"]}
        showWhereToWatch={false}
      />
    );
    expect(screen.getByRole("heading", { name: "Dune", level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Where to watch" })).not.toBeInTheDocument();
    expect(screen.queryByText("Netflix")).not.toBeInTheDocument();
    expect(screen.queryByText("No US streaming providers found right now.")).not.toBeInTheDocument();
  });

  it("groups provider types without treating rent and buy as saved-service matches", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      streamingProviders: ["Netflix", "Kanopy", "Tubi"],
      streamingProviderLogos: { Netflix: "/netflix.jpg" },
      streamingAvailability: {
        subscription: [{ id: 8, name: "Netflix", logoPath: "/netflix.jpg" }],
        free: [{ id: 9, name: "Kanopy", logoPath: null }],
        ads: [{ id: 10, name: "Tubi", logoPath: null }],
        rent: [{ id: 2, name: "Apple TV", logoPath: "/apple.jpg" }],
        buy: [{ id: 3, name: "Amazon Video", logoPath: null }],
      },
      streamingWatchUrl: "https://www.themoviedb.org/movie/438631/watch",
      streamingProviderStatus: "ready",
    };

    render(
      <AddMovieModal
        movie={movie}
        onClose={vi.fn()}
        userStreamingServices={["Netflix", "Apple TV+"]}
      />
    );

    expect(screen.getByText("Included with subscription")).toBeInTheDocument();
    expect(screen.getByText("Free")).toBeInTheDocument();
    expect(screen.getByText("Free with ads")).toBeInTheDocument();
    expect(screen.getByText("Rent")).toBeInTheDocument();
    expect(screen.getByText("Buy")).toBeInTheDocument();
    expect(screen.getByText("Netflix").closest("li")).toHaveTextContent("(in your services)");
    expect(screen.getByText("Apple TV").closest("li")).not.toHaveTextContent("(in your services)");
    expect(screen.getByRole("link", { name: /see all watch options/i })).toHaveAttribute(
      "href",
      movie.streamingWatchUrl
    );
    expect(screen.getByRole("link", { name: "JustWatch" })).toBeInTheDocument();
  });

  it("distinguishes a provider failure from confirmed empty availability", () => {
    render(
      <AddMovieModal
        movie={{
          title: "Dune",
          streamingProviders: [],
          streamingProviderStatus: "failed",
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText(/Availability could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByText(/No US streaming providers found/i)).not.toBeInTheDocument();
  });

  it("shows exceptional status and exact regional release milestones", () => {
    render(
      <AddMovieModal
        movie={{
          title: "Future Movie",
          status: "Post Production",
          release_date: "2099-11-01",
          release_dates: {
            results: [{
              iso_3166_1: "US",
              release_dates: [
                { type: 3, release_date: "2099-10-23T00:00:00.000Z" },
                { type: 4, release_date: "2099-11-18T00:00:00.000Z" },
              ],
            }],
          },
          streamingProviders: [],
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Post-production")).toBeInTheDocument();
    expect(screen.getByText(/Theatrical Oct 23, 2099/)).toHaveTextContent(
      "Digital Nov 18, 2099"
    );
  });

  it("saves a pin without allowing duplicate requests and reflects the updated movie", async () => {
    let resolvePin;
    const onTogglePin = vi.fn(() => new Promise((resolve) => { resolvePin = resolve; }));
    const movie = { id: "movie-1", title: "Dune", is_pinned: false };
    const { rerender } = render(
      <AddMovieModal movie={movie} onClose={vi.fn()} onTogglePin={onTogglePin} />
    );

    expect(screen.getByText(/One pin per bowl/i)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Movie pin" })).toContainElement(screen.getByRole("button", { name: "Pin movie" }));
    expect(screen.queryByText("Your pin")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pin movie" }));
    expect(screen.getByRole("button", { name: "Saving pin..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Saving pin..." }));
    expect(onTogglePin).toHaveBeenCalledExactlyOnceWith(true);

    await act(async () => resolvePin({ ok: true }));
    rerender(
      <AddMovieModal movie={{ ...movie, is_pinned: true }} onClose={vi.fn()} onTogglePin={onTogglePin} />
    );
    expect(screen.getByRole("button", { name: "Unpin movie" })).toHaveAttribute("aria-pressed", "true");
    onTogglePin.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Unpin movie" }));
    await waitFor(() => expect(onTogglePin).toHaveBeenLastCalledWith(false));
  });

  it.each(["failure result", "rejection"])("keeps the pin unchanged and allows retry after a %s", async (failure) => {
    const onTogglePin = vi.fn();
    if (failure === "rejection") onTogglePin.mockRejectedValueOnce(new Error("Offline"));
    else onTogglePin.mockResolvedValueOnce({ ok: false, message: "Your pin could not be saved." });
    onTogglePin.mockResolvedValue({ ok: true });
    render(<AddMovieModal movie={{ id: "movie-1", title: "Dune", is_pinned: true }} onClose={vi.fn()} onTogglePin={onTogglePin} />);

    fireEvent.click(screen.getByRole("button", { name: "Unpin movie" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      failure === "rejection" ? "Could not update this pin. Please try again." : "Your pin could not be saved."
    );
    expect(screen.getByRole("button", { name: "Unpin movie" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Unpin movie" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Unpin movie" }));
    await waitFor(() => expect(onTogglePin).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains why a pin cannot be changed and prevents saving", () => {
    const onTogglePin = vi.fn();
    const reason = "This bowl draws title-first, so pins don't change anything here.";
    render(<AddMovieModal movie={{ title: "Dune", is_pinned: true }} onClose={vi.fn()} onTogglePin={onTogglePin} pinDisabledReason={reason} />);

    const button = screen.getByRole("button", { name: "Unpin movie" });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(reason);
    fireEvent.click(button);
    expect(onTogglePin).not.toHaveBeenCalled();
  });

  it("shows the member display name for member-added movies", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      poster_path: "/abc.jpg",
      streamingProviders: ["Netflix"],
      added_by: "scott-user-id",
      profiles: {
        display_name: "Scott",
      },
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("Scott")).toBeInTheDocument();
  });

  it("hides the attribution block when there is no usable adder label", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      streamingProviders: ["Netflix"],
      profiles: {
        display_name: "   ",
      },
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.queryByText("Added by")).not.toBeInTheDocument();
  });

  it("renders a plain-text multiline bowl comment and omits blank comments", () => {
    const movie = {
      id: "movie-1",
      title: "Dune",
      note: "Recommended at dinner.\nSave it for movie night.",
      streamingProviders: [],
    };
    const { rerender } = render(
      <AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={[]} />
    );

    expect(screen.getByText("Why it’s in the bowl")).toBeInTheDocument();
    const comment = screen.getByText(/Recommended at dinner/);
    expect(comment).toHaveClass("whitespace-pre-wrap");

    rerender(
      <AddMovieModal
        movie={{ ...movie, id: "movie-2", note: "   " }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );
    expect(screen.queryByText("Why it’s in the bowl")).not.toBeInTheDocument();
  });

  it("uses the personal heading for a manual history comment", () => {
    render(
      <AddMovieModal
        movie={{
          id: "history-1",
          source_kind: "manual",
          title: "Dune",
          note: "My favorite theater trip.",
          streamingProviders: [],
        }}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Your comment")).toBeInTheDocument();
    expect(screen.queryByText("Why it’s in the bowl")).not.toBeInTheDocument();
  });

  it("adds, cancels, and clears a comment without leaving an empty note card", async () => {
    const onEditNote = vi.fn(async (note) => ({ ok: true, movie: { note: note.trim() } }));
    render(<AddMovieModal movie={{ id: "1", title: "Dune" }} onClose={vi.fn()} onEditNote={onEditNote} />);

    expect(screen.queryByRole("region", { name: "Why it’s in the bowl" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /add a comment/i }));
    expect(screen.getByLabelText("Comment (optional)")).toHaveFocus();
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "Discard this" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onEditNote).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /add a comment/i }));
    expect(screen.getByLabelText("Comment (optional)")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "For movie night" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Comment" }));
    expect(await screen.findByText("For movie night", { selector: "p" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit Comment" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Save Comment" }));
    expect(await screen.findByRole("button", { name: /add a comment/i })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Why it’s in the bowl" })).not.toBeInTheDocument();
  });

  it("keeps a failed comment draft and announces the error before retrying", async () => {
    let finishSave;
    const onEditNote = vi.fn(() => new Promise((resolve) => { finishSave = resolve; }));
    render(<AddMovieModal movie={{ id: "1", title: "Dune", note: "Original note" }} onClose={vi.fn()} onEditNote={onEditNote} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Comment" }));
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: "Keep this draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save Comment" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => finishSave({ ok: false, message: "Could not save. Try again." }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save. Try again.");
    expect(screen.getByLabelText("Comment (optional)")).toHaveValue("Keep this draft");
    expect(screen.getByLabelText("Comment (optional)")).toHaveAttribute("aria-invalid", "true");

    onEditNote.mockResolvedValue({ ok: true });
    fireEvent.click(screen.getByRole("button", { name: "Save Comment" }));
    expect(await screen.findByText("Keep this draft", { selector: "p" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("falls back when a poster fails and tries the next movie's poster", () => {
    const props = { onClose: vi.fn(), onTogglePin: vi.fn() };
    const { rerender } = render(<AddMovieModal {...props} movie={{ id: 1, title: "Dune", poster_path: "/dune.jpg" }} />);
    fireEvent.error(screen.getByRole("img", { name: "Dune" }));
    expect(screen.getByRole("img", { name: "No poster for Dune" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pin movie" })).toBeEnabled();
    rerender(<AddMovieModal {...props} movie={{ id: 2, title: "Arrival", poster_path: "/arrival.jpg" }} />);
    expect(screen.getByRole("img", { name: "Arrival" })).toHaveAttribute("src", "https://image.tmdb.org/t/p/w500/arrival.jpg");
    expect(screen.queryByRole("img", { name: "No poster for Dune" })).not.toBeInTheDocument();
  });

  it("offers comment editing only when an edit action is supplied", async () => {
    const onEditNote = vi.fn(async (note) => ({
      ok: true,
      movie: { id: "movie-1", note: note.trim() },
    }));
    const movie = {
      id: "movie-1",
      title: "Dune",
      note: "Original comment",
      streamingProviders: [],
    };
    const { rerender } = render(
      <AddMovieModal
        movie={movie}
        onClose={vi.fn()}
        onEditNote={onEditNote}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /edit comment/i }));
    const input = screen.getByLabelText(/comment \(optional\)/i);
    fireEvent.change(input, { target: { value: "  Updated comment  " } });
    fireEvent.click(screen.getByRole("button", { name: /save comment/i }));

    await waitFor(() => {
      expect(onEditNote).toHaveBeenCalledWith("  Updated comment  ");
    });
    expect(screen.getByText("Updated comment")).toBeInTheDocument();

    rerender(<AddMovieModal movie={movie} onClose={vi.fn()} />);
    expect(screen.queryByRole("button", { name: /edit comment/i })).not.toBeInTheDocument();
  });

  it("renders a collapsed trailer toggle and expands inline trailer on demand", () => {
    render(
      <AddMovieModal
        movie={{
          title: "Dune",
          release_date: "2021-10-22",
          runtime: 155,
          streamingProviders: [],
          trailer: {
            site: "YouTube",
            key: "abc123",
            embedUrl: "https://www.youtube.com/embed/abc123",
          },
        }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    const toggle = screen.getByRole("button", { name: /watch trailer/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Dune trailer")).not.toBeInTheDocument();

    const playIcon = toggle.querySelector("svg").innerHTML;

    fireEvent.click(toggle);

    const hideToggle = screen.getByRole("button", { name: /hide trailer/i });
    expect(hideToggle).toHaveAttribute("aria-expanded", "true");
    // Hiding must not wear the play icon, or the two states read as one action.
    expect(hideToggle.querySelector("svg").innerHTML).not.toBe(playIcon);
    expect(screen.getByTitle("Dune trailer")).toHaveAttribute(
      "src",
      expect.stringContaining("https://www.youtube.com/embed/abc123")
    );

    fireEvent.click(screen.getByRole("button", { name: /hide trailer/i }));
    expect(screen.getByRole("button", { name: /watch trailer/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Dune trailer")).not.toBeInTheDocument();
  });

  it("shows custom badge for non-TMDB entries", () => {
    render(
      <AddMovieModal
        movie={{ title: "Wildcard", tmdb_id: null, streamingProviders: [] }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("does not render a trailer section when trailer data is missing", () => {
    render(
      <AddMovieModal
        movie={{ title: "Dune", release_date: "2021-10-22", runtime: 155, streamingProviders: [] }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    expect(screen.queryByRole("button", { name: /watch trailer/i })).not.toBeInTheDocument();
    expect(screen.queryByTitle("Dune trailer")).not.toBeInTheDocument();
  });

  it("does not render a stray zero when runtime is unknown", () => {
    render(
      <AddMovieModal
        movie={{
          title: "Narnia",
          release_date: "2026-12-25",
          runtime: 0,
          streamingProviders: [],
        }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/runtime:/i)).not.toBeInTheDocument();
  });

  it("does not show custom badge for TMDB search movies using id", () => {
    render(
      <AddMovieModal
        movie={{ id: 42, title: "The Answer", release_date: "2024-01-01", runtime: 110, streamingProviders: [] }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );
    expect(screen.queryByText("Custom")).not.toBeInTheDocument();
  });

  it("renders detail primary action only when provided", () => {
    const onMove = vi.fn();
    const movie = { title: "Movie A", release_date: "2024-01-01", runtime: 100, streamingProviders: [] };
    const { rerender } = render(
      <AddMovieModal
        movie={movie}
        onClose={vi.fn()}
        userStreamingServices={[]}
        detailPrimaryActionLabel="Move to Bowl"
        onDetailPrimaryAction={onMove}
      />
    );

    expect(screen.getByRole("button", { name: /move to bowl/i })).toBeInTheDocument();

    rerender(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={[]} />);
    expect(screen.queryByRole("button", { name: /move to bowl/i })).not.toBeInTheDocument();
  });

  it("closes on escape", () => {
    const onClose = vi.fn();
    render(
      <AddMovieModal
        movie={{ title: "Movie A", release_date: "2024-01-01", runtime: 100, streamingProviders: [] }}
        onClose={onClose}
        userStreamingServices={[]}
      />
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("resets trailer visibility when a different movie is shown", () => {
    const { rerender } = render(
      <AddMovieModal
        movie={{
          id: 1,
          title: "Movie A",
          release_date: "2024-01-01",
          trailer: {
            site: "YouTube",
            key: "movie-a-trailer",
            embedUrl: "https://www.youtube.com/embed/movie-a-trailer",
          },
          streamingProviders: [],
        }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /watch trailer/i }));
    expect(screen.getByTitle("Movie A trailer")).toBeInTheDocument();

    rerender(
      <AddMovieModal
        movie={{
          id: 2,
          title: "Movie B",
          release_date: "2024-01-01",
          trailer: {
            site: "YouTube",
            key: "movie-b-trailer",
            embedUrl: "https://www.youtube.com/embed/movie-b-trailer",
          },
          streamingProviders: [],
        }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    expect(screen.getByRole("button", { name: /watch trailer/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Movie B trailer")).not.toBeInTheDocument();
  });

  it("attributes only direct links", () => {
    const props = { movie: { title: "Arrival" }, onClose: vi.fn() };
    const candidate = { serviceName: "Netflix", url: "https://www.netflix.com/title/123", linkType: "title" };
    const { rerender } = render(<AddMovieModal {...props} webLaunchCandidate={candidate} />);
    expect(screen.getByRole("link", { name: "Watchmode" })).toHaveAttribute("href", "https://www.watchmode.com/");
    rerender(<AddMovieModal {...props} webLaunchCandidate={{ ...candidate, linkType: "search" }} />);
    expect(screen.queryByRole("link", { name: "Watchmode" })).not.toBeInTheDocument();
  });

  it("renders a secure new-tab link when a web launch candidate is provided", () => {
    render(
      <AddMovieModal
        movie={{ title: "Dune", release_date: "2021-10-22", runtime: 155, streamingProviders: ["Netflix"] }}
        onClose={vi.fn()}
        userStreamingServices={["Netflix"]}
        webLaunchCandidate={{ serviceName: "Netflix", url: "https://www.netflix.com/search?q=Dune%202021" }}
      />
    );

    const link = screen.getByRole("link", { name: /open on web in netflix.*opens in a new tab/i });
    expect(link).toHaveAttribute("href", "https://www.netflix.com/search?q=Dune%202021");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.querySelector("img")).toHaveAttribute(
      "src",
      "https://image.tmdb.org/t/p/w92/pbpMk2JmcoNnQwx5JGpXngfoWtp.jpg"
    );
  });
});

// The pane is painted before React gets to its effects, so there is a real
// moment in which it is on screen, tappable, and still carrying pending work.
// That window is where an opened trailer used to close itself again, and no
// act()-wrapped interaction can reach it -- act flushes the effects first. So
// these tests open the pane the way the app does, from a state change after a
// lookup rather than in a first render, and tap it from the very mutation that
// put it on screen: a MutationObserver callback is a microtask, still ahead of
// effects React schedules as a task.
function LatePane(props) {
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIsShown(true), 0);
    return () => clearTimeout(timer);
  }, []);

  return isShown ? <AddMovieModal {...props} /> : null;
}

describe("AddMovieModal in the instant it first appears", () => {
  let wasActEnvironment;

  beforeEach(() => {
    wasActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = wasActEnvironment;
    cleanup();
  });

  const tapAsItAppears = (name) =>
    new Promise((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const target = screen.queryByRole("button", { name });
        if (!target) return;
        observer.disconnect();
        target.click();
        resolve(target);
      });

      observer.observe(document.body, { childList: true, subtree: true });
      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`The pane never showed a ${name} button.`));
      }, 2000);
    });

  const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

  it("keeps a trailer opened before its effects have run", async () => {
    const tapped = tapAsItAppears(/watch trailer/i);

    render(
      <LatePane
        movie={{
          id: 101,
          title: "Dune",
          release_date: "2021-10-22",
          streamingProviders: [],
          trailer: {
            site: "YouTube",
            key: "abc123",
            embedUrl: "https://www.youtube.com/embed/abc123",
          },
        }}
        onClose={vi.fn()}
        userStreamingServices={[]}
      />
    );

    await tapped;
    await settle();

    expect(screen.getByRole("button", { name: /hide trailer/i })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    expect(screen.getByTitle("Dune trailer")).toBeInTheDocument();
  });

  it("keeps a comment begun before its effects have run", async () => {
    const tapped = tapAsItAppears(/add a comment/i);

    render(
      <LatePane
        movie={{ id: 101, title: "Dune", streamingProviders: [] }}
        onClose={vi.fn()}
        onEditNote={vi.fn()}
        userStreamingServices={[]}
      />
    );

    await tapped;
    await settle();

    expect(screen.getByLabelText("Comment (optional)")).toBeInTheDocument();
  });
});


describe("AddMovieModal when something is stacked over it", () => {
  const movie = { id: "m1", title: "Arrival", tmdb_id: 101 };

  afterEach(() => cleanup());

  it("stays in the accessibility tree and reachable by default", () => {
    render(<AddMovieModal movie={movie} onClose={vi.fn()} />);

    const overlay = screen.getByRole("dialog", { name: /arrival/i }).parentElement;
    expect(overlay).not.toHaveAttribute("aria-hidden");
    expect(overlay).not.toHaveAttribute("inert");
  });

  // The theater pre-roll plays over the reveal rather than replacing it. inert
  // is the half that matters: aria-hidden alone leaves "Open on Web" focusable
  // behind the overlay, where a stray Enter can still launch a provider.
  it("goes inert and out of the tree while a pre-roll covers it", () => {
    render(<AddMovieModal movie={movie} isObscured onClose={vi.fn()} />);

    const overlay = document.querySelector(".modal-overlay");
    expect(overlay).toHaveAttribute("aria-hidden", "true");
    expect(overlay).toHaveAttribute("inert");
  });

  // Escape exits the previews, not the reveal under them -- whichever of the
  // two window listeners happened to be attached first.
  it("leaves Escape to the pre-roll while covered", () => {
    const onClose = vi.fn();
    const { rerender } = render(<AddMovieModal movie={movie} isObscured onClose={onClose} />);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    rerender(<AddMovieModal movie={movie} onClose={onClose} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
