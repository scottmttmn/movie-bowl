import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MovieSearch from "../MovieSearch";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  getTmdbMovieDetails: vi.fn(),
  fetchStreamingProviders: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbPeople: vi.fn(async () => ({ people: [] })),
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
    expect(screen.getByText(/say a title or someone in it, or type to search/i)).toBeInTheDocument();
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
    expect(screen.getByText(/say a title or someone in it — pause to search/i)).toBeInTheDocument();

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
      expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Jaws", { page: 1 });
    });
    expect(screen.getByText('Searching for "Jaws"...')).toBeInTheDocument();
    expect(await screen.findByText("Jaws")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add Jaws" }));
    await waitFor(() => expect(screen.getByPlaceholderText("Movie title or person")).toHaveValue(""));
    expect(screen.queryByText('Searching for "Jaws"...')).not.toBeInTheDocument();
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
      expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Alien", { page: 1 });
    });
    expect(screen.getByText('Searching for "Alien"...')).toBeInTheDocument();
    expect(await screen.findByText("Alien")).toBeInTheDocument();
  });

  it("still searches what is typed after saying what the field already held", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 101, title: "Jaws", release_date: "1975-06-20" }],
    });
    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    const field = screen.getByPlaceholderText("Movie title or person");
    fireEvent.change(field, { target: { value: "Jaws" } });
    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Jaws", { page: 1 }));

    // Saying the same words leaves the field unchanged, so no change clears
    // the flag that stops the transcript from searching twice.
    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    recognitionInstance.onresult?.({ results: [{ 0: { transcript: "Jaws" }, isFinal: true }] });
    recognitionInstance.onend?.();
    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledTimes(2));

    fireEvent.change(field, { target: { value: "Jaws 2" } });
    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Jaws 2", { page: 1 }));
  });

  it("asks the recognizer for words as they are heard", () => {
    window.SpeechRecognition = MockSpeechRecognition;
    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    expect(recognitionInstance.interimResults).toBe(true);
  });

  it("shows words in the field while listening without searching until it ends", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 103, title: "Cast Away", release_date: "2000-12-22", poster_path: "/cast.jpg" }],
    });

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    const field = screen.getByRole("combobox");
    expect(field).toHaveAttribute("readonly");
    expect(field).toHaveAttribute("placeholder", "Listening…");
    expect(screen.getByText(/pause to search/i)).toBeInTheDocument();

    recognitionInstance.onresult?.({ results: [{ 0: { transcript: "cast" }, isFinal: false }] });
    await waitFor(() => expect(field).toHaveValue("cast"));
    recognitionInstance.onresult?.({ results: [{ 0: { transcript: "cast away" }, isFinal: false }] });
    await waitFor(() => expect(field).toHaveValue("cast away"));

    // Well past the typing debounce: interim words are never a query.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(mocks.searchTmdbMovies).not.toHaveBeenCalled();

    recognitionInstance.onresult?.({ results: [{ 0: { transcript: "Cast Away" }, isFinal: true }] });
    recognitionInstance.onend?.();

    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Cast Away", { page: 1 }));
    expect(mocks.searchTmdbMovies).toHaveBeenCalledTimes(1);
    expect(field).not.toHaveAttribute("readonly");
    expect(field).toHaveValue("Cast Away");
  });

  it("searches what it heard when recognition ends before anything is final", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    recognitionInstance.onresult?.({ results: [{ 0: { transcript: "shutter island" }, isFinal: false }] });
    fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));

    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("shutter island", { page: 1 }));
    expect(screen.getByRole("combobox")).toHaveValue("shutter island");
  });

  it("keeps interim words that follow the final ones when recognition ends", async () => {
    window.SpeechRecognition = MockSpeechRecognition;
    mocks.searchTmdbMovies.mockResolvedValue({ results: [] });

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));

    recognitionInstance.onresult?.({
      results: [
        { 0: { transcript: "Star" }, isFinal: true },
        { 0: { transcript: "Wars" }, isFinal: false },
      ],
    });
    recognitionInstance.onend?.();

    await waitFor(() => expect(mocks.searchTmdbMovies).toHaveBeenCalledWith("Star Wars", { page: 1 }));
  });

  it("shows sound bars in place of the search icon only while listening", async () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    expect(screen.queryByTestId("voice-wave")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    expect(screen.getByTestId("voice-wave")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));
    await waitFor(() => expect(screen.queryByTestId("voice-wave")).not.toBeInTheDocument());
  });

  it("does nothing when listening ends having heard nothing", async () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    fireEvent.click(screen.getByRole("button", { name: /stop voice input/i }));

    await waitFor(() => expect(screen.getByRole("combobox")).not.toHaveAttribute("readonly"));
    expect(screen.getByRole("combobox")).toHaveValue("");
    expect(mocks.searchTmdbMovies).not.toHaveBeenCalled();
  });

  it("shows an inline error when recognition fails", async () => {
    window.SpeechRecognition = MockSpeechRecognition;

    render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    recognitionInstance.onerror?.({ error: "not-allowed" });

    await waitFor(() => {
      expect(screen.getByText(/microphone access was blocked/i)).toBeInTheDocument();
    });
    // The field is read-only while listening; an error hands it back even if
    // the browser never follows up with onend.
    expect(screen.getByPlaceholderText("Movie title or person")).not.toHaveAttribute("readonly");
  });

  it("stops recognition when the component unmounts", () => {
    window.SpeechRecognition = MockSpeechRecognition;

    const { unmount } = render(<MovieSearch onAddMovie={vi.fn()} userStreamingServices={[]} />);

    fireEvent.click(screen.getByRole("button", { name: /start voice input/i }));
    unmount();

    expect(stopSpy).toHaveBeenCalled();
  });
});
