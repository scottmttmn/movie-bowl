import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ add: vi.fn(), checkStatus: vi.fn(), refresh: vi.fn() }));
const bowls = [{ id: "a", name: "Friday Night" }];
vi.mock("../../hooks/useUserBowls", () => ({ default: () => ({ userId: "user", bowls, defaultBowlId: "a", refresh: mocks.refresh, loading: false, error: null }) }));
vi.mock("../../lib/addBowlMovie", () => ({ bowlMovieService: { add: mocks.add, checkStatus: mocks.checkStatus }, addResult: (ok, code, message) => ({ ok, code, message }), getSubmissionKey: ({ accountId, bowlId, movie }) => `${accountId}:${bowlId}:${String(movie?.title || "").trim().toLowerCase()}`, isUnsettledAddCode: (code) => ["outcome_unknown", "add_not_committed"].includes(code) }));
vi.mock("../../lib/bowlMovieActions", () => ({ bowlMovieActions: { updateNote: vi.fn(), remove: vi.fn() } }));
vi.mock("../../lib/tmdbApi", () => ({ getTmdbMovieDetails: vi.fn() }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: vi.fn() }));

import useBowlAdd, { BowlAddProvider } from "../../hooks/useBowlAdd";
import BowlAddStatusBanner from "../BowlAddStatusBanner";

const custom = { title: "Wildcard", isCustomEntry: true };
function Harness() {
  const add = useBowlAdd();
  return <>
    <button onClick={() => add.openGlobalAdd()}>Open add</button>
    <button onClick={() => add.submit(custom)}>Submit</button>
    <BowlAddStatusBanner />
  </>;
}
async function submitOnce() {
  render(<BowlAddProvider><Harness /></BowlAddProvider>);
  fireEvent.click(screen.getByText("Open add"));
  await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
  fireEvent.click(screen.getByText("Submit"));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.refresh.mockResolvedValue({ bowls, defaultBowlId: "a" });
});
afterEach(cleanup);

describe("global add status banner", () => {
  it("keeps an uncommitted add undismissable and retries it under the same id", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "add_not_committed", message: "has not been added" });
    await submitOnce();
    await screen.findByText(/has not been added/);
    // Not ordinary feedback: dismissing it would free the same title to be sent
    // again under a new id while the first write may still land.
    expect(screen.queryByRole("button", { name: "Dismiss add result" })).toBeNull();
    const submissionId = mocks.add.mock.calls[0][0].submissionId;
    mocks.add.mockResolvedValueOnce({ ok: true, movie: { id: "saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(mocks.add).toHaveBeenCalledTimes(2));
    expect(mocks.add.mock.calls[1][0].submissionId).toBe(submissionId);
    await screen.findByText(/Added Wildcard to Friday Night/);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss add result" }));
    await waitFor(() => expect(screen.queryByText(/Added Wildcard/)).toBeNull());
  });

  it("keeps an unconfirmed add on its own row until a status check settles it", async () => {
    mocks.add.mockResolvedValueOnce({ ok: false, code: "outcome_unknown", message: "Could not confirm Wildcard" });
    await submitOnce();
    await screen.findByText(/Could not confirm Wildcard/);
    // It is not ordinary feedback, so it carries no dismiss control.
    expect(screen.queryByRole("button", { name: "Dismiss add result" })).toBeNull();
    mocks.checkStatus.mockResolvedValue({ ok: true, movie: { id: "saved" } });
    fireEvent.click(screen.getByRole("button", { name: "Check add status" }));
    await waitFor(() => expect(screen.queryByText(/Could not confirm Wildcard/)).toBeNull());
    await screen.findByText(/Added Wildcard to Friday Night/);
  });
});
