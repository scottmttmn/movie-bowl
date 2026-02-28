import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  hook: {
    streamingServices: [],
    setStreamingServices: vi.fn(),
    toggleService: vi.fn(),
    loading: false,
    saveStreamingServices: vi.fn(),
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
  };
});

import UserSettings from "../UserSettings";

describe("UserSettings", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.navigate.mockReset();
    mocks.hook.streamingServices = ["Netflix", "Hulu"];
    mocks.hook.setStreamingServices.mockReset();
    mocks.hook.toggleService.mockReset();
    mocks.hook.loading = false;
    mocks.hook.saveStreamingServices.mockReset();
    mocks.hook.saveStreamingServices.mockImplementation(async () => ({ error: null }));
  });

  afterEach(() => {
    cleanup();
  });

  it("shows loading state while streaming services are loading", () => {
    mocks.hook.loading = true;

    render(<UserSettings />);

    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("saves services and alerts on success", async () => {
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<UserSettings />);

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.hook.saveStreamingServices).toHaveBeenCalledWith(["Netflix", "Hulu"]);
      expect(alertSpy).toHaveBeenCalledWith("Saved");
    });
  });

  it("does not alert if saving fails", async () => {
    mocks.hook.saveStreamingServices.mockResolvedValue({ error: new Error("nope") });
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    render(<UserSettings />);

    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.hook.saveStreamingServices).toHaveBeenCalled();
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("supports search, selection shortcuts, reordering, removal, and back navigation", () => {
    render(<UserSettings />);

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "crunch" },
    });
    expect(screen.getByText("Crunchyroll")).toBeInTheDocument();
    expect(screen.queryByLabelText("streaming-service-netflix")).not.toBeInTheDocument();

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

  it("shows an empty state when search finds no services", () => {
    render(<UserSettings />);

    fireEvent.change(screen.getByPlaceholderText("Search services..."), {
      target: { value: "zzz" },
    });

    expect(screen.getByText("No matching services.")).toBeInTheDocument();
  });
});
