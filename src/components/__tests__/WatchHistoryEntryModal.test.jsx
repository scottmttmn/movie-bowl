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

  it("shows a bowl-draw comment as read-only and preserves it on save", async () => {
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

    const comment = screen.getByPlaceholderText("What made this one memorable?");
    expect(comment).toHaveAttribute("readonly");
    expect(comment).toHaveValue("Tim recommended this.");
    fireEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ note: "Tim recommended this." })
      );
    });
  });
});
