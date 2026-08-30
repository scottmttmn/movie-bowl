import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieModal from "../AddMovieModal";

describe("AddMovieModal", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders add mode with search input", () => {
    render(<AddMovieModal onClose={vi.fn()} onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Search Movies")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
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
    expect(screen.getByText("Dune (2021)")).toBeInTheDocument();
    expect(screen.getByText("Runtime: 155 minutes")).toBeInTheDocument();
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("Dad")).toBeInTheDocument();
    expect(screen.getByText("Available on")).toBeInTheDocument();
    expect(screen.getByText("Your services")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });

  it("falls back to the local-part of profiles.email for member-added movies", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      poster_path: "/abc.jpg",
      streamingProviders: ["Netflix"],
      profiles: {
        email: "scottmttmn@gmail.com",
      },
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Added by")).toBeInTheDocument();
    expect(screen.getByText("scottmttmn")).toBeInTheDocument();
  });

  it("hides the attribution block when there is no usable adder label", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      streamingProviders: ["Netflix"],
      profiles: {
        email: "not-an-email",
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

    const toggle = screen.getByRole("button", { name: /show trailer/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Dune trailer")).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole("button", { name: /hide trailer/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTitle("Dune trailer")).toHaveAttribute(
      "src",
      "https://www.youtube.com/embed/abc123"
    );

    fireEvent.click(screen.getByRole("button", { name: /hide trailer/i }));
    expect(screen.getByRole("button", { name: /show trailer/i })).toHaveAttribute("aria-expanded", "false");
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

    expect(screen.queryByRole("button", { name: /show trailer/i })).not.toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: /show trailer/i }));
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

    expect(screen.getByRole("button", { name: /show trailer/i })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTitle("Movie B trailer")).not.toBeInTheDocument();
  });

  it("attributes only direct links and never shows a TV voice card on the phone", () => {
    const props = { movie: { title: "Arrival" }, onClose: vi.fn() };
    const candidate = { serviceName: "Netflix", url: "https://www.netflix.com/title/123", linkType: "title" };
    const { rerender } = render(<AddMovieModal {...props} webLaunchCandidate={candidate} />);
    expect(screen.getByRole("link", { name: "Watchmode" })).toHaveAttribute("href", "https://www.watchmode.com/");
    expect(screen.queryByText(/hold the mic button/i)).not.toBeInTheDocument();
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
  });
});
