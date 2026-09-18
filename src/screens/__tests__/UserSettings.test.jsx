import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTOSAVE_DELAY_MS } from "../../hooks/useAutosave";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  locationHash: "",
  hook: {
    streamingServices: [],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredWebLaunch: false,
      theaterModeEnabled: false,
      theaterTrailerCount: 3,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    },
    removeFromBowlsOnSoloDraw: false,
    setStreamingServices: vi.fn(),
    setDefaultDrawSettings: vi.fn(),
    setRemoveFromBowlsOnSoloDraw: vi.fn(),
    toggleService: vi.fn(),
    loading: false,
    saveStreamingServices: vi.fn(),
    saveDefaultDrawSettings: vi.fn(),
    saveRemoveFromBowlsOnSoloDraw: vi.fn(),
  },
}));

vi.mock("../../hooks/useUserStreamingServices", () => ({
  default: () => mocks.hook,
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useLocation: () => ({ hash: mocks.locationHash }),
  };
});

import UserSettings from "../UserSettings";

function renderSettings() {
  return render(<UserSettings />);
}

describe("UserSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.navigate.mockReset();
    mocks.locationHash = "";
    mocks.hook.streamingServices = ["Netflix", "Hulu"];
    mocks.hook.defaultDrawSettings = {
      prioritizeStreaming: false,
      useStreamingRank: true,
      enablePreferredWebLaunch: false,
      theaterModeEnabled: false,
      theaterTrailerCount: 3,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    };
    mocks.hook.removeFromBowlsOnSoloDraw = false;
    mocks.hook.setStreamingServices.mockReset();
    mocks.hook.setDefaultDrawSettings.mockReset();
    mocks.hook.setRemoveFromBowlsOnSoloDraw.mockReset();
    mocks.hook.toggleService.mockReset();
    mocks.hook.loading = false;
    mocks.hook.saveStreamingServices.mockReset();
    mocks.hook.saveDefaultDrawSettings.mockReset();
    mocks.hook.saveRemoveFromBowlsOnSoloDraw.mockReset();
    mocks.hook.saveStreamingServices.mockImplementation(async () => ({ error: null }));
    mocks.hook.saveDefaultDrawSettings.mockImplementation(async () => ({ error: null }));
    mocks.hook.saveRemoveFromBowlsOnSoloDraw.mockImplementation(async () => ({ error: null }));
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  // Lets the debounced autosave fire and its save promise settle.
  const settleAutosave = async () => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + 50);
    });
  };

  it("shows loading state while streaming services are loading", () => {
    mocks.hook.loading = true;

    renderSettings();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("does not autosave the settings it just finished loading", async () => {
    vi.useFakeTimers();
    mocks.hook.loading = true;

    const { rerender } = renderSettings();

    mocks.hook.loading = false;
    mocks.hook.streamingServices = ["Netflix", "Hulu"];
    rerender(<UserSettings />);
    await settleAutosave();

    expect(mocks.hook.saveStreamingServices).not.toHaveBeenCalled();
    expect(mocks.hook.saveDefaultDrawSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Changes save automatically");
  });

  it("autosaves an edit and reports that it saved", async () => {
    vi.useFakeTimers();

    const { rerender } = renderSettings();

    mocks.hook.streamingServices = ["Netflix"];
    rerender(<UserSettings />);
    await settleAutosave();

    expect(mocks.hook.saveStreamingServices).toHaveBeenCalledWith(["Netflix"]);
    // Draw settings are untouched, so they are not rewritten.
    expect(mocks.hook.saveDefaultDrawSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
  });

  it("offers automatic removal on solo draws, off, with undo named", () => {
    renderSettings();

    const toggle = screen.getByLabelText("Remove movies from my bowls when I draw solo");
    expect(toggle).not.toBeChecked();
    expect(
      screen.getByText("Undo in watch history puts them back for two hours.")
    ).toBeInTheDocument();

    fireEvent.click(toggle);

    expect(mocks.hook.setRemoveFromBowlsOnSoloDraw).toHaveBeenCalledWith(true);
  });

  // It saves to its own column, so turning it on must not rewrite the draw
  // settings or the service list beside it.
  it("autosaves automatic removal on its own", async () => {
    vi.useFakeTimers();

    const { rerender } = renderSettings();

    mocks.hook.removeFromBowlsOnSoloDraw = true;
    rerender(<UserSettings />);
    await settleAutosave();

    expect(mocks.hook.saveRemoveFromBowlsOnSoloDraw).toHaveBeenCalledWith(true);
    expect(mocks.hook.saveDefaultDrawSettings).not.toHaveBeenCalled();
    expect(mocks.hook.saveStreamingServices).not.toHaveBeenCalled();
  });

  it("flushes a pending autosave when the page unmounts", async () => {
    vi.useFakeTimers();

    const { rerender, unmount } = renderSettings();

    mocks.hook.streamingServices = ["Netflix"];
    rerender(<UserSettings />);
    // Leave before the debounce elapses, the way Back does.
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.hook.saveStreamingServices).toHaveBeenCalledWith(["Netflix"]);
  });

  it("surfaces a failed autosave and saves again on retry", async () => {
    vi.useFakeTimers();
    mocks.hook.saveStreamingServices.mockResolvedValue({ error: new Error("network down") });

    const { rerender } = renderSettings();

    mocks.hook.streamingServices = ["Netflix"];
    rerender(<UserSettings />);
    await settleAutosave();

    expect(screen.getByRole("status")).toHaveTextContent("Couldn't save changes");
    expect(screen.getByRole("alert")).toHaveTextContent("network down");

    mocks.hook.saveStreamingServices.mockResolvedValue({ error: null });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /retry/i }));
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(mocks.hook.saveStreamingServices).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("status")).toHaveTextContent("All changes saved");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("supports search, selection shortcuts, reordering, removal, and back navigation", () => {
    renderSettings();

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "crunch" },
    });
    expect(screen.getByLabelText("Crunchyroll")).toBeInTheDocument();
    expect(screen.queryByLabelText("Netflix")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select all/i }));
    expect(mocks.hook.setStreamingServices).toHaveBeenCalledWith(
      expect.arrayContaining(["Netflix", "Hulu", "Crunchyroll"])
    );

    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(mocks.hook.setStreamingServices).toHaveBeenCalledWith([]);

    fireEvent.click(screen.getByRole("button", { name: /only major/i }));
    expect(mocks.hook.setStreamingServices).toHaveBeenCalledWith([
      "Netflix",
      "Hulu",
      "Disney+",
      "Prime Video",
      "Max",
      "Apple TV+",
      "Paramount+",
      "Peacock",
    ]);

    // Ranking and picking share one view, so reordering needs no mode switch.
    fireEvent.click(screen.getByRole("button", { name: /move hulu up/i }));
    expect(mocks.hook.setStreamingServices).toHaveBeenCalledWith(["Hulu", "Netflix"]);

    fireEvent.click(screen.getByRole("button", { name: /move netflix down/i }));
    expect(mocks.hook.setStreamingServices).toHaveBeenCalledWith(["Hulu", "Netflix"]);

    fireEvent.click(screen.getByRole("button", { name: /remove netflix/i }));
    expect(mocks.hook.toggleService).toHaveBeenCalledWith("Netflix");

    fireEvent.click(screen.getByLabelText("Crunchyroll"));
    expect(mocks.hook.toggleService).toHaveBeenCalledWith("Crunchyroll");

    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(mocks.navigate).toHaveBeenCalledWith(-1);
  });

  it("moves a service directly to any position without dragging", () => {
    mocks.hook.streamingServices = ["Netflix", "Hulu", "Disney+", "Max"];
    const { rerender } = renderSettings();

    fireEvent.change(screen.getByRole("combobox", { name: "Position of Max" }), {
      target: { value: "0" },
    });
    expect(mocks.hook.setStreamingServices).toHaveBeenLastCalledWith(["Max", "Netflix", "Hulu", "Disney+"]);
    mocks.hook.streamingServices = ["Max", "Netflix", "Hulu", "Disney+"];
    rerender(<UserSettings />);
    expect(screen.getByRole("combobox", { name: "Position of Max" })).toHaveValue("0");

    fireEvent.change(screen.getByRole("combobox", { name: "Position of Max" }), {
      target: { value: "3" },
    });
    expect(mocks.hook.setStreamingServices).toHaveBeenLastCalledWith(["Netflix", "Hulu", "Disney+", "Max"]);
  });

  it("summarizes each section in the header and links to it", () => {
    mocks.hook.defaultDrawSettings = {
      ...mocks.hook.defaultDrawSettings,
      prioritizeStreaming: true,
      useStreamingRank: true,
      theaterModeEnabled: true,
      theaterTrailerCount: 2,
    };

    renderSettings();

    const sectionNav = screen.getByRole("navigation", { name: /settings sections/i });
    const links = within(sectionNav).getAllByRole("link");

    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "#streaming-services",
      "#solo-draw",
      "#tv-playback",
    ]);
    expect(links[0]).toHaveTextContent("2 services");
    expect(links[0]).toHaveTextContent("Netflix first");
    expect(links[1]).toHaveTextContent("Copies stay in your bowls");
    expect(links[2]).toHaveTextContent("Theater mode on");
    expect(links[2]).toHaveTextContent("2 previews");
    expect(screen.queryByRole("heading", { name: "Draw filter defaults" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/default prioritize streaming services/i)).not.toBeInTheDocument();
  });

  it("prompts for a service before the streaming toggles can be used", () => {
    mocks.hook.streamingServices = [];

    renderSettings();

    expect(
      screen.getByText(/nothing picked yet\. choose services below/i)
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/enable preferred web launch/i)).toBeDisabled();
    expect(screen.getByText(/pick at least one service to turn this on/i)).toBeInTheDocument();
  });

  it("scrolls to the streaming section when linked to by hash", () => {
    mocks.locationHash = "#streaming-services";
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    renderSettings();

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it("resets only playback and leaves remembered filters and service ranking intact", () => {
    mocks.hook.defaultDrawSettings = {
      ...mocks.hook.defaultDrawSettings,
      prioritizeStreaming: true,
      useStreamingRank: false,
      selectedRatings: ["PG"],
      selectedGenres: ["Comedy"],
      runtimeMaxMinutes: 120,
      enablePreferredWebLaunch: true,
      theaterModeEnabled: true,
      theaterTrailerCount: 2,
    };
    renderSettings();
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(screen.getByRole("button", { name: "Reset playback" }));
    expect(mocks.hook.setDefaultDrawSettings).not.toHaveBeenCalled();
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset playback" }));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith({
      ...mocks.hook.defaultDrawSettings,
      enablePreferredWebLaunch: false,
      theaterModeEnabled: false,
      theaterTrailerCount: 3,
    });
    expect(mocks.hook.setStreamingServices).not.toHaveBeenCalled();
  });

  it("saves playback edits without sending any draw filter keys", async () => {
    vi.useFakeTimers();
    const { rerender } = renderSettings();
    fireEvent.click(screen.getByLabelText(/enable preferred web launch/i));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({ enablePreferredWebLaunch: true })
    );
    mocks.hook.defaultDrawSettings = {
      ...mocks.hook.defaultDrawSettings,
      enablePreferredWebLaunch: true,
      theaterModeEnabled: true,
      theaterTrailerCount: 2,
    };
    rerender(<UserSettings />);
    await settleAutosave();
    expect(mocks.hook.saveDefaultDrawSettings).toHaveBeenCalledExactlyOnceWith({
      enablePreferredWebLaunch: true,
      theaterModeEnabled: true,
      theaterTrailerCount: 2,
    });
    expect(mocks.hook.saveStreamingServices).not.toHaveBeenCalled();
  });

  it("shows an empty state when search finds no services", () => {
    renderSettings();

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No matching services.")).toBeInTheDocument();
  });
});
