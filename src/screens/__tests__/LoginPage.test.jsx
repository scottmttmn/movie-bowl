import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("../../hooks/useAuth", () => ({
  default: () => ({
    signIn: mocks.signIn,
  }),
}));

import LoginPage from "../LoginPage";

describe("LoginPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.signIn.mockReset();
    mocks.signIn.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
  });

  it("sends a magic link and shows success state", async () => {
    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => {
      expect(mocks.signIn).toHaveBeenCalledWith("user@example.com");
      expect(screen.getByText(/check your email for a magic link/i)).toBeInTheDocument();
    });
  });

  it("shows returned auth errors", async () => {
    mocks.signIn.mockResolvedValue({ error: { message: "Too many requests" } });

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => {
      expect(screen.getByText("Too many requests")).toBeInTheDocument();
    });
  });

  it("shows fallback error on unexpected failure", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signIn.mockRejectedValue(new Error("boom"));

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    await waitFor(() => {
      expect(screen.getByText("Unexpected error sending magic link.")).toBeInTheDocument();
    });
    expect(errorSpy).toHaveBeenCalled();
  });

  it("disables submit while the request is in flight", async () => {
    let resolveSignIn;
    mocks.signIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSignIn = resolve;
        })
    );

    render(<LoginPage />);

    fireEvent.change(screen.getByPlaceholderText("Email"), {
      target: { value: "user@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: /send magic link/i }));

    expect(screen.getByRole("button", { name: /sending/i })).toBeDisabled();

    resolveSignIn({ error: null });

    await waitFor(() => {
      expect(screen.getByText(/check your email for a magic link/i)).toBeInTheDocument();
    });
  });
});
