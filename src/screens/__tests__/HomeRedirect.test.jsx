import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const mocks = vi.hoisted(() => {
  const state = {
    session: { user: { id: "u1", email: "user@example.com" } },
    bowlRows: [],
    rpcError: null,
  };

  return {
    state,
    supabase: {
      rpc: vi.fn(async () => ({
        data: state.rpcError ? null : state.bowlRows,
        error: state.rpcError,
      })),
    },
  };
});

vi.mock("../../lib/supabase", () => ({ supabase: mocks.supabase }));
vi.mock("../../hooks/useAuth", () => ({
  default: () => ({ session: mocks.state.session, loading: false }),
}));

import HomeRedirect from "../HomeRedirect";
import { rememberLastOpenedBowl } from "../../utils/lastOpenedBowl";

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/bowls" element={<div>My Bowls Screen</div>} />
        <Route path="/bowl/:bowlId" element={<div>Bowl Dashboard</div>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("HomeRedirect", () => {
  beforeEach(() => {
    window.localStorage.clear();
    mocks.supabase.rpc.mockClear();
    mocks.state.session = { user: { id: "u1", email: "user@example.com" } };
    mocks.state.bowlRows = [];
    mocks.state.rpcError = null;
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("sends a returning user straight to the bowl they last opened", async () => {
    rememberLastOpenedBowl("u1", "bowl-7");

    renderHome();

    expect(screen.getByText("Bowl Dashboard")).toBeInTheDocument();
    // The remembered id is read synchronously, so no lookup is needed.
    expect(mocks.supabase.rpc).not.toHaveBeenCalled();
  });

  it("ignores a bowl remembered for a different user", async () => {
    rememberLastOpenedBowl("someone-else", "bowl-7");
    mocks.state.bowlRows = [{ id: "a" }, { id: "b" }];

    renderHome();

    await waitFor(() => expect(screen.getByText("My Bowls Screen")).toBeInTheDocument());
  });

  it("skips the list when the user has exactly one bowl", async () => {
    mocks.state.bowlRows = [{ id: "only-bowl" }];

    renderHome();

    await waitFor(() => expect(screen.getByText("Bowl Dashboard")).toBeInTheDocument());
  });

  it("shows the list when the user has several bowls", async () => {
    mocks.state.bowlRows = [{ id: "a" }, { id: "b" }];

    renderHome();

    await waitFor(() => expect(screen.getByText("My Bowls Screen")).toBeInTheDocument());
  });

  it("shows the list when the user has no bowls yet", async () => {
    mocks.state.bowlRows = [];

    renderHome();

    await waitFor(() => expect(screen.getByText("My Bowls Screen")).toBeInTheDocument());
  });

  it("falls back to the list when the lookup fails", async () => {
    mocks.state.rpcError = { message: "boom" };
    vi.spyOn(console, "error").mockImplementation(() => {});

    renderHome();

    await waitFor(() => expect(screen.getByText("My Bowls Screen")).toBeInTheDocument());
  });
});
