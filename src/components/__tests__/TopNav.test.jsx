import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import TopNav from "../TopNav";

describe("TopNav", () => {
  afterEach(() => {
    cleanup();
  });

  it("opens and closes the navigation menu", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByLabelText(/signed in as user@example\.com/i)).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /my bowls/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls sign out from the menu", () => {
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={onSignOut} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on outside click", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} userEmail="user@example.com" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("shows only About and Log in options when logged out", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} isAuthenticated={false} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));

    expect(screen.getByRole("menuitem", { name: /about/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /log in/i })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /settings/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /log out/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/signed in as/i)).not.toBeInTheDocument();
  });
});
