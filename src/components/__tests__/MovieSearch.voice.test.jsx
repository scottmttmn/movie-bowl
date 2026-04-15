import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
  getTmdbMovieDetails: mocks.getTmdbMovieDetails,
}));

vi.mock("../../lib/streamingProviders", () => ({
  fetchStreamingProviders: mocks.fetchStreamingProviders,
}));

describe("MovieSearch voice input", () => {
  let recognitionInstance;
  let startSpy;
  let stopSpy;
  let MockSpeechRecognition;

  beforeEach(() => {
    mocks.searchTmdbMovies.mockReset();
    mocks.getTmdbMovieDetails.mockReset();
    mocks.fetchStreamingProviders.mockReset();
    mocks.fetchStreamingProviders.mockResolvedValue({
      providers: [],
      region: "US",
      fetchedAt: null,
    });
    recognitionInstance = null;
    startSpy = vi.fn(function start() {
      this.onstart?.();
    });
    stopSpy = vi.fn(function stop() {
      this.onend?.();
    });

    MockSpeechRecognition = vi.fn(function MockSpeechRecognitionImpl() {
      recognitionInstance = this;
      this.start = startSpy;
      this.stop = stopSpy;
      this.onstart = null;
      this.onresult = null;
      this.onerror = null;
      this.onend = null;
      this.lang = "";
      this.interimResults = true;
      this.maxAlternatives = 0;
    });
  });

  afterEach(() => {
    cleanup();
    delete window.SpeechRecognition;
    delete window.webkitSpeechRecognition;
    vi.restoreAllMocks();
  });

  it("renders the mic when speech recognition is supported", () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    expect(screen.getByRole("button", { name: /start voice input/i })).toBeInTheDocument();
    expect(screen.getByText(/speak a movie title or type to search/i)).toBeInTheDocument();
  });

  it("hides the mic when speech recognition is unsupported", () => {
    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    expect(screen.queryByRole("button", { name: /voice input/i })).not.toBeInTheDocument();
  });

  it("starts and stops listening from the mic toggle", async () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/listening for a movie title/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));

    expect(stopSpy).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.queryByText(/listening/i)).not.toBeInTheDocument();
    });
  });

  it("fills the search input and auto-searches when speech ends automatically", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 101, title: "Jaws", release_date: "1975-06-20", poster_path: "/jaws.jpg" }],
    });

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    recognitionInstance.onresult?.({
      results: [
        { 0: { transcript: "partial query" }, isFinal: false },
        { 0: { transcript: "Jaws" }, isFinal: true },
      ],
    });
    recognitionInstance.onend?.();

    await waitFor(() => {
      expect(screen.getByDisplayValue("Jaws")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Jaws");
    });
    expect(screen.getByText('Searching for "Jaws"...')).toBeInTheDocument();
    expect(await screen.findByText("Jaws")).toBeInTheDocument();
  });

  it("auto-searches the final transcript when the user stops listening manually", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 102, title: "Alien", release_date: "1979-05-25", poster_path: "/alien.jpg" }],
    });

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    recognitionInstance.onresult?.({
      results: [{ 0: { transcript: "Alien" }, isFinal: true }],
    });

    fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Alien")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Alien");
    });
    expect(screen.getByText('Searching for "Alien"...')).toBeInTheDocument();
    expect(await screen.findByText("Alien")).toBeInTheDocument();
  });

  it("shows an inline error when recognition fails", async () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    recognitionInstance.onerror?.({ error: "not-allowed" });

    await waitFor(() => {
      expect(screen.getByText(/microphone access was blocked/i)).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText("Search movies...")).toBeInTheDocument();
  });

  it("stops recognition when the component unmounts", () => {
    window.SpeechRecognition = MockSpeechRecognition;

    const { unmount } = render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    unmount();

    expect(stopSpy).toHaveBeenCalled();
  });
});
