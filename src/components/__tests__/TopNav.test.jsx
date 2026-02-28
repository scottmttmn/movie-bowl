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
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /my bowls/i })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /settings/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("calls sign out from the menu", () => {
    const onSignOut = vi.fn();
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={onSignOut} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /log out/i }));

    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it("closes the menu on outside click", () => {
    render(
      <MemoryRouter>
        <TopNav isSettingsRoute={false} onSignOut={vi.fn()} />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("button", { name: /navigation menu/i }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });
});
