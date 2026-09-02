import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
const mocks = vi.hoisted(() => ({ context: { bowls: [], default_bowl_id: null }, error: null, rpc: vi.fn() }));
vi.mock("../../lib/supabase", () => ({ supabase: { rpc: mocks.rpc } }));
import HomeRedirect from "../HomeRedirect";
import { UserBowlsProvider } from "../../hooks/useUserBowls";
function Destination() { return <p>Bowl {useParams().bowlId}</p>; }
function renderHome() {
  return render(<MemoryRouter><UserBowlsProvider userId="u1"><Routes>
    <Route path="/" element={<HomeRedirect />} />
    <Route path="/bowls" element={<p>My Bowls Screen</p>} />
    <Route path="/bowl/:bowlId" element={<Destination />} />
  </Routes></UserBowlsProvider></MemoryRouter>);
}
beforeEach(() => {
  mocks.context = { bowls: [], default_bowl_id: null }; mocks.error = null;
  mocks.rpc.mockReset().mockImplementation(async () => ({ data: mocks.context, error: mocks.error }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });
describe("HomeRedirect account defaults", () => {
  it("uses the saved default and ignores an old last-opened hint", async () => {
    localStorage.setItem("movie-bowl:last-bowl:u1", "other");
    mocks.context = { default_bowl_id: "a", bowls: [{ id: "a", name: "Default" }, { id: "b", name: "Other" }] };
    renderHome();
    expect(await screen.findByText("Bowl a")).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith("get_my_bowl_context");
  });
  it("opens the sole saved bowl", async () => {
    mocks.context = { default_bowl_id: "only", bowls: [{ id: "only", name: "Only" }] };
    renderHome(); expect(await screen.findByText("Bowl only")).toBeInTheDocument();
  });
  it("opens My Bowls only after confirming there are no bowls", async () => {
    renderHome(); expect(await screen.findByText("My Bowls Screen")).toBeInTheDocument();
  });
  it("keeps a failed read on Home and supports retry without guessing", async () => {
    mocks.error = { message: "offline" }; renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load");
    expect(screen.queryByText("My Bowls Screen")).not.toBeInTheDocument();
    // Retry is not the only way out: /bowls always renders, so it is the escape
    // hatch when Home resolution keeps failing.
    expect(screen.getByRole("link", { name: "Browse bowls" })).toHaveAttribute("href", "/bowls");
    mocks.error = null; fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("My Bowls Screen")).toBeInTheDocument();
  });
  it("rejects an inconsistent context rather than redirecting to an inaccessible bowl", async () => {
    mocks.context = { default_bowl_id: "missing", bowls: [{ id: "a", name: "A" }] };
    renderHome(); await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });
});
