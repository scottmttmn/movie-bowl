import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import FeedbackSheet from "../FeedbackSheet";

afterEach(() => {
  cleanup();
});

describe("FeedbackSheet", () => {
  it("sends only once something is written, and thanks the sender", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<FeedbackSheet onClose={vi.fn()} send={send} />);

    expect(screen.getByRole("dialog", { name: "Feedback" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Report a problem or suggest an idea")).toHaveFocus();
    expect(screen.getByText("Sends with your page and device.")).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Send" });
    expect(button).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "   " } });
    expect(button).toBeDisabled();
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "  Add a dark mode  " } });
    fireEvent.click(button);

    expect(await screen.findByText("Thanks")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith({ message: "Add a dark mode", errorText: "", page: null });
  });

  it("keeps what was written and says why when sending fails", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, message: "That's a lot at once. Try again in a while." });
    render(<FeedbackSheet onClose={vi.fn()} send={send} />);

    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Broken" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("That's a lot at once. Try again in a while.");
    expect(screen.getByRole("textbox")).toHaveValue("Broken");
    expect(screen.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  it("shows an error report's error and lets it go without a message", async () => {
    const send = vi.fn().mockResolvedValue({ ok: true });
    render(<FeedbackSheet onClose={vi.fn()} send={send} errorText="TypeError: boom" />);

    expect(screen.getByText("TypeError: boom")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send report" }));

    expect(await screen.findByText("Thanks")).toBeInTheDocument();
    expect(send).toHaveBeenCalledWith({ message: "", errorText: "TypeError: boom", page: null });
  });

  it("closes from its button and from Escape", () => {
    const onClose = vi.fn();
    render(<FeedbackSheet onClose={onClose} send={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Tab inside the sheet", () => {
    render(<FeedbackSheet onClose={vi.fn()} send={vi.fn()} />);
    const close = screen.getByRole("button", { name: "Close" });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    const send = screen.getByRole("button", { name: "Send" });

    send.focus();
    fireEvent.keyDown(send, { key: "Tab" });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(send).toHaveFocus();
  });
});
