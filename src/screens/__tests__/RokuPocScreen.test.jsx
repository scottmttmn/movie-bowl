import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import RokuPocScreen from "../RokuPocScreen";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

const mocks = vi.hoisted(() => ({
  searchTmdbMovies: vi.fn(),
  discoverRokus: vi.fn(),
  sendMovieToRoku: vi.fn(),
}));

vi.mock("../../lib/tmdbApi", () => ({
  searchTmdbMovies: mocks.searchTmdbMovies,
}));

vi.mock("../../lib/rokuApi", () => ({
  discoverRokus: mocks.discoverRokus,
  sendMovieToRoku: mocks.sendMovieToRoku,
}));

describe("RokuPocScreen", () => {
  beforeEach(() => {
    mocks.searchTmdbMovies.mockReset();
    mocks.discoverRokus.mockReset();
    mocks.sendMovieToRoku.mockReset();
    mocks.discoverRokus.mockResolvedValue({
      devices: [{ id: "roku-1", name: "Living Room Roku", ip: "192.168.1.20", port: 8060, model: "Roku Ultra" }],
      setupSteps: [],
      source: "discovery",
    });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  function renderScreen() {
    return render(
      <RokuDeviceProvider>
        <RokuPocScreen />
      </RokuDeviceProvider>
    );
  }

  it("renders discovered rokus and can send a movie", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 12, title: "Inception", release_date: "2010-07-16", poster_path: "/poster.jpg" }],
    });
    mocks.sendMovieToRoku.mockResolvedValue({
      ok: true,
      action: "opened-search",
      message: 'Opened Roku search for "Inception".',
      details: ["Used Roku remote keypresses to open search and type the title."],
    });

    renderScreen();

    await screen.findByText("Living Room Roku");

    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Inception" },
    });

    await screen.findByText("Inception");
    fireEvent.click(screen.getByRole("button", { name: "Send to Roku" }));

    await waitFor(() => {
      expect(mocks.sendMovieToRoku).toHaveBeenCalledWith({
        rokuIp: "192.168.1.20",
        title: "Inception",
        year: "2010",
        tmdbId: 12,
      });
    });

    expect(screen.getByText('Opened Roku search for "Inception".')).toBeInTheDocument();
  });

  it("validates a manual roku ip when discovery is empty", async () => {
    mocks.discoverRokus
      .mockResolvedValueOnce({
        devices: [],
        setupSteps: ["Use manual IP entry."],
        source: "discovery",
      })
      .mockResolvedValueOnce({
        devices: [{ id: "roku-2", name: "Bedroom Roku", ip: "192.168.1.45", port: 8060, model: "Roku Express" }],
        setupSteps: [],
        source: "manual",
      });

    renderScreen();

    await screen.findByText(/No Roku devices discovered yet/i);

    fireEvent.change(screen.getByLabelText("Manual Roku IP"), {
      target: { value: "192.168.1.45" },
    });
    fireEvent.click(screen.getByRole("button", { name: /validate roku/i }));

    await screen.findByText("Bedroom Roku");
    expect(mocks.discoverRokus).toHaveBeenLastCalledWith({ ip: "192.168.1.45" });
  });

  it("shows an actionable backend error", async () => {
    mocks.searchTmdbMovies.mockResolvedValue({
      results: [{ id: 13, title: "Dune", release_date: "2021-10-22", poster_path: "/dune.jpg" }],
    });
    mocks.sendMovieToRoku.mockRejectedValue(new Error("Could not reach that Roku on your local network."));

    renderScreen();

    await screen.findByText("Living Room Roku");
    fireEvent.change(screen.getByPlaceholderText("Search movies..."), {
      target: { value: "Dune" },
    });

    await screen.findByText("Dune");
    fireEvent.click(screen.getByRole("button", { name: "Send to Roku" }));

    await screen.findByText("Could not reach that Roku on your local network.");
    expect(screen.getByText(/Control by mobile apps is enabled/i)).toBeInTheDocument();
  });
});
