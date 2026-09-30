import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openBowlAdd: vi.fn(),
  openGlobalAdd: vi.fn(),
}));

vi.mock("../hooks/useAuth", () => ({
  default: () => ({ session: { user: { id: "user-1", email: "user@example.com" } }, loading: false, signOut: vi.fn() }),
}));

vi.mock("../hooks/useBowlAdd", () => ({
  default: () => ({ open: false, openBowlAdd: mocks.openBowlAdd, openGlobalAdd: mocks.openGlobalAdd }),
  BowlAddProvider: ({ children }) => children,
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    rpc: vi.fn(async () => ({ data: { bowls: [], default_bowl_id: null }, error: null })),
    auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(async () => ({ data: null, error: null })) })) })),
    })),
  },
}));

vi.mock("../components/TopNav", () => ({
  default: ({ onAddMovie }) => <button type="button" onClick={onAddMovie}>Add a movie</button>,
}));
vi.mock("../components/BowlAddDialog", () => ({ default: () => null }));
vi.mock("../components/BowlAddStatusBanner", () => ({ default: () => null }));
vi.mock("../screens/BowlDashboard", () => ({ default: () => <div>Bowl Dashboard Screen</div> }));
vi.mock("../screens/BowlSettings", () => ({ default: () => <div>Bowl Settings</div> }));
vi.mock("../screens/WatchListPage", () => ({ default: () => <div>Watch List Page</div> }));

import App from "../App";

describe("App header add", () => {
  beforeEach(() => {
    mocks.openBowlAdd.mockReset();
    mocks.openGlobalAdd.mockReset();
  });

  afterEach(cleanup);

  it("adds to the bowl on screen, including its settings", async () => {
    window.history.pushState({}, "", "/bowl/bowl-7");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Bowl Dashboard Screen")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add a movie" }));
    expect(mocks.openBowlAdd).toHaveBeenCalledWith("bowl-7");
    cleanup();

    window.history.pushState({}, "", "/bowl/bowl-7/settings");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Bowl Settings")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add a movie" }));
    expect(mocks.openBowlAdd).toHaveBeenLastCalledWith("bowl-7");
    expect(mocks.openGlobalAdd).not.toHaveBeenCalled();
  });

  it("adds to the home bowl away from a bowl", async () => {
    window.history.pushState({}, "", "/watch-list");
    render(<App />);
    await waitFor(() => expect(screen.getByText("Watch List Page")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Add a movie" }));
    expect(mocks.openGlobalAdd).toHaveBeenCalledTimes(1);
    expect(mocks.openBowlAdd).not.toHaveBeenCalled();
  });
});
