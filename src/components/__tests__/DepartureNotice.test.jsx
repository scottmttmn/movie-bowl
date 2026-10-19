import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import DepartureNotice from "../DepartureNotice";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), providers: vi.fn() }));
vi.mock("../../lib/titleDepartures", () => ({ fetchTitleDepartures: mocks.fetch }));
vi.mock("../../lib/streamingProviders", () => ({ fetchStreamingProviders: mocks.providers }));
const validUntil = "2099-10-20T12:00:00Z";
const props = { tmdbId: 77, providers: ["Netflix"], userStreamingServices: ["Netflix"] };
beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue({
    validUntil,
    departures: [
      { service: "Netflix", expiresOn: "2099-10-31T12:00:00Z" },
      { service: "Hulu", expiresOn: null },
    ],
  });
  mocks.providers.mockReset().mockResolvedValue({ providers: ["Netflix"] });
});
afterEach(() => vi.unstubAllGlobals());
it("shows only the viewer's current services, dates and attribution", async () => {
  render(<DepartureNotice {...props} />);
  expect(await screen.findByText("Expected to leave Netflix Oct 31")).toBeVisible();
  expect(screen.queryByText("Leaving Hulu soon")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Movie of the Night" })).toHaveAttribute(
    "href",
    "https://www.movieofthenight.com/about/api",
  );
});
it("does no lookup without saved-service overlap or for a custom title", async () => {
  const { rerender } = render(<DepartureNotice {...props} userStreamingServices={[]} />);
  rerender(<DepartureNotice {...props} userStreamingServices={["Hulu"]} />);
  rerender(<DepartureNotice {...props} tmdbId={null} />);
  await act(async () => {});
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.providers).not.toHaveBeenCalled();
});
it("checks card providers before spending and uses a compact accessible marker for unknown dates", async () => {
  mocks.fetch.mockResolvedValue({
    validUntil,
    departures: [{ service: "Netflix", expiresOn: null }],
  });
  render(<DepartureNotice {...props} providers={null} compact />);
  expect(await screen.findByText("Leaving soon")).toBeVisible();
  expect(screen.getByText(/Leaving Netflix soon. Departure data/)).toBeInTheDocument();
  expect(mocks.providers).toHaveBeenCalledWith(77, { region: "US" });
  expect(mocks.fetch).toHaveBeenCalledWith(77, "Netflix", { bowlId: null });
});
it("waits until visible before checking card providers", async () => {
  let callback;
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(cb) {
        callback = cb;
      }
      observe() {}
      disconnect() {}
    },
  );
  render(<DepartureNotice {...props} providers={null} />);
  expect(mocks.providers).not.toHaveBeenCalled();
  act(() => callback([{ isIntersecting: true }]));
  await screen.findByText("Expected to leave Netflix Oct 31");
});
it("ignores an old title's late answer and hides a notice when preferences change", async () => {
  let resolve;
  mocks.fetch.mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const { rerender } = render(<DepartureNotice {...props} />);
  await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
  rerender(<DepartureNotice {...props} tmdbId={78} userStreamingServices={[]} />);
  await act(async () =>
    resolve({ validUntil, departures: [{ service: "Netflix", expiresOn: null }] }),
  );
  expect(screen.queryByText(/Leaving Netflix/)).not.toBeInTheDocument();
});
it("hides expired data and errors without an error message or a staying claim", async () => {
  mocks.fetch.mockResolvedValue({
    validUntil: "2000-01-01",
    departures: [{ service: "Netflix", expiresOn: null }],
  });
  const { container, rerender } = render(<DepartureNotice {...props} />);
  await act(async () => {});
  expect(container.textContent).toBe("");
  mocks.fetch.mockRejectedValue(new Error("unavailable"));
  rerender(<DepartureNotice {...props} tmdbId={78} />);
  await act(async () => {});
  expect(container.textContent).toBe("");
});

it("passes bowl context only for saved cards and skips unsupported preferences", async () => {
  const { rerender } = render(<DepartureNotice {...props} bowlId="saved-bowl" />);
  await screen.findByText("Expected to leave Netflix Oct 31");
  expect(mocks.fetch).toHaveBeenCalledWith(77, "Netflix", { bowlId: "saved-bowl" });
  mocks.fetch.mockClear();
  rerender(
    <DepartureNotice
      {...props}
      tmdbId={78}
      providers={null}
      userStreamingServices={["Kanopy", "Showtime"]}
    />,
  );
  await act(async () => {});
  expect(mocks.providers).not.toHaveBeenCalled();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
