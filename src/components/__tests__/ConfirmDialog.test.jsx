import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ConfirmDialog from "../ConfirmDialog";

afterEach(cleanup);

function renderDialog(props = {}) {
  return render(
    <div>
      <button type="button">outside</button>
      <ConfirmDialog
        isOpen
        title="Revoke this invitation?"
        keepLabel="Keep invitation"
        confirmLabel="Revoke invitation"
        onKeep={vi.fn()}
        onConfirm={vi.fn()}
        {...props}
      />
    </div>
  );
}

describe("ConfirmDialog", () => {
  it("starts focus on the non-destructive action", () => {
    renderDialog();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Keep invitation" }));
  });

  it("keeps focus in the dialog while the action is pending", () => {
    renderDialog({ isBusy: true });
    const dialog = screen.getByRole("dialog");

    expect(document.activeElement).toBe(dialog);
    // Both buttons are disabled, so there is nothing for a Tab to land on. It
    // must not fall through to the page behind the modal.
    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("ignores Escape while the action is pending", () => {
    const onKeep = vi.fn();
    renderDialog({ isBusy: true, onKeep });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onKeep).not.toHaveBeenCalled();
  });

  it("closes on Escape when idle", () => {
    const onKeep = vi.fn();
    renderDialog({ onKeep });

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onKeep).toHaveBeenCalledTimes(1);
  });

  it("does not restore focus behind the modal when a parent re-renders", () => {
    const { rerender } = render(
      <div>
        <button type="button">outside</button>
        <ConfirmDialog isOpen title="Revoke?" onKeep={() => {}} onConfirm={() => {}} />
      </div>
    );
    const keep = screen.getByRole("button", { name: "Cancel" });
    expect(document.activeElement).toBe(keep);

    // A fresh inline callback each render must not re-run the focus effect,
    // whose cleanup restores focus to whatever sat behind the dialog.
    rerender(
      <div>
        <button type="button">outside</button>
        <ConfirmDialog isOpen title="Revoke?" onKeep={() => {}} onConfirm={() => {}} />
      </div>
    );
    expect(document.activeElement).toBe(keep);
  });

  it("shows an error inside the dialog", () => {
    renderDialog({ errorMessage: "Could not revoke that invitation. Try again." });
    expect(screen.getByRole("alert")).toHaveTextContent("Could not revoke that invitation.");
  });
});
