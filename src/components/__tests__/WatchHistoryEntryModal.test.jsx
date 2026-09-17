import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../MovieSearch", () => ({
  default: ({ onAddMovie, includeComment }) => (
    <button
      type="button"
      data-include-comment={String(includeComment)}
      onClick={() =>
        onAddMovie({ id: 101, title: "Arrival", release_date: "2016-11-11" })
      }
    >
      Choose Arrival
    </button>
  ),
}));

import WatchHistoryEntryModal from "../WatchHistoryEntryModal";

describe("WatchHistoryEntryModal comments", () => {
  afterEach(() => cleanup());

  it("supports a comment when creating manual history", async () => {
    const onSave = vi.fn(async () => {});
    render(<WatchHistoryEntryModal onClose={vi.fn()} onSave={onSave} />);

    const chooseButton = screen.getByRole("button", { name: /choose arrival/i });
    expect(chooseButton).toHaveAttribute("data-include-comment", "false");
    fireEvent.click(chooseButton);

    fireEvent.change(screen.getByPlaceholderText("What made this one memorable?"), {
      target: { value: "  First date at the old theater.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: /add to history/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ note: "First date at the old theater." })
      );
    });
  });

  it("allows a manual entry comment to be edited", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <WatchHistoryEntryModal
        entry={{
          id: "history-1",
          source_kind: "manual",
          title: "Arrival",
          watched_on: "2026-08-20",
          note: "Original",
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    const comment = screen.getByPlaceholderText("What made this one memorable?");
    expect(comment).not.toHaveAttribute("readonly");
    fireEvent.change(comment, { target: { value: "Updated" } });
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ note: "Updated" }));
    });
  });

  it("shows a bowl-draw comment as a static snapshot and preserves it on save", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <WatchHistoryEntryModal
        entry={{
          id: "history-2",
          source_kind: "bowl_draw",
          title: "Arrival",
          watched_on: "2026-08-20",
          note: "Tim recommended this.",
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.queryByPlaceholderText("What made this one memorable?")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /comment/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /comment from bowl draw/i })).toBeInTheDocument();
    expect(screen.getByText("Read only")).toBeInTheDocument();
    expect(screen.getByText("Tim recommended this.")).toBeInTheDocument();
    expect(screen.getByText(/can’t be changed from watch history/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ note: "Tim recommended this." })
      );
    });
  });

  it("shows an explicit empty state when a bowl draw has no comment", async () => {
    const onSave = vi.fn(async () => {});
    render(
      <WatchHistoryEntryModal
        entry={{
          id: "history-3",
          source_kind: "bowl_draw",
          title: "Arrival",
          watched_on: "2026-08-20",
          note: null,
        }}
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    expect(screen.queryByPlaceholderText("What made this one memorable?")).not.toBeInTheDocument();
    expect(screen.getByText("No comment was saved with this draw.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ note: null }));
    });
  });
});

const HOUR_MS = 60 * 60 * 1000;

function soloEntry(overrides = {}) {
  return {
    id: "history-solo",
    source_kind: "solo_draw",
    title: "Arrival",
    watched_on: "2026-08-20",
    note: "Tim added this ages ago.",
    created_at: new Date(Date.now() - HOUR_MS).toISOString(),
    ...overrides,
  };
}

describe("WatchHistoryEntryModal solo draw undo", () => {
  afterEach(() => cleanup());

  it("labels the delete action as undo inside the two-hour window", () => {
    const onDelete = vi.fn();
    const onRemoveFromBowls = vi.fn();
    const entry = soloEntry();
    render(
      <WatchHistoryEntryModal
        entry={entry}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
        onRemoveFromBowls={onRemoveFromBowls}
      />
    );

    expect(screen.queryByRole("button", { name: "Remove from history" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo draw" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo draw" }));

    expect(onDelete).toHaveBeenCalledWith(entry);
    // Undo is the same delete as always: it never touches the bowl copies,
    // which is what the separate action beside it is for.
    expect(onRemoveFromBowls).not.toHaveBeenCalled();
  });

  it("reads as ordinary removal once the window has passed", () => {
    const onDelete = vi.fn();
    const entry = soloEntry({
      created_at: new Date(Date.now() - 3 * HOUR_MS).toISOString(),
    });
    render(
      <WatchHistoryEntryModal
        entry={entry}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={onDelete}
      />
    );

    expect(screen.queryByRole("button", { name: "Undo draw" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove from history" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove entry" }));

    expect(onDelete).toHaveBeenCalledWith(entry);
  });

  it("never offers undo for a group draw, however recent", () => {
    render(
      <WatchHistoryEntryModal
        entry={{
          id: "history-group",
          source_kind: "bowl_draw",
          title: "Arrival",
          watched_on: "2026-08-20",
          created_at: new Date().toISOString(),
        }}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Remove from history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo draw" })).not.toBeInTheDocument();
  });

  it("falls back to ordinary removal when the commit time is missing or unreadable", () => {
    const { rerender } = render(
      <WatchHistoryEntryModal
        entry={soloEntry({ created_at: null })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Remove from history" })).toBeInTheDocument();

    rerender(
      <WatchHistoryEntryModal
        entry={soloEntry({ id: "history-solo-2", created_at: "not a date" })}
        onClose={vi.fn()}
        onSave={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "Remove from history" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo draw" })).not.toBeInTheDocument();
  });
});
