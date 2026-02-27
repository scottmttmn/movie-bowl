import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AddMovieButton from "../AddMovieButton";
import AddMovieModal from "../AddMovieModal";
import BowlCard from "../BowlCard";
import ContributionStats from "../ContributionStats";
import CreateBowlModal from "../CreateBowlModal";
import DrawButton from "../DrawButton";
import MovieSearch from "../MovieSearch";
import MyAddedMoviesStrip from "../MyAddedMoviesStrip";
import NewBowlButton from "../NewBowlButton";
import RemainingCount from "../RemainingCount";
import WatchedMovieCard from "../WatchedMovieCard";
import WatchedMoviesStrip from "../WatchedMoviesStrip";

describe("component smoke tests", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders AddMovieButton", () => {
    const onClick = vi.fn();
    render(<AddMovieButton onClick={onClick} />);

    const button = screen.getByRole("button", { name: /\+ add movie/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders AddMovieModal add mode", () => {
    render(<AddMovieModal onClose={vi.fn()} onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Add a movie")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
  });

  it("renders AddMovieModal drawn mode", () => {
    const movie = {
      title: "Dune",
      release_date: "2021-10-22",
      runtime: 155,
      poster_path: "/abc.jpg",
      streamingProviders: ["Netflix", "Prime Video"],
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByText("Dune (2021)")).toBeInTheDocument();
    expect(screen.getByText("Runtime: 155 minutes")).toBeInTheDocument();
    expect(screen.getByText("Available on")).toBeInTheDocument();
    expect(screen.getByText("Your services")).toBeInTheDocument();
    expect(screen.getByText("Netflix")).toBeInTheDocument();
  });

  it("shows custom badge in AddMovieModal for non-TMDB entries", () => {
    const movie = {
      title: "Wildcard",
      tmdb_id: null,
      release_date: null,
      runtime: null,
      streamingProviders: [],
    };

    render(<AddMovieModal movie={movie} onClose={vi.fn()} userStreamingServices={[]} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders detail primary action in AddMovieModal only when provided", () => {
    const movie = {
      title: "Movie A",
      release_date: "2024-01-01",
      runtime: 100,
      streamingProviders: [],
    };

    const onMove = vi.fn();
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

  it("renders BowlCard", () => {
    const onSelect = vi.fn();
    render(
      <BowlCard
        bowl={{ id: "b1", name: "Friday Bowl", remainingCount: 4, memberCount: 2, role: "Owner" }}
        onSelect={onSelect}
      />
    );

    fireEvent.click(screen.getByText("Friday Bowl"));
    expect(onSelect).toHaveBeenCalledWith("b1");
  });

  it("renders ContributionStats", () => {
    render(<ContributionStats stats={[{ member: "me@example.com", totalAdded: 3 }]} />);
    expect(screen.getByText("Contribution Stats")).toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders CreateBowlModal", () => {
    render(
      <CreateBowlModal
        isOpen
        bowlName="Friday Bowl"
        inviteEmails="friend@example.com"
        maxContributionLead="2"
        onChangeBowlName={vi.fn()}
        onChangeInviteEmails={vi.fn()}
        onChangeMaxContributionLead={vi.fn()}
        onCreate={vi.fn()}
        onClose={vi.fn()}
      />
    );

    expect(screen.getByText("Create New Bowl")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Friday Bowl")).toBeInTheDocument();
    expect(screen.getByDisplayValue("friend@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("2")).toBeInTheDocument();
  });

  it("renders DrawButton", () => {
    const onClick = vi.fn();
    render(<DrawButton onClick={onClick} disabled={false} />);
    const button = screen.getByRole("button", { name: /draw movie/i });
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders MovieSearch", () => {
    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={["Netflix"]} />);
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
  });

  it("renders NewBowlButton", () => {
    const onClick = vi.fn();
    render(<NewBowlButton onClick={onClick} />);
    fireEvent.click(screen.getByRole("button", { name: /\+ new bowl/i }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders MyAddedMoviesStrip", () => {
    const movies = [
      { id: "1", title: "Movie One", poster_path: "/one.jpg" },
      { id: "2", title: "Movie Two", poster_path: "/two.jpg" },
    ];
    render(<MyAddedMoviesStrip movies={movies} onViewMovie={vi.fn()} onDeleteMovie={vi.fn()} />);
    expect(screen.getByText("My Adds")).toBeInTheDocument();
    expect(screen.getByAltText("Movie One")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /details/i }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Custom").length).toBeGreaterThan(0);
  });

  it("renders RemainingCount", () => {
    render(<RemainingCount count={7} />);
    expect(screen.getByText("Remaining:")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("renders WatchedMovieCard", () => {
    render(<WatchedMovieCard movie={{ id: "w1", title: "Arrival", poster_path: "/arrival.jpg" }} />);
    expect(screen.getByAltText("Arrival")).toBeInTheDocument();
  });

  it("shows custom badge on watched custom entries", () => {
    render(<WatchedMovieCard movie={{ id: "w1", title: "Wildcard", tmdb_id: null }} />);
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders WatchedMoviesStrip", () => {
    const movies = [
      { id: "1", title: "Movie One", poster_path: "/one.jpg" },
      { id: "2", title: "Movie Two", poster_path: "/two.jpg" },
    ];
    render(<WatchedMoviesStrip movies={movies} />);
    expect(screen.getByAltText("Movie One")).toBeInTheDocument();
    expect(screen.getByAltText("Movie Two")).toBeInTheDocument();
  });
});
