import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  save: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../../lib/watchHistoryShare", () => ({
  saveMyWatchHistoryShareLink: mocks.save,
  deleteMyWatchHistoryShareLink: mocks.remove,
  getWatchHistoryShareUrl: (token) => `https://moviebowl.app/w/${token}`,
}));

import WatchHistoryShareSheet from "../WatchHistoryShareSheet";

function renderSheet(props = {}) {
  const onLinkChange = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <WatchHistoryShareSheet link={null} onLinkChange={onLinkChange} onClose={onClose} {...props} />
  );
  return { ...view, onLinkChange, onClose };
}

beforeEach(() => {
  mocks.save.mockReset();
  mocks.remove.mockReset();
});

afterEach(cleanup);

describe("WatchHistoryShareSheet", () => {
  it("makes a link with comments off unless switched on first", async () => {
    mocks.save.mockResolvedValue({ ok: true, link: { token: "t1", includeComments: true } });
    const { onLinkChange } = renderSheet();

    expect(screen.getByRole("switch", { name: "Show my comments" })).toHaveAttribute("aria-checked", "false");
    fireEvent.click(screen.getByRole("switch", { name: "Show my comments" }));
    // No link yet: switching only sets what the link will be made with.
    expect(mocks.save).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Make a link" }));
    await waitFor(() => expect(onLinkChange).toHaveBeenCalledWith({ token: "t1", includeComments: true }));
    expect(mocks.save).toHaveBeenCalledWith({ includeComments: true });
  });

  it("shows the link with copy and preview once there is one", () => {
    renderSheet({ link: { token: "t1", includeComments: false } });
    expect(screen.getByRole("textbox", { name: "Share link" })).toHaveValue("https://moviebowl.app/w/t1");
    expect(screen.getByRole("link", { name: "Preview" })).toHaveAttribute("href", "https://moviebowl.app/w/t1");
    expect(screen.queryByRole("button", { name: "Make a link" })).toBeNull();
  });

  it("copies the link", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderSheet({ link: { token: "t1", includeComments: false } });

    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await screen.findByRole("button", { name: "Copied" });
    expect(writeText).toHaveBeenCalledWith("https://moviebowl.app/w/t1");
  });

  it("saves the comments switch straight away on a live link, and puts it back if that fails", async () => {
    mocks.save.mockResolvedValueOnce({ ok: false, message: "Could not update your link. Please try again." });
    const { onLinkChange } = renderSheet({ link: { token: "t1", includeComments: false } });

    fireEvent.click(screen.getByRole("switch", { name: "Show my comments" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not update your link");
    expect(screen.getByRole("switch", { name: "Show my comments" })).toHaveAttribute("aria-checked", "false");
    expect(onLinkChange).not.toHaveBeenCalled();

    mocks.save.mockResolvedValueOnce({ ok: true, link: { token: "t1", includeComments: true } });
    fireEvent.click(screen.getByRole("switch", { name: "Show my comments" }));
    await waitFor(() => expect(onLinkChange).toHaveBeenCalledWith({ token: "t1", includeComments: true }));
    expect(screen.getByRole("switch", { name: "Show my comments" })).toHaveAttribute("aria-checked", "true");
  });

  it("asks once before turning the link off", async () => {
    mocks.remove.mockResolvedValue({ ok: true });
    const { onLinkChange } = renderSheet({ link: { token: "t1", includeComments: false } });

    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    expect(mocks.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Tap again to turn off" }));
    await waitFor(() => expect(onLinkChange).toHaveBeenCalledWith(null));
  });

  it("offers no controls until the saved link is known", () => {
    const onRetryLookup = vi.fn();
    const { rerender, onLinkChange, onClose } = renderSheet({ lookupStatus: "failed", onRetryLookup });

    expect(screen.getByRole("alert")).toHaveTextContent("Could not check your link.");
    expect(screen.queryByRole("button", { name: "Make a link" })).toBeNull();
    expect(screen.queryByRole("switch", { name: "Show my comments" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetryLookup).toHaveBeenCalled();

    rerender(
      <WatchHistoryShareSheet link={null} lookupStatus="loading" onLinkChange={onLinkChange} onClose={onClose} />
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checking your link");
    expect(screen.queryByRole("button", { name: "Make a link" })).toBeNull();
  });

  it("keeps the link when turning it off fails", async () => {
    mocks.remove.mockResolvedValue({ ok: false, message: "Could not turn off your link. Please try again." });
    const { onLinkChange } = renderSheet({ link: { token: "t1", includeComments: false } });

    fireEvent.click(screen.getByRole("button", { name: "Turn off link" }));
    fireEvent.click(screen.getByRole("button", { name: "Tap again to turn off" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not turn off your link");
    expect(onLinkChange).not.toHaveBeenCalled();
  });
});
