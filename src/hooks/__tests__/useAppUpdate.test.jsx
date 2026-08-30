import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  state: { deployedBuildId: "", currentBuildId: "running-sha", canCheck: true },
  reloadForNewBuild: vi.fn(() => true),
  fetchDeployedBuildId: vi.fn(),
}));

vi.mock("../../utils/appVersion", () => ({
  get APP_BUILD_ID() {
    return mocks.state.currentBuildId;
  },
  get CAN_CHECK_FOR_UPDATES() {
    return mocks.state.canCheck;
  },
  fetchDeployedBuildId: mocks.fetchDeployedBuildId,
  isNewBuildId: (deployedBuildId, currentBuildId) =>
    Boolean(deployedBuildId) &&
    Boolean(currentBuildId) &&
    deployedBuildId !== currentBuildId,
  reloadForNewBuild: mocks.reloadForNewBuild,
}));

const useAppUpdate = (await import("../useAppUpdate")).default;
const UpdateBanner = (await import("../../components/UpdateBanner")).default;

// Mirrors how AppShell wires the two together.
function Harness() {
  const { updateReady } = useAppUpdate();
  return updateReady ? <UpdateBanner /> : null;
}

const POLL_INTERVAL_MS = 15 * 60 * 1000;
const HIDDEN_BEFORE_AUTO_RELOAD_MS = 60 * 1000;

function setVisibility(value) {
  vi.spyOn(document, "visibilityState", "get").mockReturnValue(value);
  act(() => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  mocks.state.deployedBuildId = "";
  mocks.state.currentBuildId = "running-sha";
  mocks.state.canCheck = true;
  mocks.reloadForNewBuild.mockClear();
  mocks.fetchDeployedBuildId.mockReset();
  mocks.fetchDeployedBuildId.mockImplementation(
    async () => mocks.state.deployedBuildId
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("useAppUpdate", () => {
  it("stays out of the way while the tab is running the deployed build", async () => {
    mocks.state.deployedBuildId = "running-sha";

    render(<Harness />);

    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();
    expect(mocks.reloadForNewBuild).not.toHaveBeenCalled();
  });

  it("does not poll a dev server that publishes no manifest", async () => {
    mocks.state.canCheck = false;
    mocks.state.deployedBuildId = "shipped-sha";

    render(<Harness />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(mocks.fetchDeployedBuildId).not.toHaveBeenCalled();
    expect(screen.queryByTestId("update-banner")).not.toBeInTheDocument();
  });

  it("reloads on load when the document came back stale from cache", async () => {
    mocks.state.deployedBuildId = "shipped-sha";

    render(<Harness />);

    await waitFor(() => expect(mocks.reloadForNewBuild).toHaveBeenCalledTimes(1));
  });

  it("only offers the update when a deploy lands mid-session", async () => {
    mocks.state.deployedBuildId = "running-sha";
    render(<Harness />);
    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());

    mocks.state.deployedBuildId = "shipped-sha";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    expect(await screen.findByTestId("update-banner")).toHaveTextContent(
      "A new version of Movie Bowl is ready."
    );
    // Nobody asked to be interrupted mid-task, so the reload waits for the tap.
    expect(mocks.reloadForNewBuild).not.toHaveBeenCalled();
  });

  it("reloads by itself when the app is reopened after a spell in the background", async () => {
    mocks.state.deployedBuildId = "running-sha";
    render(<Harness />);
    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());

    mocks.state.deployedBuildId = "shipped-sha";
    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(HIDDEN_BEFORE_AUTO_RELOAD_MS);
    });
    setVisibility("visible");

    await waitFor(() => expect(mocks.reloadForNewBuild).toHaveBeenCalledTimes(1));
  });

  it("does not yank the page away after a glance at another tab", async () => {
    mocks.state.deployedBuildId = "running-sha";
    render(<Harness />);
    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());

    mocks.state.deployedBuildId = "shipped-sha";
    setVisibility("hidden");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    setVisibility("visible");

    expect(await screen.findByTestId("update-banner")).toBeInTheDocument();
    expect(mocks.reloadForNewBuild).not.toHaveBeenCalled();
  });

  it("reloads a tab restored from the back/forward cache", async () => {
    mocks.state.deployedBuildId = "running-sha";
    render(<Harness />);
    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());

    mocks.state.deployedBuildId = "shipped-sha";
    act(() => {
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });

    await waitFor(() => expect(mocks.reloadForNewBuild).toHaveBeenCalledTimes(1));
  });

  it("reloads outright when the update is tapped, guard window or not", async () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ reload });

    mocks.state.deployedBuildId = "running-sha";
    render(<Harness />);
    await waitFor(() => expect(mocks.fetchDeployedBuildId).toHaveBeenCalled());

    mocks.state.deployedBuildId = "shipped-sha";
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });

    fireEvent.click(await screen.findByRole("button", { name: "Update now" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
