import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PersonalCommentSection from "../PersonalCommentSection";

describe("PersonalCommentSection", () => {
  afterEach(() => cleanup());

  it("says a folded comment is there without showing it", () => {
    render(<PersonalCommentSection note="Loved the score." collapsed onSave={vi.fn()} />);

    const toggle = screen.getByRole("button", { name: "Your comment" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Loved the score.")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByRole("region", { name: "Your comment" })).toHaveTextContent("Loved the score.");
    expect(screen.getByRole("button", { name: "Your comment" })).toHaveAttribute("aria-expanded", "true");
  });

  it("opens an empty folded comment straight into the editor, and folds back on cancel", () => {
    render(<PersonalCommentSection note={null} collapsed onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add your comment" }));
    expect(screen.getByRole("textbox", { name: "Your comment" })).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add your comment" })).toHaveAttribute("aria-expanded", "false");
  });

  it("saves a trimmed comment and shows what the server kept", async () => {
    const onSave = vi.fn(async (note) => ({ ok: true, note }));
    render(<PersonalCommentSection note={null} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add your comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your comment" }), {
      target: { value: "  Better than I expected.\nThe ending!  " },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    });

    expect(onSave).toHaveBeenCalledWith("Better than I expected.\nThe ending!");
    const text = screen.getByText(/Better than I expected/);
    expect(text).toHaveClass("whitespace-pre-wrap");
    expect(screen.getByRole("button", { name: "Edit your comment" })).toBeInTheDocument();
  });

  it("keeps the draft and announces a failed save", async () => {
    const onSave = vi.fn(async () => ({ ok: false, message: "This history entry is no longer available." }));
    render(<PersonalCommentSection note="Original" onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Edit your comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your comment" }), { target: { value: "Keep me" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    });

    expect(screen.getByRole("alert")).toHaveTextContent("This history entry is no longer available.");
    expect(screen.getByRole("textbox", { name: "Your comment" })).toHaveValue("Keep me");
  });

  it("refuses an over-limit comment before calling the server", async () => {
    const onSave = vi.fn();
    render(<PersonalCommentSection note={null} onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "+ Add your comment" }));
    // maxLength stops typing; a paste or a stale draft is what reaches this.
    const textbox = screen.getByRole("textbox", { name: "Your comment" });
    textbox.removeAttribute("maxLength");
    fireEvent.change(textbox, { target: { value: "x".repeat(501) } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    });

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("500 characters or fewer");
  });

  it("folds back to the add row after clearing a folded comment", async () => {
    const onSave = vi.fn(async () => ({ ok: true, note: null }));
    render(<PersonalCommentSection note="Remove me" collapsed onSave={onSave} />);

    fireEvent.click(screen.getByRole("button", { name: "Your comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit your comment" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Your comment" }), { target: { value: "   " } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    });

    expect(onSave).toHaveBeenCalledWith(null);
    expect(screen.getByRole("button", { name: "+ Add your comment" })).toHaveAttribute("aria-expanded", "false");
  });
});
