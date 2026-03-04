import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RokuDeviceProvider } from "../../context/RokuDeviceContext";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  locationHash: "",
  hook: {
    streamingServices: [],
    defaultDrawSettings: {
      prioritizeStreaming: false,
      useStreamingRank: true,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    },
    setStreamingServices: vi.fn(),
    setDefaultDrawSettings: vi.fn(),
    toggleService: vi.fn(),
    loading: false,
    saveStreamingServices: vi.fn(),
    saveDefaultDrawSettings: vi.fn(),
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
  return render(
    <RokuDeviceProvider>
      <UserSettings />
    </RokuDeviceProvider>
  );
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
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    };
    mocks.hook.setStreamingServices.mockReset();
    mocks.hook.setDefaultDrawSettings.mockReset();
    mocks.hook.toggleService.mockReset();
    mocks.hook.loading = false;
    mocks.hook.saveStreamingServices.mockReset();
    mocks.hook.saveDefaultDrawSettings.mockReset();
    mocks.hook.saveStreamingServices.mockImplementation(async () => ({ error: null }));
    mocks.hook.saveDefaultDrawSettings.mockImplementation(async () => ({ error: null }));
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state while streaming services are loading", () => {
    mocks.hook.loading = true;

    renderSettings();

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("saves services and alerts on success", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.hook.saveStreamingServices).toHaveBeenCalledWith(["Netflix", "Hulu"]);
      expect(mocks.hook.saveDefaultDrawSettings).toHaveBeenCalledWith(mocks.hook.defaultDrawSettings);
      expect(alertSpy).toHaveBeenCalledWith("Saved");
    });
  });

  it("does not alert if saving fails", async () => {
    mocks.hook.saveStreamingServices.mockResolvedValue({ error: new Error("nope") });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    renderSettings();

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.hook.saveStreamingServices).toHaveBeenCalled();
      expect(mocks.hook.saveDefaultDrawSettings).toHaveBeenCalled();
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("supports search, selection shortcuts, reordering, removal, and back navigation", () => {
    renderSettings();

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "crunch" },
    });
    expect(screen.getByText("Crunchyroll")).toBeInTheDocument();
    expect(screen.queryByLabelText("streaming-service-netflix")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /select all services/i }));
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

  it("updates default draw settings controls", () => {
    renderSettings();

    fireEvent.click(screen.getByLabelText(/default prioritize streaming services/i));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        prioritizeStreaming: true,
        useStreamingRank: true,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /edit ratings/i }));
    fireEvent.click(screen.getByLabelText(/default rating PG-13/i));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedRatings: ["G", "PG", "R", "NC-17"],
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /edit genres/i }));
    fireEvent.click(screen.getByRole("button", { name: /select all genres/i }));

    fireEvent.click(screen.getByLabelText(/default genre Action/i));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedGenres: expect.not.arrayContaining(["Action"]),
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /edit runtime/i }));

    fireEvent.change(screen.getByRole("spinbutton", { name: /default_draw_runtime_max/i }), {
      target: { value: "180" },
    });
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeMaxMinutes: 180,
      })
    );

    fireEvent.change(screen.getByRole("spinbutton", { name: /default_draw_runtime_min/i }), {
      target: { value: "90" },
    });
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        runtimeMinMinutes: 90,
      })
    );

    fireEvent.click(screen.getByRole("button", { name: /reset to defaults/i }));
    expect(mocks.hook.setDefaultDrawSettings).toHaveBeenCalledWith({
      prioritizeStreaming: false,
      useStreamingRank: true,
      selectedRatings: ["G", "PG", "PG-13", "R", "NC-17"],
      includeUnknownRatings: true,
      selectedGenres: null,
      includeUnknownGenres: true,
      runtimeMinMinutes: 0,
      runtimeMaxMinutes: 500,
      includeUnknownRuntime: true,
    });
  });

  it("shows an empty state when search finds no services", () => {
    renderSettings();

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No matching services.")).toBeInTheDocument();
  });
});
